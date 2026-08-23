import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* O currículo direcionado a uma vaga nunca ensinava nada ao currículo mestre:
   dez análises produziam dez versões otimizadas e o principal — que alimenta o
   re-ranking dos alertas e todas as telas — continuava igual ao do primeiro
   dia. Sobrescrever o mestre seria errado (a versão pertence à vaga que a
   originou), mas uma competência que a IA articulou em várias versões é
   melhoria de perfil, não viés. */

const src = fs.readFileSync(new URL('../js/cv-lacunas.js', import.meta.url), 'utf8');

function carregar() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox.VagaAICv;
}

const Cv = carregar();

/* Array criado dentro do vm tem outro prototipo de Array: deepStrictEqual
   compara identidade de prototipo e reprova ate duas listas vazias. Array.from
   traz a lista para o realm do teste antes de comparar conteudo. */
const lista = (x) => Array.from(x || []);

function vaga(id, habilidades, extra = {}) {
  return {
    id,
    created_at: '2026-08-0' + (id % 9 + 1) + 'T10:00:00Z',
    result: {
      job_info: { empresa: 'Empresa' + id, cargo: 'Cargo' + id },
      cv_otimizado: { habilidades },
      ...extra
    }
  };
}

describe('habilidades vindas das versões por vaga', () => {
  it('devolve o que as versões têm e o currículo principal não', () => {
    const cv = { nome: 'Ana', habilidades: ['Excel'] };
    const out = Cv.habilidadesDasVersoes(cv, [vaga(1, ['Excel', 'Power BI'])]);
    assert.deepEqual(lista(out.novas), ['Power BI']);
  });

  it('ordena por em quantas vagas a competência apareceu', () => {
    const cv = { nome: 'Ana' };
    const out = Cv.habilidadesDasVersoes(cv, [
      vaga(1, ['SQL', 'Power BI']),
      vaga(2, ['SQL']),
      vaga(3, ['SQL', 'Figma'])
    ]);
    assert.equal(out.novas[0], 'SQL');
    assert.equal(out.freq['SQL'], 3);
  });

  it('não conta duas vezes a mesma competência na mesma vaga', () => {
    const out = Cv.habilidadesDasVersoes({ nome: 'Ana' }, [vaga(1, ['SQL', 'sql', ' SQL '])]);
    assert.equal(out.freq['SQL'], 1);
  });

  it('reanalisar a mesma vaga não vira duas evidências', () => {
    // Duas análises da MESMA vaga (mesma empresa e cargo): só a mais recente conta.
    const a = vaga(1, ['SQL']);
    const b = vaga(1, ['SQL']);
    b.id = 99;
    b.created_at = '2026-08-09T10:00:00Z';
    const out = Cv.habilidadesDasVersoes({ nome: 'Ana' }, [a, b]);
    assert.equal(out.freq['SQL'], 1);
    assert.equal(out.totalVagas, 1);
  });

  it('respeita o currículo inteiro, não só o campo habilidades', () => {
    // Uma competência citada só num bullet de experiência já está no currículo:
    // sugerir que a pessoa adicione algo que ela já tem é ruído.
    const cv = {
      nome: 'Ana',
      experiencias: [{ cargo: 'Analista', bullets: ['Construí dashboards em Power BI'] }]
    };
    const out = Cv.habilidadesDasVersoes(cv, [vaga(1, ['Power BI'])]);
    assert.deepEqual(lista(out.novas), []);
  });

  it('análise sem versão otimizada não quebra nem inventa', () => {
    const semCv = { id: 5, created_at: '2026-08-05T10:00:00Z', result: { job_info: { empresa: 'X', cargo: 'Y' } } };
    const out = Cv.habilidadesDasVersoes({ nome: 'Ana' }, [semCv]);
    assert.deepEqual(lista(out.novas), []);
  });

  it('entrada suja não vira sugestão', () => {
    const out = Cv.habilidadesDasVersoes({ nome: 'Ana' }, [vaga(1, ['', null, undefined, '  ', 'SQL'])]);
    assert.deepEqual(lista(out.novas), ['SQL']);
  });

  it('sem análises devolve vazio', () => {
    const out = Cv.habilidadesDasVersoes({ nome: 'Ana' }, []);
    assert.deepEqual(lista(out.novas), []);
    assert.equal(out.totalVagas, 0);
  });

  it('usa o mesmo critério de "já tenho" que calcularLacunas', () => {
    // As duas leituras aparecem no mesmo painel; discordar sobre o mesmo
    // currículo seria o defeito que cv-lacunas.js nasceu para acabar.
    const cv = { nome: 'Ana', habilidades: ['Power BI'] };
    const analises = [vaga(1, ['Power BI'], { keywords_faltando: ['Power BI'] })];
    assert.deepEqual(lista(Cv.habilidadesDasVersoes(cv, analises).novas), []);
    assert.deepEqual(lista(Cv.calcularLacunas(cv, analises).gaps), []);
  });
});
