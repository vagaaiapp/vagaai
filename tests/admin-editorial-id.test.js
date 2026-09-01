import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'admin', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'admin-editorial.css'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api', 'admin.js'), 'utf8');

test('admin carrega a identidade editorial depois da fundação global', () => {
  const foundation = html.indexOf('/assets/product-ui.css?v=20260829-shell3');
  const adminLayer = html.indexOf('/assets/admin-editorial.css?v=20260829-admin3');
  assert.ok(foundation > -1);
  assert.ok(adminLayer > foundation);
  assert.match(html, /<body data-vagaai-ui="admin">/);
});

test('camada administrativa preserva os contratos de acesso, dados e ações', () => {
  for (const contract of [
    'id="pageLoading"',
    'id="mainContent"',
    'id="refreshBtn"',
    "onclick=\"switchTab('overview')\"",
    "onclick=\"switchTab('users')\"",
    "onclick=\"switchTab('finance')\"",
    "onclick=\"switchTab('traffic')\"",
    "onclick=\"switchTab('alerts')\"",
    "onclick=\"switchTab('email')\"",
    'async function loadData(',
    'async function logout()',
    'function toggleTheme()'
  ]) assert.ok(html.includes(contract), `contrato ausente: ${contract}`);
});

test('admin usa hierarquia editorial sem sacrificar densidade operacional', () => {
  assert.match(css, /body\[data-vagaai-ui="admin"\] \.page-title/);
  assert.match(css, /body\[data-vagaai-ui="admin"\] \.metrics-grid/);
  assert.match(css, /body\[data-vagaai-ui="admin"\] \.table-wrap/);
  assert.match(css, /body\[data-vagaai-ui="admin"\] \.admin-tabs/);
  assert.match(css, /html\[data-theme="dark"\] body\[data-vagaai-ui="admin"\]/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /content:\s*["'][^"']+["']/);
});

test('dados operacionais sensiveis atravessam somente a API administrativa', () => {
  assert.match(api, /email_leads\?select=email,source,created_at/);
  assert.match(api, /return \{ users, totalUsers, credits, analyses, emailLeads \}/);
  assert.doesNotMatch(html, /rest\/v1\/email_leads/);
  assert.match(html, /loadLeads\(sb_\.emailLeads\)/);
});

test('status das fontes reflete as variaveis do servidor sem expor segredos', () => {
  for (const envName of ['JSEARCH_API_KEY', 'JOOBLE_API_KEY', 'ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'SERPAPI_KEY']) {
    assert.ok(api.includes(`process.env.${envName}`), `status ausente para ${envName}`);
  }
  assert.match(api, /integrations: integrationStatus\(\)/);
  assert.match(html, /renderSources\(data\.integrations \|\| \{\}\)/);
  assert.doesNotMatch(api, /JSEARCH_API_KEY:\s*process\.env/);
});
