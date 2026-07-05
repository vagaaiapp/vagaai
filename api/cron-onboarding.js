// /api/cron-onboarding.js
// Cron diário: envia emails de Day 2 e Day 5 para usuários recém-cadastrados
// Rastreia envios na tabela webhook_events com chave sintética "onboarding_dayN_USERID"

import { timingSafeEqual } from 'crypto';

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
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
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
    });
    // E-mail já saiu; se o marcador falhar, amanhã o cron reenvia o mesmo
    // e-mail — loga alto em vez de engolir a falha.
    if (!res.ok) {
      console.error(`markEmailSent: Supabase ${res.status} — key=${key} (risco de e-mail duplicado no próximo ciclo)`);
    }
  } catch (e) {
    console.error(`markEmailSent: ${e.message} — key=${key} (risco de e-mail duplicado no próximo ciclo)`);
  }
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
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('cron-onboarding: CRON_SECRET not configured');
    return false;
  }
  const res = await fetch('https://www.vagaai.app.br/api/onboarding-emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name, type, credits_left: creditsLeft }),
  });
  return res.ok;
}

// ─── Follow-up: candidaturas "aplicada" ou "aplicado" há ~7 dias ─────────────
async function getTrackerFollowupCards() {
  const now = Date.now();
  const minMs = now - 8 * 24 * 60 * 60 * 1000; // 8 dias atrás
  const maxMs = now - 6 * 24 * 60 * 60 * 1000; // 6 dias atrás
  const minISO = new Date(minMs).toISOString();
  const maxISO = new Date(maxMs).toISOString();

  // Busca candidaturas com status aplicada ou aplicado (legado)
  // Sem filtro de data no DB pois usamos applied_at com fallback para stage_moved_at
  // e aplicamos o filtro em código para maior precisão
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/job_tracker?status=in.(aplicada,aplicado)&select=id,user_id,empresa,cargo,applied_at,stage_moved_at`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  if (!res.ok) return [];
  const cards = await res.json();

  // Filtra em código usando applied_at como referência (fallback: stage_moved_at)
  return cards.filter(card => {
    const ref = card.applied_at || card.stage_moved_at;
    if (!ref) return false;
    const t = new Date(ref).getTime();
    return t >= minMs && t <= maxMs;
  });
}

async function getUserEmail(userId) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/auth/v1/admin/users/${userId}`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!res.ok) return null;
    const u = await res.json();
    return { email: u.email, name: u.user_metadata?.full_name || u.email?.split('@')[0] || '' };
  } catch { return null; }
}

async function callFollowupEmail(email, name, empresa, cargo) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('cron-onboarding: CRON_SECRET not configured');
    return false;
  }
  const res = await fetch('https://www.vagaai.app.br/api/onboarding-emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, name, type: 'tracker_followup', empresa, cargo }),
  });
  return res.ok;
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Exige CRON_SECRET configurado — sem fallback
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('cron-onboarding: CRON_SECRET env var não configurada');
    return res.status(500).json({ error: 'CRON_SECRET não configurado' });
  }

  const auth = (req.headers.authorization || '').replace('Bearer ', '');
  const cronExpected = Buffer.from(cronSecret, 'utf8');
  const cronReceived = Buffer.alloc(cronExpected.length);
  Buffer.from(auth || '', 'utf8').copy(cronReceived);
  if ((auth || '').length !== cronSecret.length || !timingSafeEqual(cronExpected, cronReceived)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }

  const results = { day2: { processed: 0, sent: 0 }, day5: { processed: 0, sent: 0 }, tracker_followup: { processed: 0, sent: 0 } };

  // ── Onboarding day2 / day5 ────────────────────────────────────────────────
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

  // ── Follow-up de candidaturas (~7 dias sem retorno) ───────────────────────
  const cards = await getTrackerFollowupCards();
  results.tracker_followup.processed = cards.length;

  for (const card of cards) {
    const dedupeKey = `tracker_followup_${card.id}`;
    if (await isEmailSent(card.user_id, dedupeKey)) continue;

    const userInfo = await getUserEmail(card.user_id);
    if (!userInfo || !userInfo.email) continue;

    const sent = await callFollowupEmail(userInfo.email, userInfo.name, card.empresa, card.cargo);
    if (sent) {
      await markEmailSent(card.user_id, dedupeKey);
      results.tracker_followup.sent++;
    }
  }

  console.log('cron-onboarding:', JSON.stringify(results));
  return res.status(200).json({ ok: true, results });
}
