import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { anthropicUsageRecord } from '../lib/ai-usage.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('calcula custo do Haiku e preserva tokens de cache', () => {
  const row = anthropicUsageRecord({
    model: 'claude-haiku-4-5-20251001',
    usage: {
      input_tokens: 1_000_000,
      output_tokens: 1_000_000,
      cache_creation_input_tokens: 1_000_000,
      cache_read_input_tokens: 1_000_000,
    },
  }, { endpoint: 'analyze', action: 'analysis', userId: 'u1' });
  assert.equal(row.estimated_cost_usd, 7.35);
  assert.equal(row.cache_read_input_tokens, 1_000_000);
  assert.equal(row.user_id, 'u1');
});

test('cache de resultado inclui versao do prompt e uso e contabilizado', () => {
  const analyze = read('api/analyze.js');
  assert.match(analyze, /ANALYSIS_PROMPT_VERSION/);
  assert.match(analyze, /update\(ANALYSIS_PROMPT_VERSION/);
  assert.match(analyze, /recordAnthropicUsage\(data/);
  assert.doesNotMatch(analyze, /cache_control:\s*\{ type: 'ephemeral' \}/);
});

test('todos os endpoints Anthropic registram uso', () => {
  ['api/analyze.js', 'api/cover-letter.js', 'api/interview.js', 'api/send-alerts.js'].forEach(path => {
    assert.match(read(path), /recordAnthropicUsage/, `${path} sem telemetria`);
  });
});

test('telemetria e privada, resumida no admin e falha aberta', () => {
  const migration = read('migrations/036_ai_usage_observability.sql');
  const helper = read('lib/ai-usage.js');
  const admin = read('api/admin.js');
  assert.match(migration, /revoke all on table public\.ai_usage_events from anon, authenticated/i);
  assert.match(migration, /ai_usage_summary/);
  assert.match(helper, /Telemetria nunca interrompe/);
  assert.match(admin, /req\.query\.action === 'ai_usage'/);
});
