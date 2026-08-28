import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const css = fs.readFileSync(path.join(root, 'onboarding', 'editorial-id.css'), 'utf8');
const vaga = fs.readFileSync(path.join(root, 'onboarding', 'vaga', 'index.html'), 'utf8');
const curriculo = fs.readFileSync(path.join(root, 'onboarding', 'curriculo', 'index.html'), 'utf8');

test('os dois funis usam a mesma camada da nova identidade editorial', () => {
  for (const html of [vaga, curriculo]) {
    assert.match(html, /EB\+Garamond/);
    assert.match(html, /Figtree/);
    assert.match(html, /\/onboarding\/editorial-id\.css\?v=20260828-id2/);
    assert.ok(html.indexOf('/onboarding/editorial-id.css') > html.indexOf('/assets/product-ui.css'));
  }
});

test('a marca permanece centralizada e o resumo da jornada não acompanha o scroll', () => {
  assert.match(css, /\.ob-top-inner\s*\{[^}]*display:\s*grid\s*!important;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto minmax\(0, 1fr\)/s);
  assert.match(css, /\.ob-brand-cluster\s*\{[^}]*grid-column:\s*2;[^}]*justify-self:\s*center/s);
  assert.match(css, /\.ob-journey-summary\s*\{[^}]*position:\s*relative\s*!important;[^}]*top:\s*auto\s*!important/s);
});

test('a identidade mantém a paleta, tipografia e geometria aprovadas da LP', () => {
  assert.match(css, /--ob-page:\s*#ffffeb/);
  assert.match(css, /--ob-forest:\s*#034f46/);
  assert.match(css, /--ob-mint:\s*#77edb9/);
  assert.match(css, /--ob-serif:\s*'EB Garamond'/);
  assert.match(css, /--ob-sans:\s*'Figtree'/);
  assert.match(css, /border:\s*2px solid var\(--ob-ink\)/);
  assert.match(css, /border-radius:\s*40px/);
});

test('a camada é visual, compartilhada e preserva os contratos dos funis', () => {
  assert.doesNotMatch(css, /content:\s*["'][^"']*[A-Za-zÀ-ÿ][^"']*["']/);
  assert.doesNotMatch(css, /display:\s*none[^}]*\.ob-step/);
  for (const html of [vaga, curriculo]) {
    assert.match(html, /data-vagaai-ui="onboarding"/);
    assert.match(html, /id="backBtn"/);
    assert.match(html, /id="themeBtn"/);
    assert.match(html, /class="ob-step active" id="step1"/);
    assert.match(html, /gtag\('config','G-XCT8K58VWF'\)/);
  }
});

test('a identidade cobre modo escuro, mobile e movimento reduzido', () => {
  assert.match(css, /\[data-theme="dark"\]/);
  assert.match(css, /@media \(max-width:\s*760px\)/);
  assert.match(css, /@media \(max-width:\s*440px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
});
