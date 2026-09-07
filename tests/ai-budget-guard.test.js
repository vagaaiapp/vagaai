import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('migration 038 cria reserva atomica e fecha acesso publico', () => {
  const sql = read('migrations/038_ai_budget_guard.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.ai_budget_reservations/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.reserve_ai_budget/i);
  assert.match(sql, /CREATE OR REPLACE FUNCTION public\.settle_ai_budget/i);
  assert.match(sql, /REVOKE ALL ON TABLE public\.ai_budget_reservations FROM PUBLIC, anon, authenticated/i);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.reserve_ai_budget[\s\S]+TO service_role/i);
});

test('todas as chamadas Anthropic passam pelo portao central', () => {
  for (const file of ['api/analyze.js', 'api/cover-letter.js', 'api/interview.js', 'api/send-alerts.js']) {
    const source = read(file);
    assert.match(source, /guardedAnthropicFetch/, `${file} nao importa o portao`);
    assert.doesNotMatch(source, /fetch\(['"]https:\/\/api\.anthropic\.com\/v1\/messages/, `${file} contorna o portao`);
  }
});

test('portao injeta regra de dados nao confiaveis e reserva antes da rede', () => {
  const guard = read('lib/ai-guard.js');
  assert.match(guard, /AI_INPUT_SAFETY_SYSTEM/);
  assert.match(guard, /DADOS NAO CONFIAVEIS/);
  assert.match(guard, /reserveAiBudget\(payload, context\)/);
  assert.ok(
    guard.indexOf('reserveAiBudget(payload, context)') < guard.indexOf("fetch('https://api.anthropic.com/v1/messages'"),
    'a reserva precisa acontecer antes da chamada paga'
  );
  assert.match(guard, /releaseAiBudget\(reservation\.reservationId/);
  assert.match(guard, /settleAiBudget\(reservation\.reservationId/);
});

test('CSP nasce em report-only e robots protege areas internas', () => {
  const vercel = read('vercel.json');
  assert.match(vercel, /Content-Security-Policy-Report-Only/);
  assert.doesNotMatch(vercel, /"key"\s*:\s*"Content-Security-Policy"/);
  assert.match(vercel, /worker-src 'self' blob: https:\/\/cdn\.jsdelivr\.net/);
  const robots = read('robots.txt');
  assert.match(robots, /User-agent: GPTBot/);
  assert.match(robots, /User-agent: ClaudeBot/);
  assert.match(robots, /Disallow: \/dashboard/);
  assert.match(robots, /Allow: \/blog\//);
});
