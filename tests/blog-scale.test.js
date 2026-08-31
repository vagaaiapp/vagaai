import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('listagem pagina artigos e oferece carregar mais', () => {
  const js = read('js/blog-editorial.js');
  const html = read('blog/index.html');
  assert.match(js, /POSTS_PAGE_SIZE = 24/);
  assert.match(js, /limit=\$\{POSTS_PAGE_SIZE\}&offset=\$\{nextPostsOffset\}/);
  assert.match(js, /hasMorePosts = page\.length === POSTS_PAGE_SIZE/);
  assert.match(html, /id="loadMorePosts"/);
});

test('sitemap nao para no post 500', () => {
  const middleware = read('middleware.js');
  assert.match(middleware, /for \(let offset = 0; offset < 50000; offset \+= pageSize\)/);
  assert.match(middleware, /limit=\$\{pageSize\}&offset=\$\{offset\}/);
  assert.doesNotMatch(middleware, /order=created_at\.desc&limit=500['"]/);
});

