// /api/subscription.js — retorna plano atual do usuário autenticado

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  // Valida token e obtém user
  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
    const user = await userRes.json();

    // Busca subscription
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${user.id}&select=*`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await subRes.json();
    const sub = rows?.[0];

    // Busca créditos avulsos (legado)
    const credRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${user.id}&select=credits,total_purchased`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const credRows = await credRes.json();
    const credits = credRows?.[0]?.credits || 0;
    const totalPurchased = credRows?.[0]?.total_purchased || 0;

    return res.status(200).json({
      plan: sub?.plan || 'free',
      status: sub?.status || 'active',
      current_period_end: sub?.current_period_end || null,
      cancel_at_period_end: sub?.cancel_at_period_end || false,
      analyses_used_this_month: sub?.analyses_used_this_month || 0,
      analyses_reset_at: sub?.analyses_reset_at || null,
      credits_legacy: credits,
      total_purchased_legacy: totalPurchased,
    });
  } catch (err) {
    console.error('subscription.js error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
