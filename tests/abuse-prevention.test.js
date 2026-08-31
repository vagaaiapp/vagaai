import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ABUSE_LIMITS,
  anonymousKeys,
  getOrCreateDeviceId,
  hashAbuseSignal,
  isDisposableEmail,
  isVerifiedUser,
  normalizeEmail,
} from '../lib/abuse.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

function responseStub() {
  const headers = new Map();
  return {
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    getHeader(name) { return headers.get(name.toLowerCase()); },
    cookie() { return headers.get('set-cookie'); },
  };
}

test('aliases do Gmail não criam identidades gratuitas diferentes', () => {
  assert.equal(normalizeEmail(' Nome.Sobrenome+vaga@gmail.com '), 'nomesobrenome@gmail.com');
  assert.equal(normalizeEmail('nome.sobrenome@googlemail.com'), 'nomesobrenome@gmail.com');
  assert.equal(normalizeEmail('nome.sobrenome@outlook.com'), 'nome.sobrenome@outlook.com');
});

test('e-mail descartável e conta não confirmada não passam como identidade legítima', () => {
  assert.equal(isDisposableEmail('pessoa@yopmail.com'), true);
  assert.equal(isDisposableEmail('pessoa@gmail.com'), false);
  assert.equal(isVerifiedUser({ id: 'u1', email: 'a@b.com' }), false);
  assert.equal(isVerifiedUser({ id: 'u1', email: 'a@b.com', email_confirmed_at: '2026-01-01' }), true);
  assert.equal(isVerifiedUser({ id: 'u1', email: 'a@b.com', app_metadata: { provider: 'google' } }), true);
});

test('cookie de dispositivo é HttpOnly, assinado, estável e resiste a adulteração', () => {
  process.env.ABUSE_SIGNING_SECRET = 'segredo-de-teste-longo';
  const firstRes = responseStub();
  const firstId = getOrCreateDeviceId({ headers: {} }, firstRes);
  const setCookie = firstRes.cookie();
  assert.match(setCookie, /vagaai_device=/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);

  const value = decodeURIComponent(setCookie.match(/vagaai_device=([^;]+)/)[1]);
  const stableId = getOrCreateDeviceId({ headers: { cookie: `vagaai_device=${encodeURIComponent(value)}` } }, responseStub());
  assert.equal(stableId, firstId);

  const tampered = value.replace(/.$/, value.endsWith('0') ? '1' : '0');
  const tamperedId = getOrCreateDeviceId({ headers: { cookie: `vagaai_device=${encodeURIComponent(tampered)}` } }, responseStub());
  assert.notEqual(tamperedId, firstId);
});

test('chaves persistidas não contêm e-mail ou IP em texto legível', () => {
  process.env.ABUSE_SIGNING_SECRET = 'segredo-de-teste-longo';
  const emailHash = hashAbuseSignal('email', 'pessoa@gmail.com');
  assert.match(emailHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(emailHash, /pessoa|gmail/);
  const keys = anonymousKeys({ headers: { 'x-real-ip': '203.0.113.42' } }, responseStub(), 'teste');
  assert.doesNotMatch(keys.ip, /203\.0\.113\.42/);
  assert.match(keys.ip, /^ip:[a-f0-9]{64}:teste$/);
});

test('limites centrais refletem a política operacional aprovada', () => {
  assert.equal(ABUSE_LIMITS.maxFreeAccountsPerDevice, 2);
  assert.equal(ABUSE_LIMITS.maxFreeClaimsPerIpDay, 5);
  assert.equal(ABUSE_LIMITS.maxPaidDevicesPerMonth, 5);
  assert.equal(ABUSE_LIMITS.blockPaidDevicesPerMonth, 8);
});

test('migração aplica claim atômico, RLS, retenção e acesso exclusivo do servidor', () => {
  const sql = read('migrations/035_abuse_prevention.sql');
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /'abuse-device:' \|\| p_resource \|\| ':' \|\| p_device_hash/);
  assert.match(sql, /'abuse-email:' \|\| p_resource \|\| ':' \|\| p_email_hash/);
  assert.match(sql, /'abuse-ip:' \|\| p_ip_hash/);
  assert.match(sql, /'abuse-user:' \|\| p_user_id::text/);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.abuse_claims/);
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(sql, /REVOKE ALL ON public\.abuse_claims FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.claim_free_entitlement[\s\S]*TO service_role/);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.cleanup_abuse_data/);
  assert.match(sql, /v_device_count >= 2/);
  assert.match(sql, /v_devices > 8/);
});

test('todos os recursos caros passam pela proteção compartilhada', () => {
  const abuse = read('lib/abuse.js');
  const analyze = read('api/analyze.js');
  const carta = read('api/cover-letter.js');
  const entrevista = read('api/interview.js');
  assert.match(analyze, /claimFreeEntitlement\([\s\S]*resource: 'analysis'/);
  assert.match(analyze, /guardAccountUsage\([\s\S]*resource: 'profile_cv'/);
  assert.match(carta, /guardAccountUsage\([\s\S]*resource: 'cover_letter'/);
  assert.match(entrevista, /resource: 'interview'/);
  assert.match(entrevista, /resource: 'cv_voice'/);
  assert.match(entrevista, /anonymousKeys\(req, res, 'cvvoice'\)\.ip/);
  assert.match(abuse, /fallbackAccountUsage/);
  assert.match(abuse, /abuse:account:\$\{userHash\}:device:/);
  assert.doesNotMatch(abuse, /abuse:account:\$\{user\.id\}/);
});

test('desafio progressivo está conectado às telas que podem recebê-lo', () => {
  for (const page of [
    'app/index.html', 'onboarding/vaga/index.html', 'onboarding/curriculo/index.html',
    'curriculo/index.html', 'cv/index.html', 'carta/index.html', 'entrevista/index.html',
  ]) {
    assert.match(read(page), /\/js\/abuse-challenge\.js/, `${page} não carrega desafio`);
  }
  assert.match(read('js/cv-voice.js'), /VagaAIAbuse\.fetch/);
  assert.match(read('onboarding/shared.js'), /VagaAIAbuse\.fetch/);
});

test('admin possui observabilidade e liberação manual auditada', () => {
  const api = read('api/admin.js');
  const page = read('admin/index.html');
  assert.match(api, /req\.query\.action === 'abuse'/);
  assert.match(api, /action === 'release_abuse_claim'/);
  assert.match(api, /action === 'reset_abuse_devices'/);
  assert.match(api, /auditar\(user\.email, 'liberar_gratuidade'/);
  assert.match(page, /data-tab="abuse"/);
  assert.match(page, /function loadAbuseData\(/);
  assert.match(page, /function releaseAbuseClaim\(/);
  assert.match(page, /function resetAbuseDevices\(/);
});

test('termos explicam finalidade, minimização e prazo dos sinais de abuso', () => {
  const terms = read('termos/index.html');
  assert.match(terms, /prevenir abuso, fraude e compartilhamento indevido de conta/);
  assert.match(terms, /sem guardar o IP, o cookie ou o e-mail em formato legível/);
  assert.match(terms, /eliminados em até 90 dias/);
});
