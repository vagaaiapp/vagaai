import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const pages = [
  'dashboard/index.html',
  'admin/index.html',
  'admin/blog/index.html',
  'app/index.html',
  'carta/index.html',
  'entrevista/index.html',
  'curriculo/index.html',
  'cv/index.html',
  'onboarding/vaga/index.html',
  'onboarding/curriculo/index.html',
  'blog/index.html',
  'blog/post/index.html'
];

test('todas as superfícies com carregamento usam os recursos compartilhados', () => {
  for (const page of pages) {
    const html = read(page);
    assert.match(html, /href="\/loading-comet\.css"/, `${page} não carrega o CSS global`);
    assert.match(html, /src="\/js\/loading-comet\.js"/, `${page} não carrega o aprimoramento dinâmico`);
  }
});

test('o componente usa o Lottie enviado com player completo e fallback local', () => {
  const css = read('loading-comet.css');
  const script = read('js/loading-comet.js');
  assert.match(script, /lottie-web@5\.13\.0\/build\/player\/lottie\.min\.js/);
  assert.match(script, /ANIMATION_PATH = '\/assets\/vagaai-loading-rocket\.json'/);
  assert.match(script, /lottie\.loadAnimation/);
  assert.match(script, /animationData: animationData/);
  assert.match(css, /\.vagaai-lottie-host/);
  assert.match(css, /@keyframes vagaai-loader-fallback/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
});

test('a arte preserva dimensões, duração, expressões e imagens incorporadas', () => {
  const animation = JSON.parse(read('assets/vagaai-loading-rocket.json'));
  assert.equal(animation.w, 292);
  assert.equal(animation.h, 307);
  assert.equal(animation.fr, 29.9700012207031);
  assert.equal(animation.op, 241.000009816131);
  assert.ok(Math.abs((animation.op - animation.ip) / animation.fr - 8.041374708041374) < 0.000001);

  const embedded = animation.assets.filter((asset) => /^data:image\/png;base64,/.test(asset.p || ''));
  assert.equal(embedded.length, 3);
  const serialized = JSON.stringify(animation);
  assert.match(serialized, /loopOut\('cycle'\)/);
  assert.match(serialized, /valueAtTime/);
});

test('formas vetoriais foram convertidas para a paleta verde do VagaAI', () => {
  const animation = JSON.parse(read('assets/vagaai-loading-rocket.json'));
  const colors = [];

  function collect(node) {
    if (!node || typeof node !== 'object') return;
    if ((node.ty === 'fl' || node.ty === 'st') && node.c && node.c.a === 0 && Array.isArray(node.c.k)) {
      colors.push(node.c.k.slice(0, 3));
    }
    for (const value of Object.values(node)) collect(value);
  }
  collect(animation);

  assert.ok(colors.length >= 6);
  for (const [red, green, blue] of colors) {
    assert.ok(green >= red, `cor fora da identidade: ${red},${green},${blue}`);
    assert.ok(green >= blue, `cor fora da identidade: ${red},${green},${blue}`);
  }
});

test('somente um foguete é criado por estado de carregamento', () => {
  const script = read('js/loading-comet.js');
  assert.match(script, /function hasAnimatedLoader/);
  assert.match(script, /parent\.children\.length/);
  assert.match(script, /parent\.children\[i\] !== element/);
  assert.equal((script.match(/lottie\.loadAnimation\(/g) || []).length, 1);
  assert.doesNotMatch(script, /vagaai-starfield/);
});

test('animações antigas do meteorito e estrelas foram removidas', () => {
  const css = read('loading-comet.css');
  assert.doesNotMatch(css, /vagaai-comet-(?:tail|head)/);
  assert.doesNotMatch(css, /vagaai-stars-[ab]/);
  assert.doesNotMatch(css, /clip-path:\s*polygon/);
  assert.doesNotMatch(css, /vagaai-starfield/);
});

test('ações compactas mantêm uma versão proporcional do mesmo foguete', () => {
  const css = read('loading-comet.css');
  assert.match(css, /\.vagaai-comet--sm[\s\S]*--rocket-loader-w:\s*32px[\s\S]*--rocket-loader-h:\s*34px/);
  assert.match(css, /ga4-loading\.vagaai-loading-leaf[\s\S]*--rocket-loader-w:\s*52px[\s\S]*--rocket-loader-h:\s*55px/);
});

test('carregamentos textuais dinâmicos também recebem e removem o foguete', () => {
  const script = read('js/loading-comet.js');
  assert.match(script, /MutationObserver/);
  assert.match(script, /mutation\.addedNodes/);
  assert.match(script, /destroyLoader\(oldRocket\)/);
  assert.match(script, /vagaai-loading-leaf/);
});

test('os antigos círculos giratórios não permanecem nas páginas migradas', () => {
  const obsolete = /animation\s*:\s*(?:spin|obSpin|obSpinSm)|@keyframes\s+(?:spin|obSpin|obSpinSm)|[⠋⠙⠸⠴⠦⠇]/i;
  for (const file of [...pages, 'onboarding/funnel-polish.css']) {
    assert.doesNotMatch(read(file), obsolete, `${file} ainda contém o carregamento circular antigo`);
  }
});

test('estados dinâmicos importantes continuam usando o carregador compacto', () => {
  const app = read('app/index.html');
  const voice = read('js/cv-voice.js');
  const admin = read('admin/index.html');
  assert.match(app, /vagaai-comet vagaai-comet--sm[^>]*aria-hidden="true"[^>]*>[^<]*<\/span> Gerando/);
  assert.match(app, /vagaai-comet vagaai-comet--sm[^>]*aria-hidden="true"[^>]*>[^<]*<\/span> Carregando vaga/);
  assert.match(voice, /state === 'busy'[\s\S]*vagaai-comet vagaai-comet--sm/);
  assert.match(admin, /refresh-comet/);
});
