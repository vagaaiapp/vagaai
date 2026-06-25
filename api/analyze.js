import { createHash } from 'crypto';
import { resolvePlan } from '../lib/entitlements.js';

// ─── Score breakdown determinístico ──────────────────────────────────────────

const SCORE_WEIGHTS = [
  { key: 'compatibilidade', label: 'Compatibilidade com a vaga', weight: 35 },
  { key: 'keywords_ats',    label: 'Keywords ATS',               weight: 30 },
  { key: 'legibilidade',    label: 'Legibilidade e estrutura',    weight: 20 },
  { key: 'forca_bullets',   label: 'Força dos bullets',           weight: 15 },
];

function buildScoreBreakdown(fatores) {
  const rows = SCORE_WEIGHTS.map(item => {
    const dimensionScore = Math.max(0, Math.min(100, Number(fatores?.[item.key]) || 0));
    return { ...item, dimension_score: dimensionScore, points: Math.round((dimensionScore * item.weight) / 100) };
  });
  return { rows, total: rows.reduce((sum, r) => sum + r.points, 0) };
}

// ─── Normalização de keywords ────────────────────────────────────────────────

function keywordKey(value) {
  return String(value || '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function uniqueKeywords(items) {
  const seen = new Set();
  return (Array.isArray(items) ? items : []).filter(item => {
    const k = keywordKey(item);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function normalizeKeywords(result) {
  const partials   = uniqueKeywords(result.keywords_parcialmente_encontradas);
  const partialSet = new Set(partials.map(keywordKey));

  const found    = uniqueKeywords(result.keywords_encontradas).filter(k => !partialSet.has(keywordKey(k)));
  const foundSet = new Set([...found.map(keywordKey), ...partialSet]);

  const missing = uniqueKeywords(result.keywords_faltando).filter(k => !foundSet.has(keywordKey(k)));

  result.keywords_parcialmente_encontradas = partials;
  result.keywords_encontradas = found;
  result.keywords_faltando    = missing;
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STARTER_ANALYSES_CAP = 10;

// ─── Hash de conteúdo (cv + job) ─────────────────────────────────────────────

function contentHash(cv, job) {
  return createHash('sha256').update(cv.trim() + '\n||||\n' + job.trim()).digest('hex').slice(0, 40);
}

function normalizeJobUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.href.slice(0, 2000);
  } catch {
    return '';
  }
}

function attachJobMetadata(result, jobUrl) {
  const normalizedUrl = normalizeJobUrl(jobUrl);
  return {
    ...(result || {}),
    job_info: {
      ...((result && result.job_info) || {}),
      ...(normalizedUrl ? { job_url: normalizedUrl } : {}),
    },
  };
}

// ─── Cache de análise ─────────────────────────────────────────────────────────

async function getCachedResult(hash) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/analysis_cache?hash=eq.${hash}&select=result`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await res.json();
    return rows[0]?.result || null;
  } catch (err) {
    console.error('getCachedResult error:', err);
    return null;
  }
}

async function setCachedResult(hash, result) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/analysis_cache`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ hash, result, created_at: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('setCachedResult error:', err);
  }
}

// ─── Rate limit por IP (usuários anônimos) ────────────────────────────────────

const IP_FREE_LIMIT = 1; // 1 análise gratuita por IP a cada 30 dias

async function checkRateLimit(ip) {
  // Usa a SERVICE key: a tabela ip_rate_limits tem RLS habilitada e nega anon,
  // impedindo que o usuário zere o próprio contador via PostgREST (anon key é pública).
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { allowed: true };
  try {
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(ip)}&last_seen=gte.${encodeURIComponent(cutoff)}&select=count`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await res.json();
    // Bloqueado apenas se atingiu o limite nos últimos 30 dias
    if (rows.length > 0 && (rows[0].count || 0) >= IP_FREE_LIMIT) return { allowed: false };
    return { allowed: true };
  } catch (err) {
    console.error('Rate limit check error:', err);
    return { allowed: true }; // fail-open
  }
}

async function recordIpUsage(ip) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    // Verifica se já existe registro recente (últimos 30 dias) para incrementar
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const existing = await fetch(
      `${SUPABASE_URL}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(ip)}&last_seen=gte.${encodeURIComponent(cutoff)}&select=count`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    ).then(r => r.json()).catch(() => []);

    const newCount = existing.length > 0 ? (existing[0].count || 1) + 1 : 1;
    await fetch(`${SUPABASE_URL}/rest/v1/ip_rate_limits`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ ip, count: newCount, last_seen: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('Record IP usage error:', err);
  }
  // Cleanup fire-and-forget: remove registros com mais de 30 dias
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  fetch(`${SUPABASE_URL}/rest/v1/ip_rate_limits?last_seen=lt.${encodeURIComponent(cutoff)}`, {
    method: 'DELETE',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
  }).catch(() => {});
}

// IP do cliente para rate-limit. Prefere x-real-ip (definido pela Vercel, não
// spoofável pelo cliente) em vez do 1º item de x-forwarded-for, que o cliente
// pode forjar enviando o próprio header.
function clientIp(req) {
  const realIp = (req.headers['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  // Sem x-real-ip: usa o ÚLTIMO salto do XFF (o mais próximo do proxy confiável).
  return xff.length ? xff[xff.length - 1] : 'unknown';
}

// ─── Créditos (usuários autenticados) ────────────────────────────────────────

async function getUserFromToken(token) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// ─── Estorno de crédito em falha ─────────────────────────────────────────────
// Chamado quando a IA falha APÓS o crédito já ter sido debitado.
// Nunca lança erro — falha de estorno é logada mas não propaga.

async function refundAnalysisCredit(userId, deductResult) {
  if (!userId || !deductResult || !deductResult.ok) return;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;

  // Estorno de crédito avulso — RPC atômica (credits + 1), sem race condition
  if (deductResult.via === 'credits') {
    try {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/increment_user_credits`, {
        method: 'POST',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: userId }),
      });
      const rpcData = rpcRes.ok ? await rpcRes.json().catch(() => null) : null;
      if (rpcData?.ok) {
        console.log('refundAnalysisCredit: credit refunded for user', userId, 'new balance:', rpcData.credits);
      } else {
        console.error('refundAnalysisCredit: increment_user_credits failed', rpcData);
      }
    } catch (err) {
      console.error('refundAnalysisCredit credits error:', err.message);
    }
    return;
  }

  // Estorno de cota mensal Starter — decrementa subscriptions.analyses_used_this_month
  if (deductResult.plan === 'starter' || deductResult.via === 'starter') {
    try {
      const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/decrement_analyses_used`, {
        method: 'POST',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_user_id: userId }),
      });
      const rpcData = rpcRes.ok ? await rpcRes.json().catch(() => null) : null;
      if (rpcData?.ok) {
        console.log('refundAnalysisCredit: starter quota refunded for user', userId);
      } else {
        console.warn('refundAnalysisCredit: decrement_analyses_used returned', rpcData, '(may have no eligible subscription)');
      }
    } catch (err) {
      console.error('refundAnalysisCredit starter error:', err.message);
    }
  }
  // Pro: ilimitado, não há cota a estornar
  // free_monthly / fail-open: nenhuma dedução real, nada a estornar
}

// ─── Check e incremento atômico via RPC ──────────────────────────────────────
// Fail-closed: qualquer falha de infraestrutura retorna infrastructure_error.
// Apenas erros de negócio (no_credits, plan_limit, invalid_plan) são esperados.
// A IA só é chamada após confirmação atômica de consumo.

async function checkAndDeductCredit(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { ok: false, reason: 'infrastructure_error', detail: 'missing_config' };
  }

  // 1. Verifica plano via RPC atômica (check + increment em uma transação)
  let rpcResult;
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_and_increment_analyses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId }),
    });

    if (!rpcRes.ok) {
      // Infra falhou — FAIL-CLOSED: não autoriza
      console.error('check_and_increment_analyses RPC HTTP error:', rpcRes.status);
      const directOnRpcError = await checkSubscriptionDirect(userId, 'analysis');
      if (directOnRpcError.ok) return directOnRpcError;
      if (directOnRpcError.reason && directOnRpcError.via !== 'no_subscription') return directOnRpcError;
      return { ok: false, reason: 'infrastructure_error', detail: 'rpc_http_' + rpcRes.status };
    }

    rpcResult = await rpcRes.json();
  } catch (err) {
    console.error('checkAndDeductCredit RPC exception:', err.message);
    const directOnRpcError = await checkSubscriptionDirect(userId, 'analysis').catch(() => null);
    if (directOnRpcError && directOnRpcError.ok) return directOnRpcError;
    if (directOnRpcError && directOnRpcError.reason && directOnRpcError.via !== 'no_subscription') return directOnRpcError;
    return { ok: false, reason: 'infrastructure_error', detail: 'rpc_exception' };
  }

  // 'no_subscription' → cai no sistema de créditos avulsos / free monthly
  if (rpcResult && rpcResult.via !== 'no_subscription') {
    if (rpcResult.ok) return rpcResult;
    const direct = await checkSubscriptionDirect(userId, 'analysis');
    if (direct.ok && direct.plan === 'pro') return direct;
    return rpcResult;
  }

  const direct = await checkSubscriptionDirect(userId, 'analysis');
  if (direct.ok) return direct;
  if (direct.reason && direct.via !== 'no_subscription') return direct;

  // 2. Fallback: créditos avulsos (usuários sem assinatura ativa)
  let credRows;
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!getRes.ok) {
      console.error('user_credits GET failed:', getRes.status);
      return { ok: false, reason: 'infrastructure_error', detail: 'credits_get_' + getRes.status };
    }
    credRows = await getRes.json();
  } catch (err) {
    console.error('checkAndDeductCredit credits GET exception:', err.message);
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_get_exception' };
  }

  if (!Array.isArray(credRows)) {
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_invalid_response' };
  }

  if (!credRows.length || credRows[0].credits <= 0) {
    // Plano gratuito: 1 análise gratuita por usuário a cada 30 dias
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const freeCheckRes = await fetch(
        `${SUPABASE_URL}/rest/v1/analyses?user_id=eq.${encodeURIComponent(userId)}&created_at=gte.${encodeURIComponent(thirtyDaysAgo)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      if (!freeCheckRes.ok) {
        // Não conseguiu verificar uso gratuito — FAIL-CLOSED
        console.error('free monthly check HTTP error:', freeCheckRes.status);
        return { ok: false, reason: 'infrastructure_error', detail: 'free_check_' + freeCheckRes.status };
      }
      const freeRows = await freeCheckRes.json();
      if (Array.isArray(freeRows) && freeRows.length === 0) {
        return { ok: true, via: 'free_monthly', plan: 'free' };
      }
    } catch (freeErr) {
      console.error('free monthly check exception:', freeErr.message);
      return { ok: false, reason: 'infrastructure_error', detail: 'free_check_exception' };
    }
    return { ok: false, reason: 'no_credits' };
  }

  const current = credRows[0].credits;
  // Atomic optimistic-lock: só a requisição que encontrar credits=current vai atualizar
  let patchRes;
  try {
    patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&credits=eq.${current}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ credits: current - 1, updated_at: new Date().toISOString() }),
      }
    );
  } catch (err) {
    console.error('user_credits PATCH exception:', err.message);
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_patch_exception' };
  }

  if (!patchRes.ok) {
    console.error('user_credits PATCH failed:', patchRes.status);
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_patch_' + patchRes.status };
  }

  let updated;
  try { updated = await patchRes.json(); } catch { updated = []; }

  // Nenhuma linha atualizada = race condition, outro request consumiu o crédito
  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, reason: 'no_credits' };
  }

  return { ok: true, remaining: current - 1, plan: 'credits', via: 'credits' };
}

async function saveAnalysis(userId, score, nivel, jobExcerpt, result, hash) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    // Evita duplicatas: verifica se já existe análise com o mesmo hash nos últimos 5 min
    if (hash) {
      const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const dupCheck = await fetch(
        `${SUPABASE_URL}/rest/v1/analyses?user_id=eq.${encodeURIComponent(userId)}&content_hash=eq.${hash}&created_at=gte.${encodeURIComponent(fiveMinAgo)}&select=id&limit=1`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      ).then(r => r.json()).catch(() => []);
      if (Array.isArray(dupCheck) && dupCheck.length > 0) {
        console.log('saveAnalysis: duplicate skipped for user', userId, 'hash', hash);
        return;
      }
    }
    const insertRes = await fetch(`${SUPABASE_URL}/rest/v1/analyses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({
        user_id: userId,
        score: score || 0,
        nivel: nivel || '',
        job_excerpt: (jobExcerpt || '').substring(0, 200),
        content_hash: hash || null,
        result: result,
        created_at: new Date().toISOString(),
      }),
    });
    if (insertRes.ok) {
      const rows = await insertRes.json();
      return rows?.[0]?.id || null;
    }
    return null;
  } catch (err) {
    console.error('saveAnalysis error:', err);
    return null;
  }
}

// ─── Marcos de gamificação ────────────────────────────────────────────────────

const MILESTONES = [
  { count: 5,  credits: 1, label: 'Nível Ativo' },
  { count: 10, credits: 1, label: 'Marco de fidelidade' },
  { count: 20, credits: 2, label: 'Nível Avançado' },
  { count: 30, credits: 1, label: 'Marco de fidelidade' },
  { count: 50, credits: 5, label: 'Nível Expert' },
];

async function checkAndAwardMilestones(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    // Conta total de análises do usuário
    const countRes = await fetch(
      `${SUPABASE_URL}/rest/v1/analyses?user_id=eq.${encodeURIComponent(userId)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, Prefer: 'count=exact' } }
    );
    const totalAnalyses = parseInt(countRes.headers.get('content-range')?.split('/')[1] || '0', 10);

    // Busca marcos já concedidos
    const milestonesRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_milestones?user_id=eq.${encodeURIComponent(userId)}&select=milestone`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const awarded = await milestonesRes.json();
    const awardedSet = new Set((awarded || []).map(m => m.milestone));

    // Verifica todos os marcos atingidos mas não concedidos (sem break — premia todos de uma vez)
    let newMilestone = null;
    let totalBonusCredits = 0;
    const toAward = MILESTONES.filter(m => totalAnalyses >= m.count && !awardedSet.has(m.count));

    for (const m of toAward) {
      // Registra marco
      await fetch(`${SUPABASE_URL}/rest/v1/user_milestones`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ user_id: userId, milestone: m.count, credits_awarded: m.credits }),
      });
      totalBonusCredits += m.credits;
      // Guarda o marco mais alto para retornar ao front-end
      newMilestone = { milestone: m.count, credits: m.credits, label: m.label, totalAnalyses };
    }

    // Adiciona todos os créditos bônus de uma só vez (uma única PATCH)
    if (totalBonusCredits > 0) {
      const credRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const credRows = await credRes.json();
      const current = credRows[0]?.credits || 0;
      await fetch(
        `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'PATCH',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({ credits: current + totalBonusCredits, updated_at: new Date().toISOString() }),
        }
      );
      if (newMilestone) newMilestone.totalCredits = totalBonusCredits;
    }

    return newMilestone;
  } catch (err) {
    console.error('checkAndAwardMilestones error:', err);
    return null;
  }
}

// ─── Rate limit por usuário autenticado (create_cv) ──────────────────────────
// Em memória — suficiente por instância serverless; combina com a cota do plano.
const _cvUserHits = new Map();
const CV_USER_LIMIT = 5;       // max CVs gerados por janela
const CV_USER_WINDOW_MS = 60 * 60 * 1000; // 1 hora

function checkCvRateLimit(userId) {
  const now = Date.now();
  const entry = _cvUserHits.get(userId) || { count: 0, resetAt: now + CV_USER_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + CV_USER_WINDOW_MS; }
  entry.count++;
  _cvUserHits.set(userId, entry);
  return entry.count <= CV_USER_LIMIT;
}

// ─── Dedução de crédito exclusiva para create_cv ─────────────────────────────
// Diferença em relação a checkAndDeductCredit: BLOQUEIA usuários Free.
// Não usa a gratuidade mensal de análise (free_monthly) para liberar CV.

async function getLatestSubscription(userId) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(userId)}&order=created_at.desc&limit=1&select=id,plan,status,analyses_used_this_month,analyses_reset_at,current_period_start`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  if (!res.ok) {
    console.error('getLatestSubscription failed:', res.status);
    return { error: 'subscription_get_' + res.status };
  }
  const rows = await res.json().catch(() => []);
  return { sub: Array.isArray(rows) ? rows[0] : null };
}

async function resetStarterCounterIfNeeded(sub) {
  if (!sub || sub.plan !== 'starter') return sub;
  const shouldReset = !sub.analyses_reset_at ||
    (sub.current_period_start && new Date(sub.analyses_reset_at).getTime() < new Date(sub.current_period_start).getTime());
  if (!shouldReset) return sub;

  const patch = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?id=eq.${encodeURIComponent(sub.id)}`, {
    method: 'PATCH',
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ analyses_used_this_month: 0, analyses_reset_at: new Date().toISOString() }),
  });
  if (!patch.ok) {
    console.error('resetStarterCounterIfNeeded failed:', patch.status);
    return { ...sub, _reset_error: 'subscription_reset_' + patch.status };
  }
  const rows = await patch.json().catch(() => []);
  return Array.isArray(rows) && rows[0] ? rows[0] : { ...sub, analyses_used_this_month: 0 };
}

async function checkSubscriptionDirect(userId, context = 'analysis') {
  try {
    const latest = await getLatestSubscription(userId);
    if (latest.error) return { ok: false, reason: 'infrastructure_error', detail: latest.error };

    let sub = latest.sub;
    const plan = resolvePlan(sub);
    if (plan === 'free') return { ok: false, via: 'no_subscription' };

    if (plan === 'pro') {
      return { ok: true, via: 'pro_direct', plan: 'pro' };
    }

    if (plan !== 'starter') {
      return { ok: false, reason: 'invalid_plan', plan };
    }

    sub = await resetStarterCounterIfNeeded(sub);
    if (sub && sub._reset_error) {
      return { ok: false, reason: 'infrastructure_error', detail: sub._reset_error };
    }

    const used = Number(sub?.analyses_used_this_month || 0);
    if (used >= STARTER_ANALYSES_CAP) {
      return { ok: false, reason: 'plan_limit', plan: 'starter', used, limit: STARTER_ANALYSES_CAP };
    }

    const patch = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?id=eq.${encodeURIComponent(sub.id)}&analyses_used_this_month=eq.${used}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ analyses_used_this_month: used + 1 }),
      }
    );
    if (!patch.ok) {
      console.error('checkSubscriptionDirect starter PATCH failed:', patch.status);
      return { ok: false, reason: 'infrastructure_error', detail: 'subscription_patch_' + patch.status };
    }
    const rows = await patch.json().catch(() => []);
    if (!Array.isArray(rows) || !rows.length) {
      return { ok: false, reason: 'infrastructure_error', detail: 'subscription_patch_race' };
    }
    return { ok: true, via: context === 'create_cv' ? 'starter_direct_cv' : 'starter_direct', plan: 'starter', used: used + 1, limit: STARTER_ANALYSES_CAP };
  } catch (err) {
    console.error('checkSubscriptionDirect exception:', err.message);
    return { ok: false, reason: 'infrastructure_error', detail: 'subscription_direct_exception' };
  }
}

async function checkAndDeductCreditForCV(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return { ok: false, reason: 'infrastructure_error', detail: 'missing_config' };
  }

  // 1. Verifica plano via RPC atômica
  let rpcResult;
  try {
    const rpcRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/check_and_increment_analyses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user_id: userId }),
    });
    if (!rpcRes.ok) {
      console.error('create_cv: check_and_increment_analyses HTTP error:', rpcRes.status);
      const directOnRpcError = await checkSubscriptionDirect(userId, 'create_cv');
      if (directOnRpcError.ok) return directOnRpcError;
      if (directOnRpcError.reason && directOnRpcError.via !== 'no_subscription') return directOnRpcError;
      return { ok: false, reason: 'infrastructure_error', detail: 'rpc_http_' + rpcRes.status };
    }
    rpcResult = await rpcRes.json();
  } catch (err) {
    console.error('create_cv: RPC exception:', err.message);
    const directOnRpcError = await checkSubscriptionDirect(userId, 'create_cv').catch(() => null);
    if (directOnRpcError && directOnRpcError.ok) return directOnRpcError;
    if (directOnRpcError && directOnRpcError.reason && directOnRpcError.via !== 'no_subscription') return directOnRpcError;
    return { ok: false, reason: 'infrastructure_error', detail: 'rpc_exception' };
  }

  // 'no_subscription' → cai nos créditos avulsos, mas NUNCA em free_monthly
  if (rpcResult && rpcResult.via !== 'no_subscription') {
    if (rpcResult.ok) return rpcResult;
    const direct = await checkSubscriptionDirect(userId, 'create_cv');
    if (direct.ok && direct.plan === 'pro') return direct;
    return rpcResult;
  }

  const direct = await checkSubscriptionDirect(userId, 'create_cv');
  if (direct.ok) return direct;
  if (direct.reason && direct.via !== 'no_subscription') return direct;

  // 2. Sem assinatura: verifica créditos avulsos
  let credRows;
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (!getRes.ok) {
      return { ok: false, reason: 'infrastructure_error', detail: 'credits_get_' + getRes.status };
    }
    credRows = await getRes.json();
  } catch (err) {
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_get_exception' };
  }

  if (!Array.isArray(credRows) || !credRows.length || credRows[0].credits <= 0) {
    // Free sem créditos: bloqueado para create_cv
    return { ok: false, reason: 'no_credits' };
  }

  const current = credRows[0].credits;
  let patchRes;
  try {
    patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&credits=eq.${current}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=representation',
        },
        body: JSON.stringify({ credits: current - 1, updated_at: new Date().toISOString() }),
      }
    );
  } catch (err) {
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_patch_exception' };
  }

  if (!patchRes.ok) {
    return { ok: false, reason: 'infrastructure_error', detail: 'credits_patch_' + patchRes.status };
  }

  let updated;
  try { updated = await patchRes.json(); } catch { updated = []; }

  if (!Array.isArray(updated) || updated.length === 0) {
    return { ok: false, reason: 'no_credits' };
  }

  return { ok: true, remaining: current - 1, plan: 'credits', via: 'credits' };
}

// ─── Handler principal ────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Modo: criar currículo otimizado ─────────────────────────────────────────
  const { action } = req.body || {};
  if (action === 'create_cv') {
    // 1. Autenticação obrigatória
    const cvAuthHeader = req.headers['authorization'] || '';
    const cvToken = cvAuthHeader.startsWith('Bearer ') ? cvAuthHeader.slice(7).trim() : null;
    if (!cvToken) return res.status(401).json({ error: 'Autenticação necessária para criar currículo.' });
    const cvUser = await getUserFromToken(cvToken);
    if (!cvUser?.id) return res.status(401).json({ error: 'Token inválido. Faça login novamente.' });

    // 2. Rate limit por usuário
    if (!checkCvRateLimit(cvUser.id)) {
      return res.status(429).json({ error: 'Limite de geração de CVs atingido. Aguarde antes de tentar novamente.' });
    }

    // 3. Validação de campos
    const { nome, cargo_objetivo, experiencias, formacao, habilidades, job: jobCtx } = req.body;
    if (!nome || typeof nome !== 'string' || !nome.trim()) {
      return res.status(400).json({ error: 'Nome é obrigatório.' });
    }
    if (!experiencias || typeof experiencias !== 'string' || !experiencias.trim()) {
      return res.status(400).json({ error: 'Experiência profissional é obrigatória.' });
    }
    if (nome.length > 200)              return res.status(400).json({ error: 'Nome muito longo (máx. 200 caracteres).' });
    if (experiencias.length > 10000)    return res.status(400).json({ error: 'Experiência muito longa (máx. 10.000 caracteres).' });
    if ((formacao    || '').length > 5000)  return res.status(400).json({ error: 'Formação muito longa (máx. 5.000 caracteres).' });
    if ((habilidades || '').length > 2000)  return res.status(400).json({ error: 'Habilidades muito longas (máx. 2.000 caracteres).' });
    if ((jobCtx      || '').length > 5000)  return res.status(400).json({ error: 'Descrição da vaga muito longa (máx. 5.000 caracteres).' });
    if ((cargo_objetivo || '').length > 200) return res.status(400).json({ error: 'Cargo objetivo muito longo (máx. 200 caracteres).' });

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Chave de API não configurada.' });
    }

    // 4. Verifica plano e debita cota/crédito ANTES de chamar a IA
    //    Free sem créditos = bloqueado (não reutiliza gratuidade mensal de análise)
    const cvDeduct = await checkAndDeductCreditForCV(cvUser.id);
    if (!cvDeduct.ok) {
      if (cvDeduct.reason === 'no_credits') {
        return res.status(402).json({ error: 'sem_creditos', message: 'CV otimizado não está disponível no plano gratuito. Assine um plano ou adquira créditos.' });
      }
      if (cvDeduct.reason === 'plan_limit') {
        return res.status(402).json({ error: 'plan_limit', message: 'Limite do plano Starter atingido para este mês.' });
      }
      if (cvDeduct.reason === 'invalid_plan') {
        return res.status(403).json({ error: 'invalid_plan', message: 'Plano não reconhecido.' });
      }
      // infrastructure_error — FAIL-CLOSED: não executa IA
      console.error('create_cv: deduction failed (infrastructure):', cvDeduct.detail);
      return res.status(503).json({ error: 'service_unavailable', message: 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
    }

    // 5. Chama a IA somente após dedução confirmada
    const cvPrompt = `Você é especialista em criação de currículos otimizados para sistemas ATS (Applicant Tracking System). Crie um currículo profissional completo em texto puro para o candidato abaixo.

${jobCtx ? `VAGA ALVO — use as keywords desta vaga para otimizar o currículo:\n${jobCtx.substring(0, 2000)}\n\n` : ''}DADOS DO CANDIDATO:
Nome: ${nome}
${cargo_objetivo ? `Cargo / Objetivo: ${cargo_objetivo}` : ''}
${experiencias ? `Experiência profissional: ${experiencias}` : ''}
${formacao ? `Formação acadêmica: ${formacao}` : ''}
${habilidades ? `Habilidades e ferramentas: ${habilidades}` : ''}

INSTRUÇÕES:
- Gere o currículo em texto puro (sem markdown, sem asteriscos, sem caracteres especiais)
- Use MAIÚSCULAS apenas para títulos de seção
- Estrutura obrigatória: RESUMO PROFISSIONAL → EXPERIÊNCIA PROFISSIONAL → FORMAÇÃO ACADÊMICA → HABILIDADES
- Resumo: 3-4 linhas com keywords da vaga incorporadas naturalmente
- Experiência: bullets começando com verbo de ação no passado + resultado mensurável
- Se a vaga foi fornecida, incorpore as principais keywords de forma natural
- Seja conciso e objetivo — máximo 1 página equivalente
- No topo, coloque o nome em destaque seguido do cargo/objetivo

Responda APENAS com o texto do currículo, sem explicações adicionais.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          temperature: 0.3,
          messages: [{ role: 'user', content: cvPrompt }],
        }),
      });
      if (!response.ok) {
        // IA falhou: estorna somente se houve cobrança real
        await refundAnalysisCredit(cvUser.id, cvDeduct);
        return res.status(500).json({ error: 'Erro ao gerar currículo. Tente novamente.' });
      }
      const data = await response.json();
      const cvText = data.content?.[0]?.text || '';
      if (!cvText.trim()) {
        await refundAnalysisCredit(cvUser.id, cvDeduct);
        return res.status(500).json({ error: 'Resposta vazia da IA.' });
      }
      // 6. Registra uso de forma auditável
      if (SUPABASE_URL && SUPABASE_SERVICE_KEY) {
        fetch(`${SUPABASE_URL}/rest/v1/cv_generations`, {
          method: 'POST',
          headers: {
            apikey: SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify({
            user_id: cvUser.id,
            plan: cvDeduct.plan || cvDeduct.via || 'unknown',
            via: cvDeduct.via,
            created_at: new Date().toISOString(),
          }),
        }).catch(e => console.error('cv_generations insert error:', e.message));
      }
      return res.status(200).json({ cv_text: cvText.trim() });
    } catch (err) {
      console.error('create_cv error:', err.message);
      await refundAnalysisCredit(cvUser.id, cvDeduct).catch(() => {});
      return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
    }
  }

  const { cv, job, job_url: requestedJobUrl } = req.body || {};
  const jobUrl = normalizeJobUrl(requestedJobUrl);

  if (!cv || !job) {
    return res.status(400).json({ error: 'CV e descrição da vaga são obrigatórios.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Chave de API não configurada.' });
  }

  // Tenta autenticar via Bearer token Supabase
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  let authenticatedUserId = null;

  if (bearerToken) {
    const user = await getUserFromToken(bearerToken);
    if (user && user.id) authenticatedUserId = user.id;
  }

  // ─── Verifica cache ANTES de debitar créditos ─────────────────────────────
  const hash = contentHash(cv, job);
  const cached = await getCachedResult(hash);

  if (cached) {
    console.log('Cache hit:', hash);
    const cachedResult = { ...attachJobMetadata(cached, jobUrl), _from_cache: true };

    if (authenticatedUserId) {
      // Cache hit ainda consome crédito — o resultado foi salvo, mas o limite deve ser respeitado
      const deduct = await checkAndDeductCredit(authenticatedUserId);
      if (!deduct.ok) {
        if (deduct.reason === 'no_credits' || deduct.reason === 'plan_limit') {
          return res.status(402).json({ error: 'sem_creditos' });
        }
        if (deduct.reason === 'invalid_plan') {
          return res.status(403).json({ error: 'invalid_plan' });
        }
        // infrastructure_error — FAIL-CLOSED
        console.error('Credit deduction infrastructure error on cache hit:', deduct.detail);
        return res.status(503).json({ error: 'service_unavailable', message: 'Serviço temporariamente indisponível.' });
      }
      // Salva no histórico sem duplicar (verifica se já existe entrada recente idêntica)
      const cachedAnalysisId = await saveAnalysis(authenticatedUserId, cachedResult.score, cachedResult.nivel, job, cachedResult, hash);
      if (cachedAnalysisId) cachedResult._analysis_id = cachedAnalysisId;
      try {
        const credRows = await fetch(
          `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(authenticatedUserId)}&select=credits`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
        ).then(r => r.json());
        cachedResult._credits_remaining = credRows[0]?.credits ?? null;
      } catch (_) {}
    } else {
      // Anônimo: aplica rate limit mesmo em cache hit
      const _ip = clientIp(req);
      const { allowed } = await checkRateLimit(_ip);
      if (!allowed) {
        return res.status(429).json({ error: 'limite_atingido' });
      }
      await recordIpUsage(_ip);
    }

    return res.status(200).json(cachedResult);
  }

  // ─── Cache miss: verifica limite / créditos ───────────────────────────────
  let _ip = null;
  let _deductResult = { ok: false }; // rastreia o resultado para estorno em falha
  if (authenticatedUserId) {
    _deductResult = await checkAndDeductCredit(authenticatedUserId);
    if (!_deductResult.ok) {
      if (_deductResult.reason === 'no_credits' || _deductResult.reason === 'plan_limit') {
        return res.status(402).json({ error: 'sem_creditos' });
      }
      if (_deductResult.reason === 'invalid_plan') {
        return res.status(403).json({ error: 'invalid_plan' });
      }
      // infrastructure_error — FAIL-CLOSED: não executa IA
      console.error('Credit deduction infrastructure error:', _deductResult.detail);
      return res.status(503).json({ error: 'service_unavailable', message: 'Serviço temporariamente indisponível. Tente novamente em instantes.' });
    }
  } else {
    _ip = clientIp(req);
    const { allowed } = await checkRateLimit(_ip);
    if (!allowed) {
      return res.status(429).json({ error: 'limite_atingido' });
    }
  }

  const prompt = `Você é um especialista em recrutamento e sistemas ATS (Applicant Tracking System). Analise a compatibilidade entre o currículo e a vaga abaixo e gere uma versão otimizada do currículo.

VAGA:
${job}

CURRÍCULO:
${cv}

Responda APENAS com um JSON válido, sem texto adicional, no seguinte formato:
{
  "job_info": {
    "empresa": "<nome da empresa contratante. Se não identificada ou anônima, use 'Empresa anônima'>",
    "cargo": "<título exato do cargo/vaga>",
    "salario": "<faixa salarial se mencionada, senão 'Não informado'>",
    "beneficios": ["<benefício 1>", "<benefício 2>", "<benefício 3>"]
  },
  "score": <número de 0 a 100>,
  "nivel": "<Fraco|Regular|Bom|Excelente>",
  "resumo": "<uma frase resumindo a análise>",
  "falhas": [
    "<principal problema 1>",
    "<principal problema 2>",
    "<principal problema 3>"
  ],
  "sugestoes": [
    "<sugestão de melhoria 1>",
    "<sugestão de melhoria 2>",
    "<sugestão de melhoria 3>"
  ],
  "keywords_encontradas": ["<keyword1>", "<keyword2>"],
  "keywords_faltando": ["<keyword1>", "<keyword2>"],
  "fatores": {
    "compatibilidade": <0-100>,
    "keywords_ats": <0-100>,
    "legibilidade": <0-100>,
    "forca_bullets": <0-100>
  },
  "cv_otimizado": {
    "nome": "<nome completo extraído do currículo>",
    "titulo_profissional": "<cargo atual ou objetivo profissional, otimizado para a vaga>",
    "contato": {
      "email": "<email se disponível, senão string vazia>",
      "telefone": "<telefone se disponível, senão string vazia>",
      "linkedin": "<URL do LinkedIn se disponível, senão string vazia>",
      "cidade": "<cidade e estado se disponível, senão string vazia>"
    },
    "resumo_profissional": "<3 a 5 linhas de resumo profissional otimizado para ATS, incorporando naturalmente as principais keywords da vaga sem forçar>",
    "experiencias": [
      {
        "cargo": "<cargo>",
        "empresa": "<empresa>",
        "periodo": "<período ex: Jan 2020 – Dez 2022>",
        "bullets": [
          "<bullet otimizado: verbo de ação + resultado mensurável + keyword relevante da vaga>",
          "<bullet 2>",
          "<bullet 3>"
        ]
      }
    ],
    "formacao": [
      {
        "curso": "<nome do curso>",
        "instituicao": "<nome da instituição>",
        "periodo": "<ano de conclusão ou período>"
      }
    ],
    "habilidades": ["<skill técnica 1>", "<skill 2>", "<keyword da vaga incorporada naturalmente>"]
  },
  "briefing_empresa": {
    "o_que_valorizam": [
      "<valor ou característica cultural inferida da vaga>",
      "<outro valor percebido>"
    ],
    "buscam_em_candidatos": [
      "<qualidade implícita que a empresa busca, além dos requisitos técnicos>",
      "<outra qualidade percebida>"
    ],
    "pontos_para_entrevista": [
      "<ponto concreto para mencionar na entrevista alinhado com a vaga>",
      "<outro ponto de destaque>",
      "<terceiro ponto>"
    ],
    "perguntas_para_fazer": [
      "<pergunta inteligente que demonstra interesse genuíno>",
      "<outra pergunta estratégica>"
    ],
    "pontos_de_atencao": [
      "<sinal de atenção ou ambiguidade percebida na descrição da vaga>"
    ]
  },
  "prioridades": [
    {"titulo": "<ação concreta e mais impactante para aumentar a compatibilidade>", "explicacao": "<por que essa ação tem o maior impacto para essa vaga específica>"},
    {"titulo": "<segunda ação mais impactante>", "explicacao": "<justificativa objetiva>"},
    {"titulo": "<terceira ação mais impactante>", "explicacao": "<justificativa objetiva>"}
  ],
  "keywords_parcialmente_encontradas": ["<keyword presente no currículo mas mencionada superficialmente ou sem evidência quantificável — DEVE ser mutuamente exclusiva com keywords_encontradas e keywords_faltando>"],
  "score_estimado_apos_ajustes": <número inteiro de 0 a 100 estimando o score se o candidato implementar as 3 prioridades acima>,
  "plano_melhoria": [
    {
      "id": "posicionamento",
      "titulo": "Ajustar posicionamento",
      "descricao": "<ajuste específico de posicionamento profissional para esta vaga>",
      "status": "pendente",
      "detalhes": ["<ação concreta 1>", "<ação concreta 2>"]
    },
    {
      "id": "experiencias",
      "titulo": "Fortalecer experiências",
      "descricao": "<como reescrever as experiências para esta vaga>",
      "status": "pendente",
      "detalhes": ["<ação concreta 1>", "<ação concreta 2>"]
    },
    {
      "id": "ats",
      "titulo": "Otimizar para ATS",
      "descricao": "<o que mudar na estrutura e keywords para passar pelo filtro>",
      "status": "pendente",
      "detalhes": ["<ação concreta 1>", "<ação concreta 2>"]
    }
  ]
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 8000,
        temperature: 0,   // determinístico — mesmo input, mesmo output
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error status:', response.status);
      console.error('Anthropic error body:', errText);
      let userMsg = 'Erro ao chamar a API de análise.';
      try {
        const errJson = JSON.parse(errText);
        const type = errJson?.error?.type || '';
        if (type === 'authentication_error') userMsg = 'Chave de API inválida. Verifique a configuração.';
        else if (type === 'overloaded_error') userMsg = 'Serviço temporariamente sobrecarregado. Tente em alguns segundos.';
        else if (type === 'rate_limit_error') userMsg = 'Limite de uso atingido. Tente novamente em instantes.';
      } catch (_) {}
      // Estorna crédito: IA falhou antes de produzir resultado
      if (authenticatedUserId) await refundAnalysisCredit(authenticatedUserId, _deductResult);
      return res.status(500).json({ error: userMsg });
    }

    const data = await response.json();
    if (data.stop_reason === 'max_tokens') {
      console.error('Anthropic response truncated (max_tokens reached)');
      if (authenticatedUserId) await refundAnalysisCredit(authenticatedUserId, _deductResult).catch(() => {});
      return res.status(500).json({ error: 'Resposta da IA incompleta. Tente novamente.' });
    }
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // Estorna crédito: resposta inválida (IA não retornou JSON)
      if (authenticatedUserId) await refundAnalysisCredit(authenticatedUserId, _deductResult);
      return res.status(500).json({ error: 'Resposta inválida da IA.' });
    }

    let result;
    try {
      result = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr.message, '| raw:', text.slice(0, 300));
      if (authenticatedUserId) await refundAnalysisCredit(authenticatedUserId, _deductResult).catch(() => {});
      return res.status(500).json({ error: 'Resposta inválida da IA. Tente novamente.' });
    }

    // Normaliza keywords (remove duplicatas e garante exclusividade mútua)
    normalizeKeywords(result);

    // Score determinístico calculado dos fatores (sobrescreve o da IA)
    const breakdown = buildScoreBreakdown(result.fatores);
    result.score_breakdown = breakdown.rows;
    result.score = breakdown.total;

    // Armazena no cache (fire-and-forget, não bloqueia resposta)
    setCachedResult(hash, result);

    // O link pertence à oportunidade individual, não ao resultado reutilizável
    // do cache. Ele segue apenas para a resposta e o histórico desta análise.
    if (jobUrl) {
      result.job_info = { ...(result.job_info || {}), job_url: jobUrl };
    }

    // Pós-análise
    if (authenticatedUserId) {
      const analysisId = await saveAnalysis(authenticatedUserId, result.score, result.nivel, job, result, hash);
      if (analysisId) result._analysis_id = analysisId;
      // Verifica marcos de gamificação (fire-and-forget com resultado)
      const milestone = await checkAndAwardMilestones(authenticatedUserId);
      if (milestone) result._milestone = milestone;
      // Devolve créditos restantes ao cliente para atualizar o contador
      try {
        const credRows = await fetch(
          `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(authenticatedUserId)}&select=credits`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
        ).then(r => r.json());
        result._credits_remaining = credRows[0]?.credits ?? null;
      } catch (_) {}
    } else {
      await recordIpUsage(_ip);
    }

    // Score comparativo — benchmark interno
    const score = result.score || 0;
    const benchmark = {
      media_aprovados: 78,
      percentil: score >= 85 ? 90 : score >= 75 ? 75 : score >= 65 ? 55 : score >= 50 ? 35 : 15,
      mensagem: score >= 78
        ? 'Seu score está acima da média de quem é chamado para entrevista.'
        : `Candidatos chamados para entrevista têm score médio de 78%. Você está ${78 - score} pontos abaixo.`,
      threshold_entrevista: 78,
    };
    result._benchmark = benchmark;

    return res.status(200).json(result);
  } catch (err) {
    console.error('Handler error:', err);
    // Estorna crédito em erro inesperado (timeout, rede, etc.)
    if (authenticatedUserId) await refundAnalysisCredit(authenticatedUserId, _deductResult).catch(() => {});
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
