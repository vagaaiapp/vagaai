// /api/home — serve a landing page (rewrite de "/", ver vercel.json).
//
// Por quê: a seção "Do blog" da home antes buscava os posts no Supabase via
// fetch() no client e injetava com innerHTML depois do carregamento. Isso
// deixa os links para os posts invisíveis pra qualquer crawler que não
// execute JS (e mesmo o Googlebot só pega em uma segunda onda de indexação).
// Essa função lê o template estático, busca os posts publicados no servidor
// e já entrega o HTML final com os <a href> reais prontos no primeiro
// carregamento.
//
// Falha aberta: se o Supabase não responder, a home sai sem a seção de blog
// (mesmo comportamento de antes — a landing nunca mostra estado vazio/erro,
// é a página de maior conversão do site) em vez de dar erro 500.

import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const TEMPLATE_PATH = join(process.cwd(), 'index.template.html');
let templateCache = null;

function getTemplate() {
  if (!templateCache) templateCache = readFileSync(TEMPLATE_PATH, 'utf8');
  return templateCache;
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseCats(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

async function fetchLatestPosts() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?published=eq.true&select=title,slug,excerpt,cover_url,categories,created_at&order=created_at.desc&limit=3`,
      { headers: { apikey: SUPABASE_ANON_KEY }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!r.ok) return [];
    const posts = await r.json();
    return Array.isArray(posts) ? posts : [];
  } catch (e) {
    console.error('home: falha ao buscar posts do blog', e.message);
    return [];
  }
}

function renderBlogSection(posts) {
  if (!posts.length) return '';
  const cards = posts.map(p => {
    const date = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
    const cats = parseCats(p.categories);
    const cover = p.cover_url
      ? `<img class="blog-card-cover" src="${escHtml(p.cover_url)}" alt="${escHtml(p.title)}" loading="lazy">`
      : '';
    return `<a class="blog-card glow" href="/blog/post?s=${encodeURIComponent(p.slug)}">${cover}<div class="blog-card-body">${
      cats.length ? `<div class="blog-card-cat">${escHtml(cats[0])}</div>` : ''
    }<div class="blog-card-title">${escHtml(p.title)}</div>${
      p.excerpt ? `<div class="blog-card-excerpt">${escHtml(p.excerpt)}</div>` : ''
    }<div class="blog-card-date">${date}</div></div></a>`;
  }).join('');

  return `<!-- BLOG (renderizado no servidor, ver api/home.js) -->
    <section class="section" id="blog"><div class="wrap">
      <div class="center reveal"><span class="eyebrow">Do blog</span><h2>Dicas para vencer o ATS <span class="green">e chegar à entrevista.</span></h2><p class="lead">Currículo, entrevista e estratégia de candidatura, direto do nosso blog.</p></div>
      <div class="blog-grid">${cards}</div>
      <div class="center" style="margin-top:32px"><a class="btn" href="/blog">Ver todos os posts →</a></div>
    </div></section>`;
}

export default async function handler(req, res) {
  let html;
  try {
    html = getTemplate();
  } catch (e) {
    console.error('home: falha ao ler template', e.message);
    return res.status(500).send('Erro ao carregar a página.');
  }

  const posts = await fetchLatestPosts();
  html = html.replace('<!--BLOG_SECTION-->', renderBlogSection(posts));

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400');
  res.status(200).send(html);
}
