(function () {
  'use strict';

  var NAV = [
    { id: 'painel',      label: 'Visão geral',    icon: 'grid',  href: '/dashboard', tab: 'painel',      frame: false },
    { id: 'app',         label: 'Analisar vaga',  icon: 'doc',   href: '/app',                           frame: true  },
    { id: 'vagas',       label: 'Candidaturas',   icon: 'brief', href: '/dashboard',  tab: 'vagas',       frame: false },
    { id: 'entrevistas', label: 'Entrevistas',    icon: 'mic',   href: '/dashboard',  tab: 'entrevistas', frame: false },
    { id: 'carta',       label: 'Carta para vaga',icon: 'mail',  href: '/carta',                         frame: true  },
    { id: 'alertas',     label: 'Alertas',        icon: 'bell',  href: '/dashboard',  tab: 'alertas',     frame: false },
    { id: 'plano',       label: 'Conta e plano',  icon: 'user',  href: '/dashboard',  tab: 'plano',       frame: false },
  ];

  var ICONS = {
    grid:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
    doc:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/></svg>',
    brief: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>',
    mic:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>',
    mail:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 7L2 7"/></svg>',
    bell:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    user:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  };

  var CSS = '.sidebar{position:fixed;inset:0 auto 0 0;width:230px;padding:24px 16px 20px;z-index:200;display:flex;flex-direction:column;overflow:hidden;color:#fff;background:linear-gradient(180deg,#07170f,#0b2116)}'
    + '.sidebar::before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 25% 0,rgba(78,206,145,.12),transparent 34%);pointer-events:none}'
    + '.sb-brand{position:relative;display:flex;align-items:center;gap:10px;padding:2px 6px 25px;text-decoration:none}'
    + '.sb-brand-logo{width:30px;height:30px;border-radius:8px;overflow:hidden;flex-shrink:0}'
    + '.sb-brand-full-logo{height:36px;width:auto;display:block}'
    + '.sb-section-label{position:relative;padding:0 10px;margin-bottom:7px;color:rgba(255,255,255,.3);font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;white-space:nowrap;overflow:hidden}'
    + '.sb-nav{position:relative;display:flex;flex-direction:column;gap:3px;flex:1}'
    + '.sb-btn{position:relative;width:100%;border-radius:10px;display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.45);cursor:pointer;border:none;background:transparent;transition:all .18s;padding:10px 12px;font-size:13px;font-weight:600;text-align:left;font-family:inherit;text-decoration:none;white-space:nowrap;overflow:hidden}'
    + '.sb-btn svg{width:17px;height:17px;flex-shrink:0}'
    + '.sb-btn:hover{background:rgba(78,206,145,.1);color:rgba(255,255,255,.85)}'
    + '.sb-btn.active{color:#fff;background:rgba(62,207,142,.13);box-shadow:inset 3px 0 0 #3ecf8e}'
    + '.sb-bottom{position:relative;z-index:1;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;gap:8px;margin-top:auto}'
    + '.sb-support{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:11px 12px;font-size:11px;color:rgba(255,255,255,.42);line-height:1.5;overflow:hidden}'
    + '.sb-support strong{display:block;color:rgba(255,255,255,.75);margin-bottom:2px}'
    + '.sb-profile-row{display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:10px;cursor:pointer;transition:background .15s;overflow:hidden;position:relative}'
    + '.sb-profile-row:hover{background:rgba(255,255,255,.05)}'
    + '.sb-avatar{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#1a7a4a,#2cba74);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;cursor:pointer;flex-shrink:0;border:none;line-height:1}'
    + '.sb-profile-info{min-width:0;overflow:hidden}'
    + '.sb-profile-info strong{display:block;font-size:11.5px;color:rgba(255,255,255,.85);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}'
    + '.sb-profile-info span{font-size:11px;color:rgba(255,255,255,.38);white-space:nowrap}'
    + '.sb-dropdown{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:#0f2018;border:1px solid rgba(78,206,145,.18);border-radius:12px;padding:8px;display:none;z-index:300;box-shadow:0 8px 32px rgba(0,0,0,.5)}'
    + '.sb-dropdown.open{display:block}'
    + '.sb-dropdown-header{padding:8px 8px 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:6px}'
    + '.sb-dropdown-name{font-size:13px;font-weight:700;color:rgba(255,255,255,.9)}'
    + '.sb-dropdown-email{font-size:11px;color:rgba(255,255,255,.38);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
    + '.sb-dropdown-item{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:none;border:none;color:rgba(255,255,255,.65);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;text-align:left}'
    + '.sb-dropdown-item svg{width:14px;height:14px;flex-shrink:0}'
    + '.sb-dropdown-item:hover{background:rgba(255,255,255,.07);color:#fff}'
    + '.sb-dropdown-item.danger:hover{background:rgba(255,80,80,.12);color:#ff8f8f}'
    + '@media(max-width:1050px){.sidebar{width:78px;padding-inline:12px}.sb-brand-full-logo,.sb-section-label,.sb-btn span,.sb-support,.sb-profile-info{display:none}.sb-brand{justify-content:center;padding-inline:0}.sb-btn{justify-content:center;padding:12px}.sb-profile-row{justify-content:center;padding-inline:0}}'
    + '@media(max-width:760px){.sidebar{display:none}}';

  function getActive() {
    var path = location.pathname;
    var tab = new URLSearchParams(location.search).get('tab');
    var hash = location.hash.replace('#', '');
    if (path === '/app' || path.startsWith('/app/')) return 'app';
    if (path === '/carta' || path.startsWith('/carta/')) return 'carta';
    if (path.startsWith('/entrevista')) return 'entrevistas';
    if (tab) return tab;
    if (hash && ['painel','vagas','entrevistas','alertas','plano'].indexOf(hash) > -1) return hash;
    return 'painel';
  }

  function navigate(item) {
    if (window.self !== window.top) {
      window.parent.postMessage({ type: 'vagaai-nav', id: item.id, href: item.href, tab: item.tab, frame: item.frame }, '*');
      return;
    }
    if (typeof window.shellNavigate === 'function') { window.shellNavigate(item); return; }
    window.location.href = item.frame ? item.href : (item.tab ? item.href + '#' + item.tab : item.href);
  }

  function buildHTML(opts) {
    var active = opts.active || getActive();
    var navHtml = NAV.map(function (item) {
      var isActive = item.id === active;
      return '<button class="sb-btn' + (isActive ? ' active' : '') + '" data-nav="' + item.id + '" aria-current="' + (isActive ? 'page' : 'false') + '" aria-label="' + item.label + '">'
        + ICONS[item.icon] + '<span>' + item.label + '</span></button>';
    }).join('');

    return '<aside class="sidebar" id="vagaaiSidebar" aria-label="Menu principal">'
      + '<a class="sb-brand" href="/dashboard" id="sbBrandLink">'
        + '<div class="sb-brand-logo"><img src="/logo-icon.svg" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div>'
        + '<img src="/logo.svg" alt="VagaAI" class="sb-brand-full-logo">'
      + '</a>'
      + '<div class="sb-section-label" aria-hidden="true">Seu espaço</div>'
      + '<nav class="sb-nav" aria-label="Navegação principal">' + navHtml + '</nav>'
      + '<div class="sb-bottom">'
        + '<div class="sb-support"><strong>Precisa de ajuda?</strong>' + (opts.supportText || 'Veja dicas para melhorar suas candidaturas.') + '</div>'
        + '<div class="sb-profile-row" id="sbProfileRow" role="button" aria-haspopup="true" aria-label="Menu da conta">'
          + '<div class="sb-dropdown" id="sbDropdown">'
            + '<div class="sb-dropdown-header"><div class="sb-dropdown-name" id="dropName">—</div><div class="sb-dropdown-email" id="dropEmail">—</div></div>'
            + '<button class="sb-dropdown-item" id="sbDropPerfil"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>Meu Perfil</button>'
            + '<button class="sb-dropdown-item danger" id="sbDropLogout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sair</button>'
          + '</div>'
          + '<button class="sb-avatar" id="avatarBtn" style="border:none;pointer-events:none" tabindex="-1" aria-hidden="true"><span id="avatarInitials">' + (opts.userInitials || '?') + '</span></button>'
          + '<div class="sb-profile-info" id="sbProfileInfo">'
            + '<strong id="sbDisplayName">' + (opts.userName || '—') + '</strong>'
            + '<span id="sbPlanLabel">' + (opts.planLabel || 'VagaAI') + '</span>'
          + '</div>'
        + '</div>'
      + '</div>'
    + '</aside>';
  }

  function bindEvents(sidebar) {
    sidebar.querySelectorAll('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-nav');
        var item = NAV.filter(function (n) { return n.id === id; })[0];
        if (item) navigate(item);
      });
    });

    var brand = sidebar.querySelector('#sbBrandLink');
    if (brand) {
      brand.addEventListener('click', function (e) {
        e.preventDefault();
        navigate(NAV[0]);
      });
    }

    var profileRow = sidebar.querySelector('#sbProfileRow');
    if (profileRow) {
      profileRow.addEventListener('click', function (e) {
        var dd = document.getElementById('sbDropdown');
        if (!dd) return;
        if (dd.contains(e.target)) return;
        var isOpen = dd.classList.contains('open');
        dd.classList.toggle('open', !isOpen);
        profileRow.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    }

    var perfilBtn = sidebar.querySelector('#sbDropPerfil');
    if (perfilBtn) {
      perfilBtn.addEventListener('click', function () {
        VagaaiSidebar.closeDropdown();
        if (typeof window.openPerfil === 'function') window.openPerfil();
        else navigate(NAV.filter(function (n) { return n.id === 'plano'; })[0]);
      });
    }

    var logoutBtn = sidebar.querySelector('#sbDropLogout');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', function () {
        VagaaiSidebar.closeDropdown();
        if (typeof window.logout === 'function') window.logout();
      });
    }

    document.addEventListener('click', function (e) {
      var dd = document.getElementById('sbDropdown');
      var row = document.getElementById('sbProfileRow');
      if (dd && dd.classList.contains('open') && !dd.contains(e.target) && row && !row.contains(e.target)) {
        VagaaiSidebar.closeDropdown();
      }
    });
  }

  window.VagaaiSidebar = {
    NAV: NAV,

    init: function (opts) {
      // Dentro de um iframe (shellFrame do dashboard), a sidebar do pai já é visível
      if (window.self !== window.top) return;
      opts = opts || {};
      if (!document.getElementById('vagaai-sb-css')) {
        var s = document.createElement('style');
        s.id = 'vagaai-sb-css';
        s.textContent = CSS;
        document.head.appendChild(s);
      }
      var tmp = document.createElement('div');
      tmp.innerHTML = buildHTML(opts);
      var sidebar = tmp.firstElementChild;
      var existing = document.getElementById('vagaaiSidebar');
      if (existing) existing.parentNode.replaceChild(sidebar, existing);
      else document.body.insertBefore(sidebar, document.body.firstChild);
      bindEvents(sidebar);
    },

    setActive: function (id) {
      document.querySelectorAll('[data-nav]').forEach(function (el) {
        var active = el.getAttribute('data-nav') === id;
        el.classList.toggle('active', active);
        el.setAttribute('aria-current', active ? 'page' : 'false');
      });
    },

    updateUser: function (name, initials, plan, email) {
      var n = document.getElementById('sbDisplayName'); if (n) n.textContent = name || '—';
      var a = document.getElementById('avatarInitials'); if (a) a.textContent = initials || '?';
      var p = document.getElementById('sbPlanLabel'); if (p) p.textContent = plan || 'VagaAI';
      var dn = document.getElementById('dropName'); if (dn) dn.textContent = name || '—';
      var de = document.getElementById('dropEmail'); if (de) de.textContent = email || '';
    },

    closeDropdown: function () {
      var dd = document.getElementById('sbDropdown');
      if (dd) dd.classList.remove('open');
      var row = document.getElementById('sbProfileRow');
      if (row) row.setAttribute('aria-expanded', 'false');
    },

    hide: function () {
      var sb = document.getElementById('vagaaiSidebar');
      if (sb) sb.style.display = 'none';
    }
  };

  // Legacy compat for dashboard's toggleDropdown / closeDropdown
  window.toggleDropdown = function () {
    var dd = document.getElementById('sbDropdown');
    if (!dd) return;
    var isOpen = dd.classList.contains('open');
    dd.classList.toggle('open', !isOpen);
  };
  window.closeDropdown = function () { VagaaiSidebar.closeDropdown(); };

})();
