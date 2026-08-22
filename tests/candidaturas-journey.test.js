import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');

test('candidaturas usa a jornada aprovada com uma única prioridade dominante', () => {
  assert.match(dashboard, /aria-label="Próxima ação e resumo da jornada"/);
  assert.match(dashboard, /class="cand-journey"/);
  assert.match(dashboard, /id="cjCaption"/);
  assert.match(dashboard, /id="cjNote"/);
  assert.match(dashboard, /Transforme esta análise em uma candidatura acompanhada/);
  assert.doesNotMatch(dashboard, /class="cand-metric"/);
});

test('oportunidades são agrupadas por decisão e andamento sem perder dados reais', () => {
  assert.match(dashboard, /Aguardando sua decisão/);
  assert.match(dashboard, /Em andamento/);
  assert.match(dashboard, /var waiting = filtered\.filter\(function\(item\)\{ return !item\.hasTracker; \}\)/);
  assert.match(dashboard, /var active = filtered\.filter\(function\(item\)\{ return item\.hasTracker; \}\)/);
  assert.match(dashboard, /applicationJourneySteps\(item\.status,item\.hasTracker\)/);
  assert.match(dashboard, /calcNextAction\(item\)/);
});

test('lista, Kanban, calendário, filtros, cadastro e detalhe permanecem funcionais', () => {
  ['setCandView', 'renderCandList', 'renderKanban', 'renderCalendar', 'toggleCandAdvanced', 'openTrackerEdit', 'openCandDetail'].forEach((name) => {
    assert.match(dashboard, new RegExp(`function ${name}\\(`));
  });
  assert.match(dashboard, /id="cvs-lista"/);
  assert.match(dashboard, /id="cvs-kanban"/);
  assert.match(dashboard, /id="cvs-calendario"/);
  assert.match(dashboard, /id="candSearch"/);
  assert.match(dashboard, /id="candChips"/);
  assert.match(dashboard, /openTrackerEdit\(\{status:'quero_aplicar'\}\)/);
});

test('layout aprovado cobre desktop, tablet, mobile e tema escuro', () => {
  assert.match(dashboard, /@media\(max-width:1180px\)/);
  assert.match(dashboard, /@media\(max-width:768px\)/);
  assert.match(dashboard, /@media\(max-width:480px\)/);
  assert.match(dashboard, /var\(--bg-card\)/);
  assert.match(dashboard, /var\(--t1\)/);
  assert.match(dashboard, /var\(--border\)/);
});
