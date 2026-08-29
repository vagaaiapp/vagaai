import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const css = read('assets/editorial-public.css');

const migratedPages = [
  ['blog/post/index.html', 'page-article'],
  ['paraempresas/index.html', 'page-company'],
  ['criar-curriculo/index.html', 'page-cv'],
  ['termos/index.html', 'page-legal'],
  ['obrigado/index.html', 'page-status'],
  ['cancelado/index.html', 'page-status'],
  ['404.html', 'page-not-found']
];

test('superfícies públicas antigas usam a fundação editorial compartilhada', () => {
  for (const [file, pageClass] of migratedPages) {
    const html = read(file);
    assert.match(html, /family=EB\+Garamond[^"']*Figtree/, `${file} deve usar as fontes editoriais`);
    assert.match(html, /\/assets\/editorial-public\.css\?v=20260829-id1/, `${file} deve carregar a fundação pública`);
    assert.match(html, new RegExp(`class="[^"]*editorial-public[^"]*${pageClass}`), `${file} deve declarar seu escopo visual`);
  }
});

test('LP e listagem do blog permanecem na identidade aprovada', () => {
  for (const file of ['index.template.html', 'blog/index.html']) {
    const html = read(file);
    assert.match(html, /data-theme="light"/);
    assert.match(html, /\/assets\/lp-editorial\.css/);
    assert.match(html, /family=EB\+Garamond[^"']*Figtree/);
  }
  assert.match(read('blog/index.html'), /\/assets\/blog-editorial\.css/);
});

test('fundação segue os tokens, a geometria e as restrições da skill', () => {
  assert.match(css, /--cream:\s*#ffffeb/);
  assert.match(css, /--ink:\s*#1a1a1a/);
  assert.match(css, /--forest:\s*#034f46/);
  assert.match(css, /--ember:\s*#ffa946/);
  assert.match(css, /--stone:\s*#e4e4d0/);
  assert.match(css, /border:\s*2px solid var\(--ink\)/);
  assert.match(css, /border-radius:\s*48px/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
  assert.doesNotMatch(css, /content:\s*["'][^"']*[A-Za-zÀ-ÿ][^"']*["']/);
  assert.match(css, /@media \(max-width: 1120px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 520px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test('artigo preserva conteúdo dinâmico, SEO e aquisição', () => {
  const html = read('blog/post/index.html');
  const middleware = read('middleware.js');
  assert.match(html, /published=eq\.true/);
  assert.match(html, /select=\*/);
  assert.match(html, /id="canonicalLink"/);
  assert.match(html, /class="post-content"/);
  assert.match(html, /href="\/app">Analisar minha vaga/);
  assert.match(html, /G-XCT8K58VWF/);
  assert.match(html, /src="\/cookie-consent\.js"/);
  assert.match(middleware, /replace\('<title>Blog \| VagaAI<\/title>'/);
  assert.match(middleware, /renderPostArticle\(post\)/);
  assert.match(middleware, /id="postContent"/);
});

test('LP para empresas mantém formulário, menu e ponto de contato', () => {
  const html = read('paraempresas/index.html');
  assert.match(html, /id="form-body"/);
  assert.match(html, /function showStep\(n\)/);
  assert.match(html, /function submitForm\(/);
  assert.match(html, /aria-controls="nav-links"/);
  assert.match(html, /companyNav\.classList\.toggle\('open'\)/);
  assert.match(html, /mailto:contato@vagaai\.app\.br/);
  assert.match(html, /G-XCT8K58VWF/);
});

test('rotas transacionais mantêm CTAs e medição de compra', () => {
  const success = read('obrigado/index.html');
  const cancelled = read('cancelado/index.html');
  assert.match(success, /gtag\('event', 'purchase', payload\)/);
  assert.match(success, /href="\/dashboard" class="btn"/);
  assert.match(success, /href="\/app" class="btn-ghost"/);
  assert.match(cancelled, /purchase_cancelled/);
  assert.match(cancelled, /href="\/app" class="btn"/);
  assert.match(cancelled, /href="\/dashboard" class="btn-ghost"/);
});
