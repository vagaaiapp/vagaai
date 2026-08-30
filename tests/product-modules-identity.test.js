import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const css = read('assets/product-modules.css');
const pages = ['dashboard/index.html', 'app/index.html', 'curriculo/index.html', 'entrevista/index.html', 'carta/index.html'];

test('sete modulos compartilham a camada final depois da fundacao global', () => {
  for (const file of pages) {
    const html = read(file);
    const foundation = html.indexOf('/assets/product-ui.css?v=20260829-shell3');
    const modules = html.indexOf('/assets/product-modules.css?v=20260829-modules1');
    assert.ok(foundation >= 0 && modules > foundation, `${file} deve carregar a camada por ultimo`);
  }
  const dashboard = read('dashboard/index.html');
  for (const id of ['tab-vagas', 'tab-entrevistas', 'tab-alertas', 'tab-plano']) {
    assert.match(dashboard, new RegExp(`id=["']${id}["'] class=["']tab product-module-v3["']`));
  }
});

test('camada cobre analise, curriculo, candidaturas, entrevista, carta, alertas e plano', () => {
  for (const selector of [
    'data-vagaai-ui="analysis"', 'data-vagaai-ui="curriculum"',
    '#tab-vagas.product-module-v3', '#tab-entrevistas.product-module-v3',
    'data-vagaai-ui="cover-letter"', '#tab-alertas.product-module-v3',
    '#tab-plano.product-module-v3', 'data-vagaai-ui="interview"'
  ]) {
    assert.ok(css.includes(selector), `faltou ${selector}`);
  }
});

test('acoes e estados funcionais continuam nos arquivos originais', () => {
  const dashboard = read('dashboard/index.html');
  const analysis = read('app/index.html');
  const interview = read('entrevista/index.html');
  const cover = read('carta/index.html');
  for (const contract of [
    'setCandView', 'toggleCandAdvanced', 'openTrackerEdit', 'setInterviewFilter',
    'requestJobsNow', 'openAlertEditModal', 'planxPrimaryBtn', 'planxBillingBody'
  ]) assert.ok(dashboard.includes(contract), `dashboard perdeu ${contract}`);
  for (const contract of ['switchJobMode', 'useSavedCv', 'analyze()']) assert.ok(analysis.includes(contract));
  for (const contract of ['generateInterview', 'startAudioAnswer', 'restartInterview']) assert.ok(interview.includes(contract));
  for (const contract of ['loadSavedCv', 'setTom', 'generate()', 'copyCarta', 'downloadCarta']) assert.ok(cover.includes(contract));
});

test('identidade usa superfices, tema, mobile e movimento reduzido sem injetar copy', () => {
  assert.match(css, /--module-paper: #fffef3/);
  assert.match(css, /\[data-theme="dark"\][\s\S]*?--module-paper: #0d1610/);
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(css, /content:\s*["'][^"']+["']/);
});
