import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'curriculo', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets', 'curriculum-master.css'), 'utf8');

test('currículo principal é o ativo dominante e usa a fotografia aprovada', () => {
  assert.match(html, /class="profile-head curriculum-master"/);
  assert.match(html, /Abrir e editar currículo/);
  assert.match(html, /Escolher modelo e baixar/);
  assert.match(css, /curriculum-master-workspace\.webp/);
  assert.ok(fs.existsSync(path.join(root, 'assets', 'curriculum-master-workspace.webp')));
});

test('perfil profissional usa os dados reais do currículo', () => {
  assert.match(html, /function profileStoryTitle\(d\)/);
  assert.match(html, /d\.titulo_profissional/);
  assert.match(html, /d\.resumo_profissional/);
  assert.match(html, /d\.contato && d\.contato\.cidade/);
  assert.match(html, /\(d\.habilidades \|\| \[\]\)\.slice\(0, 8\)/);
  assert.match(html, /cvBaseCount\(d\)/);
});

test('leitura do mercado preserva dados e evita recomendar competências inventadas', () => {
  assert.match(html, /VagaAICv\.calcularLacunas\(_cvData, rows\)/);
  assert.match(html, /lac\.totalVagas/);
  assert.match(html, /lac\.cobertas/);
  assert.match(html, /Inclua esses termos somente quando representarem algo que você realmente realizou/);
  assert.doesNotMatch(html, /Alertas conectados/);
});

test('ações neutras e versões por vaga continuam separadas', () => {
  assert.match(html, /onclick="scrollToCvDetails\(\)"/);
  assert.match(html, /onclick="openAdvancedEditor\(\)"/);
  assert.match(html, /onclick="deleteBaseCv\(\)"/);
  assert.match(html, /id="versionsPanel"/);
  assert.match(html, /As versões por vaga nunca substituem este documento/);
});

test('layout aprovado tem os quatro tamanhos de validação e não vaza para outras telas', () => {
  assert.match(css, /body\[data-vagaai-ui="curriculum"\]/);
  assert.match(css, /@media \(max-width: 1100px\)/);
  assert.match(css, /@media \(max-width: 820px\)/);
  assert.match(css, /@media \(max-width: 560px\)/);
});
