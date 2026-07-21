// /api/sitemap — gera o sitemap.xml dinamicamente.
// Substitui o sitemap.xml estático (que não incluía os posts do blog
// individualmente, só o índice /blog). Busca os posts publicados no
// Supabase e adiciona cada um com lastmod real (created_at).
//
// Falha aberta: se o Supabase não responder, o sitemap sai só com as
// páginas estáticas em vez de dar erro 500 — nunca queremos derrubar
// o sitemap inteiro por causa de uma falha pontual no fetch dos posts.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

const SITE = 'https://www.vagaai.app.br';

// Páginas estáticas indexáveis (confirmado via meta robots de cada uma —
// /curriculo, /cv, /carta, /entrevista são noindex, ficam de fora).
const STATIC_PAGES = [
  { loc: '/', changefreq: 'weekly', priority: '1.0' },
  { loc: '/app', changefreq: 'monthly', priority: '0.9' },
  { loc: '/paraempresas', changefreq: 'monthly', priority: '0.6' },
  { loc: '/blog', changefreq: 'weekly', priority: '0.7' },
  { loc: '/termos', changefreq: 'monthly', priority: '0.4' },
];

function escXml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function toLastmod(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

async function fetchBlogPosts() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return [];
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/blog_posts?published=eq.true&select=slug,created_at&order=created_at.desc&limit=500`,
      { headers: { apikey: SUPABASE_ANON_KEY }, signal: controller.signal }
    );
    clearTimeout(timeout);
    if (!r.ok) return [];
    const posts = await r.json();
    return Array.isArray(posts) ? posts : [];
  } catch (e) {
    console.error('sitemap: falha ao buscar posts do blog', e.message);
    return [];
  }
}

export default async function handler(req, res) {
  const posts = await fetchBlogPosts();

  const staticUrls = STATIC_PAGES.map(p =>
    `  <url>\n    <loc>${SITE}${p.loc}</loc>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>`
  );

  const postUrls = posts
    .filter(p => p.slug)
    .map(p => {
      const lastmod = toLastmod(p.created_at);
      return `  <url>\n    <loc>${SITE}/blog/post?s=${escXml(encodeURIComponent(p.slug))}</loc>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>${lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : ''}\n  </url>`;
    });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...staticUrls, ...postUrls].join('\n')}\n</urlset>\n`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400');
  res.status(200).send(xml);
}
