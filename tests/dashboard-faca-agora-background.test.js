import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const backgroundPath = path.join(root, 'assets', 'dashboard-faca-agora-editorial.webp');

test('Faça agora usa o fundo editorial aprovado e otimizado', () => {
  assert.match(dashboard, /background-image:url\('\/assets\/dashboard-faca-agora-editorial\.webp'\)/);
  assert.equal(fs.existsSync(backgroundPath), true);
  assert.ok(fs.statSync(backgroundPath).size < 150_000, 'imagem deve permanecer leve para o navegador');
  assert.doesNotMatch(dashboard, /dashboard-faca-agora-backgrounds/);
});

test('conteúdo dinâmico e ações do Faça agora permanecem no painel', () => {
  for (const id of ['pbaTitle', 'pbaDesc', 'pbaBtnPrimary', 'pbaBtnSecondary', 'pbaCargo', 'pbaEmpresa']) {
    assert.match(dashboard, new RegExp(`id=["']${id}["']`));
  }
  assert.match(dashboard, /class=["']pba-priority["']/);
});
