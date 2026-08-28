import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('blog/index.html');
const css = read('assets/blog-editorial.css');
const script = read('js/blog-editorial.js');

test('blog usa a fundação editorial aprovada da LP', () => {
  assert.match(html, /href="\/assets\/lp-editorial\.css"/);
  assert.match(html, /href="\/assets\/blog-editorial\.css"/);
  assert.match(html, /family=EB\+Garamond/);
  assert.match(html, /family=EB\+Garamond[^"']*Figtree/);
  assert.match(css, /border:\s*2px solid var\(--ink\)/);
  assert.match(css, /border-radius:\s*48px/);
  assert.doesNotMatch(css, /box-shadow/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});

test('listagem dinâmica, filtros e URLs dos posts permanecem funcionais', () => {
  assert.match(script, /published=eq\.true/);
  assert.match(script, /order=created_at\.desc/);
  assert.match(script, /new URLSearchParams\(location\.search\)\.get\('cat'\)/);
  assert.match(script, /history\.replaceState/);
  assert.match(script, /\/blog\/post\?s=/);
  assert.match(script, /safeMediaUrl/);
  assert.match(script, /class="post-card\$\{featured \? ' is-featured' : ''\}"/);
});

test('blog preserva aquisição, métricas e consentimento', () => {
  assert.match(html, /G-XCT8K58VWF/);
  assert.match(html, /src="\/js\/eventos\.js"/);
  assert.match(html, /src="\/cookie-consent\.js"/);
  assert.match(html, /href="\/onboarding\/vaga\/1\?entry=cv&amp;new=1"/);
  assert.match(script, /'blog_filtro'/);
  assert.match(script, /'blog_artigo_aberto'/);
  assert.match(script, /'cta_funil'/);
});

test('blog cobre desktop, tablet, mobile e movimento reduzido', () => {
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /min-height:\s*44px/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-current="page"/);
});
