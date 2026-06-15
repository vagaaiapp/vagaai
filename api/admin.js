const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const GA4_PROPERTY_ID  = process.env.GA4_PROPERTY_ID;
const GA4_SA_JSON      = process.env.GA4_SA_JSON; // Service Account JSON (nunca expira)

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

// Gera access token via Service Account JWT (RS256) — não expira, sem OAuth flow
async function getGA4AccessToken() {
  const sa = JSON.parse(GA4_SA_JSON);
  const { createSign } = await import('crypto');

  const now = Math.floor(Date.now() / 1000);
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const header  = b64url({ alg: 'RS256', typ: 'JWT' });
  const payload = b64url({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/analytics.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  });

  const sigInput = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(sigInput);
  const signature = sign.sign(sa.private_key, 'base64url');
  const jwt = `${sigInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('SA token error: ' + JSON.stringify(data));
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

async function fetchGA4Data(days = 30) {
  if (!GA4_PROPERTY_ID || !GA4_SA_JSON) {
    throw new Error('GA4 não configurado (GA4_PROPERTY_ID ou GA4_SA_JSON ausente)');
  }
  const d = parseInt(days) || 30;
  const startDate = `${d}daysAgo`;
  const prevStart = `${d * 2}daysAgo`;
  const prevEnd   = `${d + 1}daysAgo`;

  const ga4Token = await getGA4AccessToken();
  const [overviewRes, eventsRes, pagesRes, countriesRes, citiesRes, devicesRes, sourcesRes] = await Promise.all([
    // Visão geral com comparação ao período anterior
    runGA4Report(ga4Token, {
      dateRanges: [
        { startDate, endDate: 'today' },
        { startDate: prevStart, endDate: prevEnd },
      ],
      metrics: [
        { name: 'activeUsers' }, { name: 'sessions' },
        { name: 'screenPageViews' }, { name: 'bounceRate' },
        { name: 'averageSessionDuration' }, { name: 'newUsers' },
      ],
    }),
    // Funil de eventos
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: {
        filter: {
          fieldName: 'eventName',
          inListFilter: { values: ['analyze_start', 'analyze_complete', 'begin_checkout', 'cv_download_click'] },
        },
      },
    }),
    // Top páginas
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
    // Países
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'country' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    }),
    // Cidades (Brasil)
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'city' }],
      metrics: [{ name: 'activeUsers' }],
      dimensionFilter: { filter: { fieldName: 'country', stringFilter: { value: 'Brazil' } } },
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    }),
    // Dispositivos
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
    }),
    // Fontes de tráfego
    runGA4Report(ga4Token, {
      dateRanges: [{ startDate, endDate: 'today' }],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }, { name: 'activeUsers' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 8,
    }),
  ]);

  const cur = overviewRes.rows?.[0]?.metricValues || [];
  const prev = overviewRes.rows?.[1]?.metricValues || [];
  const overview = {
    users:       parseInt(cur[0]?.value || 0), users_prev:    parseInt(prev[0]?.value || 0),
    sessions:    parseInt(cur[1]?.value || 0), sessions_prev: parseInt(prev[1]?.value || 0),
    pageviews:   parseInt(cur[2]?.value || 0),
    bounce_rate: parseFloat(cur[3]?.value || 0),
    avg_session: parseFloat(cur[4]?.value || 0),
    new_users:   parseInt(cur[5]?.value || 0), new_users_prev: parseInt(prev[5]?.value || 0),
  };

  const eventMap = {};
  for (const row of (eventsRes.rows || [])) eventMap[row.dimensionValues[0].value] = parseInt(row.metricValues[0].value || 0);
  const funnel = {
    analyze_start:    eventMap['analyze_start']    || 0,
    analyze_complete: eventMap['analyze_complete'] || 0,
    begin_checkout:   eventMap['begin_checkout']   || 0,
    cv_download:      eventMap['cv_download_click']|| 0,
  };

  const pages = (pagesRes.rows || []).map(r => ({
    path:  r.dimensionValues[0].value,
    views: parseInt(r.metricValues[0].value || 0),
    users: parseInt(r.metricValues[1].value || 0),
  }));

  const countries = (countriesRes.rows || []).map(r => ({
    name:     r.dimensionValues[0].value,
    users:    parseInt(r.metricValues[0].value || 0),
    sessions: parseInt(r.metricValues[1].value || 0),
  }));

  const cities = (citiesRes.rows || []).map(r => ({
    name:  r.dimensionValues[0].value,
    users: parseInt(r.metricValues[0].value || 0),
  }));

  const devices = (devicesRes.rows || []).map(r => ({
    name:     r.dimensionValues[0].value,
    users:    parseInt(r.metricValues[0].value || 0),
    sessions: parseInt(r.metricValues[1].value || 0),
  }));

  const sources = (sourcesRes.rows || []).map(r => ({
    name:     r.dimensionValues[0].value,
    sessions: parseInt(r.metricValues[0].value || 0),
    users:    parseInt(r.metricValues[1].value || 0),
  }));

  return { overview, funnel, pages, countries, cities, devices, sources, days: d };
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
  // Permite GET e POST
  if (req.method !== 'GET' && req.method !== 'POST') {
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

  // ── POST: ações de gerenciamento de usuário ──────────────────────────────────
  if (req.method === 'POST') {
    const { action, userId, credits } = req.body || {};

    // Adicionar créditos avulsos
    if (action === 'add_credits') {
      if (!userId || credits == null) return res.status(400).json({ error: 'userId e credits obrigatórios' });
      const qty = parseInt(credits);
      if (isNaN(qty) || qty < -1000 || qty > 1000) return res.status(400).json({ error: 'credits inválido (máx ±1000)' });

      // Upsert: se não existir, cria com qty; se existir, incrementa
      const existing = await fetch(
        `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      ).then(r => r.json()).catch(() => []);

      const current = existing[0]?.credits ?? 0;
      const newVal  = Math.max(0, current + qty);

      const upRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_credits`,
        {
          method: 'POST',
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
          body: JSON.stringify({ user_id: userId, credits: newVal, updated_at: new Date().toISOString() }),
        }
      );
      if (!upRes.ok) return res.status(500).json({ error: 'Erro ao atualizar créditos: ' + await upRes.text() });
      return res.status(200).json({ ok: true, credits: newVal });
    }

    // Remover usuário (apaga do auth Supabase — cascata remove dados via FK)
    if (action === 'remove_user') {
      if (!userId) return res.status(400).json({ error: 'userId obrigatório' });
      const delRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
        { method: 'DELETE', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      if (!delRes.ok && delRes.status !== 404) return res.status(500).json({ error: 'Erro ao remover usuário: ' + await delRes.text() });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  }

  // ── GET: dados de alertas (dismiss feedback + histórico) ─────────────────────
  if (req.query.action === 'alerts') {
    try {
      const sb = (path) => fetch(`${SUPABASE_URL}${path}`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
      const [dismissedRes, historyRes, profilesRes] = await Promise.all([
        sb('/rest/v1/job_alert_sent?dismissed_reason=not.is.null&select=user_id,job_title,job_company,dismissed_reason,dismissed_at&order=dismissed_at.desc&limit=200'),
        sb('/rest/v1/job_alert_history?select=user_id,sent_at,jobs_count,status,error&order=sent_at.desc&limit=100'),
        sb('/rest/v1/job_alert_profiles?select=user_id,ativo,cargo_desejado,cidade,frequencia,ultimo_envio,next_run_at&order=created_at.desc'),
      ]);
      const dismissed = dismissedRes.ok ? await dismissedRes.json() : [];
      const history   = historyRes.ok   ? await historyRes.json()   : [];
      const profiles  = profilesRes.ok  ? await profilesRes.json()  : [];

      const reasonCounts = {};
      dismissed.forEach(d => {
        const r = d.dismissed_reason || 'Sem motivo';
        reasonCounts[r] = (reasonCounts[r] || 0) + 1;
      });

      return res.status(200).json({ ok: true, dismissed, reason_counts: reasonCounts, history, profiles });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── GET: rota GA4 separada para não atrasar o dashboard principal ─────────────
  if (req.query.action === 'ga4') {
    try {
      const ga4 = await fetchGA4Data(req.query.days || 30);
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
