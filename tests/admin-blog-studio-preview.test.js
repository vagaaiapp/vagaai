import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const html = read('admin/blog/index.html');
const css = read('assets/admin-blog-studio-preview.css');
const script = read('js/admin-blog-studio-preview.js');

test('studio editorial e a interface oficial do admin do blog', () => {
  assert.match(html, /<html lang="pt-BR" data-blog-studio-preview>/);
  assert.doesNotMatch(html, /get\('preview'\)===['"]studio['"]/);
  assert.match(css, /html\[data-blog-studio-preview\]/);
  assert.match(script, /hasAttribute\('data-blog-studio-preview'\)/);
  assert.match(html, /src="\/js\/admin-blog-studio-preview\.js"/);
});

test('centro de producao usa dados reais e mantem as acoes existentes', () => {
  assert.match(html, /cover_url,categories,excerpt/);
  assert.match(script, /window\._posts/);
  assert.match(script, /window\._viewsData/);
  assert.match(script, /editPost\(/);
  assert.match(script, /\/blog\/post\?s=/);
  assert.match(html, /onclick="newPost\(\)"/);
  assert.match(html, /onclick="savePost\(true\)"/);
  assert.match(html, /onclick="savePost\(false\)"/);
});

test('listagem oferece busca filtros ordenacao e leitura editorial', () => {
  assert.match(script, /id="studioSearch"/);
  assert.match(script, /data-filter="published"/);
  assert.match(script, /data-filter="draft"/);
  assert.match(script, /value="views"/);
  assert.match(script, /studioMetricDrafts/);
  assert.match(script, /studioPriorityTitle/);
  assert.match(script, /studioArticleListTitle/);
});

test('editor oferece checklist derivado sem criar novo estado de produto', () => {
  assert.match(script, /studioChecklistScore/);
  assert.match(script, /words >= 300/);
  assert.match(script, /seoTitle\.length >= 30 && seoTitle\.length <= 60/);
  assert.match(script, /desc\.length >= 80 && desc\.length <= 160/);
  assert.match(script, /refineEditorLabels/);
  assert.doesNotMatch(script, /fetch\s*\(/);
  assert.doesNotMatch(script, /localStorage\.(?:setItem|removeItem)/);
});

test('identidade cobre quatro larguras tema escuro e movimento reduzido', () => {
  assert.match(css, /@media \(max-width: 1180px\)/);
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /@media \(max-width: 480px\)/);
  assert.match(css, /:not\(\[data-theme="light"\]\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.doesNotMatch(css, /linear-gradient|radial-gradient/);
});
