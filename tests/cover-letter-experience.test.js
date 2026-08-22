import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const page = fs.readFileSync(path.join(root, 'carta/index.html'), 'utf8');

test('carta usa a jornada editorial aprovada sem falso carregamento inicial', () => {
  assert.match(page, /Uma carta com contexto — e com a sua voz\./);
  assert.match(page, /id="stepItem1"[\s\S]*?<strong>Contexto<\/strong>/);
  assert.match(page, /id="stepItem2"[\s\S]*?<strong>Direção<\/strong>/);
  assert.match(page, /id="stepItem3"[\s\S]*?<strong>Carta<\/strong>/);
  assert.doesNotMatch(page, /id="stepItem2"[^>]*>[\s\S]{0,120}Gerando carta/);
});

test('entrada preserva vaga, currículo, tom, motivação e geração real', () => {
  for (const id of ['jobUrl', 'fetchBtn', 'jobInput', 'cvSavedLink', 'cvFileInput', 'cvInput', 'porqueInput', 'btnGenerate', 'errorBox']) {
    assert.match(page, new RegExp(`id="${id}"`), `campo ${id} foi removido`);
  }
  for (const tone of ['direto', 'formal', 'criativo']) assert.match(page, new RegExp(`id="tom-${tone}"`));
  assert.match(page, /fetch\('\/api\/cover-letter'/);
  assert.match(page, /vagaaiTrack\('carta_gerada'/);
});

test('currículo principal é conectado sem bloquear upload ou edição manual', () => {
  assert.match(page, /VagaAICv\.carregarBase\(/);
  assert.match(page, /VagaAICv\.cvParaTextoLegivel\(_cvBase\)/);
  assert.match(page, /setCvText\(baseText/);
  assert.match(page, /accept="\.txt,\.pdf,\.doc,\.docx"/);
  assert.match(page, /function removeCvFile\(/);
  assert.match(page, /function updateCvConnection\(/);
});

test('inteligência lateral usa dados reais da análise', () => {
  assert.match(page, /id="cartaContextJob"/);
  assert.match(page, /id="cartaContextStrengths"/);
  assert.match(page, /id="cartaContextGaps"/);
  assert.match(page, /analysis\.keywords_encontradas/);
  assert.match(page, /analysis\.keywords_faltando/);
  assert.match(page, /if \(ji\.cargo \|\| r\.cargo\) preview\.cargo = ji\.cargo \|\| r\.cargo/);
  assert.match(page, /if \(ji\.empresa \|\| r\.empresa\) preview\.empresa = ji\.empresa \|\| r\.empresa/);
  assert.match(page, /preview\.excerpt = analysis\.job_excerpt \|\| r\.job_excerpt/);
  assert.match(page, /updateCartaIntelligence\(preview\)/);
});

test('carregamento dedicado substitui o foguete injetado na régua', () => {
  assert.match(page, /id="generationState"/);
  assert.match(page, /class="carta-loading-visual"><div class="spinner"/);
  assert.equal((page.match(/class="spinner"/g) || []).length, 1);
  assert.match(page, /showCartaStage\('loading'\)/);
  assert.match(page, /showCartaStage\('prepare'\)/);
  assert.match(page, /showCartaStage\('result'\)/);
});

test('resultado mantém formatos, prova, histórico, cópia e download', () => {
  for (const fmt of ['carta', 'curta', 'mensagem']) assert.match(page, new RegExp(`data-fmt="${fmt}"`));
  assert.match(page, /function copyCarta\(/);
  assert.match(page, /function downloadCarta\(/);
  assert.match(page, /function carregarHistoricoCartas\(/);
  assert.match(page, /function reabrirCarta\(/);
  assert.match(page, /id="provaWrap"/);
  assert.match(page, /id="highlightsWrap"/);
});

test('layout cobre desktop, tablet, mobile, tema e movimento reduzido', () => {
  assert.match(page, /@media\(max-width:1080px\)/);
  assert.match(page, /@media\(max-width:760px\)/);
  assert.match(page, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(page, /function toggleTheme\(/);
  assert.match(page, /\.carta-result-grid\{display:grid;grid-template-columns:minmax\(0,1\.35fr\)/);
  assert.match(page, /\.carta-letter,\.carta-result-insight\{min-width:0\}/);
});
