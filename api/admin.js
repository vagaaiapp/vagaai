const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const GA4_PROPERTY_ID  = process.env.GA4_PROPERTY_ID;
const GA4_SA_JSON      = process.env.GA4_SA_JSON; // Service Account JSON (nunca expira)
import { sanitizeBlogHtml } from '../lib/blog-content.js';

const serviceHeaders = () => ({
  apikey: SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

/* Quem e admin mora em public.admins (migracao 031), nao aqui. A lista
   estava duplicada entre este arquivo e a politica blog_admin_all do banco:
   tirar alguem do time exigia lembrar dos dois, e um esquecimento deixava
   acesso ativo.

   Falha fechado de proposito. Se a consulta nao responder, ninguem entra —
   controle de acesso que abre quando a infraestrutura tosse nao e controle de
   acesso. Isso significa que a migracao 031 precisa estar aplicada ANTES do
   deploy deste arquivo. */
async function isAdmin(email) {
  if (!email) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/admins?email=eq.${encodeURIComponent(email)}&select=email&limit=1`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) {
      console.error('isAdmin: PostgREST', res.status);
      return false;
    }
    const rows = await res.json();
    return Array.isArray(rows) && rows.length === 1;
  } catch (err) {
    console.error('isAdmin: exception', err.message);
    return false;
  }
}

/* Trilha do que foi olhado e alterado. Nunca grava conteudo — so a acao, o
   alvo e a contagem. Fire-and-forget: registrar nao pode derrubar a operacao,
   mas a falha aparece no log em vez de sumir. */
async function auditar(adminEmail, acao, alvo = null, detalhe = null) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/admin_audit`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({ admin_email: adminEmail, acao, alvo, detalhe }),
    });
    if (!res.ok) console.error('admin_audit HTTP', res.status, (await res.text()).slice(0, 200));
  } catch (err) {
    console.error('admin_audit erro:', err.message);
  }
}

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
          inListFilter: { values: [
            'analysis_started', 'analysis_completed', 'begin_checkout', 'sign_up',
            'purchase', 'company_lead_submitted', 'cv_download_click',
            // aliases historicos mantidos no relatorio durante a migracao
            'analyze_start', 'analyze_complete', 'onboarding_vaga_completed', 'checkout_iniciado'
          ] },
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
  const sumEvents = (...names) => names.reduce((total, name) => total + (eventMap[name] || 0), 0);
  const funnel = {
    analysis_started:   sumEvents('analysis_started', 'analyze_start'),
    analysis_completed: sumEvents('analysis_completed', 'analyze_complete', 'onboarding_vaga_completed'),
    begin_checkout:     sumEvents('begin_checkout', 'checkout_iniciado'),
    sign_up:            eventMap['sign_up'] || 0,
    purchase:           eventMap['purchase'] || 0,
    company_lead:       eventMap['company_lead_submitted'] || 0,
    cv_download:        eventMap['cv_download_click'] || 0,
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

// Pageviews do blog agrupados por slug — reaproveita a mesma autenticação e o
// mesmo runReport genérico do fetchGA4Data acima, só que filtrado em
// pagePathPlusQueryString (a versão do pagePath que preserva "?s=slug",
// necessária porque o blog usa querystring pra identificar o post, não uma
// rota própria por post).
async function fetchBlogPostViews(days = 30) {
  if (!GA4_PROPERTY_ID || !GA4_SA_JSON) {
    throw new Error('GA4 não configurado (GA4_PROPERTY_ID ou GA4_SA_JSON ausente)');
  }
  const d = parseInt(days) || 30;
  const ga4Token = await getGA4AccessToken();
  const report = await runGA4Report(ga4Token, {
    dateRanges: [{ startDate: `${d}daysAgo`, endDate: 'today' }],
    dimensions: [{ name: 'pagePathPlusQueryString' }],
    metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }],
    dimensionFilter: {
      filter: { fieldName: 'pagePathPlusQueryString', stringFilter: { matchType: 'BEGINS_WITH', value: '/blog/post' } },
    },
    limit: 500,
  });

  const bySlug = {};
  for (const row of (report.rows || [])) {
    const path = row.dimensionValues[0].value; // ex: /blog/post?s=como-colocar-cursos-no-curriculo
    const m = path.match(/[?&]s=([^&]+)/);
    if (!m) continue;
    let slug;
    try { slug = decodeURIComponent(m[1]); } catch { slug = m[1]; }
    const views = parseInt(row.metricValues[0]?.value || 0);
    const users = parseInt(row.metricValues[1]?.value || 0);
    // Um mesmo slug pode aparecer com querystrings diferentes (utm etc.) —
    // soma em vez de sobrescrever.
    if (bySlug[slug]) { bySlug[slug].views += views; bySlug[slug].users += users; }
    else bySlug[slug] = { views, users };
  }
  return bySlug;
}

// ─── E-mail marketing helpers ──────────────────────────────────────────────────

const EMAIL_DAILY_LIMIT = 100;   // limite do plano Resend free — trocar se fizer upgrade
const EMAIL_MONTHLY_LIMIT = 3000;

async function fetchEmailMarketingData(funnel = 'onboarding') {
  const validFunnels = ['onboarding', 'winback', 'trial_sem_uso'];
  const chosenFunnel = validFunnels.includes(funnel) ? funnel : 'onboarding';

  const [statsRes, quotaRes, funnelRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/rpc/get_email_type_stats`, {
      method: 'POST', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: '{}',
    }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/get_email_quota`, {
      method: 'POST', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' }, body: '{}',
    }),
    fetch(`${SUPABASE_URL}/rest/v1/rpc/get_email_funnel`, {
      method: 'POST', headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_funnel: chosenFunnel, p_days: 30 }),
    }),
  ]);

  const stats = statsRes.ok ? await statsRes.json() : [];
  const quota = quotaRes.ok ? await quotaRes.json() : { sent_today: 0, sent_month: 0 };
  const funnelStages = funnelRes.ok ? await funnelRes.json() : [];

  return {
    funnel: chosenFunnel,
    funnel_stages: funnelStages,
    type_stats: stats,
    quota: {
      ...quota,
      daily_limit: EMAIL_DAILY_LIMIT,
      monthly_limit: EMAIL_MONTHLY_LIMIT,
    },
  };
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
  if (!user || !(await isAdmin(user.email))) {
    return res.status(403).json({ error: 'Acesso negado. Apenas administradores.' });
  }

  // ── POST: ações de gerenciamento de usuário ──────────────────────────────────
  if (req.method === 'POST') {
    const { action, userId, credits, claimId } = req.body || {};

    if (action === 'save_blog_post') {
      const post = req.body?.post;
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      if (!post || typeof post !== 'object' || Array.isArray(post)) {
        return res.status(400).json({ error: 'Post inválido.' });
      }
      if (id && !/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID inválido.' });
      const title = String(post.title || '').trim().slice(0, 300);
      const slug = String(post.slug || '').trim().toLowerCase();
      if (!title || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 180) {
        return res.status(400).json({ error: 'Título ou slug inválido.' });
      }
      const cover = String(post.cover_url || '').trim().slice(0, 2000);
      if (cover) {
        try {
          const url = new URL(cover);
          if (url.protocol !== 'https:') return res.status(400).json({ error: 'A capa deve usar HTTPS.' });
        } catch {
          return res.status(400).json({ error: 'URL de capa inválida.' });
        }
      }
      const categories = (Array.isArray(post.categories) ? post.categories : [])
        .map(item => String(item || '').trim().slice(0, 80))
        .filter(Boolean)
        .slice(0, 12);
      const payload = {
        title,
        slug,
        excerpt: String(post.excerpt || '').trim().slice(0, 600),
        cover_url: cover,
        seo_title: String(post.seo_title || '').trim().slice(0, 180),
        content: sanitizeBlogHtml(String(post.content || '').slice(0, 500000)),
        published: post.published === true,
        categories: JSON.stringify(categories),
        updated_at: new Date().toISOString(),
      };
      const saveRes = await fetch(
        id
          ? `${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${encodeURIComponent(id)}`
          : `${SUPABASE_URL}/rest/v1/blog_posts`,
        {
          method: id ? 'PATCH' : 'POST',
          headers: { ...serviceHeaders(), Prefer: 'return=representation' },
          body: JSON.stringify(payload),
        }
      );
      const rows = await saveRes.json().catch(() => []);
      if (!saveRes.ok || !Array.isArray(rows) || !rows[0]) {
        console.error('save_blog_post HTTP', saveRes.status);
        return res.status(500).json({ error: 'Não foi possível salvar o post.' });
      }
      await auditar(user.email, id ? 'atualizar_post' : 'criar_post', rows[0].id, {
        published: payload.published,
      });
      return res.status(200).json({ ok: true, post: rows[0] });
    }

    if (action === 'delete_blog_post') {
      const id = typeof req.body?.id === 'string' ? req.body.id : '';
      if (!/^[a-f0-9-]{36}$/i.test(id)) return res.status(400).json({ error: 'ID inválido.' });
      const deleteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/blog_posts?id=eq.${encodeURIComponent(id)}`,
        { method: 'DELETE', headers: { ...serviceHeaders(), Prefer: 'return=representation' } }
      );
      const rows = await deleteRes.json().catch(() => []);
      if (!deleteRes.ok) return res.status(500).json({ error: 'Não foi possível excluir o post.' });
      await auditar(user.email, 'excluir_post', id, { removidos: Array.isArray(rows) ? rows.length : 0 });
      return res.status(200).json({ ok: true, removed: Array.isArray(rows) ? rows.length : 0 });
    }

    if (action === 'release_abuse_claim') {
      if (!claimId || !/^[a-f0-9-]{36}$/i.test(claimId)) {
        return res.status(400).json({ error: 'claimId inválido' });
      }
      const releaseRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/release_free_entitlement`, {
        method: 'POST', headers: serviceHeaders(), body: JSON.stringify({ p_claim_id: claimId, p_user_id: null }),
      });
      const releaseReceipt = await releaseRes.json().catch(() => ({}));
      if (!releaseRes.ok) return res.status(500).json({ error: 'Não foi possível liberar a gratuidade.' });
      await auditar(user.email, 'liberar_gratuidade', claimId, { released: releaseReceipt.released || 0 });
      return res.status(200).json({ ok: true, release: releaseReceipt });
    }

    if (action === 'reset_abuse_devices') {
      if (!userId || !/^[a-f0-9-]{36}$/i.test(userId)) {
        return res.status(400).json({ error: 'userId inválido' });
      }
      const deleteRes = await fetch(
        `${SUPABASE_URL}/rest/v1/abuse_devices?user_id=eq.${encodeURIComponent(userId)}`,
        { method: 'DELETE', headers: { ...serviceHeaders(), Prefer: 'return=representation' } }
      );
      const deleted = await deleteRes.json().catch(() => []);
      if (!deleteRes.ok) return res.status(500).json({ error: 'Não foi possível redefinir os dispositivos.' });
      await auditar(user.email, 'redefinir_dispositivos', userId, { removidos: Array.isArray(deleted) ? deleted.length : 0 });
      return res.status(200).json({ ok: true, removed: Array.isArray(deleted) ? deleted.length : 0 });
    }

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
      await auditar(user.email, 'ajustar_creditos', userId, { delta: qty, saldo: newVal });
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
      // Irreversivel e em cascata por 12 tabelas: se alguma vez alguem
      // perguntar quando a conta sumiu, a resposta precisa existir.
      await auditar(user.email, 'remover_usuario', userId, { status: delRes.status });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: 'Ação desconhecida' });
  }

  if (req.query.action === 'abuse') {
    try {
      const sb = (path) => fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: serviceHeaders() });
      const [claimsRes, eventsRes, devicesRes, cleanupRes] = await Promise.all([
        sb('abuse_claims?status=eq.active&select=id,user_id,resource,risk_score,challenge_passed,created_at&order=created_at.desc&limit=200'),
        sb('abuse_events?select=id,user_id,event_type,resource,decision,reason,risk_score,device_hash,ip_hash,created_at&order=created_at.desc&limit=200'),
        sb('abuse_devices?select=user_id,device_hash,last_seen_at&order=last_seen_at.desc&limit=1000'),
        fetch(`${SUPABASE_URL}/rest/v1/rpc/cleanup_abuse_data`, {
          method: 'POST', headers: serviceHeaders(), body: JSON.stringify({ p_days: 90 }),
        }),
      ]);
      if (!claimsRes.ok || !eventsRes.ok || !devicesRes.ok) {
        return res.status(200).json({ ok: true, available: false, reason: 'migration_035_pending' });
      }
      const claims = await claimsRes.json();
      const events = await eventsRes.json();
      const devices = await devicesRes.json();
      const deviceCounts = {};
      const deviceLastSeen = {};
      devices.forEach(row => {
        deviceCounts[row.user_id] = (deviceCounts[row.user_id] || 0) + 1;
        if (!deviceLastSeen[row.user_id] || row.last_seen_at > deviceLastSeen[row.user_id]) deviceLastSeen[row.user_id] = row.last_seen_at;
      });
      const decisions = { allow: 0, challenge: 0, deny: 0, release: 0 };
      events.forEach(row => { if (Object.prototype.hasOwnProperty.call(decisions, row.decision)) decisions[row.decision] += 1; });
      const sharedAccounts = Object.values(deviceCounts).filter(count => count > 5).length;
      const mask = value => value ? `${value.slice(0, 8)}…${value.slice(-4)}` : '';
      return res.status(200).json({
        ok: true,
        available: true,
        metrics: { active_claims: claims.length, denied: decisions.deny, challenged: decisions.challenge, shared_accounts: sharedAccounts },
        claims,
        shared_accounts: Object.entries(deviceCounts)
          .filter(([, count]) => count > 5)
          .map(([user_id, devices_count]) => ({ user_id, devices_count, last_seen_at: deviceLastSeen[user_id] }))
          .sort((a, b) => b.devices_count - a.devices_count),
        events: events.map(row => ({ ...row, device_hash: mask(row.device_hash), ip_hash: mask(row.ip_hash) })),
        cleanup: cleanupRes.ok ? await cleanupRes.json().catch(() => null) : null,
      });
    } catch (err) {
      console.error('abuse admin error:', err);
      return res.status(500).json({ error: 'Erro ao buscar sinais de abuso.' });
    }
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

  // ── GET: views por post do blog (Blog Admin) ──────────────────────────────────
  if (req.query.action === 'blog_views') {
    try {
      const views = await fetchBlogPostViews(req.query.days || 30);
      return res.status(200).json({ ok: true, views, days: parseInt(req.query.days) || 30 });
    } catch (err) {
      console.error('blog_views error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao buscar views do blog' });
    }
  }

  // ── GET: aba E-mail Marketing (funil, ranking por tipo, cota Resend) ──────────
  if (req.query.action === 'email_marketing') {
    try {
      const data = await fetchEmailMarketingData(req.query.funnel);
      return res.status(200).json({ ok: true, ...data });
    } catch (err) {
      console.error('email_marketing error:', err);
      return res.status(500).json({ error: err.message || 'Erro ao buscar dados de e-mail marketing' });
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

  // ── GET: custo real estimado por chamada Anthropic ─────────────────────────
  if (req.query.action === 'ai_usage') {
    const days = Math.max(1, Math.min(365, parseInt(req.query.days) || 30));
    try {
      const usageRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ai_usage_summary`, {
        method: 'POST', headers: serviceHeaders(), body: JSON.stringify({ p_days: days }),
      });
      if (!usageRes.ok) {
        if ([404, 400].includes(usageRes.status)) {
          return res.status(200).json({ ok: true, available: false, reason: 'migration_036_pending' });
        }
        throw new Error(`PostgREST ${usageRes.status}`);
      }
      const rows = await usageRes.json();
      const total = (Array.isArray(rows) ? rows : []).reduce((acc, row) => {
        acc.requests += Number(row.requests) || 0;
        acc.input_tokens += Number(row.input_tokens) || 0;
        acc.output_tokens += Number(row.output_tokens) || 0;
        acc.cache_creation_input_tokens += Number(row.cache_creation_input_tokens) || 0;
        acc.cache_read_input_tokens += Number(row.cache_read_input_tokens) || 0;
        acc.estimated_cost_usd += Number(row.estimated_cost_usd) || 0;
        return acc;
      }, { requests: 0, input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, estimated_cost_usd: 0 });
      total.estimated_cost_usd = Number(total.estimated_cost_usd.toFixed(6));
      await auditar(user.email, 'ler_custos_ia', null, { days, requests: total.requests });
      return res.status(200).json({ ok: true, available: true, days, total, rows });
    } catch (err) {
      console.error('ai_usage admin error:', err.message);
      return res.status(500).json({ error: 'Erro ao buscar custos de IA.' });
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

    /* Este caminho devolve ate 500 analises com o result completo — conteudo
       de curriculo de clientes reais. E a leitura mais sensivel do produto e
       ate agora nao deixava rastro nenhum. */
    await auditar(user.email, 'ler_painel', null, {
      analises: Array.isArray(supabaseData?.analyses) ? supabaseData.analyses.length : null,
      usuarios: supabaseData?.totalUsers ?? null
    });

    return res.status(200).json({
      supabase: supabaseData,
      stripe: stripeData,
    });
  } catch (err) {
    console.error('Admin handler error:', err);
    return res.status(500).json({ error: 'Erro interno ao buscar dados.' });
  }
}
