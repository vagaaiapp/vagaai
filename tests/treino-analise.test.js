import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* O treino recebia os requisitos ausentes, mas no fim de um bloco rotulado
   "VAGA" e depois dos campos mais longos da análise — numa vaga de descrição
   comprida eles caíam fora do `slice(0, 3000)` do prompt. E mesmo sobrevivendo,
   chegavam sem rótulo: o modelo os lia como mais uma linha de descrição, não
   como o que precisa ser cobrado. Resultado: um simulador que não perguntava
   justamente sobre o que a pessoa não tem.

   blocoDaAnalise resolve pela raiz — campo próprio, rótulo explícito e
   instrução de quantas perguntas devem endereçar a lacuna. */

const source = fs.readFileSync(new URL('../api/interview.js', import.meta.url), 'utf8');

function carregarBloco() {
  const inicio = source.indexOf('function blocoDaAnalise');
  assert.ok(inicio > 0, 'blocoDaAnalise sumiu de api/interview.js');
  const fim = source.indexOf('\nasync function generateQuestions', inicio);
  assert.ok(fim > inicio, 'não achei o fim de blocoDaAnalise');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(source.slice(inicio, fim) + '\nglobalThis.bloco = blocoDaAnalise;', sandbox);
  return sandbox.bloco;
}

const bloco = carregarBloco();

describe('prompt do treino — bloco da análise', () => {
  it('sem análise, não injeta nada no prompt', () => {
    assert.equal(bloco(null), '');
    assert.equal(bloco({}), '');
    assert.equal(bloco({ keywords_faltando: [] }), '');
  });

  it('rotula os requisitos ausentes e manda cobrá-los', () => {
    const out = bloco({ score: 33, keywords_faltando: ['Power BI', 'SQL'] });
    assert.match(out, /REQUISITOS AUSENTES/);
    assert.match(out, /Power BI, SQL/);
    assert.match(out, /PELO MENOS 2 DAS 8 PERGUNTAS/);
  });

  it('aderência baixa manda o treino focar na lacuna', () => {
    const out = bloco({ score: 33, keywords_faltando: ['SQL'] });
    assert.match(out, /Aderencia baixa \(33%\)/);
    assert.match(out, /o treino tambem deve/);
  });

  it('aderência alta troca lacuna por profundidade', () => {
    const out = bloco({ score: 88, keywords_encontradas: ['Python'] });
    assert.match(out, /Aderencia alta \(88%\)/);
    assert.match(out, /profundidade/);
  });

  it('score fora da faixa é ignorado em vez de virar texto errado', () => {
    const out = bloco({ score: 999, keywords_faltando: ['SQL'] });
    assert.doesNotMatch(out, /999/);
    assert.match(out, /proporcao equilibrada/);
  });

  it('trunca listas longas para não empurrar o resto do prompt para fora', () => {
    const faltando = Array.from({ length: 30 }, (_, i) => 'req' + i);
    const out = bloco({ score: 40, keywords_faltando: faltando });
    assert.match(out, /req7/);
    assert.doesNotMatch(out, /req8\b/, 'a lista deve parar em 8 itens');
  });

  it('ignora entrada suja sem quebrar', () => {
    const out = bloco({ score: 50, keywords_faltando: ['  SQL  ', '', null, undefined, 42] });
    assert.match(out, /SQL/);
    assert.doesNotMatch(out, /null|undefined/);
  });

  it('o campo chega ao handler e é repassado', () => {
    assert.match(source, /empresa,\s*analise\s*\}\s*=\s*req\.body/);
    assert.match(source, /generateQuestions\(job,\s*cv,\s*analise\)/);
    assert.match(source, /\$\{blocoDaAnalise\(analise\)\}/);
  });
});
