// /api/transcribe.js
// Transcreve respostas em áudio do Simulador de Entrevista.
// Mantém a mesma trava de plano do /api/interview: somente Pro.

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
const OPENAI_KEY = process.env.OPENAI_API_KEY;

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

function decodeBase64Audio(audioBase64) {
  const clean = String(audioBase64 || '').replace(/^data:audio\/[a-z0-9.+-]+;base64,/i, '');
  if (!clean) return null;
  return Buffer.from(clean, 'base64');
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
      message: 'A resposta por áudio é exclusiva de quem tem acesso ao simulador.',
      plan
    });
  }

  if (!OPENAI_KEY) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada' });

  const { audioBase64, mimeType } = req.body || {};
  const buffer = decodeBase64Audio(audioBase64);
  if (!buffer || buffer.length < 1000) return res.status(400).json({ error: 'Áudio inválido ou vazio' });
  if (buffer.length > 7 * 1024 * 1024) return res.status(413).json({ error: 'Áudio muito grande. Grave uma resposta mais curta.' });

  const type = /^audio\//.test(mimeType || '') ? mimeType : 'audio/webm';
  const ext = type.includes('mp4') ? 'mp4' : type.includes('mpeg') || type.includes('mp3') ? 'mp3' : type.includes('ogg') ? 'ogg' : 'webm';

  try {
    const form = new FormData();
    form.append('model', process.env.OPENAI_TRANSCRIBE_MODEL || 'whisper-1');
    form.append('language', 'pt');
    form.append('response_format', 'json');
    form.append('file', new Blob([buffer], { type }), `resposta.${ext}`);

    const tr = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form
    });

    const data = await tr.json();
    if (!tr.ok) {
      console.error('transcribe OpenAI error:', tr.status, data);
      return res.status(502).json({ error: 'Falha ao transcrever o áudio' });
    }

    return res.status(200).json({ text: (data.text || '').trim() });
  } catch (err) {
    console.error('transcribe.js error:', err);
    return res.status(500).json({ error: 'Erro interno ao transcrever áudio' });
  }
}
