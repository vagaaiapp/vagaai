// /api/stripe-portal.js
// Cria uma sessão no Stripe Customer Portal e retorna a URL de redirecionamento

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.vagaai.app.br');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    // Valida token e obtém user
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
    const user = await userRes.json();

    // Busca stripe_customer_id na tabela subscriptions
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id,plan,status`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await subRes.json();
    const sub = rows?.[0];
    const customerId = sub?.stripe_customer_id;

    if (!customerId) {
      return res.status(404).json({ error: 'no_subscription', message: 'Nenhuma assinatura encontrada para este usuário.' });
    }

    // Cria sessão no Stripe Customer Portal
    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId,
        return_url: 'https://www.vagaai.app.br/dashboard',
      }).toString(),
    });

    if (!portalRes.ok) {
      const errData = await portalRes.json();
      console.error('Stripe portal error:', errData);
      return res.status(502).json({ error: errData?.error?.message || 'Erro ao criar portal Stripe.' });
    }

    const portal = await portalRes.json();
    return res.status(200).json({ url: portal.url });
  } catch (err) {
    console.error('stripe-portal error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
