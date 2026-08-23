// /api/cover-letter.js — Gera carta de apresentação personalizada
// Disponível a partir do plano Starter

import { resolvePlan } from '../lib/entitlements.js';
import { checkAndCountLimit } from '../lib/ratelimit.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function getUserFromToken(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Rate limit por usuário — persistente (lib/ratelimit.js). O Map em memória
// anterior zerava a cada cold start do serverless e não segurava custo de IA.
const USER_LIMIT = 20;                 // máx 20 cartas/hora por usuário
const USER_WINDOW_MS = 60 * 60 * 1000;
function checkUserRateLimit(userId) {
  return checkAndCountLimit({ key: `u:${userId}:carta`, limit: USER_LIMIT, windowMs: USER_WINDOW_MS });
}

async function getUserPlan(userId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&order=created_at.desc&limit=1&select=plan,status`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const rows = await res.json();
    // Fonte única de verdade de plano/status (lib/entitlements.js)
    return resolvePlan(rows?.[0]);
  } catch { return 'free'; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const plan = await getUserPlan(user.id);
  if (plan === 'free') {
    return res.status(403).json({
      error: 'plano_insuficiente',
      message: 'Carta de apresentação disponível a partir do plano Starter.',
      plan
    });
  }

  if (!(await checkUserRateLimit(user.id))) {
    return res.status(429).json({ error: 'Limite de uso atingido. Tente novamente mais tarde.' });
  }

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { job, cv, tom, analise, motivacao, analysis_id, cargo, empresa } = req.body || {};
  if (!job || job.length < 50) return res.status(400).json({ error: 'Vaga muito curta' });
  if (!cv || cv.length < 50) return res.status(400).json({ error: 'CV muito curto' });

  /* A analise ja sabe quais requisitos o curriculo comprova, quais faltam e o
     que a empresa valoriza. Sem isso a carta e escrita de texto cru — ou seja,
     igual a de qualquer gerador generico, que e justamente o que recrutador
     descarta. Tudo aqui e opcional: sem analise, o prompt volta ao formato
     antigo. */
  const lista = (v, max) => (Array.isArray(v) ? v : [])
    .map(x => String(x == null ? '' : x).trim())
    .filter(Boolean)
    .slice(0, max);

  const an = analise && typeof analise === 'object' ? analise : {};
  const atende  = lista(an.keywords_encontradas, 12);
  const faltam  = lista(an.keywords_faltando, 6);
  const brief   = an.briefing_empresa && typeof an.briefing_empresa === 'object' ? an.briefing_empresa : {};
  const valoriza = lista(brief.o_que_valorizam, 4).concat(lista(brief.buscam_em_candidatos, 3));
  const score = Number(an.score);
  const temScore = Number.isFinite(score) && score >= 0 && score <= 100;

  // Motivacao e a unica coisa que a IA nao pode inventar — e o que separa uma
  // carta que parece de robo de uma que parece de gente.
  const porque = String(motivacao || '').trim().slice(0, 400);

  /* Estrategia pelo score: quando a aderência e baixa, a carta precisa DEFENDER
     a candidatura em vez de listar encaixes que o recrutador nao vai ver no CV.
     E onde a carta mais muda o resultado. */
  let estrategia;
  if (!temScore)      estrategia = 'Conecte o que o currículo comprova aos requisitos da vaga.';
  else if (score >= 75) estrategia = 'A aderência já e alta (' + Math.round(score) + '%). Seja curto e direto: reforce os dois encaixes mais fortes e não tente convencer de nada, o currículo já convence.';
  else if (score >= 50) estrategia = 'Aderência intermediária (' + Math.round(score) + '%). Lidere pelos requisitos comprovados e mostre como a experiência adjacente cobre o resto.';
  else                  estrategia = 'Aderência baixa (' + Math.round(score) + '%). Não esconda a lacuna: reconheça-a em uma frase, sem se desculpar, e use o resto da carta para mostrar por que a pessoa ainda entrega o resultado que a vaga precisa.';

  const blocoAnalise = [
    atende.length  ? 'REQUISITOS QUE O CURRÍCULO COMPROVA (cite ao menos 3 destes, com o contexto real do CV): ' + atende.join(', ') : '',
    faltam.length  ? 'REQUISITOS AUSENTES (NUNCA afirme possuí-los; no máximo enderece o principal): ' + faltam.join(', ') : '',
    valoriza.length? 'O QUE A EMPRESA VALORIZA (use no parágrafo de alinhamento, sem repetir literalmente): ' + valoriza.join(', ') : '',
    'ESTRATÉGIA: ' + estrategia,
    porque ? 'MOTIVAÇÃO DITA PELA PRÓPRIA PESSOA (use como base do gancho de abertura; corrija a redação, preserve o sentido e NUNCA invente detalhe que ela não disse): "' + porque + '"' : ''
  ].filter(Boolean).join('\n');

  const tomText = tom === 'formal' ? 'formal e profissional' : tom === 'criativo' ? 'criativo e diferenciado' : 'profissional e direto';

  const prompt = `Você é especialista em carreira no Brasil. Escreva uma carta de apresentação personalizada.

⚠️ REGRA ABSOLUTA: Use SOMENTE informações presentes no CURRÍCULO abaixo. NUNCA invente experiências, anos de carreira, certificações, métricas, números, habilidades ou realizações que não estejam explicitamente no CV. Se uma informação não está no CV, não a mencione.

TOM: ${tomText}
VAGA: ${job.slice(0, 2500)}
CURRÍCULO: ${cv.slice(0, 2500)}
${blocoAnalise}

Escreva uma carta de apresentação que:
1. Abre com um gancho forte (NÃO comece com "Prezado(a)")
2. Conecta APENAS as experiências presentes no CV com os requisitos da vaga
3. Demonstra alinhamento com a empresa baseado no que o CV comprova
4. Tem entre 250-400 palavras (padrão brasileiro), 3 a 5 parágrafos
5. Termina com um chamado à ação claro
6. Não fabrica conquistas: só mencione métricas e realizações que estão literalmente no CV
7. Evita as expressões que denunciam texto automático: "venho por meio desta",
   "proven track record", "apaixonado por", "profissional proativo", "trabalho
   bem em equipe". Prefira frase curta e fato concreto.
8. NUNCA usa travessão (\u2014). Ele quase não aparece na escrita profissional
   brasileira e é uma das marcas mais reconhecíveis de texto gerado por IA.
   Use vírgula, dois-pontos, parênteses ou duas frases.

Além da carta completa, produza duas reduções do MESMO argumento (não um texto novo):
- "curta": até 1200 caracteres, para colar em campo de formulário (Gupy, Vagas.com)
- "mensagem": 3 parágrafos curtos, até 600 caracteres, para mensagem de LinkedIn

Retorne APENAS este JSON (sem markdown):
{
  "assunto": "<sugestão de assunto para o email>",
  "carta": "<texto completo da carta, com quebras de parágrafo usando \\n\\n>",
  "curta": "<versão para campo de formulário>",
  "mensagem": "<versão para LinkedIn>",
  "requisitos_citados": ["<requisito da lista COMPROVA que a carta realmente menciona>"],
  "lacuna_enderecada": "<APENAS o nome do requisito ausente que a carta enderecou, no maximo 4 palavras. String vazia se nenhum foi enderecado. NAO explique como foi feito.>",
  "destaques": ["<ponto forte 1 destacado na carta>", "<ponto forte 2>", "<ponto forte 3>"],
  "palavras": <contagem de palavras da carta completa>
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 2600,
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);
    const data = await response.json();

    /* A resposta passou de um texto para tres (carta, curta e mensagem) mais a
       lista de requisitos citados. Truncada, o JSON chega invalido e o
       JSON.parse abaixo estoura num 500 generico — a pessoa perde a geracao sem
       saber por que. analyze.js ja checava isso; aqui faltava. */
    if (data.stop_reason === 'max_tokens') {
      console.error('cover-letter: resposta truncada (max_tokens)');
      return res.status(500).json({ error: 'A carta ficou incompleta. Tente novamente.' });
    }

    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(clean);
    // A tela mostra "menciona X dos Y requisitos que voce atende" — Y vem daqui,
    // nao da IA, para o numero nao depender de alucinacao.
    /* O modelo devolve quais requisitos citou, mas nada o impede de listar item
       que nao estava na lista, ou de repetir. Sem filtrar, a tela chegaria a
       mostrar "Menciona 12 dos 9 requisitos que voce atende". O cruzamento e
       feito aqui, contra a lista real que foi enviada no prompt. */
    const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const validos = new Set(atende.map(norm));
    result.requisitos_citados = [...new Set(
      (Array.isArray(result.requisitos_citados) ? result.requisitos_citados : [])
        .map(x => String(x == null ? '' : x).trim())
        .filter(x => x && validos.has(norm(x)))
        .map(norm)
    )].map(n => atende.find(a => norm(a) === n));
    result.requisitos_total = atende.length;
    result.usou_analise = atende.length > 0 || faltam.length > 0;

    /* Persistir e o ponto do recurso: ate aqui a carta so existia na aba aberta.
       Quem se candidata a 20 vagas nao conseguia reler nem reaproveitar nenhuma,
       e o painel nao tinha numero honesto para mostrar da ferramenta.

       Gravado no servidor, nao no navegador: a carta fica salva mesmo se a
       pessoa fechar a aba no meio, e o conteudo e o que a IA devolveu, sem
       passar por edicao do cliente. Falha de gravacao nao derruba a resposta —
       perder o historico e ruim, perder a carta recem-gerada e pior. */
    try {
      const salvar = await fetch(`${SUPABASE_URL}/rest/v1/cover_letters`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({
          user_id: user.id,
          analysis_id: typeof analysis_id === 'string' && analysis_id ? analysis_id : null,
          cargo: typeof cargo === 'string' ? cargo.slice(0, 200) : null,
          empresa: typeof empresa === 'string' ? empresa.slice(0, 200) : null,
          assunto: result.assunto || null,
          carta: result.carta || '',
          curta: result.curta || null,
          mensagem: result.mensagem || null,
          requisitos_citados: result.requisitos_citados || [],
          requisitos_total: result.requisitos_total || 0,
        }),
      });
      if (salvar.ok) {
        const linha = await salvar.json().catch(() => null);
        if (Array.isArray(linha) && linha[0]) result.id = linha[0].id;
      } else {
        console.warn('cover_letters insert falhou:', salvar.status, await salvar.text());
      }
    } catch (e) {
      console.warn('cover_letters insert erro:', e.message);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('cover-letter.js error:', err);
    return res.status(500).json({ error: 'Erro ao gerar a carta. Tente novamente.' });
  }
}
