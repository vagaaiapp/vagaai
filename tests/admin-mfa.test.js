import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('admin API exige AAL2 para fator verificado ou flag obrigatoria', () => {
  const api = read('api/admin.js');
  assert.match(api, /ADMIN_MFA_REQUIRED/);
  assert.match(api, /\/auth\/v1\/factors/);
  assert.match(api, /factor\?\.status === 'verified'/);
  assert.match(api, /mfa\.required && mfa\.currentLevel !== 'aal2'/);
  assert.match(api, /error: 'mfa_required'/);
});

test('login oferece cadastro, desafio e verificacao TOTP', () => {
  const page = read('admin-login/index.html');
  assert.match(page, /auth\.mfa\.enroll\(\{ factorType: 'totp'/);
  assert.match(page, /auth\.mfa\.listFactors\(\)/);
  assert.match(page, /auth\.mfa\.challengeAndVerify/);
  assert.match(page, /currentLevel === 'aal2'/);
  assert.match(page, /autocomplete="one-time-code"/);
  assert.match(page, /forceMfaSetup = query\.get\('mfa'\) === '1'/);
  assert.match(page, /prepareMfa\(forceMfaSetup\)/);
  assert.match(page, /\^\\\/admin\(\?:\\\/\|\$\|\\\?\)\//);

  const safeAdminPath = value => /^\/admin(?:\/|$|\?)/.test(value) ? value : '/admin';
  assert.equal(safeAdminPath('/admin/blog'), '/admin/blog');
  assert.equal(safeAdminPath('/admin?tab=security'), '/admin?tab=security');
  assert.equal(safeAdminPath('/administrator'), '/admin');
  assert.equal(safeAdminPath('//example.com'), '/admin');
  assert.equal(safeAdminPath('https://example.com'), '/admin');
});

test('admin redireciona sessão AAL1 para o desafio sem encerrar login', () => {
  const page = read('admin/index.html');
  assert.match(page, /err\.error === 'mfa_required'/);
  assert.match(page, /\/admin-login\?mfa=1/);
  assert.match(page, /href="\/admin-login\?mfa=1&amp;next=%2Fadmin"/);
  assert.match(page, /aria-label="Configurar autenticação em duas etapas"/);
});
