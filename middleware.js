// /middleware.js — intercepta "/", "/sitemap.xml" e "/blog/post" na borda
// (Edge Middleware).
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
// 3) "/blog/post" — a causa raiz de NENHUM post estar indexado: a página era
//    100% client-side (título "Blog — VagaAI" genérico, canonical apontando
//    pra /blog em vez do próprio post, corpo só "Carregando…" no HTML bruto).
//    O Google decide indexação pelo HTML que recebe primeiro — via canonical
//    ele explicitamente dizia "não me indexe, o conteúdo real é /blog".
//    Agora título, canonical, OG, description e o artigo inteiro já chegam
//    prontos. Novos posts funcionam automaticamente, sem alterar código.
//
// Falha aberta: qualquer erro (Supabase fora do ar, timeout etc.) cai no
// catch e serve o template puro (sem seção de blog / sem dados do post, mas
// nunca derruba a página) — o site nunca pode ficar fora do ar por causa disso.

export const config = { matcher: ['/', '/sitemap.xml', '/blog/post'] };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SITE = 'https://www.vagaai.app.br';
// Timeouts separados por rota. A home e o /blog/post caem em falha aberta (a
// pagina renderiza sem a secao de blog / o client rebusca), entao esperar 4s
// so serve para segurar o TTFB de um visitante numa revalidacao de cache — 1,5s
// ja cobre com folga uma consulta que normalmente responde em ~150ms.
// O sitemap nao tem fallback util: sem os dados ele sai vazio e o Google perde
// os posts, entao ali vale a pena esperar mais. Ninguem esta olhando a tela.
const FETCH_TIMEOUT_MS = 1500;
const SITEMAP_TIMEOUT_MS = 5000;

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

async function supabaseFetch(path, timeoutMs = FETCH_TIMEOUT_MS) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
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
    // Página de captação, indexável (index, follow) e até aqui fora do sitemap:
    // ficava dependendo de link interno para ser descoberta.
    { loc: '/criar-curriculo', changefreq: 'monthly', priority: '0.8' },
    { loc: '/paraempresas', changefreq: 'monthly', priority: '0.6' },
    { loc: '/blog', changefreq: 'weekly', priority: '0.7' },
    { loc: '/termos', changefreq: 'monthly', priority: '0.4' },
  ];

  const posts = (await supabaseFetch('/rest/v1/blog_posts?published=eq.true&select=slug,created_at&order=created_at.desc&limit=500', SITEMAP_TIMEOUT_MS)) || [];

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

// Constrói o mesmo HTML que o client-side monta hoje (ver blog/post/index.html,
// função anônima async no fim do arquivo) — mantém as duas versões idênticas
// visualmente; o client continua rodando por cima e não muda nada pra quem
// já carregou a página (só reidrata o mesmo conteúdo).
function renderPostArticle(p) {
  const cats = parseCats(p.categories);
  const date = new Date(p.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const coverHtml = p.cover_url ? `<img class="post-cover" src="${escHtml(p.cover_url)}" alt="${escHtml(p.title)}">` : '';
  const catHtml = cats.length ? `<div class="post-cat">${escHtml(cats[0])}</div>` : '';
  // p.content é HTML de rich-text escrito pelo admin no CMS interno (não é
  // input de usuário público) — mesmo modelo de confiança do client-side,
  // que já injeta via innerHTML sem escapar.
  return `${catHtml}${coverHtml}<h1 class="post-title">${escHtml(p.title)}</h1>`
    + `<div class="post-meta"><span>📅 ${date}</span></div>`
    + `<div class="post-content">${p.content || ''}</div>`
    + `<div class="post-cta"><h3>Teste o VagaAI gratuitamente</h3>`
    + `<p>Cole a vaga e seu currículo. Receba score ATS, falhas e sugestões em 30 segundos.</p>`
    + `<a class="btn btn-primary" href="/app">Analisar minha vaga →</a></div>`;
}

function renderArticleLd(p, postUrl) {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: p.title,
    description: p.excerpt || '',
    image: p.cover_url ? [p.cover_url] : undefined,
    datePublished: p.created_at,
    dateModified: p.updated_at || p.created_at,
    author: { '@type': 'Organization', name: 'VagaAI' },
    publisher: { '@type': 'Organization', name: 'VagaAI', logo: { '@type': 'ImageObject', url: `${SITE}/favicon.svg` } },
    mainEntityOfPage: { '@type': 'WebPage', '@id': postUrl },
  };
  // JSON.stringify nunca produz "</script>" sozinho; ainda assim escapamos "<"
  // por segurança caso o conteúdo do post algum dia entre em algum campo aqui.
  return `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
}

async function handleBlogPost(request) {
  const url = new URL(request.url);
  const slug = url.searchParams.get('s');

  const templateRes = await fetch(new URL('/blog/post/index.html', request.url));
  if (!templateRes.ok) throw new Error('blog post template fetch failed: ' + templateRes.status);
  let html = await templateRes.text();

  if (!slug) {
    // Sem slug não há o que renderizar — deixa o client-side mostrar "não
    // encontrado" (mesmo comportamento de hoje), só marca como não-indexável.
    html = html.replace('<meta name="description"', '<meta name="robots" content="noindex, follow">\n  <meta name="description"');
    return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  // supabaseFetch nunca lança (já tem try/catch interno) — devolve `null` em
  // erro de infra (timeout, HTTP não-ok, rede fora do ar) e um array (mesmo
  // que vazio) em consulta bem-sucedida. Precisamos diferenciar os dois: erro
  // de infra é falha aberta (200, o client tenta de novo), slug realmente
  // inexistente é 404 de verdade. Tratar os dois iguais faria uma instabili-
  // dade passageira do Supabase derrubar posts publicados dos resultados do
  // Google (exatamente o tipo de bug que essa mudança inteira existe pra evitar).
  const rows = await supabaseFetch(`/rest/v1/blog_posts?slug=eq.${encodeURIComponent(slug)}&published=eq.true&select=*`);
  if (rows === null) {
    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const post = rows.length ? rows[0] : null;
  if (!post) {
    html = html.replace('<meta name="description"', '<meta name="robots" content="noindex, follow">\n  <meta name="description"');
    return new Response(html, { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const postUrl = `${SITE}/blog/post?s=${encodeURIComponent(post.slug)}`;
  const title = escHtml(post.seo_title || post.title);
  const description = escHtml(post.excerpt || '');
  const image = post.cover_url || `${SITE}/og.png`;

  html = html
    .replace('<title>Blog — VagaAI</title>', `<title>${title} — Blog VagaAI</title>`)
    .replace('<link rel="canonical" id="canonicalLink" href="https://www.vagaai.app.br/blog">', `<link rel="canonical" id="canonicalLink" href="${postUrl}">`)
    .replace('<meta property="og:url" id="ogUrl" content="https://www.vagaai.app.br/blog">', `<meta property="og:url" id="ogUrl" content="${postUrl}">`)
    .replace('<meta property="og:title" id="ogTitle" content="Blog VagaAI">', `<meta property="og:title" id="ogTitle" content="${title}">`)
    .replace('<meta property="og:image" id="ogImage" content="https://www.vagaai.app.br/og.png">', `<meta property="og:image" id="ogImage" content="${escHtml(image)}">`);

  if (post.excerpt) {
    html = html
      .replace('<meta name="description" content="Blog VagaAI — dicas de carreira e currículo.">', `<meta name="description" content="${description}">`)
      .replace('<meta property="og:description" id="ogDesc" content="Blog VagaAI — dicas de carreira e currículo.">', `<meta property="og:description" id="ogDesc" content="${description}">`);
  }

  html = html
    .replace('<div id="postContent" class="loading-state">Carregando…</div>', `<div id="postContent">${renderPostArticle(post)}</div>`)
    .replace('</head>', `  ${renderArticleLd(post, postUrl)}\n</head>`);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=300, stale-while-revalidate=86400',
    },
  });
}

export default async function middleware(request) {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/sitemap.xml') return await handleSitemap();
    if (url.pathname === '/blog/post') return await handleBlogPost(request);
    return await handleHome(request);
  } catch (e) {
    console.error('middleware: falha inesperada', e.message);
    if (url.pathname === '/sitemap.xml') {
      return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n', {
        status: 200,
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
      });
    }
    if (url.pathname === '/blog/post') {
      try {
        const fallback = await fetch(new URL('/blog/post/index.html', request.url));
        return new Response(await fallback.text(), { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      } catch (_) {
        return new Response('Erro temporário ao carregar a página. Tente novamente em instantes.', { status: 500 });
      }
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
