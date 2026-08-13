/* Invariantes que atravessam páginas. Nasceram de uma varredura que achou três
   bugs da mesma família: código que lê uma chave que ninguém escreve, duas
   chaves para a mesma preferência, e a mesma regra calculada em dois lugares
   com resultados diferentes. Testar o caso pontual corrigido não impede a
   próxima ocorrência — estes testes travam a classe inteira. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Só o que vai para produção. Diretórios excluídos do deploy pelo .vercelignore
   (protótipos, mockups, versões alternativas) não precisam seguir as regras. */
const IGNORAR_DIR = /^(\.git|\.vercel|\.claude|\.codex|\.agents|node_modules|tests|migrations|tmp|scripts|.*-preview.*|.*-v[2-5]|mockup-.*|manual-.*|jornada-.*|planejamento-.*|produto-.*|email-marketing-.*|lp-nova-aprovacao)$/;

function arquivosDeCodigo(dir = ROOT, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (IGNORAR_DIR.test(ent.name)) continue;
      arquivosDeCodigo(path.join(dir, ent.name), out);
    } else if (/\.(html|js)$/.test(ent.name) && ent.name !== 'index.html.txt') {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

const FONTES = arquivosDeCodigo().map((abs) => ({
  rel: path.relative(ROOT, abs).replace(/\\/g, '/'),
  src: fs.readFileSync(abs, 'utf8')
}));

function chaves(regex) {
  const achados = new Map();
  for (const { rel, src } of FONTES) {
    for (const m of src.matchAll(regex)) {
      if (!achados.has(m[1])) achados.set(m[1], new Set());
      achados.get(m[1]).add(rel);
    }
  }
  return achados;
}

describe('Integridade entre páginas', () => {
  it('toda chave de localStorage lida por alguém é escrita por alguém', () => {
    // `vagaai_prefill_url` e `vagaai_scroll_to` eram lidas em /app e nunca
    // escritas: duas features descritas em comentário que nunca rodaram.
    const lidas = chaves(/localStorage\.getItem\(\s*['"]([^'"]+)['"]/g);
    const escritas = chaves(/localStorage\.(?:setItem|removeItem)\(\s*['"]([^'"]+)['"]/g);
    // Chaves que ninguém escreve de propósito: o SDK do Supabase grava a sessão
    // com prefixo sb-, o cookie-consent guarda o nome numa constante, e
    // 'vagaai-theme' é a chave antiga de tema — lida só para migrar quem já
    // tinha preferência salva, nunca mais escrita (ver teste do tema abaixo).
    const externas = /^sb-|^vagaai_cookie_consent$|^vagaai-theme$/;

    const orfas = [...lidas.keys()]
      .filter((k) => !externas.test(k) && !escritas.has(k))
      .map((k) => `${k} (lida em ${[...lidas.get(k)].join(', ')})`);

    assert.deepEqual(orfas, [], 'chave lida que ninguém escreve');
  });

  it('a preferência de tema usa uma chave só em todo o produto', () => {
    // O site institucional gravava em 'vagaai-theme' e o produto em
    // 'vagaai_theme': quem escolhia escuro na home voltava ao claro no /app.
    const escritas = chaves(/localStorage\.setItem\(\s*['"]([^'"]*theme[^'"]*)['"]/g);
    assert.deepEqual([...escritas.keys()].sort(), ['vagaai_theme']);

    // A chave antiga só pode sobreviver como leitura de migração.
    for (const { rel, src } of FONTES) {
      if (!src.includes('vagaai-theme')) continue;
      assert.match(
        src,
        /getItem\('vagaai_theme'\)\s*\|\|\s*localStorage\.getItem\('vagaai-theme'\)/,
        `${rel} menciona a chave antiga sem ler a nova antes`
      );
    }
  });

  it('nenhum href é montado só com escape de HTML', () => {
    // escHtml escapa & < >, mas deixa passar href="javascript:...". O link da
    // vaga vem do feed externo de vagas, não só do próprio usuário.
    const VALIDADORES = /(safeExternalUrl|_href)\(/;

    // Valor do próprio browser, não do dado: a origem da página não pode
    // carregar esquema executável.
    const INTRINSECOS = /^(location|window\.location)\.(origin|href|pathname)\s*$/;

    // Aceita tanto a chamada direta — _esc(_href(x)) — quanto o valor guardado
    // antes numa variável: var jobUrlSafe = safeExternalUrl(...).
    const validado = (expr, src) => {
      if (INTRINSECOS.test(expr) || VALIDADORES.test(expr)) return true;
      return (expr.match(/[A-Za-z_$][\w$]*/g) || []).some((id) =>
        new RegExp(`\\b${id}\\s*=\\s*(safeExternalUrl|_href)\\(`).test(src)
      );
    };

    for (const { rel, src } of FONTES) {
      for (const m of src.matchAll(/href="'\s*\+\s*([\s\S]{0,200}?)\+\s*'/g)) {
        assert.ok(
          validado(m[1], src),
          `${rel}: href sem validação de esquema em \`${m[1].trim().slice(0, 80)}\``
        );
      }
    }
  });

  it('safeExternalUrl rejeita esquema que não seja http(s)', () => {
    const dash = read('dashboard/index.html');
    const fn = dash.match(/function safeExternalUrl\([\s\S]*?\n\}/);
    assert.ok(fn, 'safeExternalUrl não encontrada');
    const sandbox = { URL, String };
    vm.runInNewContext(fn[0] + '\nvar _r = safeExternalUrl;', sandbox);
    assert.equal(sandbox._r('javascript:alert(1)'), '');
    assert.equal(sandbox._r('data:text/html,<script>x</script>'), '');
    assert.equal(sandbox._r('vbscript:msgbox'), '');
    assert.equal(sandbox._r('  '), '');
    assert.equal(sandbox._r('https://vaga.com/x'), 'https://vaga.com/x');
  });

  it('o gerador de PDF só carrega o documento principal', () => {
    // Subframe também é resourceType 'document': liberar todos permitia um
    // <iframe src="http://169.254.169.254/..."> render­izar endereço interno
    // dentro do PDF devolvido ao usuário.
    const pdf = read('api/generate-cv-pdf.js');
    assert.match(pdf, /resourceType\(\)\s*===\s*'document'\s*&&\s*req\.frame\(\)\s*===\s*page\.mainFrame\(\)/);
  });

  it('as lacunas de mercado são calculadas num lugar só', () => {
    const curriculo = read('curriculo/index.html');
    const dashboard = read('dashboard/index.html');
    for (const [rel, src] of [['curriculo', curriculo], ['dashboard', dashboard]]) {
      assert.match(src, /src="\/js\/cv-lacunas\.js"/, `${rel} não carrega o módulo`);
      assert.match(src, /VagaAICv\.calcularLacunas/, `${rel} não usa o módulo`);
      assert.doesNotMatch(src, /keywords_faltando \|\| \[\]\)\.forEach/, `${rel} recriou o cálculo local`);
    }
    // As duas telas precisam do mesmo recorte de análises.
    assert.match(curriculo, /VagaAICv\.ANALISES_QUERY\.limite/);
    assert.match(curriculo, /\.is\('archived_at', null\)/);
    assert.match(dashboard, /archived_at=is\.null/);
  });
});

describe('Superfície pública', () => {
  it('nenhum endereço IP público hardcoded no código de servidor', () => {
    // O repositório é público. Um bypass de rate limit "temporário" deixou um
    // IP residencial no fonte por semanas depois de expirar — endereço pessoal
    // exposto, e um atalho de autorização que ninguém lembrava de remover.
    // Restrito a código de servidor/compartilhado: HTML tem SVG e CSS inline
    // que produzem falso positivo.
    const alvo = FONTES.filter((f) => /^(api|lib|js)\//.test(f.rel) || f.rel === 'middleware.js');
    const privado = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|2[3-5]\d\.)/;
    // Endpoints de metadados de nuvem: aparecem no denylist de SSRF do
    // fetch-job.js, ou seja, são controle de segurança e não atalho.
    const DENYLIST_CONHECIDO = new Set(['100.100.100.200']);
    for (const { rel, src } of alvo) {
      const ips = [...src.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)]
        .map((m) => m[1])
        .filter((ip) => ip.split('.').every((o) => Number(o) <= 255))
        .filter((ip) => !privado.test(ip) && !DENYLIST_CONHECIDO.has(ip));
      assert.deepEqual(ips, [], `${rel}: IP público hardcoded`);
    }
  });

  it('toda página indexável está no sitemap', () => {
    // Página com robots "index, follow" fora do sitemap depende de link interno
    // para ser descoberta — foi o caso de /criar-curriculo.
    const middleware = read('middleware.js');
    const dinamicas = ['/blog/post']; // entram no sitemap via blog_posts
    for (const { rel, src } of FONTES) {
      if (!/\.html$/.test(rel)) continue;
      if (!/name="robots"\s+content="index/.test(src)) continue;
      const rota = rel === 'index.template.html' ? '/' : '/' + rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
      if (dinamicas.includes(rota)) continue;
      const alvo = rota === '/' ? `loc: '/'` : `loc: '${rota}'`;
      assert.ok(middleware.includes(alvo), `${rota} é indexável mas não está no sitemap (middleware.js)`);
    }
  });

  it('o limite sem cadastro não acusa quem nunca analisou', () => {
    // O limite é por IP, e CGNAT de operadora móvel faz milhares de pessoas
    // saírem pelo mesmo endereço: "você já usou" é dito a quem acabou de chegar.
    const app = read('app/index.html');
    assert.doesNotMatch(app, /Você já usou sua análise gratuita'/,
      'a mensagem do limite anônimo voltou a culpar o usuário');
    assert.match(app, /uma por rede a cada 30 dias/);
  });
});

describe('Crons têm limite e ordem', () => {
  const API = FONTES.filter((f) => f.rel.startsWith('api/'));

  it('nenhuma paginação de base roda sem teto de páginas', () => {
    // Paginar a base inteira faz o custo crescer com o total de cadastros e não
    // com os destinatários: a função passa a ser morta pelo maxDuration sem
    // erro nenhum, e os e-mails simplesmente param de sair.
    //
    // A regra mira paginação, não todo `while(true)`: readBodyLimited em
    // fetch-job.js é um leitor de stream com dois cortes (fim do corpo e teto
    // de bytes), que é justamente um laço já limitado.
    for (const { rel, src } of API) {
      if (!/\bpage\+\+/.test(src)) continue;
      // O teto vale como constante nomeada ou literal (webhook.js usa `page <= 5`).
      assert.match(src, /page\s*<=?\s*([A-Z_]{3,}|\d+)/,
        `${rel}: pagina sem teto — precisa de um limite de páginas`);
    }
  });

  it('a fila do cron de alertas é ordenada e limitada', () => {
    const src = read('api/send-alerts.js');
    const consulta = src.match(/job_alert_profiles\?ativo=eq\.true[^`]*/);
    assert.ok(consulta, 'consulta do cron não encontrada');
    // Sem ORDER BY, o PostgREST devolve na ordem física e os mesmos usuários
    // ficam sempre no início: quem não cabe no corte nunca é alcançado.
    assert.match(consulta[0], /order=next_run_at\.asc/, 'fila sem ordenação: causa inanição da cauda');
    assert.match(consulta[0], /limit=/, 'fila sem teto de leitura');
    // E o laço precisa parar sozinho antes do maxDuration, não ser morto.
    assert.match(src, /runDeadline - Date\.now\(\) < maiorLote/);
  });

  it('todo cron declara maxDuration', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const funcs = vercel.functions || {};
    for (const cron of vercel.crons || []) {
      const arquivo = cron.path.replace(/^\//, '') + '.js';
      assert.ok(funcs[arquivo] && funcs[arquivo].maxDuration,
        `${arquivo} roda em cron sem maxDuration declarado`);
    }
  });
});

describe('Paginação de usuários do onboarding', () => {
  function carregar() {
    const src = read('api/cron-onboarding.js');
    const partes = ['const MAX_PAGINAS', 'function direcaoDaPagina', 'async function getUsersCreatedAround']
      .map((assinatura) => {
        const i = src.indexOf(assinatura);
        assert.ok(i >= 0, `não achei: ${assinatura}`);
        const fim = src.indexOf('\n}\n', i);
        return assinatura.startsWith('const') ? src.slice(i, src.indexOf('\n', i) + 1) : src.slice(i, fim + 3);
      });
    const sandbox = { Date, Number, Math, JSON, console };
    sandbox.SUPABASE_URL = 'https://x';
    sandbox.SUPABASE_SERVICE_KEY = 'k';
    return { sandbox, codigo: partes.join('\n') };
  }

  // Base sintética: 3 páginas cheias, do mais novo para o mais antigo.
  function paginasDesc(totalPaginas, perPage) {
    return (url) => {
      const page = Number((url.match(/page=(\d+)/) || [])[1]);
      const users = [];
      for (let i = 0; i < perPage; i++) {
        const idx = (page - 1) * perPage + i;
        users.push({ id: 'u' + idx, created_at: new Date(Date.now() - idx * 60 * 60 * 1000).toISOString() });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: page <= totalPaginas ? users : [] }) });
    };
  }

  it('para de paginar assim que passa da janela', async () => {
    const { sandbox, codigo } = carregar();
    const paginasPedidas = [];
    sandbox.fetch = (url) => { paginasPedidas.push(Number((url.match(/page=(\d+)/) || [])[1])); return paginasDesc(50, 10)(url); };
    vm.runInNewContext(codigo + '\nvar _f = getUsersCreatedAround;', sandbox);

    // Janela em torno de 2 dias atrás; com 10 usuários por página de 1h em 1h,
    // a janela acaba bem antes da 50ª página.
    const achados = await sandbox._f(2, 12);
    assert.ok(paginasPedidas.length < 50, `paginou ${paginasPedidas.length} páginas — deveria cortar cedo`);
    assert.ok(Array.isArray(achados));
  });

  it('respeita o teto de páginas mesmo sem conseguir detectar a ordem', async () => {
    const { sandbox, codigo } = carregar();
    let chamadas = 0;
    // Todas as páginas com a MESMA data: direcaoDaPagina não decide o sentido.
    sandbox.fetch = () => {
      chamadas++;
      const users = Array.from({ length: 10 }, (_, i) => ({ id: 'u' + i, created_at: new Date().toISOString() }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ users }) });
    };
    vm.runInNewContext(codigo + '\nvar _f = getUsersCreatedAround;\nvar _max = MAX_PAGINAS;', sandbox);
    await sandbox._f(2, 12);
    assert.ok(chamadas <= sandbox._max, `paginou ${chamadas} vezes, acima do teto ${sandbox._max}`);
  });

  it('detecta a direção da página pelos próprios dados', () => {
    const { sandbox, codigo } = carregar();
    vm.runInNewContext(codigo + '\nvar _d = direcaoDaPagina;', sandbox);
    assert.equal(sandbox._d([300, 200, 100]), 'desc');
    assert.equal(sandbox._d([100, 200, 300]), 'asc');
    assert.equal(sandbox._d([100]), null, 'uma data só não define direção');
    assert.equal(sandbox._d([]), null);
  });
});

describe('Falha de envio de alerta é visível', () => {
  function carregar(historico) {
    const src = read('dashboard/index.html');
    const fn = src.match(/function ultimaFalhaDeEnvio\(\)[\s\S]*?\n\}/);
    assert.ok(fn, 'ultimaFalhaDeEnvio não encontrada');
    const sandbox = { Date, _alertHistory: historico };
    vm.runInNewContext(fn[0] + '\nvar _r = ultimaFalhaDeEnvio();', sandbox);
    return sandbox._r;
  }

  it('avisa quando o último envio falhou', () => {
    // send-alerts grava status:'failed' quando o provedor recusa o e-mail, mas
    // o painel só olhava 'sent': quem tinha entrega falhando via "0 alertas
    // enviados" e nenhuma pista do motivo.
    const r = carregar([
      { sent_at: '2026-08-01T10:00:00Z', status: 'sent' },
      { sent_at: '2026-08-08T10:00:00Z', status: 'failed' }
    ]);
    assert.ok(r);
    assert.equal(r.status, 'failed');
  });

  it('não alarma por falha antiga já superada', () => {
    const r = carregar([
      { sent_at: '2026-08-01T10:00:00Z', status: 'failed' },
      { sent_at: '2026-08-08T10:00:00Z', status: 'sent' }
    ]);
    assert.equal(r, null);
  });

  it('não quebra com histórico vazio ou malformado', () => {
    assert.equal(carregar([]), null);
    assert.equal(carregar([{ status: 'failed' }]), null, 'registro sem data não conta');
    assert.equal(carregar(null), null);
  });
});

describe('Currículo base como fonte única', () => {
  it('as páginas que usam o currículo o buscam no banco, não só no navegador', () => {
    // localStorage é cache do dispositivo. Páginas que liam só o cache diziam
    // "nenhum currículo salvo" para quem tinha feito login em outro aparelho.
    for (const pagina of ['carta/index.html', 'entrevista/index.html']) {
      const src = read(pagina);
      assert.match(src, /src="\/js\/cv-base\.js"/, `${pagina} não carrega o módulo`);
      assert.match(src, /VagaAICv\.carregarBase\(/, `${pagina} não busca o currículo no banco`);
    }
  });

  it('o serializador legível não perde projetos nem o texto importado', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(read('js/cv-base.js'), sandbox, { filename: 'js/cv-base.js' });
    const { cvParaTextoLegivel } = sandbox.window.VagaAICv;

    const texto = cvParaTextoLegivel({
      nome: 'Ana',
      experiencias: [{ cargo: 'Analista', empresa: 'Acme', bullets: ['Reduziu custo em 20%'] }],
      projetos: [{ nome: 'ETL', contexto: 'Voluntariado', bullets: ['Pipeline em Python'] }],
      habilidades: ['SQL'],
      raw_text: 'Texto original do PDF'
    });
    assert.match(texto, /EXPERIÊNCIA PROFISSIONAL/);
    assert.match(texto, /Reduziu custo em 20%/);
    assert.match(texto, /PROJETOS E PORTFÓLIO/);
    assert.match(texto, /Pipeline em Python/);
    assert.match(texto, /Texto original do PDF/);

    // Currículo só importado: devolve o texto cru, sem cabeçalho inventado.
    assert.equal(cvParaTextoLegivel({ raw_text: 'Só o texto' }), 'Só o texto');
    assert.equal(cvParaTextoLegivel(null), '');
    assert.equal(cvParaTextoLegivel('já é texto'), 'já é texto');
  });
});

describe('Fluxo de candidatura', () => {
  it('vaga adicionada à mão oferece análise, levando o link junto', () => {
    // A linha "Sem análise" só tinha editar e remover: para analisar, o usuário
    // recolava no formulário em branco uma URL que o tracker já guardava.
    const dash = read('dashboard/index.html');
    assert.match(dash, /⚡ Analisar/);

    const fn = dash.match(/function buildTrackerAnalyzeUrl\([\s\S]*?\n\}/);
    const safe = dash.match(/function safeExternalUrl\([\s\S]*?\n\}/);
    assert.ok(fn && safe);
    const sandbox = { URL, String, encodeURIComponent };
    vm.runInNewContext(`${safe[0]}\n${fn[0]}\nvar _b = buildTrackerAnalyzeUrl;`, sandbox);

    const url = sandbox._b({ job_url: 'https://vagas.com/x', cargo: 'Analista', empresa: 'Acme' });
    assert.match(url, /^\/app\?/);
    assert.match(url, /vaga=https%3A%2F%2Fvagas\.com%2Fx/);
    assert.match(url, /job_title=Analista/);
    assert.match(url, /job_company=Acme/);

    // Link com esquema executável não pode virar parâmetro de navegação.
    assert.doesNotMatch(sandbox._b({ job_url: 'javascript:alert(1)', cargo: 'X' }), /javascript/);
    // Sem link, ainda abre o analisador — só sem pré-preenchimento de URL.
    assert.equal(sandbox._b({}), '/app');
  });

  it('o menu avisa quais abas o plano atual não libera', () => {
    const dash = read('dashboard/index.html');
    assert.match(dash, /function marcarItensPagosNoMenu/);
    // Os selos precisam bater com o gate real do servidor: cover-letter recusa
    // free; interview recusa quem não é pro.
    assert.match(read('api/cover-letter.js'), /plan === 'free'/);
    assert.match(read('api/interview.js'), /plan !== 'pro'/);
    assert.match(dash, /tab: 'carta',\s*bloqueado: plano === 'free'/);
    assert.match(dash, /tab: 'entrevistas',\s*bloqueado: !\(plano === 'pro'/);
  });
});

describe('Cálculo de lacunas', () => {
  function carregar() {
    const sandbox = { window: {} };
    vm.runInNewContext(read('js/cv-lacunas.js'), sandbox, { filename: 'js/cv-lacunas.js' });
    return sandbox.window.VagaAICv;
  }
  const analises = (...listas) => listas.map((l) => ({ result: { keywords_faltando: l } }));

  it('ordena as lacunas pelas mais pedidas', () => {
    const { calcularLacunas } = carregar();
    const r = calcularLacunas({ nome: 'Ana' }, analises(['SQL', 'Growth'], ['SQL'], ['SQL', 'CRM']));
    assert.deepEqual(Array.from(r.gaps), ['SQL', 'Growth', 'CRM']);
    assert.equal(r.freq.SQL, 3);
    assert.equal(r.totalVagas, 3);
  });

  it('não acusa lacuna de competência citada só num projeto', () => {
    // O extrator do painel ignorava projetos: quem só tinha Python num projeto
    // pessoal via "Python" listado como lacuna na home e como coberto no hub.
    const { calcularLacunas } = carregar();
    const cv = { nome: 'Ana', projetos: [{ nome: 'ETL', bullets: ['Pipeline em Python'] }] };
    const r = calcularLacunas(cv, analises(['Python', 'Kafka']));
    assert.deepEqual(Array.from(r.gaps), ['Kafka']);
    assert.equal(r.cobertas, 1);
  });

  it('não acusa lacuna de competência que está só no texto importado', () => {
    const { calcularLacunas } = carregar();
    const cv = { nome: 'Ana', raw_text: 'Experiência com Salesforce e HubSpot' };
    const r = calcularLacunas(cv, analises(['Salesforce', 'SAP']));
    assert.deepEqual(Array.from(r.gaps), ['SAP']);
  });

  it('ignora keyword vazia e não quebra com entrada malformada', () => {
    const { calcularLacunas } = carregar();
    const r = calcularLacunas(null, [{ result: { keywords_faltando: ['', '  ', null] } }, {}, null]);
    assert.deepEqual(Array.from(r.gaps), []);
    assert.equal(r.totalVagas, 3);
  });
});
