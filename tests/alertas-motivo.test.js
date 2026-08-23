import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* O radar não passava o currículo pela IA no plano free: as vagas saíam na
   ordem em que as fontes devolveram, e o primeiro contato de toda pessoa com a
   funcionalidade era justamente a versão que não olha para ela. E nenhum plano
   dizia POR QUE aquela vaga apareceu — o painel mostrava uma frase escolhida
   por faixa de score, igual para todo mundo na mesma faixa. */

const source = fs.readFileSync(new URL('../api/send-alerts.js', import.meta.url), 'utf8');

function extrair(nome, fim) {
  const inicio = source.indexOf('function ' + nome);
  assert.ok(inicio > 0, nome + ' sumiu de api/send-alerts.js');
  const corte = source.indexOf(fim, inicio);
  assert.ok(corte > inicio, 'não achei o fim de ' + nome);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source.slice(inicio, corte) + `\nglobalThis.fn = ${nome};`, sandbox);
  return sandbox.fn;
}

const parseAiScores = extrair('parseAiScores', '\n// Detecta se o usuário');

describe('motivo da recomendação', () => {
  it('lê score e motivo do JSON da IA', () => {
    const out = parseAiScores('[{"i":0,"score":87,"motivo":"Power BI e senioridade batem"}]');
    assert.equal(out[0].score, 87);
    assert.equal(out[0].motivo, 'Power BI e senioridade batem');
  });

  it('continua funcionando sem motivo (resposta antiga da IA)', () => {
    const out = parseAiScores('[{"i":0,"score":50},{"i":1,"score":10}]');
    assert.equal(out.length, 2);
    assert.equal(out[0].motivo, '');
  });

  it('normaliza espaço e corta motivo longo', () => {
    const longo = 'a'.repeat(200);
    const out = parseAiScores(`[{"i":0,"score":50,"motivo":"linha  um\\n\\nlinha dois"},{"i":1,"score":9,"motivo":"${longo}"}]`);
    assert.equal(out[0].motivo, 'linha um linha dois');
    assert.equal(out[1].motivo.length, 90);
  });

  it('motivo que não é string vira vazio em vez de quebrar', () => {
    const out = parseAiScores('[{"i":0,"score":50,"motivo":{"a":1}},{"i":1,"score":20,"motivo":42}]');
    assert.equal(out[0].motivo, '');
    assert.equal(out[1].motivo, '');
  });

  it('score continua limitado a 0..100', () => {
    const out = parseAiScores('[{"i":0,"score":900},{"i":1,"score":-40}]');
    assert.equal(out[0].score, 100);
    assert.equal(out[1].score, 0);
  });
});

describe('re-ranking não depende mais do plano', () => {
  it('a condição do re-rank não filtra por plano', () => {
    const trecho = source.slice(
      source.indexOf('const poolIA'),
      source.indexOf('aiRescoreJobs(jobs, profile, cvHint, poolIA)')
    );
    assert.ok(trecho.length > 0, 'o call site do re-rank mudou de forma');
    assert.doesNotMatch(
      trecho,
      /plan\s*!==\s*'free'/,
      'o re-ranking voltou a excluir o plano free'
    );
  });

  it('o free usa um lote menor de candidatos', () => {
    assert.match(source, /const poolIA = plan === 'free' \? 8 : 20;/);
  });

  it('o motivo sobrevive ao cache que alimenta o painel', () => {
    const inicio = source.indexOf('async function upsertAlertCache');
    const trecho = source.slice(inicio, inicio + 900);
    assert.match(trecho, /_motivo: j\._motivo \|\| ''/);
  });
});

describe('o motivo não vira injeção de HTML', () => {
  // _motivo nasce da IA lendo anúncios de feeds externos — o dado menos
  // confiável do produto, porque não passa por nenhum usuário nosso.
  it('o e-mail escapa o motivo', () => {
    assert.match(source, /Por que para voce: \$\{escEmail\(j\._motivo\)\}/);
  });

  it('o painel escapa o motivo', () => {
    const dash = fs.readFileSync(new URL('../dashboard/index.html', import.meta.url), 'utf8');
    assert.match(dash, /matchCopy = j\._motivo \? j\._motivo/);
    assert.match(dash, /\+ _esc\(matchCopy\) \+/);
  });
});
