import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/* Proteções do novo bloco de entrada e das duas fotografias editoriais de
   fundo. Os cartões dos funis são interface, sem foto; as imagens atmosféricas
   ficam apenas em "Vagas de vários portais" e no CTA final. */

const lp = fs.readFileSync(new URL('../index.template.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../assets/lp-editorial.css', import.meta.url), 'utf8');

describe('fundos e caminhos da LP editorial', () => {
  for (const nome of ['sources-nt-original.webp', 'next-step-motion-original.jpg']) {
    it(`${nome} existe na pasta pública`, () => {
      const url = new URL(`../assets/lp-editorial/${nome}`, import.meta.url);
      assert.ok(fs.statSync(url).size > 1000, `${nome} vazio ou ausente`);
    });
  }

  it('o bloco de portais usa a imagem original sem filtro CSS', () => {
    const regra = css.match(/\.sources::before\s*\{[^}]*\}/);
    assert.ok(regra, 'fundo do bloco de portais sumiu');
    assert.match(regra[0], /sources-nt-original\.webp/);
    assert.match(regra[0], /filter:\s*none/);
  });

  it('o próximo passo usa a fotografia aprovada sem filtro CSS', () => {
    const regra = css.match(/\.final-cta::before\s*\{[^}]*\}/);
    assert.ok(regra, 'fundo do CTA final sumiu');
    assert.match(regra[0], /next-step-motion-original\.jpg/);
    assert.match(regra[0], /filter:\s*none/);
  });

  it('os dois funis usam superfícies editoriais, não fotos', () => {
    const cards = lp.match(/<div class="journeys">[\s\S]*?<\/div>\s*<svg class="journey-merge"/);
    assert.ok(cards, 'bloco dos dois funis sumiu');
    assert.doesNotMatch(cards[0], /<img\b|background-image/, 'foto voltou para dentro dos cartões de decisão');
    assert.match(css, /\.journey-primary\s*\{[^}]*background:\s*var\(--forest-surface\)/);
  });

  it('a linha pontilhada e o ícone de confirmação continuam verdes', () => {
    assert.match(css, /\.final-journey-line path\s*\{[^}]*stroke:\s*#77edb9/);
    assert.match(css, /\.final-milestone span\s*\{[^}]*background:\s*#77edb9/);
  });

  it('movimento tem estado alternativo para redução de animação', () => {
    assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
    assert.match(css, /\.journey-traveler\s*\{\s*display:\s*none/);
  });

  it('o retrato original continua servindo apenas o editor de currículo', () => {
    const curriculumCss = fs.readFileSync(new URL('../assets/curriculum-master.css', import.meta.url), 'utf8');
    assert.match(curriculumCss, /curriculum-master-workspace\.webp/);
  });
});
