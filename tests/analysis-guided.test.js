import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = fs.readFileSync(path.join(root, 'app', 'index.html'), 'utf8');
const cssPath = path.join(root, 'assets', 'analysis-guided.css');
const css = fs.readFileSync(cssPath, 'utf8');

test('análise guiada usa o layout aprovado sem alterar os contratos do fluxo', () => {
  assert.match(app, /analysis-guided\.css\?v=20260821-guided1/);
  assert.match(app, /id="jobUrl"/);
  assert.match(app, /id="jobInput"/);
  assert.match(app, /id="cvInput"/);
  assert.match(app, /id="analyzeBtn"/);
  assert.match(app, /onclick="analyze\(\)"/);
  assert.match(css, /grid-template-columns:minmax\(0,1fr\) 335px/);
});

test('vaga alterna entre link e texto sem remover o fallback manual', () => {
  assert.match(app, /id="jobModeLink"[\s\S]*id="jobModeText"/);
  assert.match(app, /function switchJobMode\(mode, focusField\)/);
  assert.match(app, /switchJobMode\('texto', true\)/);
  assert.match(app, /Não foi possível carregar a vaga automaticamente/);
});

test('currículo principal vira caminho padrão e mantém alternativas acessíveis', () => {
  assert.match(app, /id="savedCvChoice"/);
  assert.match(app, /id="cvOptionsToggle"[\s\S]*Trocar currículo/);
  assert.match(app, /useSavedCv\(true\)/);
  assert.match(app, /Enviar ou colar/);
  assert.match(app, /Criar do zero/);
});

test('apoio lateral não apresenta score fictício antes da análise', () => {
  assert.match(app, /O número de aderência só aparece depois da análise/);
  assert.doesNotMatch(app, /analysis-ring-label">74/);
  assert.match(app, /Aderência à vaga/);
  assert.match(app, /Currículo direcionado/);
});

test('stylesheet aprovado existe e inclui os quatro breakpoints de validação', () => {
  assert.equal(fs.existsSync(cssPath), true);
  assert.match(css, /@media\(max-width:1100px\)/);
  assert.match(css, /@media\(max-width:860px\)/);
  assert.match(css, /@media\(max-width:560px\)/);
});
