// /middleware.js — intercepta "/" e "/sitemap.xml" na borda (Edge Middleware).
//
// Por quê Edge Middleware e não uma Serverless Function em api/: o plano
// Hobby da Vercel tem limite de 12 Serverless Functions por deploy, e o
// projeto já estava exatamente nesse limite (por isso api/generate-cv-pdf.js
// está excluído no .vercelignore). Middleware roda num primitivo separado da
// Vercel, não conta nesse limite, então dá pra adicionar essa lógica sem
// mexer em nenhuma função existente.
//
// O que resolve:
// 1) "/" — a seção "Do blog" da home antes era montada só no client (fetch no
//    Supabase depois do carregamento, injetado com innerHTML). Isso deixava
//    os links pros posts invisíveis pra qualquer crawler que não execute JS.
//    Agora os <a href> reais já vêm prontos no primeiro HTML entregue.
// 2) "/sitemap.xml" — antes era um arquivo estático com 5 URLs fixas, sem os
//    posts do blog. Agora é gerado com os posts publicados + lastmod real.
//
// Falha aberta: qualquer erro (Supabase fora do ar, timeout etc.) cai no
// catch e serve o template puro sem a seção de blog, em vez de quebrar a
// home inteira — a landing nunca pode ficar fora do ar por causa disso.

export const config = { matcher: ['/', '/sitemap.xml'] };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE = 'https://www.vagaai.app.br';
const FETCH_TIMEOUT_MS = 4000;

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escXml(s) {
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

async function supabaseFetch(path) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const r = await fetch(`${SUPABASE_URL}${path}`, { headers: { apikey: SUPABASE_ANON_KEY }, signal: controller.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch (e) {
    console.error('middleware: falha ao consultar Supabase', e.message);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function renderBlogSection(posts) {
  if (!posts || !posts.length) return '';
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

  return `<!-- BLOG (renderizado na borda, ver middleware.js) -->
    <section class="section" id="blog"><div class="wrap">
      <div class="center reveal"><span class="eyebrow">Do blog</span><h2>Dicas para vencer o ATS <span class="green">e chegar à entrevista.</span></h2><p class="lead">Currículo, entrevista e estratégia de candidatura, direto do nosso blog.</p></div>
      <div class="blog-grid">${cards}</div>
      <div class="center" style="margin-top:32px"><a class="btn" href="/blog">Ver todos os posts →</a></div>
    </div></section>`;
}

async function handleHome(request) {
  const templateRes = await fetch(new URL('/index.template.html', request.url));
  if (!templateRes.ok) throw new Error('template fetch failed: ' + templateRes.status);
  let html = await templateRes.text();

  try {
    const posts = await supabaseFetch('/rest/v1/blog_posts?published=eq.true&select=title,slug,excerpt,cover_url,categories,created_at&order=created_at.desc&limit=3');
    html = html.replace('<!--BLOG_SECTION-->', renderBlogSection(posts));
  } catch (e) {
    html = html.replace('<!--BLOG_SECTION-->', '');
  }

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}

async function handleSitemap() {
  const staticPages = [
    { loc: '/', changefreq: 'weekly', priority: '1.0' },
    { loc: '/app', changefreq: 'monthly', priority: '0.9' },
    { loc: '/paraempresas', changefreq: 'monthly', priority: '0.6' },
    { loc: '/blog', changefreq: 'weekly', priority: '0.7' },
    { loc: '/termos', changefreq: 'monthly', priority: '0.4' },
  ];

  const posts = (await supabaseFetch('/rest/v1/blog_posts?published=eq.true&select=slug,created_at&order=created_at.desc&limit=500')) || [];

  const staticUrls = staticPages.map(p =>
    `  <url>\n    <loc>${SITE}${p.loc}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  );

  const postUrls = posts.filter(p => p.slug).map(p => {
    const d = new Date(p.created_at);
    const lastmod = isNaN(d.getTime()) ? '' : `\n    <lastmod>${d.toISOString().slice(0, 10)}</lastmod>`;
    return `  <url>\n    <loc>${SITE}/blog/post?s=${escXml(encodeURIComponent(p.slug))}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>${lastmod}\n  </url>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...postUrls].join('\n')}\n</urlset>\n`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/sitemap.xml') return await handleSitemap();
    return await handleHome(request);
  } catch (e) {
    console.error('middleware: falha inesperada', e.message);
    if (url.pathname === '/sitemap.xml') {
      return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n', {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
    try {
      const fallback = await fetch(new URL('/index.template.html', request.url));
      const text = (await fallback.text()).replace('<!--BLOG_SECTION-->', '');
      return new Response(text, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    } catch (_) {
      return new Response('Erro temporário ao carregar a página. Tente novamente em instantes.', { status: 500 });
    }
  }
}
