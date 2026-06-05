const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const GA4_PROPERTY_ID  = process.env.GA4_PROPERTY_ID;
const GA4_CLIENT_ID    = process.env.GA4_CLIENT_ID;
const GA4_CLIENT_SECRET = process.env.GA4_CLIENT_SECRET;
const GA4_REFRESH_TOKEN = process.env.GA4_REFRESH_TOKEN;

const ADMIN_EMAILS = ['contato@vagaai.app.br', 'jvhr96@gmail.com'];

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

// ─── GA4 helpers ─────────────────────────────────────────────────────────────

async function getGA4AccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: GA4_CLIENT_ID,
      client_secret: GA4_CLIENT_SECRET,
      refresh_token: GA4_REFRESH_TOKEN,
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth token error: ' + JSON.stringify(data));
  return data.access_token;
}

async function runGA4Report(token, body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) throw new Error('GA4 runReport error: ' + await res.text());
  return res.json();
}

async function fetchGA4Data() {
  if (!GA4_PROPERTY_ID || !GA4_CLIENT_ID || !GA4_CLIENT_SECRET || !GA4_REFRESH_TOKEN) {
    throw new Error('GA4 não configurado (env vars ausentes)');
  }
  const ga4Token = await getGA4AccessToken();
  const [overviewRes, eventsRes, pagesRes] = await Promise.all([
    runGA4Report(ga4Token, {
      dateRanges: [
        { startDate: '30daysAgo', endDate: 'today' },
        { startDate: '60daysAgo', endDate: '31daysAgo' },
      ],
      metrics: [
        { name: 'activeUsers' }, { name: 'sessions' },
        { name: 'screenPageViews' }, { name: 'bounceRate' },
        { name: 'averageSessionDuration' },
      ],
    }),
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ['analyze_start', 'analyze_complete', 'begin_checkout', 'cv_download_click'] },
        },
      },
    }),
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 5,
    }),
  ]);
  const cur = overviewRes.rows?.[0]?.metricValues || [];
  const prev = overviewRes.rows?.[1]?.metricValues || [];
  const overview = {
    users: parseInt(cur[0]?.value || 0), users_prev: parseInt(prev[0]?.value || 0),
    sessions: parseInt(cur[1]?.value || 0), sessions_prev: parseInt(prev[1]?.value || 0),
    pageviews: parseInt(cur[2]?.value || 0),
    bounce_rate: parseFloat(cur[3]?.value || 0),
    avg_session: parseFloat(cur[4]?.value || 0),
  };
  const eventMap = {};
  for (const row of (eventsRes.rows || [])) eventMap[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value || 0);
  const funnel = {
    analyze_start: eventMap['analyze_start'] || 0,
    analyze_complete: eventMap['analyze_complete'] || 0,
    begin_checkout: eventMap['begin_checkout'] || 0,
    cv_download: eventMap['cv_download_click'] || 0,
  };
  const pages = (pagesRes.rows || []).map(r => ({
    path: r.dimensionValues[0].value,
    views: parseInt(r.metricValues[0].value || 0),
    users: parseInt(r.metricValues[1].value || 0),
  }));
  return { overview, funnel, pages };
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
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  // Rota GA4 separada para não atrasar o dashboard principal
  if (req.query.action === 'ga4') {
    try {
      const ga4 = await fetchGA4Data();
      return res.status(200).json(ga4);
    } catch (err) {
      console.error('GA4 error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao buscar dados do GA4' });
    }
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
