import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* O painel tinha o desfecho de cada candidatura e o score da análise que a
   originou lado a lado, e nunca ligou os dois. No lugar disso mostrava
   "priorize vagas com score acima de 70%" — regra de bolso igual para todo
   mundo. insightDeAderencia troca a regra por um fato sobre esta pessoa,
   quando há amostra que o sustente. */

const dash = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');

function carregar() {
  const inicio = dash.indexOf('var MIN_POR_FAIXA');
  assert.ok(inicio > 0, 'insightDeAderencia sumiu do dashboard');
  const fim = dash.indexOf('function buildFunilCard', inicio);
  assert.ok(fim > inicio);
  const sandbox = {
    // O dashboard normaliza sinônimos de status ('aplicado'/'aplicada'); aqui
    // basta a identidade, os testes já usam os nomes canônicos.
    normalizeStatus: s => s
  };
  vm.createContext(sandbox);
  vm.runInContext(dash.slice(inicio, fim) + '\nglobalThis.fn = insightDeAderencia;', sandbox);
  return sandbox.fn;
}

const insight = carregar();

// Monta N candidaturas de uma faixa de score, das quais `avancaram` chegaram a entrevista.
function candidaturas(scoreBase, total, avancaram, offset = 0) {
  const analyses = [];
  const tracked = [];
  for (let i = 0; i < total; i++) {
    const id = 'a' + (offset + i);
    analyses.push({ id, score: scoreBase });
    tracked.push({ analysis_id: id, status: i < avancaram ? 'entrevista' : 'aplicada' });
  }
  return { analyses, tracked };
}

function juntar(a, b) {
  return {
    analyses: a.analyses.concat(b.analyses),
    tracked: a.tracked.concat(b.tracked)
  };
}

describe('insight de aderência × desfecho', () => {
  it('cala a boca sem amostra suficiente em alguma faixa', () => {
    const d = juntar(candidaturas(85, 2, 2), candidaturas(40, 5, 0, 100));
    assert.equal(insight(d.analyses, d.tracked), null);
  });

  it('cala a boca sem dado nenhum', () => {
    assert.equal(insight([], []), null);
    assert.equal(insight(null, null), null);
  });

  it('diz o fato quando aderência alta responde mais', () => {
    const d = juntar(candidaturas(85, 4, 3), candidaturas(40, 4, 1, 100));
    const txt = insight(d.analyses, d.tracked);
    assert.match(txt, /75%/);
    assert.match(txt, /25%/);
    assert.match(txt, /tem funcionado para você/);
  });

  it('não esconde o resultado contraintuitivo', () => {
    // Se o score não prevê o retorno, dizer isso vale mais que omitir.
    const d = juntar(candidaturas(85, 4, 0), candidaturas(40, 4, 3, 100));
    const txt = insight(d.analyses, d.tracked);
    assert.match(txt, /não está prevendo seu retorno/);
  });

  it('empate vira frase honesta, não silêncio', () => {
    const d = juntar(candidaturas(85, 4, 2), candidaturas(40, 4, 2, 100));
    assert.match(insight(d.analyses, d.tracked), /mesma proporção/);
  });

  it('ignora o que ainda não foi enviado', () => {
    const d = juntar(candidaturas(85, 4, 4), candidaturas(40, 4, 0, 100));
    d.tracked.push(
      { analysis_id: 'a0', status: 'quero_aplicar' },
      { analysis_id: 'a1', status: 'cv_pronto' }
    );
    // As duas linhas extras não podem mudar as taxas de 100% e 0%.
    const txt = insight(d.analyses, d.tracked);
    assert.match(txt, /100%/);
    assert.match(txt, /0%/);
  });

  it('candidatura sem score não entra na conta', () => {
    const d = juntar(candidaturas(85, 4, 4), candidaturas(40, 4, 0, 100));
    d.analyses.push({ id: 'sem', score: 0 });
    d.tracked.push({ analysis_id: 'sem', status: 'entrevista' });
    assert.match(insight(d.analyses, d.tracked), /100%/);
  });

  it('usa o score do próprio tracker quando a análise sumiu', () => {
    const d = juntar(candidaturas(85, 4, 4), candidaturas(40, 3, 0, 100));
    d.tracked.push({ analysis_id: 'inexistente', score: 30, status: 'aplicada' });
    assert.ok(insight(d.analyses, d.tracked), 'a quarta da faixa baixa veio do tracker');
  });
});
