// /api/cover-letter.js — Gera carta de apresentação personalizada
// Disponível a partir do plano Starter

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
    const sub = rows?.[0];
    if (!sub || sub.status !== 'active') return 'free';
    return sub.plan || 'free';
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

  if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'API key not configured' });

  const { job, cv, tom } = req.body || {};
  if (!job || job.length < 50) return res.status(400).json({ error: 'Vaga muito curta' });
  if (!cv || cv.length < 50) return res.status(400).json({ error: 'CV muito curto' });

  const tomText = tom === 'formal' ? 'formal e profissional' : tom === 'criativo' ? 'criativo e diferenciado' : 'profissional e direto';

  const prompt = `Você é especialista em carreira no Brasil. Escreva uma carta de apresentação personalizada.

TOM: ${tomText}
VAGA: ${job.slice(0, 2500)}
CURRÍCULO: ${cv.slice(0, 2500)}

Escreva uma carta de apresentação que:
1. Abre com um gancho forte (NÃO comece com "Prezado(a)")
2. Conecta as experiências mais relevantes do CV com os requisitos da vaga
3. Demonstra conhecimento sobre a empresa/área
4. Tem entre 200-280 palavras
5. Termina com um chamado à ação claro

Retorne APENAS este JSON (sem markdown):
{
  "assunto": "<sugestão de assunto para o email>",
  "carta": "<texto completo da carta, com quebras de parágrafo usando \\n\\n>",
  "destaques": ["<ponto forte 1 destacado na carta>", "<ponto forte 2>", "<ponto forte 3>"],
  "palavras": <contagem de palavras>
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
        max_tokens: 1500,
        temperature: 0.6,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) throw new Error(`Anthropic ${response.status}`);
    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(clean);
    return res.status(200).json(result);
  } catch (err) {
    console.error('cover-letter.js error:', err);
    return res.status(500).json({ error: 'Erro ao gerar carta: ' + err.message });
  }
}
