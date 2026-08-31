import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { sanitizeBlogHtml } from '../lib/blog-content.js';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('blog remove payloads ativos e URLs ofuscadas', () => {
  const malicious = [
    '<script>alert(1)</script>',
    '<img src="https://example.com/a.jpg" onerror="alert(1)">',
    '<iframe srcdoc="<img src=x onerror=alert(1)>"></iframe>',
    '<svg onload="alert(1)"><a href="javascript:alert(1)">x</a></svg>',
    '<a href="java&#x73;cript:alert(1)" target="_blank">clique</a>',
    '<p style="background:url(javascript:alert(1))" onclick="alert(1)">texto</p>',
  ].join('');
  const output = sanitizeBlogHtml(malicious);
  assert.doesNotMatch(output, /<(?:script|iframe|svg)\b|<(?:img|a|p)[^>]+\s(?:on\w+|style|srcdoc)\s*=|href="javascript:/i);
  assert.match(output, /<img src="https:\/\/example\.com\/a\.jpg" alt="" loading="lazy" decoding="async">/);
  assert.match(output, /<p>texto<\/p>/);
});

test('blog preserva rich text editorial permitido', () => {
  const legitimate = '<h2>Guia</h2><p>Leia <strong>antes</strong> e <em>revise</em>.</p>'
    + '<ul><li>Primeiro</li><li>Segundo</li></ul>'
    + '<blockquote>Um passo por vez.</blockquote>'
    + '<a href="https://example.com/guia?q=1&amp;x=2" target="_blank" title="Guia">Fonte</a>'
    + '<img src="https://example.com/capa.webp" alt="Capa">';
  const output = sanitizeBlogHtml(legitimate);
  assert.match(output, /<h2>Guia<\/h2>/);
  assert.match(output, /<strong>antes<\/strong>/);
  assert.match(output, /<ul><li>Primeiro<\/li><li>Segundo<\/li><\/ul>/);
  assert.match(output, /target="_blank" rel="noopener noreferrer"/);
  assert.match(output, /<img src="https:\/\/example\.com\/capa\.webp" alt="Capa" loading="lazy" decoding="async">/);
});

test('sanitizacao e idempotente', () => {
  const once = sanitizeBlogHtml('<p>Texto <a href="/blog" title="Leia &quot;agora&quot;">seguro</a>'
    + '<img src="https://example.com/a.webp?q=1&amp;x=2" alt="Um &gt; dois"></p>');
  assert.equal(sanitizeBlogHtml(once), once);
  assert.match(once, /title="Leia &quot;agora&quot;"/);
  assert.match(once, /alt="Um &gt; dois"/);
  assert.match(once, /a\.webp\?q=1&amp;x=2/);
});

test('barreira cobre escrita, SSR, fallback cliente e editor', () => {
  const middleware = read('middleware.js');
  const client = read('blog/post/index.html');
  const adminApi = read('api/admin.js');
  const adminEditor = read('admin/blog/index.html');
  const migration = read('migrations/036_ai_usage_observability.sql');
  assert.match(middleware, /sanitizeBlogHtml\(p\.content/);
  assert.match(client, /sanitizeBlogHtml\(p\.content/);
  assert.match(adminApi, /action === 'save_blog_post'[\s\S]*sanitizeBlogHtml/);
  assert.match(adminEditor, /sanitizeBlogHtml\(p\.content/);
  assert.match(adminEditor, /sanitizeBlogHtml\(code\.value/);
  assert.match(migration, /revoke insert, update, delete on public\.blog_posts from authenticated/i);
});
