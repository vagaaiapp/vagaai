import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Vocabulário do produto: uma coisa, um nome, e o nome mais simples que
   funciona.

   O mapeamento encontrou três conceitos com dois nomes cada, o que é ao mesmo
   tempo linguagem difícil e incoerência:

     a nota de encaixe .... "aderência" e "compatibilidade"
     o resultado .......... "diagnóstico" e "análise"
     o que falta .......... "lacuna" e "requisitos ausentes"

   Unificar resolveu os dois problemas de uma vez.

   LIMPOS ATÉ AQUI são as superfícies abaixo. Faltam app, curriculo, carta,
   entrevista e os dois funis de onboarding: estavam com alteração não
   commitada de outra sessão quando isto foi escrito, e entram assim que ela
   fechar. Ao incluí-las, é só movê-las para LIMPOS. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const LIMPOS = [
  'index.template.html',
  'dashboard/index.html',
  'cv/index.html',
  'criar-curriculo/index.html',
  'paraempresas/index.html'
];

/* Páginas com robots="index, follow". Nelas "ATS" fica: é termo de busca real
   no Brasil e tirar custaria tráfego. A regra é outra: nunca aparecer sozinha,
   sempre com a explicação por perto. */
const INDEXADAS = [
  'index.template.html',
  'criar-curriculo/index.html',
  'paraempresas/index.html'
];

function visivel(fonte) {
  return fonte
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .map((l) => l.replace(/\s\/\/.*$/, ''))
    .join('\n');
}

/* Palavra em português: tem acento ou é palavra funcional comum. É o que
   separa prosa de seletor CSS, caminho e nome de propriedade. */
const PT = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]|\b(?:de|da|do|para|com|seu|sua|que|uma|não|você|em|na|no)\b/i;

/* Só texto que a pessoa lê. A primeira versão deste extrator olhava apenas
   texto entre tags e `textContent = 'literal'`, e por isso deixou passar os
   rótulos do anel de score ("Boa aderência", "Aderência moderada"), que são
   montados em ternário: `s >= 70 ? 'Boa aderência' : ...`. Era o texto mais
   visível do painel inteiro, logo abaixo do número.

   Agora varre QUALQUER literal com cara de frase em português, venha de onde
   vier. Nome de variável e classe CSS continuam de fora porque não passam no
   teste de prosa. */
function frases(fonte) {
  const src = visivel(fonte);
  const out = [];

  for (const m of src.matchAll(/>([^<>{}]{4,240})</g)) {
    const t = m[1].replace(/\s+/g, ' ').trim();
    if (t && PT.test(t) && !/[{};=]|function|var /.test(t)) out.push(t);
  }

  for (const m of src.matchAll(/'([^'\\\n]{4,240})'|"([^"\\\n]{4,240})"/g)) {
    const t = (m[1] || m[2] || '').trim();
    if (!t || !PT.test(t)) continue;
    if (/^[\w.#/:@-]+$/.test(t)) continue;      // seletor, caminho, classe
    if (/^(?:https?:|\/|\.)/.test(t)) continue;
    out.push(t);
  }

  return out;
}

/* Cada termo saiu por um motivo, e o motivo entra na mensagem de falha para
   quem reintroduzir entender por que não pode. */
const APOSENTADOS = [
  ['aderência', /ader[êe]nci/i, 'dois nomes para a mesma nota; ficou "compatibilidade"'],
  ['diagnóstico', /diagn[óo]stic/i, 'dois nomes para a mesma entrega; ficou "análise"'],
  ['jornada', /\bjornada\b/i, 'abstrato; ficou "busca"'],
  ['trajetória', /trajet[óo]ri/i, 'palavra de discurso; ficou "experiência"'],
  ['ativo profissional', /ativo profissional/i, 'ninguém chama o próprio currículo assim'],
  ['lacuna', /\blacunas?\b/i, 'ficou "o que falta"']
];

describe('vocabulário simples nas superfícies já limpas', () => {
  for (const arquivo of LIMPOS) {
    it(arquivo, () => {
      const texto = frases(ler(arquivo));
      for (const [termo, re, porque] of APOSENTADOS) {
        const achou = texto.find((t) => re.test(t));
        assert.equal(
          achou, undefined,
          `${arquivo} voltou a usar "${termo}" (${porque}):\n  ${(achou || '').slice(0, 130)}`
        );
      }
    });
  }
});

describe('ATS: sai de dentro do produto, fica onde tem busca', () => {
  it('o painel e o /cv não usam a sigla', () => {
    for (const arquivo of ['dashboard/index.html', 'cv/index.html']) {
      const achou = frases(ler(arquivo)).find((t) => /\bATS\b/.test(t));
      assert.equal(
        achou, undefined,
        `${arquivo} é noindex: a sigla deve virar "os sistemas que filtram currículos".\n  ${(achou || '').slice(0, 130)}`
      );
    }
  });

  for (const arquivo of INDEXADAS) {
    it(`${arquivo} mantém a sigla e continua indexável`, () => {
      const src = ler(arquivo);
      assert.match(
        src, /name="robots" content="index, follow"/,
        'se esta página deixou de ser indexável, a sigla não precisa mais ficar'
      );
    });
  }

  it('a LP explica o que é ATS em vez de só citar', () => {
    const lp = ler('index.template.html');
    assert.match(lp, /sistemas que filtram candidatos|filtrados por sistemas ATS/);
  });
});

describe('o que a simplificação não pode ter levado junto', () => {
  it('a nota continua se chamando compatibilidade', () => {
    assert.match(ler('dashboard/index.html'), /O quanto seu currículo combina com esta vaga/);
    assert.match(ler('paraempresas/index.html'), /Alta compatibilidade/);
  });

  it('o painel continua dizendo para não inventar', () => {
    // A simplificação mexeu na mesma copy do padrão anti-indução.
    assert.match(ler('dashboard/index.html'), /O que você não tem, não invente/);
  });
});
