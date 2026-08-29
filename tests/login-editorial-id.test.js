import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const html = fs.readFileSync(path.join(root, 'login', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'login', 'editorial-id.css'), 'utf8');

test('login usa a identidade editorial depois da fundação visual', () => {
  assert.match(html, /EB\+Garamond/);
  assert.match(html, /Figtree/);
  assert.match(html, /\/login\/editorial-id\.css\?v=20260828-id1/);
  assert.ok(html.indexOf('/login/editorial-id.css') > html.indexOf('/assets/product-ui.css'));
  assert.match(html, /class="auth-brand-cluster"/);
});

test('login preserva os contratos de autenticação e métricas', () => {
  assert.match(html, /async function loginWithGoogle\(/);
  assert.match(html, /async function handleAuth\(/);
  assert.match(html, /function switchTab\(/);
  assert.match(html, /function showView\(/);
  assert.match(html, /function toggleTheme\(/);
  assert.match(html, /gtag\('config','G-XCT8K58VWF'\)/);
  assert.match(html, /id="viewForgot"/);
  assert.match(html, /id="viewMagic"/);
  assert.match(html, /id="viewReset"/);
});

test('camada visual é escopada e cobre responsividade e tema escuro', () => {
  assert.match(css, /body\[data-vagaai-ui="auth"\]/);
  assert.match(css, /--auth-page:\s*#ffffeb/);
  assert.match(css, /--auth-forest:\s*#034f46/);
  assert.match(css, /--auth-mint:\s*#77edb9/);
  assert.match(css, /html:not\(\[data-theme="light"\]\)/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /@media \(max-width:\s*390px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.doesNotMatch(css, /content:\s*["'][^"']*[A-Za-zÀ-ÿ][^"']*["']/);
});
