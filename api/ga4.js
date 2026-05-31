// api/ga4.js — GA4 Data API via OAuth2 refresh token
// Env vars necessárias:
//   GA4_PROPERTY_ID    — ex: 539587515
//   GA4_CLIENT_ID      — OAuth Desktop client ID
//   GA4_CLIENT_SECRET  — OAuth Desktop client secret
//   GA4_REFRESH_TOKEN  — refresh token do dono da propriedade

const SUPABASE_URL       = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const GA4_PROPERTY_ID    = process.env.GA4_PROPERTY_ID;
const GA4_CLIENT_ID      = process.env.GA4_CLIENT_ID;
const GA4_CLIENT_SECRET  = process.env.GA4_CLIENT_SECRET;
const GA4_REFRESH_TOKEN  = process.env.GA4_REFRESH_TOKEN;

const ADMIN_EMAILS = ['contato@vagaai.app.br', 'jvhr96@gmail.com'];

// ── Auth: verifica token Supabase ─────────────────────────────────────────────

async function getUserFromToken(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// ── OAuth2: troca refresh_token por access_token ──────────────────────────────

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     GA4_CLIENT_ID,
      client_secret: GA4_CLIENT_SECRET,
      refresh_token: GA4_REFRESH_TOKEN,
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('OAuth token error: ' + JSON.stringify(data));
  return data.access_token;
}

// ── GA4 Data API ──────────────────────────────────────────────────────────────

async function runReport(token, body) {
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

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers['authorization'] || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente' });

  const user = await getUserFromToken(token);
  if (!user || !ADMIN_EMAILS.includes(user.email)) {
    return res.status(403).json({ error: 'Acesso negado' });
  }

  if (!GA4_PROPERTY_ID || !GA4_CLIENT_ID || !GA4_CLIENT_SECRET || !GA4_REFRESH_TOKEN) {
    return res.status(503).json({ error: 'GA4 não configurado (env vars ausentes)' });
  }

  try {
    const ga4Token = await getAccessToken();

    const [overviewRes, eventsRes, pagesRes] = await Promise.all([
      // Visão geral: últimos 30 dias vs 30 anteriores
      runReport(ga4Token, {
        dateRanges: [
          { startDate: '30daysAgo', endDate: 'today' },
          { startDate: '60daysAgo', endDate: '31daysAgo' },
        ],
        metrics: [
          { name: 'activeUsers' },
          { name: 'sessions' },
          { name: 'screenPageViews' },
          { name: 'bounceRate' },
          { name: 'averageSessionDuration' },
        ],
      }),

      // Funil: eventos customizados
      runReport(ga4Token, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'eventName' }],
        metrics: [{ name: 'eventCount' }],
        dimensionFilter: {
          filter: {
            fieldName: 'eventName',
            inListFilter: {
              values: ['analyze_start', 'analyze_complete', 'begin_checkout', 'cv_download_click'],
            },
          },
        },
      }),

      // Top páginas
      runReport(ga4Token, {
        dateRanges: [{ startDate: '30daysAgo', endDate: 'today' }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 5,
      }),
    ]);

    // Processa visão geral
    const cur  = overviewRes.rows?.[0]?.metricValues || [];
    const prev = overviewRes.rows?.[1]?.metricValues || [];
    const overview = {
      users:       parseInt(cur[0]?.value  || 0),
      users_prev:  parseInt(prev[0]?.value || 0),
      sessions:    parseInt(cur[1]?.value  || 0),
      sessions_prev: parseInt(prev[1]?.value || 0),
      pageviews:   parseInt(cur[2]?.value  || 0),
      bounce_rate: parseFloat(cur[3]?.value || 0),
      avg_session: parseFloat(cur[4]?.value || 0),
    };

    // Processa funil
    const eventMap = {};
    for (const row of (eventsRes.rows || [])) {
      eventMap[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value || 0);
    }
    const funnel = {
      analyze_start:    eventMap['analyze_start']    || 0,
      analyze_complete: eventMap['analyze_complete'] || 0,
      begin_checkout:   eventMap['begin_checkout']   || 0,
      cv_download:      eventMap['cv_download_click']|| 0,
    };

    // Processa páginas
    const pages = (pagesRes.rows || []).map(r => ({
      path:  r.dimensionValues[0].value,
      views: parseInt(r.metricValues[0].value || 0),
      users: parseInt(r.metricValues[1].value || 0),
    }));

    return res.status(200).json({ overview, funnel, pages });
  } catch (err) {
    console.error('GA4 handler error:', err);
    return res.status(500).json({ error: err.message || 'Erro ao buscar dados do GA4' });
  }
}
