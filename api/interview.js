// /api/interview.js
// action=generate: gera perguntas | action=evaluate: avalia resposta | action=transcribe: transcreve audio
//   -> Simulador de entrevista. Requer plano Pro. As tres exigem token + Pro.
// action=cv_voice: entrada por voz do criador de curriculo (/cv, /curriculo,
//   /onboarding/curriculo, /onboarding/vaga, /app). Aceita anonimo — os funis
//   de curriculo rodam antes do cadastro, e e la que a barra do campo em
//   branco derruba mais gente. Vive neste arquivo (em vez de api/cv-voice.js)
//   porque o Hobby plan da Vercel limita a 12 Serverless Functions por
//   deployment e o projeto ja estava no teto; ver tests/vercel-config.test.js.

import { resolvePlan } from '../lib/entitlements.js';
import { checkAndCountLimit } from '../lib/ratelimit.js';
import { transcribeAudio } from '../lib/transcribe.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb'
    }
  }
};

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
  } catch {
    return null;
  }
}

// Rate limit por usuário — persistente (lib/ratelimit.js). O Map em memória
// anterior zerava a cada cold start do serverless e não segurava custo de IA.
const USER_LIMIT = 40;
const USER_WINDOW_MS = 60 * 60 * 1000;

function checkUserRateLimit(userId) {
  return checkAndCountLimit({ key: `u:${userId}:entrevista`, limit: USER_LIMIT, windowMs: USER_WINDOW_MS });
}

async function getUserPlan(userId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&order=created_at.desc&limit=1&select=plan,status`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const rows = await res.json();
    // Fonte única de verdade de plano/status (lib/entitlements.js)
    return resolvePlan(rows?.[0]);
  } catch {
    return 'free';
  }
}

async function callClaude(prompt, maxTokens = 2000, temperature = 0.7) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

function cleanJsonText(text) {
  return String(text || '').replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
}

async function generateQuestions(job, cv) {
  const prompt = `Voce e um especialista em processos seletivos no Brasil. Analise a vaga e o curriculo abaixo e gere 8 perguntas de entrevista personalizadas.

VAGA:
${job.slice(0, 3000)}

CURRICULO:
${cv.slice(0, 3000)}

Gere exatamente 8 perguntas no seguinte formato JSON:
{
  "empresa": "nome da empresa se identificavel, senao null",
  "cargo": "titulo do cargo",
  "perguntas": [
    {
      "id": 1,
      "categoria": "Comportamental|Tecnica|Situacional|Motivacional",
      "pergunta": "texto da pergunta",
      "dica": "o que o entrevistador quer avaliar com essa pergunta (1 frase curta)",
      "nivel": "facil|medio|dificil"
    }
  ]
}

Misture os tipos:
- 2-3 perguntas comportamentais baseadas no CV
- 2-3 perguntas tecnicas baseadas nos requisitos da vaga
- 1-2 situacionais com cenarios hipoteticos da vaga
- 1 motivacional sobre a empresa ou vaga

Responda APENAS com o JSON, sem markdown.`;

  const text = await callClaude(prompt, 2000);
  return JSON.parse(cleanJsonText(text));
}

async function evaluateAnswer(question, answer, job, cv) {
  const prompt = `Voce e um recrutador senior experiente no mercado brasileiro. Avalie a resposta do candidato para a pergunta de entrevista.

CONTEXTO DA VAGA:
${job.slice(0, 1500)}

PERGUNTA: "${question}"

RESPOSTA DO CANDIDATO:
"${answer}"

Avalie e retorne APENAS este JSON, sem markdown:
{
  "nota": <numero de 1 a 5>,
  "resumo": "<avaliacao em 1 frase, direta, honesta e construtiva>",
  "pontos_fortes": ["<ponto forte 1>", "<ponto forte 2>"],
  "melhorar": ["<o que melhorar 1>", "<o que melhorar 2>"],
  "resposta_modelo": "<como o candidato ideal responderia, em 2-3 frases>",
  "dica_final": "<1 dica pratica e especifica para melhorar essa resposta>"
}

Seja direto e honesto. Nota 5 = resposta excelente, 3 = aceitavel mas pode melhorar, 1 = resposta fraca.`;

  const text = await callClaude(prompt, 1500);
  return JSON.parse(cleanJsonText(text));
}

// ─── cv_voice: entrada por voz dos criadores/funis de currículo ─────────────
// field=resumo      -> texto corrido do resumo profissional (sf_resumo)
// field=bullets     -> uma entrega por linha, verbo na frente (efec_bul_*)
// field=experiencia -> relato organizado, para os campos "conte com suas
//                      palavras" dos funis (fExp, qExp, cb-experiencias), cujo
//                      texto ainda passa por outra IA que monta o currículo
//
// O usuário nunca vê a transcrição crua: o retorno já vem pronto para colar
// no campo, e ele revisa dali.

// Transcrição é cobrada por minuto e cada chamada ainda gasta um Claude.
// 20/h por usuário cobre um currículo inteiro com folga e trava abuso.
const CVV_USER_LIMIT = 20;
const CVV_USER_WINDOW_MS = 60 * 60 * 1000;

// Anônimo é mais apertado: sem conta não há a quem cobrar o custo. 12/24h
// cobre com folga preencher um currículo no funil inteiro.
const CVV_ANON_IP_LIMIT = 12;
const CVV_ANON_IP_WINDOW_MS = 24 * 60 * 60 * 1000;

// IP do cliente para rate-limit. Prefere x-real-ip (definido pela Vercel, não
// spoofável pelo cliente) em vez do 1º item de x-forwarded-for. Mesma função
// de analyze.js.
function clientIp(req) {
  const realIp = (req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : 'unknown';
}

// Regra que vale para os três formatos: a IA reescreve, nunca inventa.
const CVV_REGRAS = `REGRAS OBRIGATORIAS:
- Use SOMENTE o que a pessoa falou. Nunca invente empresa, cargo, tecnologia, numero ou resultado.
- Se a pessoa deu um numero ou percentual, mantenha o numero.
- Se ela falou de forma vaga, escreva de forma vaga porem profissional. Nao preencha lacuna com suposicao.
- Portugues do Brasil, tom profissional e direto, sem marcas de fala ("tipo", "ne", "ai eu").
- Nao use emoji, nao use markdown, nao comente nada. Responda apenas com o texto final.`;

function cvvPromptResumo(transcript, ctx) {
  const alvo = ctx.titulo ? `\nCargo pretendido pela pessoa: ${String(ctx.titulo).slice(0, 120)}` : '';
  return `Voce escreve curriculos no mercado brasileiro. A pessoa gravou um audio falando sobre a propria carreira. Transforme a fala em um RESUMO PROFISSIONAL de curriculo.${alvo}

FALA TRANSCRITA:
"""
${transcript.slice(0, 4000)}
"""

FORMATO: um unico paragrafo de 3 a 4 frases, entre 350 e 600 caracteres. Escreva na terceira pessoa implicita (sem "eu", sem o nome da pessoa): comece por algo como "Profissional de..." ou pelo cargo/area. Priorize area de atuacao, tempo de experiencia, competencias centrais e resultados citados.

${CVV_REGRAS}`;
}

function cvvPromptBullets(transcript, ctx) {
  const vaga = [ctx.cargo && `Cargo: ${String(ctx.cargo).slice(0, 120)}`, ctx.empresa && `Empresa: ${String(ctx.empresa).slice(0, 120)}`]
    .filter(Boolean).join(' | ');
  const ctxLine = vaga ? `\nContexto da experiencia: ${vaga}` : '';
  return `Voce escreve curriculos no mercado brasileiro. A pessoa gravou um audio falando sobre o que fazia em um emprego. Transforme a fala em ATIVIDADES E RESULTADOS de curriculo.${ctxLine}

FALA TRANSCRITA:
"""
${transcript.slice(0, 4000)}
"""

FORMATO: de 3 a 5 linhas, uma entrega por linha, sem numeracao e sem hifen/bullet no inicio. Cada linha comeca com um verbo de acao no passado (ex: "Gerenciei", "Reduzi", "Implementei") e tem no maximo 160 caracteres. Coloque as linhas com numero ou resultado primeiro.

${CVV_REGRAS}`;
}

// Campos "conte com suas palavras" dos funis. Aqui o texto ainda passa por
// outra IA que monta o currículo, entao a saida NAO deve ser formatada como
// curriculo: o objetivo e so limpar a fala e preservar cada detalhe util.
function cvvPromptExperiencia(transcript, ctx) {
  const alvo = ctx.cargo ? `\nCargo desejado pela pessoa: ${String(ctx.cargo).slice(0, 120)}` : '';
  return `A pessoa gravou um audio contando a propria experiencia profissional para preencher um formulario de curriculo. Reescreva a fala como um relato organizado e legivel.${alvo}

FALA TRANSCRITA:
"""
${transcript.slice(0, 5000)}
"""

FORMATO: um paragrafo curto por emprego citado, na ordem em que a pessoa falou. Em cada um, deixe claro empresa, cargo, periodo e o que ela fazia, quando ela tiver dito isso. Texto corrido e simples, sem topicos e sem titulos. Preserve TODO detalhe util que ela deu (numeros, ferramentas, tamanho de equipe, metas) — este texto ainda sera transformado em curriculo depois, entao perder detalhe aqui e perder para sempre.

${CVV_REGRAS}`;
}

const CVV_PROMPTS = {
  resumo: { build: cvvPromptResumo, maxTokens: 600 },
  bullets: { build: cvvPromptBullets, maxTokens: 700 },
  experiencia: { build: cvvPromptExperiencia, maxTokens: 1200 },
};

function cvvLimparSaida(text, field) {
  let out = String(text || '').replace(/```[a-z]*\n?/gi, '').trim();
  if (field === 'bullets') {
    out = out
      .split('\n')
      .map(l => l.replace(/^\s*(?:[-*•–—]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
      .slice(0, 6)
      .join('\n');
  } else if (field === 'resumo') {
    // Resumo é um parágrafo só.
    out = out.replace(/\s*\n+\s*/g, ' ').trim();
  } else {
    // Experiência mantém a quebra entre empregos, sem linhas vazias extras.
    out = out.replace(/\n{3,}/g, '\n\n').trim();
  }
  return out;
}

async function handleCvVoice(req, res) {
  // Token é opcional: os funis de currículo rodam antes do cadastro.
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const user = token ? await getUserFromToken(token) : null;

  const ok = user
    ? await checkAndCountLimit({ key: `u:${user.id}:cvvoice`, limit: CVV_USER_LIMIT, windowMs: CVV_USER_WINDOW_MS })
    : await checkAndCountLimit({ key: `ip:${clientIp(req)}:cvvoice`, limit: CVV_ANON_IP_LIMIT, windowMs: CVV_ANON_IP_WINDOW_MS });
  if (!ok) {
    return res.status(429).json({
      error: user
        ? 'Voce atingiu o limite de gravacoes desta hora. Tente novamente mais tarde.'
        : 'Voce atingiu o limite de gravacoes por hoje. Crie sua conta para continuar.'
    });
  }

  const { field, audioBase64, context } = req.body || {};
  if (!CVV_PROMPTS[field]) {
    return res.status(400).json({ error: 'field invalido. Use resumo, bullets ou experiencia' });
  }
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const transcript = await transcribeAudio(audioBase64);
  if (!transcript || transcript.length < 15) {
    return res.status(422).json({ error: 'Nao consegui entender o audio. Fale um pouco mais e mais perto do microfone.' });
  }

  const ctx = context && typeof context === 'object' ? context : {};
  const spec = CVV_PROMPTS[field];
  const raw = await callClaude(spec.build(transcript, ctx), spec.maxTokens, 0.4);
  const text = cvvLimparSaida(raw, field);

  if (!text) return res.status(502).json({ error: 'Falha ao organizar o texto. Tente gravar novamente.' });

  // transcript volta só para debug/telemetria futura; a UI usa `text`.
  return res.status(200).json({ text, transcript });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { action } = req.body || {};

  // cv_voice tem regras próprias de acesso (anônimo permitido, sem gate de
  // plano) — não passa pela exigência de token+Pro abaixo, que é só da
  // entrevista.
  if (action === 'cv_voice') {
    try {
      return await handleCvVoice(req, res);
    } catch (err) {
      console.error('interview.js cv_voice error:', err);
      return res.status(err.statusCode || 500).json({ error: err.publicMessage || 'Erro interno. Tente novamente.' });
    }
  }

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  const plan = await getUserPlan(user.id);
  if (plan !== 'pro') {
    return res.status(403).json({
      error: 'plano_insuficiente',
      message: 'O Simulador de Entrevista e exclusivo do plano Pro.',
      plan
    });
  }

  if (!(await checkUserRateLimit(user.id))) {
    return res.status(429).json({ error: 'Limite de uso atingido. Tente novamente mais tarde.' });
  }

  const { job, cv, question, answer, audioBase64 } = req.body || {};

  try {
    if (action === 'generate') {
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });
      if (!job || job.length < 50) return res.status(400).json({ error: 'Vaga muito curta' });
      if (!cv || cv.length < 50) return res.status(400).json({ error: 'CV muito curto' });
      const result = await generateQuestions(job, cv);
      return res.status(200).json(result);
    }

    if (action === 'evaluate') {
      if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });
      if (!question) return res.status(400).json({ error: 'Pergunta obrigatoria' });
      if (!answer || answer.trim().length < 10) return res.status(400).json({ error: 'Resposta muito curta' });
      const result = await evaluateAnswer(question, answer, job || '', cv || '');
      return res.status(200).json(result);
    }

    if (action === 'transcribe') {
      const text = await transcribeAudio(audioBase64);
      return res.status(200).json({ text });
    }

    return res.status(400).json({ error: 'action invalida. Use generate, evaluate, transcribe ou cv_voice' });
  } catch (err) {
    console.error('interview.js error:', err);
    return res.status(err.statusCode || 500).json({ error: err.publicMessage || 'Erro interno. Tente novamente.' });
  }
}
