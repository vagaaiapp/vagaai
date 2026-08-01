// /api/cv-voice.js
// Entrada por voz do criador de currículo (/cv).
// Grava → transcreve (AssemblyAI) → estrutura com IA no formato do campo.
// O usuário nunca vê a transcrição crua: o retorno já vem pronto para colar
// no campo, e ele revisa dali.
//
// field=resumo      -> texto corrido do resumo profissional (sf_resumo)
// field=bullets     -> uma entrega por linha, verbo na frente (efec_bul_*)
// field=experiencia -> relato organizado, para os campos "conte com suas
//                      palavras" dos funis (fExp, qExp, cb-experiencias), cujo
//                      texto ainda passa por outra IA que monta o currículo
//
// Aceita usuário anônimo: os funis de currículo rodam antes do cadastro, e é
// justamente lá que a barra do campo em branco derruba mais gente. O limite
// anônimo é por IP, como em analyze.js.

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
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Transcrição é cobrada por minuto e cada chamada ainda gasta um Claude.
// 20/h por usuário cobre um currículo inteiro com folga e trava abuso.
const USER_LIMIT = 20;
const USER_WINDOW_MS = 60 * 60 * 1000;

// Anônimo é mais apertado: sem conta não há a quem cobrar o custo. 12/24h
// cobre com folga preencher um currículo no funil inteiro.
const ANON_IP_LIMIT = 12;
const ANON_IP_WINDOW_MS = 24 * 60 * 60 * 1000;

// IP do cliente para rate-limit. Prefere x-real-ip (definido pela Vercel, não
// spoofável pelo cliente) em vez do 1º item de x-forwarded-for. Mesma função
// de analyze.js.
function clientIp(req) {
  const realIp = (req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : 'unknown';
}

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

async function callClaude(prompt, maxTokens = 700) {
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
      temperature: 0.4,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// Regra que vale para os dois formatos: a IA reescreve, nunca inventa.
const REGRAS = `REGRAS OBRIGATORIAS:
- Use SOMENTE o que a pessoa falou. Nunca invente empresa, cargo, tecnologia, numero ou resultado.
- Se a pessoa deu um numero ou percentual, mantenha o numero.
- Se ela falou de forma vaga, escreva de forma vaga porem profissional. Nao preencha lacuna com suposicao.
- Portugues do Brasil, tom profissional e direto, sem marcas de fala ("tipo", "ne", "ai eu").
- Nao use emoji, nao use markdown, nao comente nada. Responda apenas com o texto final.`;

function promptResumo(transcript, ctx) {
  const alvo = ctx.titulo ? `\nCargo pretendido pela pessoa: ${String(ctx.titulo).slice(0, 120)}` : '';
  return `Voce escreve curriculos no mercado brasileiro. A pessoa gravou um audio falando sobre a propria carreira. Transforme a fala em um RESUMO PROFISSIONAL de curriculo.${alvo}

FALA TRANSCRITA:
"""
${transcript.slice(0, 4000)}
"""

FORMATO: um unico paragrafo de 3 a 4 frases, entre 350 e 600 caracteres. Escreva na terceira pessoa implicita (sem "eu", sem o nome da pessoa): comece por algo como "Profissional de..." ou pelo cargo/area. Priorize area de atuacao, tempo de experiencia, competencias centrais e resultados citados.

${REGRAS}`;
}

function promptBullets(transcript, ctx) {
  const vaga = [ctx.cargo && `Cargo: ${String(ctx.cargo).slice(0, 120)}`, ctx.empresa && `Empresa: ${String(ctx.empresa).slice(0, 120)}`]
    .filter(Boolean).join(' | ');
  const ctxLine = vaga ? `\nContexto da experiencia: ${vaga}` : '';
  return `Voce escreve curriculos no mercado brasileiro. A pessoa gravou um audio falando sobre o que fazia em um emprego. Transforme a fala em ATIVIDADES E RESULTADOS de curriculo.${ctxLine}

FALA TRANSCRITA:
"""
${transcript.slice(0, 4000)}
"""

FORMATO: de 3 a 5 linhas, uma entrega por linha, sem numeracao e sem hifen/bullet no inicio. Cada linha comeca com um verbo de acao no passado (ex: "Gerenciei", "Reduzi", "Implementei") e tem no maximo 160 caracteres. Coloque as linhas com numero ou resultado primeiro.

${REGRAS}`;
}

// Campos "conte com suas palavras" dos funis. Aqui o texto ainda passa por
// outra IA que monta o currículo, entao a saida NAO deve ser formatada como
// curriculo: o objetivo e so limpar a fala e preservar cada detalhe util.
function promptExperiencia(transcript, ctx) {
  const alvo = ctx.cargo ? `\nCargo desejado pela pessoa: ${String(ctx.cargo).slice(0, 120)}` : '';
  return `A pessoa gravou um audio contando a propria experiencia profissional para preencher um formulario de curriculo. Reescreva a fala como um relato organizado e legivel.${alvo}

FALA TRANSCRITA:
"""
${transcript.slice(0, 5000)}
"""

FORMATO: um paragrafo curto por emprego citado, na ordem em que a pessoa falou. Em cada um, deixe claro empresa, cargo, periodo e o que ela fazia, quando ela tiver dito isso. Texto corrido e simples, sem topicos e sem titulos. Preserve TODO detalhe util que ela deu (numeros, ferramentas, tamanho de equipe, metas) — este texto ainda sera transformado em curriculo depois, entao perder detalhe aqui e perder para sempre.

${REGRAS}`;
}

const PROMPTS = {
  resumo: { build: promptResumo, maxTokens: 600 },
  bullets: { build: promptBullets, maxTokens: 700 },
  experiencia: { build: promptExperiencia, maxTokens: 1200 },
};

function limparSaida(text, field) {
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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Token é opcional: os funis de currículo rodam antes do cadastro.
  const token = (req.headers.authorization || '').replace('Bearer ', '').trim();
  const user = token ? await getUserFromToken(token) : null;

  const ok = user
    ? await checkAndCountLimit({ key: `u:${user.id}:cvvoice`, limit: USER_LIMIT, windowMs: USER_WINDOW_MS })
    : await checkAndCountLimit({ key: `ip:${clientIp(req)}:cvvoice`, limit: ANON_IP_LIMIT, windowMs: ANON_IP_WINDOW_MS });
  if (!ok) {
    return res.status(429).json({
      error: user
        ? 'Voce atingiu o limite de gravacoes desta hora. Tente novamente mais tarde.'
        : 'Voce atingiu o limite de gravacoes por hoje. Crie sua conta para continuar.'
    });
  }

  const { field, audioBase64, context } = req.body || {};
  if (!PROMPTS[field]) {
    return res.status(400).json({ error: 'field invalido. Use resumo, bullets ou experiencia' });
  }
  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const transcript = await transcribeAudio(audioBase64);
    if (!transcript || transcript.length < 15) {
      return res.status(422).json({ error: 'Nao consegui entender o audio. Fale um pouco mais e mais perto do microfone.' });
    }

    const ctx = context && typeof context === 'object' ? context : {};
    const spec = PROMPTS[field];
    const raw = await callClaude(spec.build(transcript, ctx), spec.maxTokens);
    const text = limparSaida(raw, field);

    if (!text) return res.status(502).json({ error: 'Falha ao organizar o texto. Tente gravar novamente.' });

    // transcript volta só para debug/telemetria futura; a UI usa `text`.
    return res.status(200).json({ text, transcript });
  } catch (err) {
    console.error('cv-voice.js error:', err);
    return res.status(err.statusCode || 500).json({ error: err.publicMessage || 'Erro interno. Tente novamente.' });
  }
}
