// Protecao compartilhada contra abuso de gratuidades e compartilhamento de conta.
// Nenhum identificador bruto (e-mail, IP ou cookie) e persistido: apenas HMACs.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const DEVICE_COOKIE = 'vagaai_device';
const DEVICE_MAX_AGE = 60 * 60 * 24 * 180;
const FREE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const IP_VELOCITY_WINDOW_MS = 24 * 60 * 60 * 1000;

const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com', '20minutemail.com', 'dispostable.com', 'emailondeck.com',
  'fakeinbox.com', 'getnada.com', 'guerrillamail.com', 'guerrillamail.net',
  'maildrop.cc', 'mailinator.com', 'mailnesia.com', 'mintemail.com',
  'mohmal.com', 'sharklasers.com', 'temp-mail.org', 'tempail.com',
  'tempmail.com', 'tempmail.net', 'throwawaymail.com', 'trashmail.com',
  'yopmail.com', 'yopmail.fr', 'yopmail.net',
]);

function supabaseConfig() {
  return {
    url: process.env.SUPABASE_URL || '',
    key: process.env.SUPABASE_SERVICE_KEY || '',
  };
}

function signingSecret() {
  return process.env.ABUSE_SIGNING_SECRET
    || process.env.CRON_SECRET
    || process.env.STRIPE_WEBHOOK_SECRET
    || process.env.SUPABASE_SERVICE_KEY
    || 'vagaai-local-abuse-key';
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ''));
  const right = Buffer.from(String(b || ''));
  return left.length === right.length && timingSafeEqual(left, right);
}

function signDeviceId(id) {
  return createHmac('sha256', signingSecret()).update(`device:${id}`).digest('hex');
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx < 1) return;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    try { out[key] = decodeURIComponent(value); } catch { out[key] = value; }
  });
  return out;
}

function appendDeviceCookie(res, value) {
  if (!res || typeof res.setHeader !== 'function') return;
  const cookie = `${DEVICE_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${DEVICE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`;
  const current = typeof res.getHeader === 'function' ? res.getHeader('Set-Cookie') : null;
  if (!current) return res.setHeader('Set-Cookie', cookie);
  const values = Array.isArray(current) ? current : [current];
  res.setHeader('Set-Cookie', [...values, cookie]);
}

export function getOrCreateDeviceId(req, res) {
  const raw = parseCookies(req?.headers?.cookie)[DEVICE_COOKIE] || '';
  const [id, signature] = raw.split('.');
  if (/^[a-f0-9]{32}$/.test(id || '') && /^[a-f0-9]{64}$/.test(signature || '') && safeEqual(signature, signDeviceId(id))) {
    return id;
  }
  const next = randomBytes(16).toString('hex');
  appendDeviceCookie(res, `${next}.${signDeviceId(next)}`);
  return next;
}

export function clientIp(req) {
  const realIp = String(req?.headers?.['x-real-ip'] || '').trim();
  if (realIp) return realIp;
  const forwarded = String(req?.headers?.['x-forwarded-for'] || '')
    .split(',').map(value => value.trim()).filter(Boolean);
  return forwarded.length ? forwarded[forwarded.length - 1] : 'unknown';
}

export function hashAbuseSignal(kind, value) {
  return createHmac('sha256', signingSecret())
    .update(`${kind}:${String(value || '').trim().toLowerCase()}`)
    .digest('hex');
}

export function normalizeEmail(rawEmail) {
  const email = String(rawEmail || '').trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return '';
  let local = email.slice(0, at);
  let domain = email.slice(at + 1);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') {
    local = local.split('+')[0].replace(/\./g, '');
  }
  return local && domain ? `${local}@${domain}` : '';
}

export function isDisposableEmail(rawEmail) {
  const normalized = normalizeEmail(rawEmail);
  const domain = normalized.split('@')[1] || '';
  const configured = String(process.env.DISPOSABLE_EMAIL_DOMAINS || '')
    .split(',').map(value => value.trim().toLowerCase()).filter(Boolean);
  return DISPOSABLE_DOMAINS.has(domain) || configured.includes(domain);
}

export function isVerifiedUser(user) {
  if (!user?.id || !normalizeEmail(user.email)) return false;
  if (user.email_confirmed_at || user.confirmed_at) return true;
  const providers = [user.app_metadata?.provider]
    .concat(user.app_metadata?.providers || [])
    .concat((user.identities || []).map(identity => identity?.provider))
    .filter(Boolean);
  return providers.some(provider => ['google', 'azure', 'linkedin_oidc'].includes(provider));
}

export function abuseContext(req, res, user = null) {
  const deviceId = getOrCreateDeviceId(req, res);
  const normalizedEmail = normalizeEmail(user?.email);
  return {
    deviceHash: hashAbuseSignal('device', deviceId),
    ipHash: hashAbuseSignal('ip', clientIp(req)),
    emailHash: normalizedEmail ? hashAbuseSignal('email', normalizedEmail) : '',
    normalizedEmail,
  };
}

function serviceHeaders() {
  const { key } = supabaseConfig();
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function callRpc(name, body) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return { available: false, data: null };
  try {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: serviceHeaders(), body: JSON.stringify(body),
    });
    if (response.status === 404 || response.status === 400) {
      const text = await response.text().catch(() => '');
      if (/PGRST202|Could not find the function|schema cache/i.test(text)) return { available: false, data: null };
      return { available: true, error: `rpc_${response.status}` };
    }
    if (!response.ok) return { available: true, error: `rpc_${response.status}` };
    return { available: true, data: await response.json().catch(() => null) };
  } catch (error) {
    console.error(`abuse ${name} error:`, error.message);
    return { available: false, data: null };
  }
}

export function turnstileConfigured() {
  return Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY);
}

async function verifyTurnstile(token, ip) {
  if (!turnstileConfigured()) return { configured: false, ok: false };
  if (!token || typeof token !== 'string' || token.length > 2048) return { configured: true, ok: false };
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip === 'unknown' ? '' : ip,
      }).toString(),
    });
    const data = await response.json().catch(() => ({}));
    return { configured: true, ok: response.ok && data.success === true };
  } catch (error) {
    console.error('turnstile verification error:', error.message);
    return { configured: true, ok: false };
  }
}

function normalizeRpcDecision(value) {
  const data = Array.isArray(value) ? value[0] : value;
  if (!data || typeof data !== 'object') return null;
  return {
    ok: data.ok === true,
    action: String(data.action || (data.ok ? 'allow' : 'deny')),
    reason: String(data.reason || ''),
    riskScore: Number(data.risk_score || 0),
    claimId: data.claim_id || null,
    userId: data.user_id || null,
    source: 'rpc',
  };
}

async function getLimitRow(key) {
  const { url, key: serviceKey } = supabaseConfig();
  if (!url || !serviceKey) return null;
  const response = await fetch(
    `${url}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(key)}&select=count,first_seen,last_seen`,
    { headers: serviceHeaders() }
  );
  if (!response.ok) throw new Error(`limit_get_${response.status}`);
  const rows = await response.json();
  return rows?.[0] || null;
}

async function claimWindowKey(key, windowMs) {
  const { url, key: serviceKey } = supabaseConfig();
  if (!url || !serviceKey) return { ok: true, inserted: false, key };
  const row = await getLimitRow(key);
  if (row && Date.now() - new Date(row.first_seen).getTime() < windowMs) return { ok: false, inserted: false, key };
  if (row) {
    await fetch(`${url}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(key)}`, {
      method: 'DELETE', headers: serviceHeaders(),
    });
  }
  const now = new Date().toISOString();
  const response = await fetch(`${url}/rest/v1/ip_rate_limits`, {
    method: 'POST',
    headers: { ...serviceHeaders(), Prefer: 'return=representation' },
    body: JSON.stringify({ ip: key, count: 1, first_seen: now, last_seen: now }),
  });
  if (response.status === 409) return { ok: false, inserted: false, key };
  if (!response.ok) throw new Error(`limit_claim_${response.status}`);
  return { ok: true, inserted: true, key };
}

async function incrementWindowKey(key, windowMs) {
  const { url, key: serviceKey } = supabaseConfig();
  if (!url || !serviceKey) return 1;
  const row = await getLimitRow(key);
  const now = new Date().toISOString();
  if (row && Date.now() - new Date(row.first_seen).getTime() < windowMs) {
    const next = Number(row.count || 0) + 1;
    await fetch(`${url}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(key)}`, {
      method: 'PATCH', headers: serviceHeaders(), body: JSON.stringify({ count: next, last_seen: now }),
    });
    return next;
  }
  if (row) {
    await fetch(`${url}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(key)}`, { method: 'DELETE', headers: serviceHeaders() });
  }
  await fetch(`${url}/rest/v1/ip_rate_limits`, {
    method: 'POST', headers: serviceHeaders(), body: JSON.stringify({ ip: key, count: 1, first_seen: now, last_seen: now }),
  });
  return 1;
}

async function deleteKeys(keys) {
  const { url, key } = supabaseConfig();
  if (!url || !key || !keys?.length) return;
  await Promise.all(keys.map(value => fetch(
    `${url}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(value)}`,
    { method: 'DELETE', headers: serviceHeaders() }
  ).catch(() => null)));
}

async function fallbackFreeClaim({ user, context, resource, challengePassed }) {
  const prefix = `abuse:free:${resource}`;
  const ipKey = `${prefix}:ip24:${context.ipHash}`;
  let deviceCount = 0;
  for (let slot = 1; slot <= 2; slot += 1) {
    const row = await getLimitRow(`${prefix}:device:${context.deviceHash}:${slot}`).catch(() => null);
    if (row && Date.now() - new Date(row.first_seen).getTime() < FREE_WINDOW_MS) deviceCount += 1;
  }
  const ipRow = await getLimitRow(ipKey).catch(() => null);
  const ipCount = ipRow && Date.now() - new Date(ipRow.first_seen).getTime() < IP_VELOCITY_WINDOW_MS
    ? Number(ipRow.count || 0) : 0;
  const riskScore = (deviceCount >= 1 ? 40 : 0) + (ipCount >= 5 ? 40 : 0);

  if (deviceCount >= 2 || riskScore >= 80) {
    return { ok: false, action: 'deny', reason: deviceCount >= 2 ? 'device_limit' : 'risk_limit', riskScore, source: 'fallback' };
  }
  if (riskScore >= 40 && turnstileConfigured() && !challengePassed) {
    return { ok: false, action: 'challenge', reason: 'risk_challenge', riskScore, source: 'fallback' };
  }

  const inserted = [];
  const emailKey = `${prefix}:email:${context.emailHash}`;
  const emailClaim = await claimWindowKey(emailKey, FREE_WINDOW_MS);
  if (!emailClaim.ok) return { ok: false, action: 'deny', reason: 'email_limit', riskScore: 100, source: 'fallback' };
  if (emailClaim.inserted) inserted.push(emailKey);

  const deviceKey = `${prefix}:device:${context.deviceHash}:${deviceCount + 1}`;
  const deviceClaim = await claimWindowKey(deviceKey, FREE_WINDOW_MS);
  if (!deviceClaim.ok) {
    await deleteKeys(inserted);
    return { ok: false, action: 'deny', reason: 'device_limit', riskScore: 100, source: 'fallback' };
  }
  if (deviceClaim.inserted) inserted.push(deviceKey);
  await incrementWindowKey(ipKey, IP_VELOCITY_WINDOW_MS).catch(() => 0);
  return { ok: true, action: 'allow', reason: '', riskScore, source: 'fallback', fallbackKeys: inserted, userId: user.id };
}

async function fallbackAccountUsage({ user, context, challengePassed }) {
  const { url, key } = supabaseConfig();
  if (!url || !key) return { ok: true, action: 'allow', reason: 'local_without_store', riskScore: 0, source: 'fallback' };
  const userHash = hashAbuseSignal('user', user.id);
  const prefix = `abuse:account:${userHash}:device:`;
  const deviceKey = `${prefix}${context.deviceHash}`;
  await claimWindowKey(deviceKey, FREE_WINDOW_MS).catch(() => null);
  try {
    const response = await fetch(
      `${url}/rest/v1/ip_rate_limits?ip=like.${encodeURIComponent(prefix + '*')}&select=ip,first_seen&limit=100`,
      { headers: serviceHeaders() }
    );
    if (!response.ok) return { ok: false, action: 'deny', reason: 'abuse_guard_unavailable', riskScore: 100, source: 'fallback' };
    const rows = await response.json();
    const devices = (Array.isArray(rows) ? rows : []).filter(row =>
      Date.now() - new Date(row.first_seen).getTime() < FREE_WINDOW_MS
    ).length;
    if (devices > 8) return { ok: false, action: 'deny', reason: 'account_sharing', riskScore: 100, source: 'fallback' };
    if (devices > 5 && turnstileConfigured() && !challengePassed) {
      return { ok: false, action: 'challenge', reason: 'account_sharing', riskScore: 60, source: 'fallback' };
    }
    return { ok: true, action: 'allow', reason: 'legacy_fallback', riskScore: 0, devices30d: devices, source: 'fallback' };
  } catch (error) {
    console.error('abuse account fallback error:', error.message);
    return { ok: false, action: 'deny', reason: 'abuse_guard_unavailable', riskScore: 100, source: 'fallback' };
  }
}

export async function claimFreeEntitlement({ user, req, res, resource = 'analysis', challengeToken = '' }) {
  if (!isVerifiedUser(user)) {
    return { ok: false, action: 'deny', reason: 'email_unverified', riskScore: 100 };
  }
  if (isDisposableEmail(user.email)) {
    return { ok: false, action: 'deny', reason: 'disposable_email', riskScore: 100 };
  }

  const context = abuseContext(req, res, user);
  const turnstile = await verifyTurnstile(challengeToken, clientIp(req));
  if (challengeToken && turnstile.configured && !turnstile.ok) {
    return { ok: false, action: 'challenge', reason: 'challenge_invalid', riskScore: 60 };
  }

  const rpc = await callRpc('claim_free_entitlement', {
    p_user_id: user.id,
    p_resource: resource,
    p_email_hash: context.emailHash,
    p_device_hash: context.deviceHash,
    p_ip_hash: context.ipHash,
    p_challenge_available: turnstileConfigured(),
    p_challenge_passed: turnstile.ok,
  });
  if (rpc.available && rpc.error) {
    return { ok: false, action: 'deny', reason: 'abuse_guard_unavailable', riskScore: 100 };
  }
  if (rpc.available) {
    const decision = normalizeRpcDecision(rpc.data);
    if (decision) return { ...decision, userId: user.id };
  }
  try {
    return await fallbackFreeClaim({ user, context, resource, challengePassed: turnstile.ok });
  } catch (error) {
    console.error('abuse free fallback error:', error.message);
    return { ok: false, action: 'deny', reason: 'abuse_guard_unavailable', riskScore: 100 };
  }
}

export async function releaseFreeEntitlement(claim) {
  if (!claim) return;
  if (claim.source === 'rpc' && claim.claimId) {
    await callRpc('release_free_entitlement', { p_claim_id: claim.claimId, p_user_id: claim.userId || null });
    return;
  }
  if (claim.source === 'fallback') await deleteKeys(claim.fallbackKeys || []);
}

export async function guardAccountUsage({ user, req, res, resource, challengeToken = '' }) {
  if (!user?.id) return { ok: false, action: 'deny', reason: 'invalid_user', riskScore: 100 };
  const context = abuseContext(req, res, user);
  const turnstile = await verifyTurnstile(challengeToken, clientIp(req));
  if (challengeToken && turnstile.configured && !turnstile.ok) {
    return { ok: false, action: 'challenge', reason: 'challenge_invalid', riskScore: 60 };
  }
  const rpc = await callRpc('register_abuse_usage', {
    p_user_id: user.id,
    p_resource: resource,
    p_device_hash: context.deviceHash,
    p_ip_hash: context.ipHash,
    p_challenge_available: turnstileConfigured(),
    p_challenge_passed: turnstile.ok,
  });
  if (!rpc.available) return fallbackAccountUsage({ user, context, challengePassed: turnstile.ok });
  if (rpc.error) return { ok: false, action: 'deny', reason: 'abuse_guard_unavailable', riskScore: 100 };
  return normalizeRpcDecision(rpc.data) || { ok: false, action: 'deny', reason: 'invalid_guard_response', riskScore: 100 };
}

export async function cleanupAbuseData(days = 90) {
  const safeDays = Math.max(30, Math.min(365, Number(days) || 90));
  return callRpc('cleanup_abuse_data', { p_days: safeDays });
}

export function abuseHttpResponse(res, decision) {
  const reasonMessages = {
    email_unverified: 'Confirme seu e-mail antes de usar a otimização gratuita.',
    disposable_email: 'Use um e-mail permanente ou entre com Google para continuar.',
    email_limit: 'Este benefício gratuito já foi utilizado por esta identidade.',
    account_limit: 'A gratuidade desta conta já foi utilizada neste período.',
    device_limit: 'As gratuidades disponíveis neste dispositivo já foram utilizadas.',
    risk_limit: 'Muitas tentativas foram identificadas. Aguarde 24 horas e tente novamente.',
    account_sharing: 'Precisamos confirmar este acesso antes de continuar.',
    abuse_guard_unavailable: 'Não foi possível validar o uso com segurança. Tente novamente em instantes.',
  };
  const message = reasonMessages[decision?.reason]
    || (decision?.action === 'challenge' ? 'Confirme que você é uma pessoa para continuar.' : 'Não foi possível liberar este uso gratuito.');
  if (decision?.action === 'challenge') {
    return res.status(403).json({
      error: 'abuse_challenge_required',
      reason: decision.reason || 'risk_challenge',
      message,
      site_key: process.env.TURNSTILE_SITE_KEY || '',
    });
  }
  const status = decision?.reason === 'abuse_guard_unavailable' ? 503 : 429;
  return res.status(status).json({ error: 'abuse_limit', reason: decision?.reason || 'risk_limit', message });
}

export function anonymousKeys(req, res, scope) {
  const context = abuseContext(req, res, null);
  return {
    device: `device:${context.deviceHash}:${scope}`,
    ip: `ip:${context.ipHash}:${scope}`,
    context,
  };
}

export const ABUSE_LIMITS = Object.freeze({
  freeWindowMs: FREE_WINDOW_MS,
  ipVelocityWindowMs: IP_VELOCITY_WINDOW_MS,
  maxFreeAccountsPerDevice: 2,
  maxFreeClaimsPerIpDay: 5,
  maxPaidDevicesPerMonth: 5,
  blockPaidDevicesPerMonth: 8,
});
