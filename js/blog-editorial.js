const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const track = (name, props) => {
  if (typeof window.vagaaiTrack === 'function') return window.vagaaiTrack(name, props || {});
  try { if (typeof window.gtag === 'function') window.gtag('event', name, props || {}); } catch (_) {}
};

const hasActiveSession = () => {
  try {
    const raw = localStorage.getItem('sb-kbcjchjepgejdezeuwwh-auth-token');
    if (!raw) return false;
    const session = JSON.parse(raw);
    const expiresAt = session?.expires_at || session?.currentSession?.expires_at;
    return Boolean(session) && (!expiresAt || expiresAt * 1000 > Date.now());
  } catch (_) { return false; }
};

document.getElementById('year').textContent = new Date().getFullYear();

if (hasActiveSession()) {
  ['navEntrar', 'navMobileEntrar'].forEach(id => {
    const link = document.getElementById(id);
    if (link) link.hidden = true;
  });
  ['navComecar', 'navMobileComecar'].forEach(id => {
    const link = document.getElementById(id);
    if (!link) return;
    link.textContent = 'Ir para o painel';
    link.href = '/dashboard';
  });
}

const menuToggle = document.getElementById('menuToggle');
const navLinks = document.getElementById('navLinks');
const setMenuState = open => {
  navLinks.classList.toggle('is-open', open);
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  document.body.classList.toggle('menu-open', open);
};
menuToggle.addEventListener('click', () => setMenuState(!navLinks.classList.contains('is-open')));
navLinks.querySelectorAll('a').forEach(link => link.addEventListener('click', () => {
  setMenuState(false);
  track('nav_click', { destino: link.getAttribute('href') || '' });
}));
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && navLinks.classList.contains('is-open')) {
    setMenuState(false);
    menuToggle.focus();
  }
});

const updateProgress = () => {
  const max = document.documentElement.scrollHeight - innerHeight;
  document.getElementById('progressBar').style.width = `${max > 0 ? (scrollY / max) * 100 : 0}%`;
};
addEventListener('scroll', updateProgress, { passive: true });
updateProgress();

const SUPABASE_URL = 'https://kbcjchjepgejdezeuwwh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiY2pjaGplcGdlamRlemV1d3doIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3NzA4OTcsImV4cCI6MjA5MjM0Njg5N30.k2julxPkEm4kgtw5dBy6S8hlSrVBqebe-A_GfzcW2HA';
let allPosts = [];
let activeCategory = new URLSearchParams(location.search).get('cat') || null;

function esc(value) {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function safeMediaUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(String(value || ''), location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) { return ''; }
}

function parseCategories(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter(item => typeof item === 'string' && item.trim());
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(item => typeof item === 'string' && item.trim()) : [];
  } catch (_) { return []; }
}

function renderCategoryFilter() {
  const categories = [];
  allPosts.forEach(post => parseCategories(post.categories).forEach(category => {
    if (!categories.includes(category)) categories.push(category);
  }));
  categories.sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const filter = document.getElementById('catFilter');
  if (!categories.length) {
    filter.hidden = true;
    return;
  }

  filter.hidden = false;
  const options = [['Todos', null], ...categories.map(category => [category, category])];
  filter.innerHTML = options.map(([label, value]) => {
    const active = activeCategory === value;
    return `<button class="cat-chip${active ? ' active' : ''}" type="button" data-cat="${esc(value || '')}" aria-pressed="${active}">${esc(label)}</button>`;
  }).join('');

  filter.querySelectorAll('.cat-chip').forEach(button => button.addEventListener('click', () => {
    activeCategory = button.dataset.cat || null;
    const url = new URL(location.href);
    if (activeCategory) url.searchParams.set('cat', activeCategory);
    else url.searchParams.delete('cat');
    history.replaceState(null, '', url);
    track('blog_filtro', { categoria: activeCategory || 'todos' });
    renderCategoryFilter();
    renderPosts();
  }));
}

const placeholderIcon = '<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M12 7h17l7 7v27H12zM29 7v8h7M18 23h12M18 29h12M18 35h8"/></svg>';

function renderPostCard(post, index) {
  const categories = parseCategories(post.categories);
  const rawDate = new Date(post.created_at);
  const date = Number.isNaN(rawDate.getTime()) ? '' : rawDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const coverUrl = safeMediaUrl(post.cover_url);
  const featured = index === 0;
  const cover = coverUrl
    ? `<img class="post-card-cover" src="${esc(coverUrl)}" alt="${esc(post.title)}" loading="${featured ? 'eager' : 'lazy'}" decoding="async"${featured ? ' fetchpriority="high"' : ''}>`
    : `<span class="post-card-cover-placeholder">${placeholderIcon}</span>`;

  return `<a class="post-card${featured ? ' is-featured' : ''}" href="/blog/post?s=${encodeURIComponent(post.slug || '')}" data-post-title="${esc(post.title)}">`
    + cover
    + '<span class="post-card-body">'
    + (categories.length ? `<span class="post-card-cat">${esc(categories[0])}</span>` : '')
    + `<span class="post-card-title">${esc(post.title)}</span>`
    + (post.excerpt ? `<span class="post-card-excerpt">${esc(post.excerpt)}</span>` : '')
    + `<span class="post-card-meta"><span class="post-card-date">${esc(date)}</span><span class="post-card-link">Ler artigo →</span></span>`
    + '</span></a>';
}

function renderPosts() {
  const container = document.getElementById('postsContainer');
  const filtered = activeCategory
    ? allPosts.filter(post => parseCategories(post.categories).includes(activeCategory))
    : allPosts;

  document.getElementById('postCount').textContent = filtered.length === 1
    ? '1 artigo para esta etapa.'
    : `${filtered.length} artigos para explorar.`;

  if (!filtered.length) {
    container.className = 'empty-state';
    container.innerHTML = '<div><h3>Nenhum artigo por aqui ainda</h3><p>Escolha outro assunto ou volte em breve para novas leituras.</p><button class="button button-outline" type="button" id="showAllPosts">Ver todos os artigos</button></div>';
    document.getElementById('showAllPosts').addEventListener('click', () => {
      activeCategory = null;
      history.replaceState(null, '', location.pathname);
      renderCategoryFilter();
      renderPosts();
    });
    return;
  }

  container.className = 'posts-grid';
  container.innerHTML = filtered.map(renderPostCard).join('');
}

document.getElementById('postsContainer').addEventListener('click', event => {
  const card = event.target.closest('.post-card');
  if (!card) return;
  track('blog_artigo_aberto', {
    titulo: card.dataset.postTitle || '',
    categoria: activeCategory || 'todos',
    destaque: card.classList.contains('is-featured')
  });
});

(async function loadPosts() {
  const container = document.getElementById('postsContainer');
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/blog_posts?published=eq.true&select=title,slug,excerpt,cover_url,categories,created_at&order=created_at.desc`, {
      headers: { apikey: SUPABASE_ANON }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    allPosts = await response.json();
    if (!Array.isArray(allPosts)) allPosts = [];
    renderCategoryFilter();
    renderPosts();
  } catch (_) {
    container.className = 'empty-state';
    container.innerHTML = '<div><h3>Não foi possível carregar os artigos</h3><p>Recarregue a página em alguns instantes.</p><button class="button button-outline" type="button" onclick="location.reload()">Tentar novamente</button></div>';
    document.getElementById('postCount').textContent = 'Conteúdo temporariamente indisponível.';
  }
})();

document.querySelectorAll('a[href^="/onboarding/"]').forEach(link => link.addEventListener('click', () => {
  track('blog_cta_click', { path: link.href.includes('/curriculo/') ? 'no_cv' : 'with_cv', label: (link.textContent || '').trim(), placement: link.closest('footer') ? 'footer' : link.closest('section') ? 'content' : 'header' });
}));

const cookiePrefs = document.getElementById('cookiePrefs');
if (cookiePrefs) cookiePrefs.addEventListener('click', event => {
  if (!window.VagaAICookies?.open) return;
  event.preventDefault();
  window.VagaAICookies.open();
});

if (reduceMotion) document.documentElement.classList.add('reduce-motion');
