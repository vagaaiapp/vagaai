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

test('círculo comunica completude do currículo e não score de vaga', () => {
  assert.match(dashboard, /Completude do currículo/);
  assert.match(dashboard, /aria-label="Completude do currículo: /);
  assert.match(dashboard, /--pv-progress:/);
  assert.doesNotMatch(dashboard, /pv-ring[^\n]*Score ATS/);
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
