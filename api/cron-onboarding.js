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

const _sbHeaders = () => ({ apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` });

// Condições da régua nova. Em erro de consulta, retornam o valor que SUPRIME o
// envio (fail-safe: melhor não enviar do que enviar errado).
async function hasActiveAlert(userId) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${encodeURIComponent(userId)}&ativo=eq.true&select=user_id&limit=1`,
      { headers: _sbHeaders() }
    );
    if (!r.ok) return true;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return true; }
}

async function hasAnalysisSince(userId, sinceIso) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/analyses?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(sinceIso)}&select=id&limit=1`,
      { headers: _sbHeaders() }
    );
    if (!r.ok) return true;
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  } catch { return true; }
}

async function isPaidPlan(userId) {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1&select=plan,status`,
      { headers: _sbHeaders() }
    );
    if (!r.ok) return true;
    const rows = await r.json();
    const sub = rows?.[0];
    if (!sub) return false;
    return ['starter', 'pro'].includes(sub.plan) && ['active', 'trialing', 'past_due'].includes(sub.status);
  } catch { return true; }
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

  const results = {
    day2: { processed: 0, sent: 0 }, day5: { processed: 0, sent: 0 },
    day7_alerts: { processed: 0, sent: 0 }, winback: { processed: 0, sent: 0 },
    free_renewed: { processed: 0, sent: 0 }, tracker_followup: { processed: 0, sent: 0 },
    block_errors: [],
  };
  // Isola cada bloco da régua: um erro transitório (ex.: fetch de rede lançando
  // em getUsersCreatedAround) não pode derrubar o handler inteiro e silenciar
  // os blocos seguintes — em 2026-07-07 o D7 tinha 3 usuários elegíveis e nada
  // saiu, sem rastro (logs do Hobby duram 1h). Com o isolamento, o erro fica
  // registrado em results.block_errors e o resto do run continua.
  async function runBlock(name, fn) {
    try { await fn(); } catch (e) {
      console.error(`cron-onboarding: bloco ${name} falhou:`, e.message);
      results.block_errors.push(name + ': ' + e.message);
    }
  }

  // ── Onboarding day2 / day5 ────────────────────────────────────────────────
  // Janela de 36h (±18h... na prática 1,5 dia): cobre 2 runs do cron — se um
  // dia falhar, o seguinte reenvia (o marcador de dedup impede duplicata).
  // A janela original de ±12h transformava 1 run perdido em usuário perdido.
  for (const { type, daysAgo } of [{ type: 'day2', daysAgo: 2 }, { type: 'day5', daysAgo: 5 }]) {
    await runBlock(type, async () => {
      const users = await getUsersCreatedAround(daysAgo, 18);
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
    });
  }

  // ── D7: "ligue seu radar" — só para quem NÃO tem alerta ativo ─────────────
  // Janela de ±36h (5,5–8,5 dias): cobre 3 runs. Chegar no D8 é melhor que nunca.
  await runBlock('day7_alerts', async () => {
    const users = await getUsersCreatedAround(7, 36);
    results.day7_alerts.processed = users.length;
    for (const user of users) {
      if (await isEmailSent(user.id, 'day7_alerts')) continue;
      if (!user.email) continue;
      if (await hasActiveAlert(user.id)) continue;
      const name = user.user_metadata?.full_name || user.email.split('@')[0];
      const sent = await callOnboardingEmail(user.email, name, 'day7_alerts', 0);
      if (sent) {
        await markEmailSent(user.id, 'day7_alerts');
        results.day7_alerts.sent++;
      }
    }
  });

  // ── D21: win-back único — sem análise há 14d e sem alerta ativo ───────────
  // Janela de ±60h (18,5–23,5 dias): timing exato importa pouco num win-back.
  await runBlock('winback', async () => {
    const users = await getUsersCreatedAround(21, 60);
    results.winback.processed = users.length;
    const since14d = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    for (const user of users) {
      if (await isEmailSent(user.id, 'winback')) continue;
      if (!user.email) continue;
      if (await hasActiveAlert(user.id)) continue;
      if (await hasAnalysisSince(user.id, since14d)) continue;
      const name = user.user_metadata?.full_name || user.email.split('@')[0];
      const sent = await callOnboardingEmail(user.email, name, 'winback', 0);
      if (sent) {
        await markEmailSent(user.id, 'winback');
        results.winback.sent++;
      }
    }
  });

  // ── Ciclo do grátis: janela mensal reabriu e não foi usada ────────────────
  // Candidatos: última análise entre 40 e 30 dias atrás (janela de 30d reabriu
  // há pouco). Quem continua inativo além dos 40d NÃO recebe de novo — 1 nudge
  // por lapso, sem virar spam recorrente para dormentes.
  await runBlock('free_renewed', async () => {
    const from40 = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const to30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/analyses?created_at=gte.${encodeURIComponent(from40)}&created_at=lte.${encodeURIComponent(to30)}&select=user_id`,
      { headers: _sbHeaders() }
    );
    const rows = r.ok ? await r.json() : [];
    const candidates = [...new Set((Array.isArray(rows) ? rows : []).map(x => x.user_id).filter(Boolean))];
    results.free_renewed.processed = candidates.length;
    const monthKey = `freecycle_${new Date().toISOString().slice(0, 7).replace('-', '')}`;
    for (const uid of candidates) {
      if (await isEmailSent(uid, monthKey)) continue;
      if (await hasAnalysisSince(uid, to30)) continue;  // usou nos últimos 30d → janela não reabriu
      if (await isPaidPlan(uid)) continue;              // pago não depende da gratuidade
      if ((await getUserCredits(uid)) > 0) continue;    // com créditos, o gate não é a análise grátis
      const info = await getUserEmail(uid);
      if (!info?.email) continue;
      const sent = await callOnboardingEmail(info.email, info.name, 'free_renewed', 0);
      if (sent) {
        await markEmailSent(uid, monthKey);
        results.free_renewed.sent++;
      }
    }
  });

  // ── Follow-up de candidaturas (~7 dias sem retorno) ───────────────────────
  await runBlock('tracker_followup', async () => {
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
  });

  console.log('cron-onboarding:', JSON.stringify(results));
  return res.status(200).json({ ok: true, results });
}
