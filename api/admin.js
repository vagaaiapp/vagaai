const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const ADMIN_EMAIL = 'contato@vagaai.app.br';

// ─── Auth helpers ─────────────────────────────────────────────────────────────

async function getUserFromToken(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Supabase helpers ─────────────────────────────────────────────────────────

async function fetchSupabaseData() {
  const sb = (path, params = '') =>
    fetch(`${SUPABASE_URL}${path}${params}`, {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    });

  // Total users count from auth.users (via admin API)
  const usersRes = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const usersData = await usersRes.json();
  const users = usersData.users || [];
  const totalUsers = usersData.total || users.length;

  // user_credits
  const creditsRes = await sb('/rest/v1/user_credits?select=user_id,credits');
  const credits = await creditsRes.json();

  // analyses with job_info fields
  const analysesRes = await sb(
    '/rest/v1/analyses?select=id,user_id,score,nivel,job_excerpt,created_at,result&order=created_at.desc&limit=500'
  );
  const analyses = await analysesRes.json();

  return { users, totalUsers, credits, analyses };
}

// ─── Stripe helpers ───────────────────────────────────────────────────────────

async function fetchStripeData() {
  if (!STRIPE_SECRET_KEY) return null;

  const stripeGet = async (path) => {
    const res = await fetch(`https://api.stripe.com/v1${path}`, {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      },
    });
    if (!res.ok) {
      const err = await res.text();
      console.error(`Stripe error ${path}:`, err);
      return null;
    }
    return res.json();
  };

  const thirtyDaysAgo = Math.floor(Date.now() / 1000) - 30 * 24 * 60 * 60;

  const [paymentIntents, balance, charges] = await Promise.all([
    stripeGet(`/payment_intents?limit=100&created[gte]=${thirtyDaysAgo}`),
    stripeGet('/balance'),
    stripeGet('/charges?limit=100'),
  ]);

  return { paymentIntents, balance, charges };
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify admin token
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido.' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase não configurado.' });
  }

  const user = await getUserFromToken(token);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  try {
    const [supabaseData, stripeData] = await Promise.all([
      fetchSupabaseData(),
      fetchStripeData().catch((err) => {
        console.error('Stripe fetch error:', err);
        return null;
      }),
    ]);

    return res.status(200).json({
      supabase: supabaseData,
      stripe: stripeData,
    });
  } catch (err) {
    console.error('Admin handler error:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar dados.' });
  }
}
