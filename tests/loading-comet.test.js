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
    assert.match(html, /href="\/loading-comet\.css"/, `${page} não carrega o CSS do cometa`);
    assert.match(html, /src="\/js\/loading-comet\.js"/, `${page} não carrega o aprimoramento dinâmico`);
  }
});

test('o componente possui cauda, núcleo e alternativa sem movimento', () => {
  const css = read('loading-comet.css');
  assert.match(css, /@keyframes vagaai-comet-tail/);
  assert.match(css, /@keyframes vagaai-comet-head/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(css, /\.vagaai-comet--sm/);
});

test('o meteorito percorre uma trajetória descendente', () => {
  const css = read('loading-comet.css');
  assert.match(css, /--comet-start-y:\s*-12px[\s\S]*--comet-end-y:\s*32px/);
  assert.match(css, /@keyframes vagaai-comet-tail[\s\S]*rotate\(19deg\)[\s\S]*rotate\(27deg\)/);
  assert.match(css, /--comet-duration:\s*2\.4s/);
  assert.match(css, /clip-path:\s*polygon/);
});

test('a jornada preserva uma versão proporcional para ações compactas', () => {
  const css = read('loading-comet.css');
  assert.match(css, /\.vagaai-comet--sm[\s\S]*--comet-start-y:\s*-2px[\s\S]*--comet-end-y:\s*5px/);
  assert.match(css, /--comet-duration:\s*1\.35s/);
  assert.match(css, /--comet-tail-h:\s*10px[\s\S]*--comet-head:\s*8px/);
});

test('o corpo maior permanece reconhecível durante a passagem suave', () => {
  const css = read('loading-comet.css');
  assert.match(css, /--comet-w:\s*160px[\s\S]*--comet-head:\s*30px/);
  assert.match(css, /radial-gradient\(circle at 63% 34%/);
  assert.match(css, /var\(--comet-duration\) linear infinite/);
  assert.match(css, /92%[\s\S]*100%[\s\S]*opacity:\s*0/);
});

test('o fundo estrelado pisca em camadas sem poluir ações compactas', () => {
  const css = read('loading-comet.css');
  const script = read('js/loading-comet.js');
  assert.match(css, /\.vagaai-starfield::before[\s\S]*vagaai-stars-a/);
  assert.match(css, /\.vagaai-starfield::after[\s\S]*vagaai-stars-b/);
  assert.match(css, /button \.spinner > \.vagaai-starfield[\s\S]*display:\s*none/);
  assert.match(script, /function decorateLoader/);
  assert.match(script, /className = 'vagaai-starfield'/);
  assert.match(script, /aria-hidden/);
});

test('os antigos círculos giratórios não permanecem nas páginas migradas', () => {
  const obsolete = /animation\s*:\s*(?:spin|obSpin|obSpinSm)|@keyframes\s+(?:spin|obSpin|obSpinSm)|[⠋⠙⠸⠴⠦⠇]/i;
  for (const file of [...pages, 'onboarding/funnel-polish.css']) {
    assert.doesNotMatch(read(file), obsolete, `${file} ainda contém o carregamento circular antigo`);
  }
});

test('estados dinâmicos importantes renderizam a versão compacta do cometa', () => {
  const app = read('app/index.html');
  const voice = read('js/cv-voice.js');
  const admin = read('admin/index.html');
  assert.match(app, /vagaai-comet vagaai-comet--sm[^>]*aria-hidden="true"[^>]*>[^<]*<\/span> Gerando/);
  assert.match(app, /vagaai-comet vagaai-comet--sm[^>]*aria-hidden="true"[^>]*>[^<]*<\/span> Carregando vaga/);
  assert.match(voice, /state === 'busy'[\s\S]*vagaai-comet vagaai-comet--sm/);
  assert.match(admin, /refresh-comet/);
});

test('carregamentos textuais inseridos depois da página também recebem o cometa', () => {
  const script = read('js/loading-comet.js');
  assert.match(script, /MutationObserver/);
  assert.match(script, /mutation\.addedNodes/);
  assert.match(script, /vagaai-loading-leaf/);
  assert.match(script, /aria-hidden/);
});
