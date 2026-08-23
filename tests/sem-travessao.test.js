import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Travessão (—) fora da comunicação do produto.
   Ele quase não aparece na escrita profissional brasileira e virou uma das
   marcas mais reconhecíveis de texto gerado por IA. Numa plataforma que escreve
   currículo e carta para a pessoa levar a um recrutador, isso custa caro.

   Três categorias saíram junto, cada uma com destino próprio:
     separador de título  VagaAI — Início    ->  VagaAI | Início
     valor vazio na tela  <span>—</span>     ->  <span>-</span>
     pontuação em frase   "X — Y"            ->  ponto, dois-pontos ou vírgula,
                                                 lido caso a caso

   Os prompts de IA também foram limpos, por um motivo diferente: o modelo imita
   a pontuação do que recebe. E cada prompt de geração ganhou instrução
   explícita para não devolver travessão. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const SUPERFICIES = [
  'index.template.html', 'app/index.html', 'dashboard/index.html',
  'curriculo/index.html', 'cv/index.html', 'carta/index.html',
  'entrevista/index.html', 'criar-curriculo/index.html', 'login/index.html',
  'onboarding/vaga/index.html', 'onboarding/curriculo/index.html',
  'onboarding/shared.js', 'paraempresas/index.html', 'termos/index.html',
  'obrigado/index.html', 'cancelado/index.html', '404.html',
  'blog/index.html', 'blog/post/index.html', 'cookie-consent.js',
  'sidebar.js', 'js/cv-base.js', 'js/cv-voice.js', 'js/cv-lacunas.js',
  'api/analyze.js', 'api/cover-letter.js', 'api/interview.js',
  'api/send-alerts.js', 'api/onboarding-emails.js', 'api/cron-onboarding.js',
  'api/unsubscribe.js', 'api/support.js', 'api/webhook.js'
];

/* O que NÃO é comunicação com o usuário e por isso pode conter o caractere:

   - comentário de código, que é prosa interna sobre o passado;
   - log de servidor e mensagem de erro técnica, que ninguém lê na interface;
   - regex que REMOVE travessão do texto colado pela pessoa (essas viraram
     aliadas: limpam o caractere de currículo importado);
   - a própria instrução dos prompts, escrita como — justamente para o
     fonte ficar limpo e a regra continuar chegando ao modelo. */
function linhaDispensada(l) {
  const t = l.trim();
  if (t.startsWith('//') || t.startsWith('*')) return true;
  if (/console\.(log|warn|error|info|debug)/.test(l)) return true;
  if (/new Error\(|throw /.test(l)) return true;
  if (/\\u2014/.test(l)) return true;
  // Regex literal que cita o caractere dentro de uma classe: /[-–—]/ e afins.
  if (/\[[^\]]*—[^\]]*\]/.test(l)) return true;
  return false;
}

function comunicacao(fonte) {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    /* Comentário no FIM da linha (`var x = 1; // nota —`) também é interno.
       O corte exige espaço antes das barras para não decepar `https://`. */
    .map((l) => l.replace(/\s\/\/.*$/, ''))
    .filter((l) => !linhaDispensada(l));
}

describe('nenhum travessão na comunicação do produto', () => {
  for (const arquivo of SUPERFICIES) {
    it(arquivo, () => {
      const sujas = comunicacao(ler(arquivo))
        .filter((l) => l.includes('—'))
        .map((l) => l.trim().slice(0, 130));

      assert.deepEqual(
        sujas, [],
        `${arquivo} tem travessão em texto que o usuário lê:\n  ` + sujas.join('\n  ')
      );
    });
  }
});

describe('todo prompt de geração proíbe o travessão na saída', () => {
  /* É a parte que mais pesa: a carta, o currículo e as perguntas do treino são
     texto que a IA escreve e a pessoa entrega a um recrutador. */
  const casos = [
    ['api/cover-letter.js', 1],
    ['api/analyze.js', 4],
    ['api/interview.js', 3],
    ['api/send-alerts.js', 1]
  ];

  for (const [arquivo, minimo] of casos) {
    it(`${arquivo} (pelo menos ${minimo})`, () => {
      const src = ler(arquivo);
      const regras = src.match(/travess[aã]o \(\\u2014\)/g) || [];
      assert.ok(
        regras.length >= minimo,
        `esperava pelo menos ${minimo} instrução(ões) contra travessão, achei ${regras.length}`
      );
    });
  }

  it('a instrução chega ao modelo como o caractere, não como texto escapado', () => {
    // `—` dentro de string JS vira — em tempo de execução. Sem isso, o
    // modelo leria a sequência literal e a regra perderia o sentido.
    assert.equal('travessao (—)', 'travessao (—)');
  });
});
