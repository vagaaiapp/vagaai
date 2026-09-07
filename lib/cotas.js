// lib/cotas.js
// Cota MENSAL de carta de apresentação e treino de entrevista.
//
// Análises já tinham contador próprio (subscriptions.analyses_used_this_month,
// travado pela RPC check_and_increment_analyses). Cartas e treinos não tinham
// nada além do rate limit por hora — que segura pico, não volume: 20 cartas/hora
// são 480 por dia, num plano de preço fixo.
//
// Aqui não há coluna nova: cover_letters e interview_sessions (migração 026) já
// gravam user_id + created_at, então a cota é count(*) desde o início do ciclo.
// Contar linha real tem uma vantagem sobre contador: não dessincroniza. Se a
// geração falhou e a linha não foi gravada, ela não conta — o estorno é
// automático, sem RPC de decremento.
//
// FAIL-OPEN por decisão, não por descuido: este teto protege margem, não
// segurança. Banco fora do ar não pode impedir um assinante de escrever a carta
// que ele já pagou. O rate limit por hora continua de pé como rede de abuso.

import { planEntitlements } from './entitlements.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Tabela e campo de entitlement de cada recurso contado por linha.
const RECURSOS = {
  carta:  { tabela: 'cover_letters',      limite: 'letters_limit' },
  treino: { tabela: 'interview_sessions', limite: 'interviews_limit' },
};

// Soma `n` meses a uma data, sem estourar o fim do mês: 31/01 + 1 mês é 28/02,
// não 03/03. Calcula sempre a partir da data original (não iterando sobre o
// resultado anterior), então a âncora não acumula deriva de alguns dias a cada
// virada de ciclo.
function somarMeses(base, n) {
  const dia = base.getUTCDate();
  const d = new Date(base.getTime());
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const ultimoDiaDoMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(dia, ultimoDiaDoMes));
  return d;
}

// Início do ciclo de contagem.
//
// Ancorado em current_period_start — a mesma data que o painel mostra como
// "renova em" — mas ROLADO mês a mês até o mês corrente. A rolagem é o ponto:
// current_period_start é o início do período de COBRANÇA, e num plano
// trimestral ou anual ele só avança a cada 3 ou 12 meses. Usar a data crua
// daria ao assinante trimestral uma cota por trimestre em vez de uma por mês —
// era exatamente esse o bug do contador de análises (ver api/analyze.js e a
// migração 039). Para o plano mensal a rolagem é no-op: o próximo mês ainda
// está no futuro, então a âncora continua sendo o próprio current_period_start.
//
// Sem assinatura com período conhecido, cai para o primeiro dia do mês
// corrente: previsível e explicável, que é o que importa quando a pessoa
// pergunta "quando isso volta a zero?".
export function inicioDoCiclo(sub) {
  const inicio = sub && sub.current_period_start;
  if (inicio) {
    const d = new Date(inicio);
    if (!Number.isNaN(d.getTime())) {
      const agora = new Date();
      // Meses de calendário decorridos; a correção abaixo cobre o caso de a
      // âncora do mês corrente ainda não ter chegado (ciclo que vira dia 20 e
      // hoje é dia 5 → o ciclo em curso começou no mês passado).
      let n = (agora.getUTCFullYear() - d.getUTCFullYear()) * 12
            + (agora.getUTCMonth() - d.getUTCMonth());
      if (n < 0) n = 0;
      let ancora = somarMeses(d, n);
      if (ancora.getTime() > agora.getTime()) ancora = somarMeses(d, n - 1);
      return ancora.toISOString();
    }
  }
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), 1)).toISOString();
}

// Conta linhas do usuário na tabela desde `desde`, sem trazer as linhas.
// Prefer: count=exact + Range 0-0 devolve o total no header Content-Range
// ("0-0/37"); trazer 50 cartas inteiras só para contá-las seria desperdício de
// banda dentro de um limite de 10s de função.
async function contarDesde(tabela, userId, desde) {
  const url = `${SUPABASE_URL}/rest/v1/${tabela}` +
    `?user_id=eq.${encodeURIComponent(userId)}` +
    `&created_at=gte.${encodeURIComponent(desde)}` +
    `&select=id`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      Prefer: 'count=exact',
      Range: '0-0',
    },
  });
  if (!res.ok && res.status !== 206) throw new Error(`count ${res.status}`);
  const cr = res.headers.get('content-range') || '';
  const total = Number(String(cr).split('/')[1]);
  if (!Number.isFinite(total)) throw new Error(`content-range inválido: ${cr}`);
  return total;
}

// Retorna { ok, usado, limite, desde }.
// ok=false só quando a contagem foi lida com sucesso E bateu no teto.
export async function checarCotaMensal({ userId, plan, recurso, sub }) {
  const cfg = RECURSOS[recurso];
  if (!cfg) return { ok: true, usado: 0, limite: null, desde: null };

  const limite = planEntitlements(plan)[cfg.limite];
  // null = sem teto (nenhum plano usa hoje, mas mantém a porta aberta).
  if (limite === null || limite === undefined) {
    return { ok: true, usado: 0, limite: null, desde: null };
  }
  if (limite <= 0) {
    return { ok: false, usado: 0, limite: 0, desde: null };
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { ok: true, usado: 0, limite, desde: null };
  }

  const desde = inicioDoCiclo(sub);
  try {
    const usado = await contarDesde(cfg.tabela, userId, desde);
    return { ok: usado < limite, usado, limite, desde };
  } catch (err) {
    console.error(`checarCotaMensal(${recurso}) falhou, liberando:`, err.message);
    return { ok: true, usado: 0, limite, desde, infra: true };
  }
}

// Mensagem única para as duas APIs e para o painel, para o usuário não ver o
// mesmo limite explicado de duas formas diferentes.
export function mensagemDeCota(recurso, limite, desde) {
  const nomes = {
    carta:  ['carta de apresentação', 'cartas'],
    treino: ['treino de entrevista', 'treinos'],
  };
  const [, plural] = nomes[recurso] || ['', 'itens'];
  let quando = '';
  if (desde) {
    const d = new Date(desde);
    if (!Number.isNaN(d.getTime())) {
      d.setMonth(d.getMonth() + 1);
      quando = ` A contagem zera em ${d.toLocaleDateString('pt-BR')}.`;
    }
  }
  return `Você usou ${limite} ${plural} neste ciclo, o total do seu plano.${quando}`;
}
