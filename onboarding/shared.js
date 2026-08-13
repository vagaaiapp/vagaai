(function (root, factory) {
  var api = factory(root && root.localStorage ? root.localStorage : null, root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VagaAIOnboarding = api;
})(typeof window !== 'undefined' ? window : globalThis, function (storage, root) {
  'use strict';

  var KEY = 'vagaai_onboarding_handoff_v1';
  var VERSION = 1;
  var MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
  var ANON_ID_KEY = 'vagaai_ob_anon_id';
  var THEME_KEY = 'vagaai_theme';

  /* ── Utilidades comuns aos dois funis ──────────────────────────────────
     Antes duplicadas em onboarding/vaga e onboarding/curriculo: toda
     correção precisava ser feita — e lembrada — nos dois arquivos. */

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function track(name, params) {
    try {
      if (root && typeof root.gtag === 'function') root.gtag('event', name, params || {});
    } catch (e) {}
  }

  // O page_view automático do GA4 só dispara no carregamento. Como a navegação
  // entre etapas é por pushState, sem este disparo manual o funil de drop-off
  // por etapa ficaria cego.
  function trackPageView(path) {
    try {
      if (!root || typeof root.gtag !== 'function') return;
      root.gtag('event', 'page_view', {
        page_path: path,
        page_location: root.location.origin + path,
        page_title: typeof document !== 'undefined' ? document.title : ''
      });
    } catch (e) {}
  }

  function anonymousBrowserId() {
    var current = '';
    try { current = (storage && storage.getItem(ANON_ID_KEY)) || ''; } catch (e) {}
    if (/^[A-Za-z0-9._:-]{16,128}$/.test(current)) return current;

    var created = '';
    try {
      var c = root && root.crypto;
      if (c && typeof c.randomUUID === 'function') {
        created = c.randomUUID();
      } else if (c && typeof c.getRandomValues === 'function') {
        var bytes = new Uint8Array(16);
        c.getRandomValues(bytes);
        created = Array.prototype.map.call(bytes, function (b) {
          return b.toString(16).padStart(2, '0');
        }).join('');
      }
    } catch (e) {}
    if (!created) {
      created = 'ob-' + Date.now().toString(36) + '-' +
        Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    try { if (storage) storage.setItem(ANON_ID_KEY, created); } catch (e) {}
    return created;
  }

  // Profundidade guardada na própria entrada do histórico: sobrevive a
  // back/forward, diferente de um contador em memória.
  function currentDepth() {
    if (typeof history === 'undefined' || !history.state) return 0;
    return typeof history.state.depth === 'number' ? history.state.depth : 0;
  }

  /* ── Tema ──────────────────────────────────────────────────────────────
     Mesma chave do produto logado (dashboard, app, cv), que abre em claro
     quando não há preferência salva. */

  var ICON_SUN = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>';
  var ICON_MOON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';

  function savedTheme() {
    try {
      return (storage && storage.getItem(THEME_KEY)) === 'dark' ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }

  function applyTheme(theme) {
    if (typeof document === 'undefined' || !document.documentElement) return;
    document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
  }

  function syncThemeButton() {
    if (typeof document === 'undefined') return;
    var btn = document.getElementById('themeBtn');
    if (!btn) return;
    btn.innerHTML = document.documentElement.getAttribute('data-theme') === 'light' ? ICON_MOON : ICON_SUN;
  }

  function toggleTheme() {
    if (typeof document === 'undefined') return;
    var next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    applyTheme(next);
    try { if (storage) storage.setItem(THEME_KEY, next); } catch (e) {}
    syncThemeButton();
  }

  // Aplicado já no carregamento: shared.js é carregado no <head>, antes do
  // <body>, então a preferência salva entra sem flash do tema padrão.
  applyTheme(savedTheme());

  function emptyState() {
    return {
      version: VERSION,
      entry: '',
      flow: '',
      hasCv: null,
      hasJob: null,
      intent: '',
      situation: '',
      job: { raw: '', url: '', preview: null },
      cv: { raw: '', name: '', data: null, template: '', form: {} },
      analysis: null,
      marketDiagnosis: null,
      alertDraft: {
        cargo: '',
        local: '',
        modalidade: '',
        salario: '',
        nivel: '',
        interesses: [],
        frequencia: 'semanal',
        scoreMinimo: 70,
        activate: false
      },
      nextAction: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function merge(base, patch) {
    var out = Object.assign({}, base || {}, patch || {});
    out.job = Object.assign({}, (base && base.job) || {}, (patch && patch.job) || {});
    out.cv = Object.assign({}, (base && base.cv) || {}, (patch && patch.cv) || {});
    out.cv.form = Object.assign(
      {},
      (base && base.cv && base.cv.form) || {},
      (patch && patch.cv && patch.cv.form) || {}
    );
    out.alertDraft = Object.assign(
      {},
      (base && base.alertDraft) || {},
      (patch && patch.alertDraft) || {}
    );
    return out;
  }

  function read() {
    var fallback = emptyState();
    if (!storage) return fallback;
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return fallback;
      var parsed = JSON.parse(raw);
      var savedAt = Date.parse(parsed.updatedAt || parsed.createdAt || '');
      if (savedAt && Date.now() - savedAt > MAX_AGE_MS) {
        storage.removeItem(KEY);
        return fallback;
      }
      return merge(fallback, parsed);
    } catch (e) {
      return fallback;
    }
  }

  function write(next) {
    var current = read();
    var value = merge(current, next || {});
    value.version = VERSION;
    value.updatedAt = new Date().toISOString();
    if (!value.createdAt) value.createdAt = value.updatedAt;
    if (storage) {
      try { storage.setItem(KEY, JSON.stringify(value)); } catch (e) {}
    }
    return value;
  }

  function deriveFlow(hasCv, hasJob) {
    if (hasCv === true && hasJob === true) return 'cv_job';
    if (hasCv === true && hasJob === false) return 'cv_no_job';
    if (hasCv === false && hasJob === true) return 'no_cv_job';
    if (hasCv === false && hasJob === false) return 'no_cv_no_job';
    return '';
  }

  function ensureJourneySummaryStyles() {
    if (typeof document === 'undefined' || document.getElementById('obJourneySummaryStyles')) return;
    var style = document.createElement('style');
    style.id = 'obJourneySummaryStyles';
    style.textContent =
      '.ob-journey-summary{position:sticky;top:var(--ob-journey-sticky-top,81px);z-index:12;isolation:isolate;margin:0 0 22px;padding:13px 16px;background:var(--card,#fff);border:1px solid var(--line,#dfe7e1);border-radius:16px;box-shadow:0 12px 32px rgba(9,35,20,.08)}' +
      '.ob-journey-summary::before{content:"";position:absolute;z-index:-1;inset:-9px -7px;background:var(--bg,#f4f7f5);border-radius:20px;pointer-events:none}' +
      '.ob-journey-summary[data-expanded="true"]{position:relative;top:auto}' +
      '.ob-journey-stepper{width:100%}' +
      '.ob-journey-track{display:flex;gap:6px;width:100%}' +
      '.ob-journey-seg{flex:1;height:6px;border-radius:99px;background:var(--line,#dfe7e1);transition:background .22s ease}' +
      '.ob-journey-seg.is-current{background:rgba(30,157,96,.55)}' +
      '.ob-journey-seg.is-done{background:var(--green,#168451)}' +
      '.ob-journey-labels{display:flex;justify-content:space-between;gap:6px;margin-top:8px}' +
      '.ob-journey-label-item{min-width:0;overflow:hidden;color:var(--muted,#698072);font-size:11px;line-height:1.25;font-weight:700;white-space:nowrap;text-overflow:ellipsis}' +
      '.ob-journey-label-item.is-done,.ob-journey-label-item.is-current{color:var(--text,#0b1911)}' +
      '.ob-journey-meta{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-top:11px;padding-top:10px;border-top:1px solid var(--line,#dfe7e1)}' +
      '.ob-journey-progress{min-width:0;color:var(--text,#0b1911);font-size:11px;line-height:1.4;font-weight:700}' +
      '.ob-journey-toggle{flex:0 0 auto;padding:0;border:0;background:transparent;color:var(--green,#168451);font:inherit;font-size:10px;font-weight:800;cursor:pointer}' +
      '.ob-journey-toggle:hover{text-decoration:underline}' +
      '.ob-journey-details{margin-top:11px;padding:13px 14px;border:1px solid var(--line,#dfe7e1);border-radius:12px;background:var(--soft,#f4f7f5)}' +
      '.ob-journey-details[hidden]{display:none}' +
      '.ob-journey-grid{display:grid;grid-template-columns:1.15fr 1.1fr 1.1fr 1.55fr;gap:12px;align-items:start}' +
      '.ob-journey-item{min-width:0}' +
      '.ob-journey-label{display:block;margin-bottom:4px;color:var(--muted,#698072);font-size:9px;line-height:1.2;font-weight:800;letter-spacing:.08em;text-transform:uppercase}' +
      '.ob-journey-value{display:block;color:var(--text,#0b1911);font-size:11px;line-height:1.35;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.ob-journey-item.is-next .ob-journey-value{color:var(--green,#168451);white-space:normal}' +
      '.ob-journey-trust{display:flex;align-items:center;gap:7px;margin-top:11px;padding-top:10px;border-top:1px solid var(--line,#dfe7e1);color:var(--muted,#698072);font-size:10px;line-height:1.4}' +
      '.ob-journey-trust-mark{display:inline-grid;place-items:center;width:17px;height:17px;flex:0 0 17px;border-radius:50%;background:rgba(30,157,96,.12);color:var(--green,#168451);font-size:10px;font-weight:900}' +
      '.ob-journey-mobile{display:none}' +
      '@media(max-width:760px){.ob-journey-summary{margin:0 0 20px;padding:12px 14px;border-radius:14px}.ob-journey-summary::before{inset:-7px -5px;border-radius:18px}.ob-journey-stepper{display:none}.ob-journey-mobile{display:block}.ob-journey-mobile-head{display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--text,#0b1911);font-size:11px;font-weight:800}.ob-journey-mobile-track{height:5px;margin-top:8px;overflow:hidden;border-radius:999px;background:var(--line,#dfe7e1)}.ob-journey-mobile-fill{height:100%;border-radius:inherit;background:var(--green,#168451);transition:width .3s ease}.ob-journey-meta{align-items:flex-start;margin-top:9px;padding-top:9px}.ob-journey-progress{font-size:10px}.ob-journey-grid{grid-template-columns:1fr 1fr;gap:11px 14px}.ob-journey-item.is-next{grid-column:1/-1}.ob-journey-trust{align-items:flex-start}}';
    document.head.appendChild(style);
  }

  function renderJourneySummary(options) {
    if (typeof document === 'undefined') return null;
    options = options || {};
    ensureJourneySummaryStyles();

    var target = options.target;
    if (typeof target === 'string') target = document.querySelector(target);
    if (!target) target = document.querySelector('.ob-main');
    if (!target) return null;

    var summary = document.getElementById('obJourneySummary');
    if (!summary) {
      summary = document.createElement('section');
      summary.id = 'obJourneySummary';
      summary.className = 'ob-journey-summary';
      summary.setAttribute('aria-label', 'Resumo da jornada');
      target.insertBefore(summary, target.firstChild);
    }

    function syncStickyOffset() {
      var topBar = document.querySelector('.ob-top');
      var topBarHeight = topBar ? Math.ceil(topBar.getBoundingClientRect().height) : 72;
      summary.style.setProperty('--ob-journey-sticky-top', (topBarHeight + 8) + 'px');
    }
    syncStickyOffset();
    if (typeof window !== 'undefined' && !window.__vagaaiJourneyStickyBound) {
      window.__vagaaiJourneyStickyBound = true;
      window.addEventListener('resize', function () {
        var activeSummary = document.getElementById('obJourneySummary');
        var activeTopBar = document.querySelector('.ob-top');
        if (!activeSummary) return;
        var activeTopBarHeight = activeTopBar ? Math.ceil(activeTopBar.getBoundingClientRect().height) : 72;
        activeSummary.style.setProperty('--ob-journey-sticky-top', (activeTopBarHeight + 8) + 'px');
      }, { passive: true });
    }

    var currentStep = Math.max(1, parseInt(options.currentStep, 10) || 1);
    var totalSteps = Math.max(currentStep, parseInt(options.totalSteps, 10) || 5);
    var stepLabels = Array.isArray(options.steps) ? options.steps.slice(0, totalSteps) : [];
    while (stepLabels.length < totalSteps) stepLabels.push('Etapa ' + (stepLabels.length + 1));
    var wasExpanded = summary.getAttribute('data-expanded') === 'true';

    summary.innerHTML = '';
    var stepper = document.createElement('div');
    stepper.className = 'ob-journey-stepper';
    stepper.setAttribute('aria-label', 'Progresso da jornada');
    var track = document.createElement('div');
    track.className = 'ob-journey-track';
    var labelsRow = document.createElement('div');
    labelsRow.className = 'ob-journey-labels';
    stepLabels.forEach(function (stepLabel, index) {
      var stepNumber = index + 1;
      var stateClass = stepNumber < currentStep ? ' is-done' : (stepNumber === currentStep ? ' is-current' : '');
      var seg = document.createElement('span');
      seg.className = 'ob-journey-seg' + stateClass;
      track.appendChild(seg);
      var labelItem = document.createElement('span');
      labelItem.className = 'ob-journey-label-item' + stateClass;
      labelItem.textContent = stepLabel;
      labelsRow.appendChild(labelItem);
    });
    stepper.appendChild(track);
    stepper.appendChild(labelsRow);
    summary.appendChild(stepper);

    var mobile = document.createElement('div');
    mobile.className = 'ob-journey-mobile';
    mobile.innerHTML =
      '<div class="ob-journey-mobile-head"><span>' +
      String(stepLabels[currentStep - 1] || ('Etapa ' + currentStep)) +
      '</span><span>' + currentStep + ' de ' + totalSteps + '</span></div>' +
      '<div class="ob-journey-mobile-track"><div class="ob-journey-mobile-fill" style="width:' +
      Math.min(100, Math.round((currentStep / totalSteps) * 100)) + '%"></div></div>';
    summary.appendChild(mobile);

    var meta = document.createElement('div');
    meta.className = 'ob-journey-meta';
    var progress = document.createElement('div');
    progress.className = 'ob-journey-progress';
    progress.textContent = options.progress || ('Etapa ' + currentStep + ' de ' + totalSteps);
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'ob-journey-toggle';
    toggle.setAttribute('aria-expanded', wasExpanded ? 'true' : 'false');
    toggle.textContent = wasExpanded ? 'Ocultar resumo' : 'Ver resumo da jornada';
    meta.appendChild(progress);
    meta.appendChild(toggle);
    summary.appendChild(meta);

    var details = document.createElement('div');
    details.className = 'ob-journey-details';
    details.hidden = !wasExpanded;
    var fields = [
      ['Objetivo', options.goal || 'Definir próximo passo', ''],
      ['Vaga', options.job || 'Ainda não selecionada', ''],
      ['Currículo', options.cv || 'Ainda não adicionado', ''],
      ['Próxima entrega', options.next || 'Continue para ver o próximo resultado.', 'is-next']
    ];
    var grid = document.createElement('div');
    grid.className = 'ob-journey-grid';
    fields.forEach(function (field) {
      var item = document.createElement('div');
      item.className = 'ob-journey-item' + (field[2] ? ' ' + field[2] : '');
      var itemLabel = document.createElement('span');
      itemLabel.className = 'ob-journey-label';
      itemLabel.textContent = field[0];
      var value = document.createElement('span');
      value.className = 'ob-journey-value';
      value.textContent = field[1];
      value.title = field[1];
      item.appendChild(itemLabel);
      item.appendChild(value);
      grid.appendChild(item);
    });
    details.appendChild(grid);

    var trust = document.createElement('div');
    trust.className = 'ob-journey-trust';
    var trustMark = document.createElement('span');
    trustMark.className = 'ob-journey-trust-mark';
    trustMark.textContent = '✓';
    var trustText = document.createElement('span');
    trustText.textContent = options.trust || 'Você revisa tudo antes de usar. O VagaAI não inventa experiências.';
    trust.appendChild(trustMark);
    trust.appendChild(trustText);
    details.appendChild(trust);
    summary.appendChild(details);

    toggle.addEventListener('click', function () {
      var expanded = details.hidden;
      details.hidden = !expanded;
      summary.setAttribute('data-expanded', expanded ? 'true' : 'false');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.textContent = expanded ? 'Ocultar resumo' : 'Ver resumo da jornada';
    });
    summary.setAttribute('data-expanded', wasExpanded ? 'true' : 'false');
    return summary;
  }

  var JOURNEY_PROFILES = {
    cv_job: {
      label: 'Currículo + vaga',
      overviewTitle: 'Seu currículo encontra uma vaga específica.',
      overviewSub: 'Vamos comparar os dois, mostrar onde você já é forte e o que precisa ajustar antes de aplicar.',
      situation: 'Você já tem currículo e uma oportunidade em vista.',
      problem: 'Um currículo bom ainda pode perder aderência quando não destaca o que esta vaga prioriza.',
      implication: 'Sem essa comparação, você pode enviar uma candidatura genérica e descobrir tarde demais o que faltou.',
      payoff: 'Você recebe diagnóstico completo, score, lacunas e prioridades para uma versão direcionada.',
      jobTitle: 'Mostre qual vaga você quer avaliar',
      jobSub: 'Cole o link ou a descrição. A VagaAI organiza os requisitos e prepara a comparação.',
      jobCta: 'Usar esta vaga no diagnóstico →',
      cvTitle: 'Envie o currículo que será sua base',
      cvSub: 'Ele vira seu currículo base na VagaAI. Comparamos sua experiência real com os requisitos desta vaga e criamos uma versão direcionada, sem alterar a base.',
      cvCta: 'Gerar meu diagnóstico completo →',
      quickTitle: 'Conte sua experiência para esta vaga',
      quickSub: 'Escreva do seu jeito. A VagaAI organiza o conteúdo sem inventar experiências.',
      quickCta: 'Montar currículo e gerar diagnóstico →'
    },
    cv_no_job: {
      label: 'Currículo + radar de vagas',
      overviewTitle: 'Seu currículo pode orientar uma busca mais precisa.',
      overviewSub: 'Vamos revisar seu perfil e preparar alertas para oportunidades mais alinhadas.',
      situation: 'Você já tem currículo, mas ainda não escolheu uma vaga específica.',
      problem: 'Procurar em todos os lugares consome tempo e aumenta candidaturas pouco aderentes.',
      implication: 'Sem critérios claros, você pode perder energia em vagas que não combinam com seu momento.',
      payoff: 'Seu currículo fica estruturado e seu radar de vagas nasce com cargo, local e preferências.',
      importTitle: 'Comece pelo currículo que você já tem',
      importSub: 'A VagaAI extrai os dados para você apenas revisar, sem recomeçar do zero. O resultado vira seu currículo base.',
      importCta: 'Revisar meus dados extraídos →',
      formTitle: 'Revise o perfil que orientará currículo e alertas',
      formSub: 'Leva alguns minutos: confirme seus dados para que o currículo e o radar usem o mesmo objetivo profissional.',
      formCta: 'Preparar meu radar de vagas →',
      alertTitle: 'Prepare o radar que vai orientar sua busca',
      alertSub: 'Seu currículo já vai ser montado com este perfil. Confirme o alerta agora e revise tudo antes do primeiro envio.',
      alertCta: 'Gerar meu currículo e preparar alertas →',
      gateTitle: 'Seu currículo e seu radar estão prontos',
      gateSub: 'Crie a conta grátis para salvar o currículo e revisar o primeiro alerta antes de ativar.',
      gateCta: 'Salvar currículo e ativar meu alerta grátis →'
    },
    no_cv_job: {
      label: 'Currículo para uma vaga',
      overviewTitle: 'Transforme sua experiência em um currículo para esta oportunidade.',
      overviewSub: 'A vaga define as prioridades; você conta sua experiência e a VagaAI estrutura o currículo.',
      situation: 'Você já encontrou a oportunidade, mas ainda precisa de um currículo pronto.',
      problem: 'Sem um currículo estruturado, competências relevantes podem ficar invisíveis para o ATS e recrutador.',
      implication: 'Você pode perder uma vaga compatível por não conseguir apresentar sua experiência com clareza.',
      payoff: 'Você recebe currículo profissional direcionado e o diagnóstico de aderência à mesma vaga.',
      jobTitle: 'Mostre a vaga que vai orientar seu currículo',
      jobSub: 'Cole o link ou a descrição para identificarmos cargo, requisitos e prioridades.',
      jobCta: 'Usar esta vaga como direção →',
      quickTitle: 'Conte sua experiência do seu jeito',
      quickSub: 'A VagaAI transforma o conteúdo em um currículo profissional e alinhado à vaga.',
      quickCta: 'Montar currículo e analisar esta vaga →',
      importTitle: 'Comece pelo que você já tem',
      importSub: 'Se houver um currículo antigo, aproveitamos os dados; se não, você conta sua experiência do zero.',
      importCta: 'Revisar os dados para esta vaga →',
      formTitle: 'Conte sobre sua experiência para esta vaga',
      formSub: 'Leva alguns minutos: escreva do seu jeito e montamos um currículo direcionado à vaga.',
      formCta: 'Preparar meu radar de vagas →',
      alertTitle: 'Prepare um radar de vagas parecidas com esta',
      alertSub: 'Além do currículo direcionado, deixe pronto um alerta para oportunidades do mesmo perfil.',
      alertCta: 'Gerar currículo e preparar alertas →',
      gateTitle: 'Seu currículo para esta vaga está pronto',
      gateSub: 'Crie a conta grátis para salvar, baixar e acompanhar a candidatura.',
      gateCta: 'Salvar currículo e continuar candidatura →'
    },
    no_cv_no_job: {
      label: 'Currículo + direção de busca',
      overviewTitle: 'Construa seu currículo e comece a busca com direção.',
      overviewSub: 'A VagaAI organiza sua experiência e usa seu objetivo para orientar oportunidades.',
      situation: 'Você está começando a busca sem um currículo pronto e sem uma vaga definida.',
      problem: 'Sem um perfil estruturado, fica difícil escolher vagas e demonstrar seu valor.',
      implication: 'A busca tende a ficar ampla, cansativa e baseada em tentativas.',
      payoff: 'Você sai com currículo profissional, objetivo claro e caminho para receber vagas compatíveis.',
      importTitle: 'Aproveite o que você já tiver',
      importSub: 'Se houver um arquivo antigo, importamos os dados; se não, você monta do zero com orientação.',
      importCta: 'Revisar meus dados →',
      formTitle: 'Conte sobre você para montarmos seu currículo',
      formSub: 'Leva alguns minutos — escreva do seu jeito. A VagaAI organiza sua experiência e conecta o currículo ao objetivo.',
      formCta: 'Preparar meu radar de vagas →',
      alertTitle: 'Prepare seu radar de oportunidades',
      alertSub: 'Enquanto seu currículo é montado, deixe pronto o alerta de vagas do seu perfil. Ele só é ativado depois que você criar a conta.',
      alertCta: 'Gerar meu currículo grátis →',
      gateTitle: 'Seu currículo está pronto para começar',
      gateSub: 'Crie a conta grátis para salvar, baixar e configurar oportunidades compatíveis.',
      gateCta: 'Salvar e baixar meu currículo grátis →'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getJourneyProfile(flow, state) {
    var key = JOURNEY_PROFILES[flow]
      ? flow
      : deriveFlow(state && state.hasCv, state && state.hasJob);
    var profile = clone(JOURNEY_PROFILES[key] || JOURNEY_PROFILES.no_cv_no_job);
    var preview = state && ((state.job && state.job.preview) || state.preview) || {};
    var cargo = preview.cargo || preview.title ||
      (state && state.alertDraft && state.alertDraft.cargo) || '';
    var empresa = preview.empresa || preview.company || '';
    profile.flow = key || 'no_cv_no_job';
    profile.target = cargo + (cargo && empresa ? ' na ' + empresa : '');
    return profile;
  }

  function setContext(hasCv, hasJob, extra) {
    return write(Object.assign({}, extra || {}, {
      hasCv: hasCv,
      hasJob: hasJob,
      flow: deriveFlow(hasCv, hasJob)
    }));
  }

  function clear() {
    if (storage) {
      try { storage.removeItem(KEY); } catch (e) {}
    }
    return emptyState();
  }

  function fadeNavigate(url, delay) {
    if (typeof document === 'undefined' || typeof window === 'undefined') return;
    document.body.classList.add('ob-leaving');
    setTimeout(function () { window.location.href = url; }, delay || 160);
  }

  function stageProductData() {
    var state = read();
    if (!storage || state.productStagedAt) return state;

    try {
      if (state.cv && state.cv.data) {
        storage.setItem('vagaai_cv', JSON.stringify(state.cv.data));
        storage.setItem('vagaai_cv_base', JSON.stringify(state.cv.data));
        if (state.cv.template) storage.setItem('vagaai_cv_tpl', state.cv.template);
      } else if (state.cv && state.cv.raw) {
        storage.setItem('vagaai_cv_base', JSON.stringify({ raw_text: state.cv.raw }));
      }
      if (state.job && state.job.raw) storage.setItem('vagaai_last_job', state.job.raw);
      if (state.cv && state.cv.raw) storage.setItem('vagaai_last_cv', state.cv.raw);
      if (state.analysis) {
        storage.setItem('vagaai_pending_result', JSON.stringify(state.analysis));
      }
    } catch (e) {}

    return write({ productStagedAt: new Date().toISOString() });
  }

  function alertSignature(userId, draft) {
    return [
      userId || '',
      draft.cargo || '',
      draft.local || '',
      draft.modalidade || '',
      draft.salario || '',
      draft.nivel || '',
      draft.frequencia || 'semanal'
    ].join('|').toLowerCase();
  }

  async function provisionAlert(session, options) {
    var state = read();
    var draft = state.alertDraft || {};
    if (!session || !session.user || !draft.activate || !String(draft.cargo || '').trim()) {
      return { created: false, reason: 'not_requested', state: state };
    }

    var signature = alertSignature(session.user.id, draft);
    if (draft.provisionedSignature === signature) {
      return { created: false, reason: 'already_provisioned', state: state };
    }

    options = options || {};
    var supabaseUrl = options.supabaseUrl || '';
    var anonKey = options.anonKey || '';
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!supabaseUrl || !anonKey || !fetchFn) {
      return { created: false, reason: 'missing_config', state: state };
    }

    var modalidade = {
      remoto: 'Remoto',
      hibrido: 'Híbrido',
      presencial: 'Presencial'
    }[String(draft.modalidade || '').toLowerCase()];
    var salary = parseInt(String(draft.salario || '').replace(/\D/g, ''), 10) || 0;
    var body = {
      user_id: session.user.id,
      email: session.user.email || '',
      cargo_desejado: String(draft.cargo || '').trim(),
      nivel: draft.nivel || 'qualquer',
      cidade: String(draft.local || '').trim(),
      salario_min: salary,
      keywords: Array.isArray(draft.interesses) ? draft.interesses : [],
      frequencia: draft.frequencia || 'semanal',
      ativo: true,
      formato: modalidade ? [modalidade] : [],
      updated_at: new Date().toISOString()
    };

    var response = await fetchFn(supabaseUrl + '/rest/v1/job_alert_profiles?on_conflict=user_id', {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok && response.status !== 204) {
      var detail = '';
      try { detail = await response.text(); } catch (e) {}
      throw new Error('alert_profile_' + response.status + (detail ? ':' + detail : ''));
    }

    var nextDraft = Object.assign({}, draft, {
      provisionedSignature: signature,
      provisionedAt: new Date().toISOString()
    });
    var nextState = write({ alertDraft: nextDraft, nextAction: 'open_dashboard' });
    return { created: true, reason: 'created', state: nextState };
  }

  async function claimAnalysis(session, options) {
    var state = read();
    var analysis = state.analysis;
    if (!session || !session.user || !analysis) {
      return { claimed: false, reason: 'not_available', state: state };
    }

    var existingId = analysis._analysis_id || analysis.analysis_id || state.analysisId;
    if (existingId) {
      return { claimed: false, reason: 'already_claimed', analysisId: existingId, state: state };
    }

    options = options || {};
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchFn) return { claimed: false, reason: 'missing_fetch', state: state };

    var response = await fetchFn('/api/analyze', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'claim_onboarding_analysis',
        result: analysis,
        cv: state.cv && state.cv.raw ? state.cv.raw : '',
        job: state.job && state.job.raw ? state.job.raw : ''
      })
    });
    var payload = {};
    try { payload = await response.json(); } catch (e) {}
    if (!response.ok || !payload.analysis_id) {
      throw new Error('claim_analysis_' + response.status);
    }

    var claimedResult = payload.result || Object.assign({}, analysis, {
      _analysis_id: payload.analysis_id
    });
    var nextState = write({
      analysis: claimedResult,
      analysisId: payload.analysis_id,
      analysisClaimedAt: new Date().toISOString(),
      productStagedAt: null
    });
    return {
      claimed: true,
      reason: 'claimed',
      analysisId: payload.analysis_id,
      state: nextState
    };
  }

  /* ── Currículo base: texto → campos estruturados ───────────────────────
     Os dois funis e a primeira análise do /app gravam o mesmo registro em
     cv_saves, então precisam produzir o mesmo formato. Guardar só o texto
     fazia o hub "Meu Currículo" abrir com "0% completo" para quem tinha
     acabado de entregar um currículo inteiro — e deixava o painel de
     posicionamento sem nada para ler.

     O texto original nunca é descartado: viaja em raw_text ao lado dos
     campos. Os campos são o que a plataforma consegue operar; o raw_text é
     o currículo como a pessoa escreveu. */

  /* ── Ordem cronológica inversa ─────────────────────────────────────────
     Formato recomendado para currículo no Brasil, e até aqui garantido só
     por sorte: nada no código ordenava nada. Na prática, quem conseguia um
     emprego novo e o adicionava via editor o via entrar ABAIXO dos empregos
     antigos, porque a lista era gravada na ordem do DOM. */

  var MESES_PT = {
    jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
    jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12
  };

  // Piso para períodos em curso. Fica acima de qualquer data real (dez/2099 =
  // 209912), então emprego atual sempre vence emprego encerrado.
  var EM_CURSO = 900000;

  function resolverMes(texto, data) {
    if (data.mes >= 1 && data.mes <= 12) return data.mes;
    // "Dez 2022": nome do mês logo antes do ano.
    var antes = texto.slice(Math.max(0, data.idx - 12), data.idx).toLowerCase();
    var nome = antes.match(/([a-zà-ú]{3,})[^a-zà-ú]*$/);
    var mes = nome ? MESES_PT[nome[1].slice(0, 3)] : null;
    return (mes >= 1 && mes <= 12) ? mes : 12; // só o ano: assume dezembro
  }

  // Devolve um número comparável, ou null quando o texto não permite concluir
  // nada. Períodos são texto livre: o parser precisa aguentar "2021 — 2024",
  // "Jan 2020 – Dez 2022", "03/2019 a 08/2021", "2023 - atual" e "2022".
  function periodoOrdem(periodo) {
    var texto = String(periodo == null ? '' : periodo).trim();
    if (!texto) return null;
    var emCurso = /\b(atual|atualmente|presente|momento|hoje|current|present)\b/i.test(texto);

    var datas = [];
    var re = /(?:(\d{1,2})[\/\-.]\s*)?((?:19|20)\d{2})/g;
    var achado;
    while ((achado = re.exec(texto))) {
      datas.push({ mes: achado[1] ? Number(achado[1]) : null, ano: Number(achado[2]), idx: achado.index });
    }
    if (!datas.length) return emCurso ? EM_CURSO : null;

    // Encerrado ordena pelo FIM; em curso ordena pelo INÍCIO — dois empregos
    // atuais empatariam para sempre se o fim fosse a chave, e o mais recente
    // ficaria abaixo do antigo.
    var alvo = emCurso ? datas[0] : datas[datas.length - 1];
    var ordem = alvo.ano * 100 + resolverMes(texto, alvo);
    return emCurso ? EM_CURSO + ordem : ordem;
  }

  // Entradas sem período legível NÃO são reposicionadas: ficam ancoradas no
  // índice original e as datadas se reorganizam ao redor delas. Reordenar o
  // que não se entende é pior do que manter como a pessoa escreveu.
  function ordenarPorPeriodo(itens) {
    var lista = (itens || []).map(function (item, i) {
      return { item: item, i: i, ordem: periodoOrdem(item && item.periodo) };
    });
    var datadas = lista.filter(function (e) { return e.ordem !== null; });
    if (datadas.length < 2) return lista.map(function (e) { return e.item; });

    var posicoes = datadas.map(function (e) { return e.i; }).sort(function (a, b) { return a - b; });
    datadas.sort(function (a, b) {
      // Comparação explícita: Infinity - Infinity daria NaN e quebraria a
      // ordenação quando houvesse dois períodos "atual".
      if (a.ordem !== b.ordem) return a.ordem > b.ordem ? -1 : 1;
      return a.i - b.i;
    });
    var saida = lista.slice();
    datadas.forEach(function (entrada, k) { saida[posicoes[k]] = entrada; });
    return saida.map(function (e) { return e.item; });
  }

  // Aplica a ordem a todas as listas datadas do currículo de uma vez.
  function ordenarCv(cvData) {
    if (!cvData || typeof cvData !== 'object') return cvData;
    ['experiencias', 'formacao', 'cursos', 'projetos'].forEach(function (campo) {
      if (Array.isArray(cvData[campo])) cvData[campo] = ordenarPorPeriodo(cvData[campo]);
    });
    return cvData;
  }

  function formToCvData(form, rawText) {
    form = form || {};
    var cargo = String(form.cargo || '').trim();
    var experiencia = String(form.exp || '').trim();
    var formacao = String(form.form || '').trim();
    var data = {
      nome: String(form.nome || '').trim(),
      titulo_profissional: cargo,
      resumo_profissional: '',
      contato: {
        email: String(form.email || '').trim(),
        telefone: String(form.tel || '').trim(),
        linkedin: '',
        portfolio: '',
        cidade: String(form.cidade || '').trim()
      },
      experiencias: [],
      formacao: [],
      cursos: [],
      idiomas: [],
      projetos: [],
      habilidades: String(form.skills || '')
        .split(/[,;\n]/)
        .map(function (item) { return item.trim(); })
        .filter(Boolean)
    };
    /* O extrator devolve as experiências já separadas (empresa, período,
       bullets). Antes só existia o bloco de texto corrido, e três empregos
       viravam UMA entrada sem empresa e sem período — o que também tornava
       impossível ordenar cronologicamente. O texto corrido continua como
       plano B: quando a IA não consegue separar, é melhor um bloco honesto
       do que empresas inventadas. */
    // O filtro roda ANTES de decidir usar a lista: um array só com entradas
    // vazias voltava [] e ainda assim pulava o plano B, apagando a experiência
    // inteira da pessoa. Lista que não sobrevive ao filtro é lista inexistente.
    var experienciasLimpas = (Array.isArray(form.experiencias) ? form.experiencias : []).map(function (e) {
      e = e || {};
      return {
        cargo: String(e.cargo || '').trim(),
        empresa: String(e.empresa || '').trim(),
        periodo: String(e.periodo || '').trim(),
        bullets: (Array.isArray(e.bullets) ? e.bullets : [])
          .map(function (b) { return String(b || '').trim(); })
          .filter(Boolean)
      };
    }).filter(function (e) { return e.cargo || e.empresa || e.bullets.length; });

    if (experienciasLimpas.length) {
      data.experiencias = experienciasLimpas;
    } else if (experiencia) {
      data.experiencias = [{
        cargo: cargo || 'Experiência profissional',
        empresa: '',
        periodo: '',
        bullets: experiencia
          .split(/\n+/)
          .map(function (line) { return line.replace(/^[-•]\s*/, '').trim(); })
          .filter(Boolean)
      }];
    }

    var formacoesLimpas = (Array.isArray(form.formacao) ? form.formacao : []).map(function (f) {
      f = f || {};
      return {
        curso: String(f.curso || '').trim(),
        instituicao: String(f.instituicao || '').trim(),
        periodo: String(f.periodo || '').trim(),
        situacao: String(f.situacao || '').trim()
      };
    }).filter(function (f) { return f.curso; });

    if (formacoesLimpas.length) {
      data.formacao = formacoesLimpas;
    } else if (formacao) {
      data.formacao = [{ curso: formacao, instituicao: '', periodo: '', situacao: '' }];
    }

    if (rawText) data.raw_text = String(rawText).slice(0, 30000);
    return ordenarCv(data);
  }

  // Falha aqui nunca é fatal: quem chama cai no raw_text puro, que continua
  // sendo um currículo base válido — só menos navegável.
  async function structureCvFromText(raw, options) {
    var text = String(raw || '').trim();
    if (text.length < 50) return null;
    options = options || {};
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchFn) return null;
    try {
      var response = await fetchFn('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'onboarding_cv_extract', cv: text.slice(0, 15000) })
      });
      if (!response.ok) throw new Error('extract_' + response.status);
      var payload = await response.json();
      if (!payload || !payload.form) return null;
      return formToCvData(payload.form, text);
    } catch (error) {
      return null;
    }
  }

  async function persistBaseCv(session, options) {
    var state = read();
    var cv = state.cv || {};
    var rawText = cv.raw ? String(cv.raw).slice(0, 30000) : '';
    if (!session || !session.user || (!cv.data && !rawText) || state.baseCvPersistedAt) {
      return { saved: false, reason: 'not_available', state: state };
    }
    options = options || {};
    var supabaseUrl = options.supabaseUrl || '';
    var anonKey = options.anonKey || '';
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!supabaseUrl || !anonKey || !fetchFn) return { saved: false, reason: 'missing_config', state: state };
    var headers = { apikey: anonKey, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' };
    var list = await fetchFn(supabaseUrl + '/rest/v1/cv_saves?user_id=eq.' + encodeURIComponent(session.user.id) + '&select=id&order=updated_at.desc&limit=1', { headers: headers });
    if (!list.ok) throw new Error('base_cv_lookup_' + list.status);
    var rows = await list.json();
    if (rows && rows[0]) {
      return { saved: false, reason: 'base_exists', state: write({ baseCvPersistedAt: new Date().toISOString() }) };
    }
    // A consulta acima vem antes da estruturação de propósito: quem já tem
    // base não gasta uma chamada de IA para nada.
    var cvData = cv.data ? Object.assign({}, cv.data) : null;
    if (!cvData) cvData = await structureCvFromText(rawText, options);
    if (!cvData) cvData = {};
    if (rawText && !cvData.raw_text) cvData.raw_text = rawText;
    var name = String((cvData && cvData.nome) || cv.name || 'Meu currículo').slice(0, 80);
    var response = await fetchFn(supabaseUrl + '/rest/v1/cv_saves', {
      method: 'POST',
      headers: Object.assign({}, headers, { Prefer: 'return=representation' }),
      body: JSON.stringify({ user_id: session.user.id, name: name, cv_data: cvData, template: cv.template || 'perfil', updated_at: new Date().toISOString() })
    });
    if (!response.ok) throw new Error('base_cv_save_' + response.status);
    return { saved: true, reason: 'created', state: write({ baseCvPersistedAt: new Date().toISOString() }) };
  }

  function trackerFields(state) {
    var result = state.analysis || {};
    var info = result.job_info || {};
    var preview = (state.job && state.job.preview) || {};
    return {
      empresa: String(info.empresa || preview.empresa || 'Empresa não informada').trim(),
      cargo: String(info.cargo || preview.cargo || state.alertDraft.cargo || 'Oportunidade analisada').trim(),
      score: Math.max(0, Math.min(100, Number(result.score) || 0)),
      job_url: String(info.job_url || (state.job && state.job.url) || '').trim(),
      salario: String(info.salario || preview.salario || '').trim()
    };
  }

  async function provisionTracker(session, options) {
    var state = read();
    var analysisId = state.analysisId ||
      (state.analysis && (state.analysis._analysis_id || state.analysis.analysis_id));
    if (!session || !session.user || !analysisId || state.hasJob !== true) {
      return { created: false, reason: 'not_available', state: state };
    }

    options = options || {};
    var supabaseUrl = options.supabaseUrl || '';
    var anonKey = options.anonKey || '';
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!supabaseUrl || !anonKey || !fetchFn) {
      return { created: false, reason: 'missing_config', state: state };
    }

    var headers = {
      apikey: anonKey,
      Authorization: 'Bearer ' + session.access_token
    };
    var existingResponse = await fetchFn(
      supabaseUrl + '/rest/v1/job_tracker?user_id=eq.' +
      encodeURIComponent(session.user.id) + '&analysis_id=eq.' +
      encodeURIComponent(analysisId) + '&select=id&limit=1',
      { headers: headers }
    );
    var existing = [];
    try { existing = await existingResponse.json(); } catch (e) {}
    if (existingResponse.ok && Array.isArray(existing) && existing.length) {
      var existingState = write({
        trackerId: existing[0].id,
        trackerProvisionedAt: new Date().toISOString()
      });
      return { created: false, reason: 'already_provisioned', id: existing[0].id, state: existingState };
    }

    var fields = trackerFields(state);
    var response = await fetchFn(supabaseUrl + '/rest/v1/job_tracker', {
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify({
        user_id: session.user.id,
        analysis_id: analysisId,
        empresa: fields.empresa,
        cargo: fields.cargo,
        score: fields.score,
        status: 'analisada',
        nota: '',
        job_url: fields.job_url || null,
        salario: fields.salario || null,
        origem: 'onboarding'
      })
    });
    var rows = [];
    try { rows = await response.json(); } catch (e) {}
    if (!response.ok) throw new Error('tracker_' + response.status);

    var trackerId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
    var nextState = write({
      trackerId: trackerId,
      trackerProvisionedAt: new Date().toISOString(),
      nextAction: 'open_dashboard'
    });
    return { created: true, reason: 'created', id: trackerId, state: nextState };
  }

  async function consume(session, options) {
    var output = { state: read(), analysis: null, baseCv: null, tracker: null, alert: null, errors: [] };
    try { output.analysis = await claimAnalysis(session, options); }
    catch (error) { output.errors.push({ stage: 'analysis', error: error }); }

    output.state = stageProductData();

    try { output.baseCv = await persistBaseCv(session, options); }
    catch (error) { output.errors.push({ stage: 'base_cv', error: error }); }

    try { output.tracker = await provisionTracker(session, options); }
    catch (error) { output.errors.push({ stage: 'tracker', error: error }); }

    try { output.alert = await provisionAlert(session, options); }
    catch (error) { output.errors.push({ stage: 'alert', error: error }); }

    output.state = read();
    if (output.errors.length && typeof console !== 'undefined' && console.warn) {
      console.warn('VagaAI onboarding handoff incompleto:', output.errors);
    }
    return output;
  }

  return {
    KEY: KEY,
    VERSION: VERSION,
    MAX_AGE_MS: MAX_AGE_MS,
    emptyState: emptyState,
    read: read,
    write: write,
    merge: merge,
    deriveFlow: deriveFlow,
    getJourneyProfile: getJourneyProfile,
    renderJourneySummary: renderJourneySummary,
    setContext: setContext,
    fadeNavigate: fadeNavigate,
    esc: esc,
    track: track,
    trackPageView: trackPageView,
    anonymousBrowserId: anonymousBrowserId,
    currentDepth: currentDepth,
    toggleTheme: toggleTheme,
    syncThemeButton: syncThemeButton,
    stageProductData: stageProductData,
    claimAnalysis: claimAnalysis,
    formToCvData: formToCvData,
    structureCvFromText: structureCvFromText,
    periodoOrdem: periodoOrdem,
    ordenarPorPeriodo: ordenarPorPeriodo,
    ordenarCv: ordenarCv,
    persistBaseCv: persistBaseCv,
    provisionTracker: provisionTracker,
    provisionAlert: provisionAlert,
    consume: consume,
    clear: clear
  };
});
