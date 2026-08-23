import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* A plataforma não pode induzir ninguém a escrever no currículo o que não fez.
   Não é preferência de tom: é o produto inteiro dizendo a mesma coisa. A camada
   de IA já era rigorosa — quatro regras anti-alucinação em analyze.js, "NUNCA
   afirme possuí-los" na carta, "somente quando representarem algo que você
   realmente realizou" em /curriculo. A interface do painel destoava, no card
   mais visível do produto.

   O princípio canônico está escrito em js/cv-lacunas.js, onde o conceito de
   lacuna nasce. Estes testes impedem que ele se perca. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

/* Comentário é prosa sobre o passado — inclusive os que citam a copy antiga
   para explicar por que ela saiu. Só texto que chega ao usuário conta. */
function visivel(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');
}

const SUPERFICIES = [
  'dashboard/index.html',
  'app/index.html',
  'curriculo/index.html',
  'cv/index.html',
  'carta/index.html',
  'entrevista/index.html',
  'index.template.html'
];

/* Cada padrão veio de uma frase que existiu no produto. Não é lista genérica
   de palavras feias: é o que já apareceu e não pode voltar. */
const PROIBIDOS = [
  {
    re: /caminho mais direto para subir sua ader/i,
    porque: 'tratava incluir o termo como o objetivo, sem nenhuma ressalva de veracidade'
  },
  {
    re: /Aumente seu score/i,
    porque: 'põe o score como meta; o score é termômetro da presença de mercado, não o prêmio'
  },
  {
    re: /maximizar suas chances de retorno/i,
    porque: 'conselho genérico vendido como se fosse leitura do histórico da pessoa'
  }
];

describe('nenhuma tela induz a preencher o que não existe', () => {
  for (const arquivo of SUPERFICIES) {
    it(arquivo, () => {
      const texto = visivel(ler(arquivo));
      for (const { re, porque } of PROIBIDOS) {
        const linha = texto.split('\n').find((l) => re.test(l));
        assert.equal(
          linha, undefined,
          `${arquivo} voltou a usar uma frase aposentada (${porque}):\n  ${(linha || '').trim().slice(0, 140)}`
        );
      }
    });
  }
});

describe('o card "Faça agora" conduz pelo fato', () => {
  const dash = visivel(ler('dashboard/index.html'));

  it('o título afirma o fato em vez de mandar preencher', () => {
    assert.match(dash, /Seu currículo não menciona ' \+ missing \+ ' requisito/);
  });

  it('aponta primeiro o que a pessoa já fez e não escreveu', () => {
    assert.match(dash, /Comece pelos que você já fez e não escreveu/);
  });

  it('diz explicitamente para não inventar, e para onde levar a lacuna real', () => {
    assert.match(dash, /O que você não tem, não invente/);
    assert.match(dash, /a carta é o lugar de tratar a lacuna/);
  });

  it('a descrição depende de `missing`, não só de `temVersao`', () => {
    /* O bug que veio junto: com zero requisitos faltando, a descrição
       continuava afirmando que a vaga pedia coisas ausentes do currículo — o
       card contradizia a própria análise que ele estava exibindo. */
    // O fim tem que ser procurado A PARTIR do início: `if (btnPri) {` aparece
    // antes no arquivo, em outro ramo do card, e o slice saía vazio.
    const ini = dash.indexOf("descEl.textContent = temVersao");
    assert.ok(ini > 0, 'não achei o bloco da descrição');
    const bloco = dash.slice(ini, dash.indexOf('if (btnPri) {', ini));
    assert.ok(bloco.length > 0, 'não achei o fim do bloco da descrição');
    assert.match(bloco, /missing > 0/, 'a descrição voltou a ignorar quantos requisitos faltam');
  });
});

describe('a projeção de score não promete o que exigiria mentir', () => {
  it('a legenda diz que a estimativa é sobre evidenciar o que já existe', () => {
    const app = visivel(ler('app/index.html'));
    assert.match(app, /Estimativa para quando você evidenciar o que já fez/);
    assert.match(app, /Nunca pressupõe incluir o que você não tem/);
  });
});

describe('as defesas que já existiam continuam de pé', () => {
  it('/curriculo mantém a ressalva de veracidade', () => {
    assert.match(
      ler('curriculo/index.html'),
      /somente quando representarem algo que você realmente realizou/
    );
  });

  it('a carta nunca afirma possuir requisito ausente', () => {
    assert.match(ler('api/cover-letter.js'), /NUNCA afirme possuí-los/);
  });

  it('os prompts de currículo mantêm a regra anti-alucinação', () => {
    const analyze = ler('api/analyze.js');
    const regras = analyze.match(/NUNCA invente/g) || [];
    assert.ok(
      regras.length >= 4,
      `esperava pelo menos 4 regras "NUNCA invente" em analyze.js, achei ${regras.length}`
    );
    assert.match(analyze, /melhor um currículo curto e verdadeiro do que um completo e inventado/);
    assert.match(analyze, /Otimize a redação e as keywords — jamais os fatos/);
  });

  it('o princípio está escrito onde o conceito de lacuna nasce', () => {
    const lacunas = ler('js/cv-lacunas.js');
    assert.match(lacunas, /Uma lacuna é um FATO sobre o currículo, não uma tarefa de preenchimento/);
  });
});
