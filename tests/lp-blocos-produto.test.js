import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Os três passos editoriais da LP (analisar vaga, alertas, candidaturas) e os
   visuais ao lado deles.

   O mockup é a única parte da LP que ninguém revisa junto com a copy, porque
   parece decoração. Não é: ele é a promessa desenhada. Estava afirmando "70%
   precisão", que é performance sem base, e mostrando um status "Enviada" que
   não existe no produto. */

const ler = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const lp = ler('index.template.html');

function visivel(fonte) {
  return fonte.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

describe('blocos de recurso da LP', () => {
  it('o CTA de alertas é link de verdade, não gatilho de modal', () => {
    /* `journey-trigger` dá preventDefault e abre o modal das jornadas,
       ignorando o href. Os outros CTAs convivem com isso porque o modal
       expressa o destino deles. Este não: alerta só nasce no funil de
       currículo com `goal=alerts`, opção que o modal não oferece. Com a
       classe, o botão prometeria vagas e entregaria a pergunta "você já tem
       currículo?". */
    const btn = lp.match(/<a class="text-link"[^>]*href="\/onboarding\/curriculo\/1\?mode=cv_no_job[^\"]*"[^>]*>/);
    assert.ok(btn, 'CTA de alertas sumiu ou mudou de destino');
    assert.doesNotMatch(
      btn[0], /journey-trigger/,
      'com journey-trigger o href é ignorado e o botão vira modal genérico'
    );
  });

  it('o destino do CTA de alertas é o modo que o funil realmente entende', () => {
    /* `goal=alerts` só é lido junto de `mode=cv_no_job`: no ramo de
       `entry=no-cv` o próprio funil zera o goal. */
    const funil = ler('onboarding/curriculo/index.html');
    assert.match(funil, /mode === 'cv_no_job'/);
    assert.match(funil, /state\.goal = goal === 'alerts' \? 'alerts' : ''/);
  });

  it('os três passos têm um visual correspondente e controles com o mesmo índice', () => {
    assert.equal((lp.match(/class="story-step/g) || []).length, 3, 'esperava três passos editoriais');
    assert.equal((lp.match(/data-visual="[012]"/g) || []).length, 3, 'cada passo precisa de um visual');
    assert.equal((lp.match(/data-tab="[012]"/g) || []).length, 3, 'cada visual precisa de uma aba');
  });

  it('o mockup de alertas não afirma precisão', () => {
    // Volume ilustrativo passa como mockup. Precisão é promessa de resultado.
    assert.doesNotMatch(
      visivel(lp), /precisão<\/span>/,
      'número de precisão num mockup é promessa de performance sem base'
    );
  });

  it('a LP não usa "match" como palavra visível', () => {
    // matchMedia e String.match são código; o que conta é texto entre tags.
    const solto = [...visivel(lp).matchAll(/>([^<>{}]{2,120})</g)]
      .map((m) => m[1].trim())
      .find((t) => /\bmatch\b/i.test(t));
    assert.equal(solto, undefined, `inglês solto na LP: "${solto}"`);
  });

  it('a LP chama o treino de entrevista pelo nome do produto', () => {
    const bloco = lp.match(/<article class="story-step" data-step="2">[\s\S]*?<\/article>/);
    assert.ok(bloco, 'bloco de candidaturas sumiu');
    assert.match(bloco[0], /Treino de entrevista/);
  });

  /* O nome tem que bater em toda superfície que a pessoa lê antes de chegar
     ao produto, senão ela clica esperando simulador e encontra treino. A
     tabela de planos e o e-mail de onboarding ficaram para trás quando o
     resto foi renomeado. */
  for (const arquivo of ['index.template.html', 'api/onboarding-emails.js']) {
    it(`${arquivo} não fala em "simulador"`, () => {
      const achou = visivel(ler(arquivo)).match(/[Ss]imulador de [Ee]ntrevista/);
      assert.equal(
        achou, null,
        `o produto se chama "Treino de entrevista" (42 ocorrências no painel, /app e /entrevista)`
      );
    });
  }

  it('cada bloco de recurso termina com uma saída', () => {
    // O de alertas ficou sem CTA por muito tempo, sendo o produto recorrente.
    const blocos = [...lp.matchAll(/<article class="story-step[^>]*>[\s\S]*?<\/article>/g)];
    assert.equal(blocos.length, 3, 'esperava três blocos de recurso');
    for (const b of blocos) {
      const tag = (b[0].match(/step-label">([^<]+)/) || [])[1] || '?';
      assert.match(b[0], /<a class="text-link"/, `o bloco "${tag}" ficou sem CTA`);
    }
  });
});
