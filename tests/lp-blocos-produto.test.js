import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Os três blocos de recurso da LP (analisar vaga, alertas, candidaturas) e os
   mockups ao lado deles.

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
    const btn = lp.match(/<a class="btn[^"]*"[^>]*href="\/onboarding\/curriculo\/1\?mode=cv_no_job[^"]*"[^>]*>/);
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

  it('o mockup de candidaturas usa status que existem no produto', () => {
    const bloco = visivel(lp).match(/Painel <b>› Candidaturas<\/b>[\s\S]*?dmock-note/);
    assert.ok(bloco, 'mockup de candidaturas sumiu');

    const labels = ler('dashboard/index.html').match(/var STATUS_LABELS = \{[\s\S]*?\};/);
    assert.ok(labels, 'STATUS_LABELS sumiu do painel');
    const reais = [...labels[0].matchAll(/:\s*'([^']+)'/g)].map((m) => m[1]);

    for (const m of bloco[0].matchAll(/<i class="s\d">([^<]+)<\/i>/g)) {
      assert.ok(
        reais.includes(m[1]),
        `"${m[1]}" não é status do rastreador. Reais: ${reais.join(', ')}`
      );
    }
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
    const bloco = lp.match(/Depois de aplicar[\s\S]*?<\/div>\s*<a class="btn/);
    assert.ok(bloco, 'bloco de candidaturas sumiu');
    assert.match(bloco[0], /Treino de entrevista/);
    assert.doesNotMatch(
      bloco[0], /Simulador de entrevista/,
      'o produto chama de "Treino de entrevista" no painel, no /app e no /entrevista'
    );
  });

  it('cada bloco de recurso termina com uma saída', () => {
    // O de alertas ficou sem CTA por muito tempo, sendo o produto recorrente.
    const blocos = [...lp.matchAll(/<div class="detail-text reveal">[\s\S]*?<\/div>\s*<div class="dmock/g)];
    assert.equal(blocos.length, 3, 'esperava três blocos de recurso');
    for (const b of blocos) {
      const tag = (b[0].match(/detail-tag">([^<]+)/) || [])[1] || '?';
      assert.match(b[0], /<a class="btn/, `o bloco "${tag}" ficou sem CTA`);
    }
  });
});
