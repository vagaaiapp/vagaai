import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = fs.readFileSync(path.join(root, 'dashboard', 'index.html'), 'utf8');

test('candidaturas usa a jornada aprovada com uma única prioridade dominante', () => {
  /* "jornada" saiu da copy do produto: palavra abstrata, trocada por "busca"
     no mapeamento de linguagem. O ratchet segue travando o mesmo elemento. */
  assert.match(dashboard, /aria-label="Próxima ação e resumo da busca"/);
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

test('detalhe da vaga conduz decisão sem perder ações e dados reais', () => {
  assert.match(dashboard, /class="cd-decision"/);
  assert.match(dashboard, /O que mais aumenta sua compatibilidade/);
  assert.match(dashboard, /Preparação da candidatura/);
  assert.match(dashboard, /Etapas desta vaga/);
  assert.match(dashboard, /Array\.isArray\(r\.prioridades\)/);
  assert.match(dashboard, /Array\.isArray\(r\.keywords_faltando\)/);
  assert.match(dashboard, /Vaga em site externo/);
  assert.match(dashboard, /Esta candidatura acontece fora da VagaAI/);
  assert.match(dashboard, /trackAnalysis\(/);
  assert.match(dashboard, /openSavedAnalysis\(/);
  assert.match(dashboard, /openSavedCv\(/);
  assert.match(dashboard, /switchDashTab\(\\'entrevista\\'/);
  assert.match(dashboard, /switchDashTab\(\\'carta\\'/);
  assert.match(dashboard, /openTrackerEditById\(/);
});

test('layout aprovado cobre desktop, tablet, mobile e tema escuro', () => {
  assert.match(dashboard, /@media\(max-width:1180px\)/);
  assert.match(dashboard, /@media\(max-width:768px\)/);
  assert.match(dashboard, /@media\(max-width:480px\)/);
  assert.match(dashboard, /var\(--bg-card\)/);
  assert.match(dashboard, /var\(--t1\)/);
  assert.match(dashboard, /var\(--border\)/);
});
