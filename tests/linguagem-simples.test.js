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

   LIMPOS cobre agora todas as superfícies de texto do produto. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const LIMPOS = [
  'index.template.html',
  'dashboard/index.html',
  'cv/index.html',
  'criar-curriculo/index.html',
  'paraempresas/index.html',
  'app/index.html',
  'curriculo/index.html',
  'carta/index.html',
  'entrevista/index.html',
  'onboarding/vaga/index.html',
  'onboarding/curriculo/index.html',
  'onboarding/shared.js'
];

/* Páginas com robots="index, follow". Nelas "ATS" fica: é termo de busca real
   no Brasil e tirar custaria tráfego. A regra é outra: nunca aparecer sozinha,
   sempre com a explicação por perto. */
const INDEXADAS = [
  'index.template.html',
  'criar-curriculo/index.html',
  'paraempresas/index.html',
  'app/index.html'
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
   separa prosa de seletor CSS, caminho e nome de propriedade.

   Só isso ainda deixava passar rótulo curto sem acento e sem palavra
   funcional: "jornada completa" sobreviveu a duas varreduras por causa disso.
   Por isso `pareceFrase` aceita também duas ou mais palavras comuns seguidas,
   desde que não pareçam código. */
const PT = /[áàâãéêíóôõúüçÁÀÂÃÉÊÍÓÔÕÚÜÇ]|\b(?:de|da|do|para|com|seu|sua|que|uma|não|você|em|na|no)\b/i;

function pareceFrase(t) {
  if (PT.test(t)) return true;
  const palavras = t.split(/\s+/).filter((p) => /^[a-zà-ú]{3,}$/i.test(p));
  return palavras.length >= 2;
}

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
    if (t && pareceFrase(t) && !/[{};=]|function|var /.test(t)) out.push(t);
  }

  for (const m of src.matchAll(/'([^'\\\n]{4,240})'|"([^"\\\n]{4,240})"/g)) {
    const t = (m[1] || m[2] || '').trim();
    if (!t || !pareceFrase(t)) continue;
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

/* A LP editorial aprovada usa "jornada" como nome do trilho visual que une os
   dois pontos de entrada. Não é sinônimo de uma função do produto nem compete
   com "busca" dentro das telas, então a exceção fica restrita à home. */
const EXCECOES_POR_ARQUIVO = {
  'index.template.html': new Set(['jornada'])
};

describe('vocabulário simples nas superfícies já limpas', () => {
  for (const arquivo of LIMPOS) {
    it(arquivo, () => {
      const texto = frases(ler(arquivo));
      for (const [termo, re, porque] of APOSENTADOS) {
        if (EXCECOES_POR_ARQUIVO[arquivo]?.has(termo)) continue;
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
  /* A única frase com a sigla que sobrevive numa página noindex é a que
     ENSINA o que ela é. Está no topo do funil de vaga, antes de qualquer
     resultado: é ali que a pessoa aprende o termo. Sem ela, as páginas
     indexadas citariam uma sigla que o produto nunca explicou. */
  const ENSINA_A_SIGLA = /Cerca de 75% dos currículos são filtrados por sistemas ATS/;

  const NOINDEX = LIMPOS.filter((a) => !INDEXADAS.includes(a));

  for (const arquivo of NOINDEX) {
    it(`${arquivo} não usa a sigla solta`, () => {
      const achou = frases(ler(arquivo))
        .filter((t) => /\bATS\b/.test(t))
        .find((t) => !ENSINA_A_SIGLA.test(t));
      assert.equal(
        achou, undefined,
        `${arquivo} é noindex: a sigla deve virar "os filtros" ou "os sistemas que filtram currículos".\n  ${(achou || '').slice(0, 130)}`
      );
    });
  }

  it('o funil de vaga continua explicando a sigla', () => {
    assert.match(ler('onboarding/vaga/index.html'), ENSINA_A_SIGLA);
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

  it('a projeção continua avisando que não é para inventar', () => {
    // "Aderência projetada" virou "Compatibilidade estimada"; a ressalva ao
    // lado é o que impede o número de virar promessa.
    assert.match(ler('app/index.html'), /Nunca pressupõe incluir o que você não tem/);
  });

  it('a carta continua dizendo a que ponto ela responde', () => {
    // É o único elo entre a carta e a análise que a originou.
    assert.match(ler('carta/index.html'), /Responde ao que faltava:/);
  });
});
