import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Os fundos das duas jornadas da LP.

   Três coisas quebram em silêncio aqui, e nenhuma delas aparece como erro:

   1. Proporção. O slot do card é 3.42:1. A foto que estava no card 02 era
      retrato 1122x1402, então `cover` descartava 77% dela e o que sobrava
      era uma tira de madeira escura. Ficava com cara de textura quebrada, e
      ninguém percebe olhando o arquivo original, que é bonito.

   2. Descoberta. Imagem de fundo em CSS não passa pelo preload scanner do
      navegador: ela só existe depois que o CSS é parseado. Medido no ar,
      as duas começavam a baixar aos ~2,0s estando acima da dobra.

   3. Contraste. O scrim já está no limite: medindo o pixel mais claro sob
      cada texto, o h3 dá 4,6:1. Clarear a metade direita (que é a tentação
      óbvia, porque a foto está enterrada) derruba para 3,2:1. Por isso o
      ganho veio do recorte, não de abrir o scrim. */

const lp = fs.readFileSync(new URL('../index.template.html', import.meta.url), 'utf8');

const IMAGENS = [
  '/assets/dashboard-faca-agora-editorial.webp',
  '/assets/lp-jornada-curriculo.webp'
];

describe('fundos das jornadas da LP', () => {
  for (const src of IMAGENS) {
    it(`${src.split('/').pop()} tem preload`, () => {
      const re = new RegExp(`<link rel="preload"[^>]+href="${src}"`);
      assert.match(lp, re, 'sem preload a foto só é descoberta depois do CSS');
    });
  }

  it('o card 02 usa o recorte paisagem, não o retrato do /curriculo', () => {
    const bloco = lp.match(/\.path:nth-child\(2\)::before\{[^}]*\}/);
    assert.ok(bloco, 'regra do card 02 sumiu');
    assert.match(bloco[0], /lp-jornada-curriculo\.webp/);
    assert.doesNotMatch(
      bloco[0], /curriculum-master-workspace\.webp/,
      'esse arquivo é retrato 1122x1402: num slot 3.42:1 sobra 23% da foto'
    );
  });

  it('o retrato original continua servindo o /curriculo', () => {
    // O recorte da LP é um arquivo novo justamente para não quebrar isto.
    const css = fs.readFileSync(new URL('../assets/curriculum-master.css', import.meta.url), 'utf8');
    assert.match(css, /curriculum-master-workspace\.webp/);
  });

  it('o scrim continua fechado o bastante para o texto', () => {
    // O h3 ocupa a largura inteira do card, então a última parada do
    // gradiente é o que decide a legibilidade do título.
    const scrim = lp.match(/\.path::after\{[\s\S]*?\}/);
    assert.ok(scrim, 'scrim das jornadas sumiu');
    const ultima = scrim[0].match(/rgba\(5,22,14,\.(\d+)\) 100%/);
    assert.ok(ultima, 'parada de 100% do gradiente horizontal sumiu');
    assert.ok(
      Number('0.' + ultima[1]) >= 0.40,
      `scrim aberto demais na direita (${ultima[1]}): a 0.28 o h3 cai de 4,6:1 para 3,2:1`
    );
  });

  it('só uma regra pinta o fundo do card', () => {
    // Havia três `background` empilhados em `.path` e só o último valia.
    // Quem fosse mudar a cor amanhã editaria o morto.
    const regras = lp.match(/^\s*\.path\{[\s\S]*?\}/gm) || [];
    const comFundo = regras.filter((r) => /\n?\s*background:/.test(r));
    assert.equal(
      comFundo.length, 1,
      `${comFundo.length} regras .path definem background; só a última renderiza`
    );
  });
});
