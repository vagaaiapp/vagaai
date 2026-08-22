import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const avatarSource = read('js/profile-avatar.js');
const dashboard = read('dashboard/index.html');
const sidebar = read('sidebar.js');
const subscription = read('api/subscription.js');

function profileModule() {
  const sandbox = { window: { location: { origin: 'https://www.vagaai.app.br', hostname: 'www.vagaai.app.br' } }, URL };
  vm.runInNewContext(avatarSource, sandbox);
  return sandbox.window.VagaAIProfile;
}

test('iniciais são únicas por pessoa e não usam as duas primeiras letras do nome', () => {
  const profile = profileModule();
  assert.equal(profile.initials('João Victor Heringer', 'joao@vagaai.app.br'), 'JV');
  assert.equal(profile.initials('Ana Carolina', 'ana@vagaai.app.br'), 'AC');
  assert.equal(profile.initials('Pedro', 'pedro@vagaai.app.br'), 'PE');
  assert.equal(profile.initials('', 'maria.silva@vagaai.app.br'), 'MA');
  assert.equal(profile.safeUrl('javascript:alert(1)'), '');
});

test('avatar é uma identidade única no painel, menu da conta, barra lateral e mobile', () => {
  for (const id of ['avatarBtn', 'dmAvatar', 'uaAvatarCircle', 'pgAvatar', 'perfilAvatarPreview']) {
    assert.match(dashboard, new RegExp(`id="${id}"[^>]*data-profile-avatar|data-profile-avatar[^>]*id="${id}"`));
  }
  assert.match(dashboard, /function applyProfileIdentity\(/);
  assert.match(dashboard, /VagaAIProfile\.renderAll\(window\._perfilData\)/);
  assert.match(sidebar, /data-profile-avatar/);
  assert.match(sidebar, /VagaAIProfile\.initials\(name, email\)/);
  assert.match(sidebar, /VagaAIProfile\.renderAll\(\{ name: name, email: email, avatarUrl: avatarUrl \}\)/);
});

test('foto pode ser enviada e removida sem expor bucket público ou criar nova função Vercel', () => {
  assert.match(dashboard, /id="perfilAvatarInput"/);
  assert.match(dashboard, /function handleProfileAvatarFile\(/);
  assert.match(dashboard, /function removeProfileAvatar\(/);
  assert.match(dashboard, /api\/subscription\?action=avatar/);
  assert.match(subscription, /const AVATAR_BUCKET = 'profile-avatars'/);
  assert.match(subscription, /public: false/);
  assert.match(subscription, /action === 'avatar'/);
  assert.match(subscription, /signAvatarUrl\(/);
  assert.match(subscription, /avatar_url: avatarUrl/);
});

test('superfícies autenticadas carregam o componente e recebem a URL assinada', () => {
  for (const file of ['dashboard/index.html', 'app/index.html', 'carta/index.html', 'entrevista/index.html']) {
    assert.match(read(file), /<script src="\/js\/profile-avatar\.js"><\/script>/, `${file} não carrega o avatar compartilhado`);
  }
  assert.match(read('app/index.html'), /userPlanSub && userPlanSub\.avatar_url/);
  assert.match(read('carta/index.html'), /sub\.avatar_url \|\| ''/);
  assert.match(read('entrevista/index.html'), /avatarUrl: sub\.avatar_url \|\| ''/);
});
