// /api/cron-onboarding.js
// Cron diário: envia emails de Day 2 e Day 5 para usuários recém-cadastrados
// Rastreia envios na tabela webhook_events com chave sintética "onboarding_dayN_USERID"

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

async function getUsersCreatedAround(daysAgo, windowHours = 12) {
  const targetMs = Date.now() - daysAgo * 24 * 60 * 60 * 1000;
  const minMs = targetMs - windowHours * 60 * 60 * 1000;
  const maxMs = targetMs + windowHours * 60 * 60 * 1000;

  const users = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=${perPage}`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) break;
    const data = await res.json();
    const pageUsers = data.users || [];

    for (const u of pageUsers) {
      const t = new Date(u.created_at).getTime();
      if (t >= minMs && t <= maxMs) users.push(u);
    }

    if (pageUsers.length < perPage) break;
    page++;
  }

  return users;
}

async function isEmailSent(userId, type) {
  const key = `onboarding_${type}_${userId}`;
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/webhook_events?stripe_session_id=eq.${encodeURIComponent(key)}&select=id`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const rows = await res.json();
  return Array.isArray(rows) && rows.length > 0;
}

async function markEmailSent(userId, type) {
  const key = `onboarding_${type}_${userId}`;
  await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=ignore-duplicates',
    },
    body: JSON.stringify({
      stripe_session_id: key,
      user_id: userId,
      amount: 0,
      processed_at: new Date().toISOString(),
    }),
  }).catch(() => {});
}

async function getUserCredits(userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await res.json();
    return rows?.[0]?.credits ?? 0;
  } catch { return 0; }
}

async function callOnboardingEmail(email, name, type, creditsLeft) {
  const res = await fetch('https://www.vagaai.app.br/api/onboarding-emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.CRON_SECRET || 'vagaai-cron-secret-2026'}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name, type, credits_left: creditsLeft }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const secret = process.env.CRON_SECRET || 'vagaai-cron-secret-2026';
  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  // Vercel invoca crons sem Authorization header — aceita sem token nesse caso
  const isVercelCron = req.headers['x-vercel-cron'] === '1';
  if (!isVercelCron && auth !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }

  const results = { day2: { processed: 0, sent: 0 }, day5: { processed: 0, sent: 0 } };

  for (const { type, daysAgo } of [{ type: 'day2', daysAgo: 2 }, { type: 'day5', daysAgo: 5 }]) {
    const users = await getUsersCreatedAround(daysAgo);
    results[type].processed = users.length;

    for (const user of users) {
      if (await isEmailSent(user.id, type)) continue;

      const email = user.email;
      if (!email) continue;

      const name = user.user_metadata?.full_name || email.split('@')[0];
      const credits = type === 'day5' ? await getUserCredits(user.id) : 0;

      const sent = await callOnboardingEmail(email, name, type, credits);
      if (sent) {
        await markEmailSent(user.id, type);
        results[type].sent++;
      }
    }
  }

  console.log('cron-onboarding:', JSON.stringify(results));
  return res.status(200).json({ ok: true, results });
}
