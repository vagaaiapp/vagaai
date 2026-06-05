// /api/interview.js
// Simulador de entrevista com IA — exclusivo plano Pro
// action=generate: gera perguntas | action=evaluate: avalia resposta

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

async function getUserPlan(userId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const rows = await res.json();
    return rows?.[0]?.plan || 'free';
  } catch { return 'free'; }
}

async function callClaude(prompt, maxTokens = 2000) {
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
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!response.ok) throw new Error(`Anthropic ${response.status}`);
  const data = await response.json();
  return data.content?.[0]?.text || '';
}

// ── Gerar perguntas de entrevista ─────────────────────────────────────────────
async function generateQuestions(job, cv) {
  const prompt = `Você é um especialista em processos seletivos no Brasil. Analise a vaga e o currículo abaixo e gere 8 perguntas de entrevista personalizadas.

VAGA:
${job.slice(0, 3000)}

CURRÍCULO:
${cv.slice(0, 3000)}

Gere exatamente 8 perguntas no seguinte formato JSON:
{
  "empresa": "nome da empresa se identificável, senão null",
  "cargo": "título do cargo",
  "perguntas": [
    {
      "id": 1,
      "categoria": "Comportamental|Técnica|Situacional|Motivacional",
      "pergunta": "texto da pergunta",
      "dica": "o que o entrevistador quer avaliar com essa pergunta (1 frase curta)",
      "nivel": "fácil|médio|difícil"
    }
  ]
}

Misture os tipos:
- 2-3 perguntas comportamentais (baseadas no CV)
- 2-3 perguntas técnicas (baseadas nos requisitos da vaga)
- 1-2 situacionais (cenários hipotéticos da vaga)
- 1 motivacional (por que essa empresa/vaga)

Responda APENAS com o JSON, sem markdown.`;

  const text = await callClaude(prompt, 2000);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ── Avaliar resposta ──────────────────────────────────────────────────────────
async function evaluateAnswer(question, answer, job, cv) {
  const prompt = `Você é um recrutador sênior experiente no mercado brasileiro. Avalie a resposta do candidato para a pergunta de entrevista.

CONTEXTO DA VAGA:
${job.slice(0, 1500)}

PERGUNTA: "${question}"

RESPOSTA DO CANDIDATO:
"${answer}"

Avalie e retorne APENAS este JSON (sem markdown):
{
  "nota": <número de 1 a 5>,
  "resumo": "<avaliação em 1 frase — direto, honesto, construtivo>",
  "pontos_fortes": ["<ponto forte 1>", "<ponto forte 2>"],
  "melhorar": ["<o que melhorar 1>", "<o que melhorar 2>"],
  "resposta_modelo": "<como o candidato ideal responderia — 2-3 frases>",
  "dica_final": "<1 dica prática e específica para melhorar essa resposta>"
}

Seja direto e honesto. Nota 5 = resposta excelente, 3 = aceitável mas pode melhorar, 1 = resposta fraca.`;

  const text = await callClaude(prompt, 1500);
  const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  return JSON.parse(clean);
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  const user = await getUserFromToken(token);
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  // Verifica plano — Pro obrigatório para simulador
  const plan = await getUserPlan(user.id);
  if (plan !== 'pro') {
    return res.status(403).json({
      error: 'plano_insuficiente',
      message: 'O Simulador de Entrevista é exclusivo do plano Pro.',
      plan
    });
  }

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { action, job, cv, question, answer } = req.body || {};

  try {
    if (action === 'generate') {
      if (!job || job.length < 50) return res.status(400).json({ error: 'Vaga muito curta' });
      if (!cv || cv.length < 50) return res.status(400).json({ error: 'CV muito curto' });
      const result = await generateQuestions(job, cv);
      return res.status(200).json(result);

    } else if (action === 'evaluate') {
      if (!question) return res.status(400).json({ error: 'Pergunta obrigatória' });
      if (!answer || answer.trim().length < 10) return res.status(400).json({ error: 'Resposta muito curta' });
      const result = await evaluateAnswer(question, answer, job || '', cv || '');
      return res.status(200).json(result);

    } else {
      return res.status(400).json({ error: 'action inválida. Use generate ou evaluate' });
    }
  } catch (err) {
    console.error('interview.js error:', err);
    return res.status(500).json({ error: 'Erro interno: ' + err.message });
  }
}
