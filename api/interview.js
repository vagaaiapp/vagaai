// /api/interview.js
// Simulador de entrevista com IA. Requer plano Pro.
// action=generate: gera perguntas | action=evaluate: avalia resposta | action=transcribe: transcreve audio

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
const ASSEMBLYAI_KEY = process.env.ASSEMBLYAI_API_KEY;

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

const _userHits = new Map();
const USER_LIMIT = 40;
const USER_WINDOW_MS = 60 * 60 * 1000;

function checkUserRateLimit(userId) {
  const now = Date.now();
  const entry = _userHits.get(userId) || { count: 0, resetAt: now + USER_WINDOW_MS };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + USER_WINDOW_MS;
  }
  entry.count++;
  _userHits.set(userId, entry);
  return entry.count <= USER_LIMIT;
}

async function getUserPlan(userId) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    });
    const rows = await res.json();
    const sub = rows?.[0];
    if (!sub) return 'free';
    const paidStatuses = ['active', 'trialing', 'past_due'];
    if (!paidStatuses.includes(sub.status)) return 'free';
    return sub.plan || 'free';
  } catch {
    return 'free';
  }
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

function decodeBase64Audio(audioBase64) {
  const clean = String(audioBase64 || '').replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
  if (!clean) return null;
  return Buffer.from(clean, 'base64');
}

async function transcribeAudio(audioBase64, mimeType) {
  if (!ASSEMBLYAI_KEY) {
    const err = new Error('ASSEMBLYAI_API_KEY not configured');
    err.statusCode = 500;
    err.publicMessage = 'Servico de transcricao nao configurado';
    throw err;
  }

  const buffer = decodeBase64Audio(audioBase64);
  if (!buffer || buffer.length < 1000) {
    const err = new Error('Audio invalid');
    err.statusCode = 400;
    err.publicMessage = 'Audio invalido ou vazio';
    throw err;
  }
  if (buffer.length > 7 * 1024 * 1024) {
    const err = new Error('Audio too large');
    err.statusCode = 413;
    err.publicMessage = 'Audio muito grande. Grave uma resposta mais curta.';
    throw err;
  }

  // 1. Upload do áudio
  const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
    method: 'POST',
    headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/octet-stream' },
    body: buffer,
  });
  if (!uploadRes.ok) {
    console.error('AssemblyAI upload error:', uploadRes.status);
    const err = new Error('Upload failed');
    err.statusCode = 502;
    err.publicMessage = 'Falha ao enviar audio para transcricao';
    throw err;
  }
  const { upload_url } = await uploadRes.json();

  // 2. Submete transcrição
  const transcriptRes = await fetch('https://api.assemblyai.com/v2/transcript', {
    method: 'POST',
    headers: { 'Authorization': ASSEMBLYAI_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_url: upload_url, language_code: 'pt' }),
  });
  if (!transcriptRes.ok) {
    console.error('AssemblyAI transcript request error:', transcriptRes.status);
    const err = new Error('Transcription request failed');
    err.statusCode = 502;
    err.publicMessage = 'Falha ao iniciar transcricao';
    throw err;
  }
  const { id } = await transcriptRes.json();

  // 3. Polling até concluir (max ~7s)
  const pollingUrl = `https://api.assemblyai.com/v2/transcript/${id}`;
  for (let i = 0; i < 14; i++) {
    await new Promise(r => setTimeout(r, 500));
    const pollRes = await fetch(pollingUrl, { headers: { 'Authorization': ASSEMBLYAI_KEY } });
    const result = await pollRes.json();
    if (result.status === 'completed') return (result.text || '').trim();
    if (result.status === 'error') {
      console.error('AssemblyAI transcription error:', result.error);
      const err = new Error('Transcription error');
      err.statusCode = 502;
      err.publicMessage = 'Falha ao transcrever o audio';
      throw err;
    }
  }

  const err = new Error('Transcription timeout');
  err.statusCode = 504;
  err.publicMessage = 'Transcricao demorou demais. Tente novamente com uma resposta mais curta.';
  throw err;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  if (!checkUserRateLimit(user.id)) {
    return res.status(429).json({ error: 'Limite de uso atingido. Tente novamente mais tarde.' });
  }

  const { action, job, cv, question, answer, audioBase64, mimeType } = req.body || {};

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
      const text = await transcribeAudio(audioBase64, mimeType);
      return res.status(200).json({ text });
    }

    return res.status(400).json({ error: 'action invalida. Use generate, evaluate ou transcribe' });
  } catch (err) {
    console.error('interview.js error:', err);
    return res.status(err.statusCode || 500).json({ error: err.publicMessage || 'Erro interno. Tente novamente.' });
  }
}
