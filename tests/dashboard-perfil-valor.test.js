import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');

test('Perfil de valor integra currículo e ferramentas sem alterar as outras seções', () => {
  assert.match(dashboard, /class="profile-value-stage"[\s\S]{0,1800}id="matStrip"[\s\S]{0,1800}id="ferStrip"/);
  assert.match(dashboard, />Sua busca</);
  assert.match(dashboard, />Suas vagas</);
  assert.match(dashboard, /dashboard-faca-agora-editorial\.webp/);
  assert.doesNotMatch(dashboard, /dashboard-curriculo-premium-5-preview/);
});

test('Início usa módulos com respiro sem romper os contratos dinâmicos', () => {
  assert.match(dashboard, /class="product-workspace"[\s\S]*?id="matStrip"[\s\S]*?id="ferStrip"[\s\S]*?id="funilPipe"[\s\S]*?id="oppList"[\s\S]*?\/product-workspace/);
  assert.match(dashboard, /\.product-workspace \.profile-value-stage,[\s\S]*?border:0;[\s\S]*?box-shadow:none/);
  assert.match(dashboard, /\.product-workspace \{[^}]*display:flex;[^}]*gap:22px;/);
  assert.match(dashboard, /\.product-workspace-section \{[^}]*border:1px solid var\(--border\);[^}]*border-radius:18px;/);
  assert.match(dashboard, /class="opp-list-kicker">Suas vagas/);
  assert.match(dashboard, /<small>Sua busca<\/small>/);
});

test('tipografia principal permanece legível sem depender de microtexto', () => {
  assert.match(dashboard, /\.pv-title \{[^}]*font-size:26px;/);
  assert.match(dashboard, /\.pv-desc \{[^}]*font-size:12px;/);
  assert.match(dashboard, /\.profile-value-tools \.fer-nome \{ font-size:12px; \}/);
  assert.match(dashboard, /\.bus-heading h3 \{[^}]*font-size:25px;/);
  assert.match(dashboard, /\.product-workspace \.opp-list-title-t \{[^}]*font-size:25px;/);
});

test('indicador comunica completude do currículo e não score de vaga', () => {
  assert.match(dashboard, /Completude do currículo/);
  assert.match(dashboard, /aria-label="Completude do currículo: /);
  assert.match(dashboard, /--pv-progress:/);
  assert.doesNotMatch(dashboard, /pv-ring[^\n]*Score ATS/);
});

test('aderência da vaga usa barra dinâmica e não compete com a completude', () => {
  assert.match(dashboard, /--pba-progress:/);
  assert.match(dashboard, /scoreRow\.style\.setProperty\('--pba-progress'/);
  assert.match(dashboard, /\.pba-ring-wrap svg \{ display:none; \}/);
  assert.match(dashboard, /aria-labelledby="pbaRingTitulo"/);
});

test('forças e lacunas usam dados reais e mantêm prioridade por frequência', () => {
  assert.match(dashboard, /function pvForcasDoCurriculo\(cvData, analyses\)/);
  assert.match(dashboard, /keywords_encontradas/);
  assert.match(dashboard, /cvData\.habilidades/);
  assert.match(dashboard, /window\.VagaAICv\.calcularLacunas\(cvData, analyses\)/);
  assert.match(dashboard, /gaps\.slice\(0, 3\)\.map/);
  assert.match(dashboard, /Number\(freq\[nome\]\) \|\| 1/);
  assert.match(dashboard, /pv-rank-num/);
});

test('as quatro ferramentas continuam dinâmicas e acionáveis', () => {
  for (const name of ['Analisar vaga', 'Carta de apresentação', 'Treino de entrevista', 'Vagas para você']) {
    assert.match(dashboard, new RegExp(name));
  }
  assert.match(dashboard, /function buildFerramentas\(\)/);
  assert.match(dashboard, /fer-arrow/);
  assert.match(dashboard, /switchDashTab\('app'\)/);
});
