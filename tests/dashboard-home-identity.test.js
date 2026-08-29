import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'dashboard-home.css'), 'utf8');

test('Inicio carrega a identidade propria depois da estrutura global', () => {
  const globalIndex = html.indexOf('/assets/product-ui.css?v=20260829-shell3');
  const homeIndex = html.indexOf('/assets/dashboard-home.css?v=20260829-home1');
  assert.ok(globalIndex >= 0 && homeIndex > globalIndex);
  assert.match(html, /id="tab-painel" class="tab active dashboard-home-v3"/);
  assert.match(css, /#tab-painel\.dashboard-home-v3/);
});

test('redesign preserva contratos dinamicos e acoes do Inicio', () => {
  for (const id of [
    'pgGreeting', 'pgPills', 'pbaTitle', 'pbaDesc', 'pbaBtnPrimary',
    'pbaBtnSecondary', 'pbaCargo', 'pbaEmpresa', 'pbaScoreNum',
    'matStrip', 'ferStrip', 'funilPipe', 'funilInsight', 'oppList'
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
  assert.match(html, /onclick="switchDashTab\('app'\)"/);
  assert.match(html, /onclick="openCandidaturasFiltered\('todas'\)"/);
  assert.match(html, /onclick="setFunilPeriod\(30\)"/);
  assert.match(html, /onclick="setOppFilter\('entrevista'\)"/);
});

test('hierarquia visual tem um hero dominante e modulos de apoio mais quietos', () => {
  assert.match(css, /\.pba-card[\s\S]*?min-height: 356px;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.pba-priority[\s\S]*?border-left: 1px solid[\s\S]*?background: transparent;[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.profile-value-stage,[\s\S]*?\.bus-card,[\s\S]*?\.opp-list-card[\s\S]*?box-shadow: none;/);
  assert.match(css, /\.pv-strength[\s\S]*?border-left: 2px solid var\(--gb-mid\);/);
});

test('tema escuro, mobile e movimento reduzido continuam contemplados', () => {
  assert.match(css, /\[data-theme="dark"\][\s\S]*?--home-paper: #0d1610;/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /display:\s*none[^;]*;[^}]*#(?:pba|mat|fer|funil|opp)/);
});
