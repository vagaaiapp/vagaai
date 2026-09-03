(function () {
  'use strict';

  if (!document.documentElement.hasAttribute('data-blog-studio-preview')) return;

  document.body.setAttribute('data-vagaai-ui', 'blog-studio');

  var studioState = {
    filter: 'all',
    query: '',
    sort: 'updated',
  };

  var searchIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.5-3.5"></path></svg>';
  var editIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 20h9"></path><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"></path></svg>';
  var externalIcon = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 3h6v6"></path><path d="m10 14 11-11"></path><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path></svg>';
  var imageIcon = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><path d="m21 15-5-5L5 21"></path></svg>';

  function safeCoverUrl(value) {
    try {
      var normalized = String(value || '').trim();
      if (!normalized) return '';
      var parsed = new URL(normalized, location.origin);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (e) {
      return '';
    }
  }

  function categoriesOf(post) {
    if (Array.isArray(post.categories)) return post.categories.filter(Boolean);
    if (typeof post.categories !== 'string' || !post.categories.trim()) return [];
    try {
      var parsed = JSON.parse(post.categories);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch (e) {
      return [];
    }
  }

  function viewCount(post) {
    var row = window._viewsData && window._viewsData[post.slug];
    return row && Number.isFinite(Number(row.views)) ? Number(row.views) : 0;
  }

  function formatDate(value) {
    if (!value) return 'Sem data';
    var parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return 'Sem data';
    return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  function studioPosts() {
    var posts = Array.isArray(window._posts) ? window._posts.slice() : [];
    var query = studioState.query.toLocaleLowerCase('pt-BR');
    posts = posts.filter(function (post) {
      if (studioState.filter === 'published' && !post.published) return false;
      if (studioState.filter === 'draft' && post.published) return false;
      if (!query) return true;
      var haystack = [post.title, post.slug, post.excerpt].concat(categoriesOf(post)).join(' ').toLocaleLowerCase('pt-BR');
      return haystack.indexOf(query) !== -1;
    });

    posts.sort(function (a, b) {
      if (studioState.sort === 'views') return viewCount(b) - viewCount(a);
      if (studioState.sort === 'title') return String(a.title || '').localeCompare(String(b.title || ''), 'pt-BR');
      return new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0);
    });
    return posts;
  }

  function setMetric(id, value, note) {
    var valueEl = document.getElementById(id);
    var noteEl = document.getElementById(id + 'Note');
    if (valueEl) valueEl.textContent = value;
    if (noteEl && note != null) noteEl.textContent = note;
  }

  function updateStudioMetrics() {
    var posts = Array.isArray(window._posts) ? window._posts : [];
    var published = posts.filter(function (post) { return post.published; });
    var drafts = posts.filter(function (post) { return !post.published; });
    var totalViews = published.reduce(function (sum, post) { return sum + viewCount(post); }, 0);
    var leader = published.slice().sort(function (a, b) { return viewCount(b) - viewCount(a); })[0];
    var days = document.getElementById('viewsRangeSelect');
    var period = days ? days.value : '30';

    setMetric('studioMetricTotal', posts.length, 'artigos no acervo');
    setMetric('studioMetricPublished', published.length, 'visíveis no blog');
    setMetric('studioMetricDrafts', drafts.length, drafts.length === 1 ? 'aguardando revisão' : 'aguardando revisão');
    setMetric('studioMetricViews', totalViews.toLocaleString('pt-BR'), 'visualizações em ' + period + ' dias');

    var priorityTitle = document.getElementById('studioPriorityTitle');
    var priorityCopy = document.getElementById('studioPriorityCopy');
    if (priorityTitle && priorityCopy) {
      if (drafts.length) {
        priorityTitle.textContent = drafts.length === 1 ? '1 rascunho pede atenção.' : drafts.length + ' rascunhos pedem atenção.';
        priorityCopy.textContent = 'Revise título, conteúdo, SEO e imagem antes de colocar o próximo artigo no ar.';
      } else if (leader && viewCount(leader)) {
        priorityTitle.textContent = 'Produção em dia.';
        priorityCopy.textContent = 'O artigo com mais alcance no período é “' + (leader.title || 'Sem título') + '”.';
      } else {
        priorityTitle.textContent = 'Produção em dia.';
        priorityCopy.textContent = 'Crie o próximo artigo ou acompanhe o alcance conforme os dados entrarem.';
      }
    }

    var filters = document.querySelectorAll('.studio-filter');
    filters.forEach(function (button) {
      var filter = button.getAttribute('data-filter');
      var count = filter === 'all' ? posts.length : filter === 'published' ? published.length : drafts.length;
      var countEl = button.querySelector('span');
      if (countEl) countEl.textContent = count;
      button.setAttribute('aria-pressed', String(filter === studioState.filter));
    });
  }

  function renderStudioPosts() {
    var grid = document.getElementById('postsGrid');
    if (!grid) return;
    var posts = studioPosts();
    updateStudioMetrics();

    var tableHead = '<div class="studio-table-head" aria-hidden="true">'
      + '<span>Artigo</span><span class="studio-category-col">Categoria</span><span>Tráfego</span><span class="studio-updated-col">Atualização</span><span style="text-align:right">Ações</span>'
      + '</div>';

    if (!posts.length) {
      grid.innerHTML = tableHead + '<div class="studio-empty"><strong>Nenhum artigo encontrado.</strong><span>Ajuste a busca ou os filtros para continuar.</span></div>';
      return;
    }

    grid.innerHTML = tableHead + posts.map(function (post) {
      var cover = safeCoverUrl(post.cover_url);
      var categories = categoriesOf(post);
      var thumb = cover
        ? '<span class="studio-thumb"><img src="' + esc(cover) + '" alt=""></span>'
        : '<span class="studio-thumb">' + imageIcon + '</span>';
      var status = '<span class="badge ' + (post.published ? 'green' : 'yellow') + '">' + (post.published ? 'Publicado' : 'Rascunho') + '</span>';
      var publicLink = post.published && post.slug
        ? '<a class="studio-icon-btn" href="/blog/post?s=' + encodeURIComponent(post.slug) + '" target="_blank" rel="noopener" title="Ver artigo publicado" aria-label="Ver artigo publicado">' + externalIcon + '</a>'
        : '';
      return '<article class="studio-post-row">'
        + '<div class="studio-post-main" role="button" tabindex="0" data-edit-post="' + esc(post.id) + '" aria-label="Editar ' + esc(post.title || 'artigo sem título') + '">'
          + thumb
          + '<div style="min-width:0"><div class="studio-post-title">' + esc(post.title || '(sem título)') + '</div>'
          + '<div class="studio-post-slug">' + esc(post.slug || 'slug ainda não definido') + '</div>'
          + '<div style="margin-top:7px">' + status + '</div></div>'
        + '</div>'
        + '<div class="studio-category-col"><span class="studio-category">' + esc(categories[0] || 'Sem categoria') + '</span></div>'
        + '<div class="studio-views-col">' + viewsBadgeHtml(post) + '</div>'
        + '<div class="studio-updated-col"><div class="studio-cell-muted" style="margin-top:0">' + esc(formatDate(post.updated_at || post.created_at)) + '</div></div>'
        + '<div class="studio-post-actions">'
          + publicLink
          + '<button class="studio-icon-btn" type="button" data-edit-post="' + esc(post.id) + '" title="Editar artigo" aria-label="Editar artigo">' + editIcon + '</button>'
        + '</div>'
      + '</article>';
    }).join('');

    grid.querySelectorAll('[data-edit-post]').forEach(function (element) {
      element.addEventListener('click', function () { editPost(element.getAttribute('data-edit-post')); });
      element.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          editPost(element.getAttribute('data-edit-post'));
        }
      });
    });
  }

  function buildStudioShell() {
    var list = document.getElementById('listView');
    var listHeader = list && list.querySelector('.list-header');
    var grid = document.getElementById('postsGrid');
    if (!list || !listHeader || !grid || document.getElementById('studioHero')) return;

    list.insertAdjacentHTML('afterbegin',
      '<section class="studio-hero" id="studioHero">'
        + '<div><div class="studio-kicker">Conteúdo e distribuição</div><h1>Produção editorial, sem perder o ritmo.</h1><p class="studio-hero-copy">Acompanhe o que está publicado, encontre o que precisa de revisão e cuide de cada artigo do rascunho ao tráfego.</p></div>'
        + '<div class="studio-priority"><div class="studio-priority-label">Prioridade agora</div><strong id="studioPriorityTitle">Carregando produção...</strong><p id="studioPriorityCopy">Os dados editoriais aparecerão aqui.</p></div>'
      + '</section>'
      + '<section class="studio-metrics" aria-label="Resumo da produção">'
        + '<div class="studio-metric"><div class="studio-metric-label">Acervo</div><div class="studio-metric-value" id="studioMetricTotal">—</div><div class="studio-metric-note" id="studioMetricTotalNote">artigos no acervo</div></div>'
        + '<div class="studio-metric"><div class="studio-metric-label">Publicados</div><div class="studio-metric-value" id="studioMetricPublished">—</div><div class="studio-metric-note" id="studioMetricPublishedNote">visíveis no blog</div></div>'
        + '<div class="studio-metric"><div class="studio-metric-label">Rascunhos</div><div class="studio-metric-value" id="studioMetricDrafts">—</div><div class="studio-metric-note" id="studioMetricDraftsNote">aguardando revisão</div></div>'
        + '<div class="studio-metric"><div class="studio-metric-label">Tráfego</div><div class="studio-metric-value" id="studioMetricViews">—</div><div class="studio-metric-note" id="studioMetricViewsNote">visualizações no período</div></div>'
      + '</section>'
    );

    var heading = listHeader.querySelector('h1');
    if (heading) {
      var sectionHeading = document.createElement('h2');
      sectionHeading.textContent = 'Todos os artigos';
      sectionHeading.id = 'studioArticleListTitle';
      heading.replaceWith(sectionHeading);
      grid.setAttribute('aria-labelledby', sectionHeading.id);
    }

    grid.insertAdjacentHTML('beforebegin',
      '<div class="studio-toolbar">'
        + '<div class="studio-filters" role="group" aria-label="Filtrar artigos por status">'
          + '<button type="button" class="studio-filter" data-filter="all" aria-pressed="true">Todos <span>0</span></button>'
          + '<button type="button" class="studio-filter" data-filter="published" aria-pressed="false">Publicados <span>0</span></button>'
          + '<button type="button" class="studio-filter" data-filter="draft" aria-pressed="false">Rascunhos <span>0</span></button>'
        + '</div>'
        + '<label class="studio-search"><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Buscar artigos</span>' + searchIcon + '<input id="studioSearch" type="search" placeholder="Buscar por título, URL ou categoria"></label>'
        + '<select class="studio-sort" id="studioSort" aria-label="Ordenar artigos"><option value="updated">Mais recentes</option><option value="views">Mais acessados</option><option value="title">Título de A a Z</option></select>'
      + '</div>'
    );

    document.querySelectorAll('.studio-filter').forEach(function (button) {
      button.addEventListener('click', function () {
        studioState.filter = button.getAttribute('data-filter') || 'all';
        renderStudioPosts();
      });
    });
    document.getElementById('studioSearch').addEventListener('input', function () {
      studioState.query = this.value.trim();
      renderStudioPosts();
    });
    document.getElementById('studioSort').addEventListener('change', function () {
      studioState.sort = this.value;
      renderStudioPosts();
    });
  }

  function checklistItem(id, label) {
    return '<div class="studio-check-item" id="' + id + '"><span class="studio-check-dot">✓</span><span>' + label + '</span></div>';
  }

  function buildEditorIntelligence() {
    var sidebar = document.querySelector('.wp-sidebar');
    var footer = document.querySelector('.editor-footer');
    if (!sidebar || document.getElementById('studioChecklist')) return;
    sidebar.insertAdjacentHTML('afterbegin',
      '<section class="sidebar-card" id="studioChecklist">'
        + '<div class="sidebar-card-header">Checklist do artigo</div>'
        + '<div class="sidebar-card-body">'
          + '<div class="studio-checklist-progress"><strong id="studioChecklistScore">0/6</strong><span id="studioChecklistLabel">itens prontos</span></div>'
          + checklistItem('studioCheckTitle', 'Título definido')
          + checklistItem('studioCheckBody', 'Conteúdo com pelo menos 300 palavras')
          + checklistItem('studioCheckSeo', 'Título de busca dentro do limite')
          + checklistItem('studioCheckDesc', 'Meta descrição pronta')
          + checklistItem('studioCheckCover', 'Imagem destacada definida')
          + checklistItem('studioCheckCategory', 'Categoria selecionada')
        + '</div>'
      + '</section>'
    );
    if (footer && !document.getElementById('studioReadTime')) {
      footer.querySelector('.word-count').insertAdjacentHTML('afterend', '<span class="word-count studio-reading-time" id="studioReadTime">Leitura: 1 min</span>');
    }
  }

  function refineEditorLabels() {
    var seoHeading = document.querySelector('.seo-header span');
    if (seoHeading && seoHeading.textContent.trim() !== 'SEO e pré-visualização') {
      seoHeading.textContent = 'SEO e pré-visualização';
    }

    document.querySelectorAll('#editorView button').forEach(function (button) {
      var label = button.textContent.trim();
      if (/Salvar rascunho/.test(label) && label !== 'Salvar rascunho') button.textContent = 'Salvar rascunho';
      if (/Publicar/.test(label) && label !== 'Publicar') button.textContent = 'Publicar';
      if (/Atualizar/.test(label) && label !== 'Atualizar') button.textContent = 'Atualizar';
      if (/Enviar do computador/.test(label) && label !== 'Enviar do computador') button.textContent = 'Enviar do computador';
      if (/Desktop/.test(label) && label !== 'Desktop') button.textContent = 'Desktop';
      if (/Móvel/.test(label) && label !== 'Móvel') button.textContent = 'Móvel';
      if (label === '+ Add') button.textContent = 'Adicionar';
    });
  }

  function setCheck(id, ready) {
    var item = document.getElementById(id);
    if (item) item.classList.toggle('is-ready', Boolean(ready));
    return Boolean(ready);
  }

  function updateStudioChecklist() {
    if (!document.getElementById('studioChecklist')) return;
    var title = document.getElementById('postTitle').value.trim();
    var words = (document.getElementById('editorContent').innerText || '').trim().split(/\s+/).filter(Boolean).length;
    var seoTitle = document.getElementById('seoTitle').value.trim() || title;
    var desc = document.getElementById('postExcerpt').value.trim();
    var cover = safeCoverUrl(document.getElementById('postCover').value);
    var ready = [
      setCheck('studioCheckTitle', title.length >= 20),
      setCheck('studioCheckBody', words >= 300),
      setCheck('studioCheckSeo', seoTitle.length >= 30 && seoTitle.length <= 60),
      setCheck('studioCheckDesc', desc.length >= 80 && desc.length <= 160),
      setCheck('studioCheckCover', Boolean(cover)),
      setCheck('studioCheckCategory', Array.isArray(window._categories) && window._categories.length > 0),
    ].filter(Boolean).length;
    document.getElementById('studioChecklistScore').textContent = ready + '/6';
    document.getElementById('studioChecklistLabel').textContent = ready === 6 ? 'pronto para publicar' : 'itens prontos';
    var readTime = document.getElementById('studioReadTime');
    if (readTime) readTime.textContent = 'Leitura: ' + Math.max(1, Math.ceil(words / 220)) + ' min';
  }

  buildStudioShell();
  buildEditorIntelligence();
  refineEditorLabels();

  window.renderPostsGrid = renderStudioPosts;

  var baseUpdateWordCount = window.updateWordCount;
  window.updateWordCount = function () {
    baseUpdateWordCount();
    updateStudioChecklist();
  };

  var baseRenderCatTags = window.renderCatTags;
  window.renderCatTags = function () {
    baseRenderCatTags();
    updateStudioChecklist();
  };

  var baseUpdateCoverPreview = window.updateCoverPreview;
  window.updateCoverPreview = function (url) {
    baseUpdateCoverPreview(url);
    updateStudioChecklist();
  };

  var baseUpdatePreview = window.updatePreview;
  window.updatePreview = function () {
    baseUpdatePreview();
    updateStudioChecklist();
  };

  var baseSetPublishUI = window.setPublishUI;
  window.setPublishUI = function (published) {
    baseSetPublishUI(published);
    refineEditorLabels();
  };

  var editorView = document.getElementById('editorView');
  if (editorView) {
    new MutationObserver(refineEditorLabels).observe(editorView, { childList: true, subtree: true });
  }

  document.addEventListener('input', function (event) {
    if (event.target.closest('#editorView')) updateStudioChecklist();
  });

  var range = document.getElementById('viewsRangeSelect');
  if (range) range.addEventListener('change', updateStudioMetrics);
})();
