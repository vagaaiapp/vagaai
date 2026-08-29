import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const productPages = new Map([
  ['dashboard/index.html', 'dashboard'],
  ['app/index.html', 'analysis'],
  ['curriculo/index.html', 'curriculum'],
  ['cv/index.html', 'cv-editor'],
  ['entrevista/index.html', 'interview'],
  ['carta/index.html', 'cover-letter'],
  ['onboarding/vaga/index.html', 'onboarding'],
  ['onboarding/curriculo/index.html', 'onboarding'],
  ['login/index.html', 'auth']
]);

test('rotas ativas carregam a fundação visual depois dos estilos locais', () => {
  for (const [file, page] of productPages) {
    const html = read(file);
    const href = '<link rel="stylesheet" href="/assets/product-ui.css?v=20260829-shell3">';
    const head = html.slice(0, html.indexOf('</head>'));
    assert.equal(html.split(href).length - 1, 1, `${file} deve carregar a fundação uma vez`);
    assert.match(html, new RegExp(`<body data-vagaai-ui="${page}">`));
    assert.ok(head.indexOf(href) > head.lastIndexOf('</style>'), `${file} deve aplicar a fundação depois do CSS local`);
  }
});

test('a fundação é visual, escopada e não injeta conteúdo', () => {
  const css = read('assets/product-ui.css');
  assert.match(css, /body\[data-vagaai-ui\]/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /:focus-visible/);
  assert.doesNotMatch(css, /content\s*:\s*['"][^'"]+['"]/);
  assert.doesNotMatch(css, /\.(?:classic|compact|minimal|focus)-(?:name|role|sec|resumo|exp)/);
});

test('o shell global traduz a identidade editorial sem depender do conteúdo dos módulos', () => {
  const css = read('assets/product-ui.css');
  for (const token of ['--vui-paper', '--vui-forest', '--vui-emerald', '--vui-mint', '--vui-line']) {
    assert.match(css, new RegExp(token.replace('--', '--')));
  }
  assert.match(css, /Global product shell · editorial identity v3/);
  assert.match(css, /body\[data-vagaai-ui\] :is\(\.sidebar, \.app-sidebar, \.cv-nav\)/);
  assert.match(css, /body\[data-vagaai-ui\] :is\(\.header, \.app-header, \.top-nav, \.standalone-nav, \.base-studio-topbar\)/);
  assert.match(css, /body\[data-vagaai-ui\] :is\(\.vm-bottom, \.dm-bottom\)/);
});

test('contratos funcionais centrais continuam presentes nas páginas estilizadas', () => {
  assert.match(read('dashboard/index.html'), /function switchDashTab\(/);
  assert.match(read('dashboard/index.html'), /function buildPBACard\(/);
  assert.match(read('app/index.html'), /id="analyzeBtn"/);
  assert.match(read('curriculo/index.html'), /function render\(/);
  assert.match(read('cv/index.html'), /function goBackToCurriculos\(/);
  assert.match(read('entrevista/index.html'), /async function generateInterview\(/);
  assert.match(read('carta/index.html'), /async function generate\(/);
  assert.match(read('onboarding/vaga/index.html'), /function goStep\(/);
  assert.match(read('onboarding/curriculo/index.html'), /function goStep\(/);
  assert.match(read('login/index.html'), /async function handleAuth\(/);
});
