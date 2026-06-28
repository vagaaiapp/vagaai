(function () {
  'use strict';

  var NAV = [
    { id: 'painel',      label: 'Vis\u00e3o geral',     icon: 'grid',  href: '/dashboard', tab: 'painel',      frame: false, bottom: true  },
    { id: 'app',         label: 'Analisar vaga',       icon: 'doc',   href: '/app',                           frame: true,  bottom: true  },
    { id: 'vagas',       label: 'Candidaturas',        icon: 'brief', href: '/dashboard', tab: 'vagas',       frame: false, bottom: true  },
    { id: 'entrevistas', label: 'Entrevistas',         icon: 'mic',   href: '/dashboard', tab: 'entrevistas', frame: false, bottom: false },
    { id: 'carta',       label: 'Carta para vaga',     icon: 'mail',  href: '/carta',                         frame: true,  bottom: false },
    { id: 'alertas',     label: 'Alertas',             icon: 'bell',  href: '/dashboard', tab: 'alertas',     frame: false, bottom: true  },
    { id: 'plano',       label: 'Conta',               icon: 'user',  href: '/dashboard', tab: 'plano',       frame: false, bottom: true  },
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
    + '.sb-btn svg{width:17px;height:17px;flex-shrink:0}.sb-btn:hover{background:rgba(78,206,145,.1);color:rgba(255,255,255,.85)}.sb-btn.active{color:#fff;background:rgba(62,207,142,.13);box-shadow:inset 3px 0 0 #3ecf8e}'
    + '.sb-bottom{position:relative;z-index:1;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);display:flex;flex-direction:column;gap:8px;margin-top:auto}'
    + '.sb-support{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:11px 12px;font-size:11px;color:rgba(255,255,255,.42);line-height:1.5;overflow:hidden}.sb-support strong{display:block;color:rgba(255,255,255,.75);margin-bottom:2px}'
    + '.sb-profile-row{display:flex;align-items:center;gap:9px;padding:5px 6px;border-radius:10px;cursor:pointer;transition:background .15s;overflow:hidden;position:relative}.sb-profile-row:hover{background:rgba(255,255,255,.05)}'
    + '.sb-avatar{width:34px;height:34px;border-radius:9px;background:linear-gradient(135deg,#1a7a4a,#2cba74);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;cursor:pointer;flex-shrink:0;border:none;line-height:1}.sb-profile-info{min-width:0;overflow:hidden}.sb-profile-info strong{display:block;font-size:11.5px;color:rgba(255,255,255,.85);font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sb-profile-info span{font-size:11px;color:rgba(255,255,255,.38);white-space:nowrap}'
    + '.sb-dropdown{position:absolute;bottom:calc(100% + 6px);left:0;right:0;background:#0f2018;border:1px solid rgba(78,206,145,.18);border-radius:12px;padding:8px;display:none;z-index:300;box-shadow:0 8px 32px rgba(0,0,0,.5)}.sb-dropdown.open{display:block}.sb-dropdown-header{padding:8px 8px 10px;border-bottom:1px solid rgba(255,255,255,.07);margin-bottom:6px}.sb-dropdown-name{font-size:13px;font-weight:700;color:rgba(255,255,255,.9)}.sb-dropdown-email{font-size:11px;color:rgba(255,255,255,.38);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sb-dropdown-item{width:100%;display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:8px;background:none;border:none;color:rgba(255,255,255,.65);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;transition:all .15s;text-align:left}.sb-dropdown-item svg{width:14px;height:14px;flex-shrink:0}.sb-dropdown-item:hover{background:rgba(255,255,255,.07);color:#fff}.sb-dropdown-item.danger:hover{background:rgba(255,80,80,.12);color:#ff8f8f}'
    + '.vagaai-mobile-ui{display:none}'
    + '@media(max-width:1050px){.sidebar{width:78px;padding-inline:12px}.sb-brand-full-logo,.sb-section-label,.sb-btn span,.sb-support,.sb-profile-info{display:none}.sb-brand{justify-content:center;padding-inline:0}.sb-btn{justify-content:center;padding:12px}.sb-profile-row{justify-content:center;padding-inline:0}}'
    + '@media(max-width:760px){body{padding-top:58px;padding-bottom:86px}.sidebar,.app-sidebar{display:none!important}.app-header,.top-nav,body>nav{top:58px!important}.app-header,.top-nav{position:sticky!important;z-index:640!important;min-height:46px!important;height:auto!important;padding:0 14px!important}.app-header .nav-credits,.top-nav .nav-badge-pro,.top-nav .theme-btn,.top-nav .btn-analisar-top{display:none!important}.app-breadcrumb,.breadcrumb-nav{min-height:46px}.vagaai-mobile-ui{display:block}.vm-top{position:fixed;top:0;left:0;right:0;height:58px;z-index:650;display:flex;align-items:center;justify-content:space-between;padding:0 14px;background:rgba(245,247,245,.92);border-bottom:1px solid rgba(7,18,9,.08);backdrop-filter:blur(18px)}[data-theme="dark"] .vm-top{background:rgba(7,13,8,.9);border-color:rgba(255,255,255,.07)}.vm-menu-btn{width:40px;height:40px;border:1px solid rgba(26,122,74,.18);border-radius:12px;background:#fff;color:#07170f;display:grid;place-items:center;box-shadow:0 8px 24px rgba(7,18,9,.08)}[data-theme="dark"] .vm-menu-btn{background:#0d1610;color:#ddeae0}.vm-menu-btn svg{width:21px;height:21px}.vm-brand{display:flex;align-items:center;gap:8px;text-decoration:none}.vm-brand img:first-child{width:28px;height:28px;border-radius:8px}.vm-brand img:last-child{height:30px;width:auto}.vm-top-spacer{width:40px}.vm-overlay{position:fixed;inset:0;z-index:690;background:rgba(3,12,7,.52);backdrop-filter:blur(2px);opacity:0;pointer-events:none;transition:opacity .2s}.vm-drawer{position:fixed;z-index:700;top:0;bottom:0;left:0;width:min(82vw,310px);padding:22px 18px;background:#fff;border-radius:0 24px 24px 0;box-shadow:24px 0 70px rgba(0,0,0,.22);transform:translateX(-105%);transition:transform .24s cubic-bezier(.2,.8,.2,1);display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain}[data-theme="dark"] .vm-drawer{background:#07170f}.vm-open .vm-overlay{opacity:1;pointer-events:auto}.vm-open .vm-drawer{transform:translateX(0)}.vm-drawer-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.vm-drawer-logo{display:flex;align-items:center;gap:9px}.vm-drawer-logo img:first-child{width:30px;height:30px;border-radius:9px}.vm-drawer-logo img:last-child{height:34px;width:auto}.vm-close{width:36px;height:36px;border:1px solid rgba(7,18,9,.09);border-radius:11px;background:#f5f7f5;color:#07170f;display:grid;place-items:center}[data-theme="dark"] .vm-close{background:#0d1610;color:#ddeae0;border-color:rgba(255,255,255,.1)}.vm-drawer-label{font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#6d8877;margin:8px 4px 10px}.vm-drawer-nav{display:grid;gap:5px}.vm-drawer-btn{width:100%;border:0;border-radius:12px;background:transparent;color:#3d5c47;display:flex;align-items:center;gap:11px;padding:12px 11px;font:700 13px Manrope,system-ui;text-align:left}.vm-drawer-btn svg{width:18px;height:18px}.vm-drawer-btn.active{background:rgba(78,206,145,.14);color:#071209;box-shadow:inset 3px 0 0 #4ece91}[data-theme="dark"] .vm-drawer-btn{color:#8fb29a}[data-theme="dark"] .vm-drawer-btn.active{color:#fff}.vm-drawer-foot{margin-top:auto;padding-top:16px;border-top:1px solid rgba(7,18,9,.08);display:flex;align-items:center;gap:10px;color:#5d7a66}.vm-drawer-foot .sb-avatar{width:36px;height:36px}.vm-drawer-user strong{display:block;font-size:12px;color:#071209}.vm-drawer-user span{font-size:11px}[data-theme="dark"] .vm-drawer-user strong{color:#fff}.vm-bottom{position:fixed;left:10px;right:10px;bottom:10px;height:66px;z-index:660;background:#fff;border:1px solid rgba(7,18,9,.08);border-radius:24px;box-shadow:0 14px 44px rgba(7,18,9,.16);display:grid;grid-template-columns:repeat(5,1fr);overflow:hidden}[data-theme="dark"] .vm-bottom{background:#0d1610;border-color:rgba(255,255,255,.08)}.vm-bottom-btn{border:0;background:transparent;color:#6d8877;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font:700 11px Manrope,system-ui;min-width:0}.vm-bottom-btn svg{width:20px;height:20px}.vm-bottom-btn.active{color:#fff;background:#0b2116}.vm-bottom-btn.active svg{color:#4ece91}.vm-bottom-btn[data-nav="app"]{font-weight:800}.vm-bottom-btn[data-nav="app"].active{background:linear-gradient(180deg,#0b2116,#103b25)}}';

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

  function navButton(item, cls, active) {
    return '<button class="' + cls + (item.id === active ? ' active' : '') + '" data-nav="' + item.id + '" aria-current="' + (item.id === active ? 'page' : 'false') + '" aria-label="' + item.label + '">'
      + ICONS[item.icon] + '<span>' + item.label + '</span></button>';
  }

  function buildHTML(opts) {
    var active = opts.active || getActive();
    var navHtml = NAV.map(function (item) { return navButton(item, 'sb-btn', active); }).join('');
    var drawerHtml = NAV.map(function (item) { return navButton(item, 'vm-drawer-btn', active); }).join('');
    var bottomHtml = NAV.filter(function (item) { return item.bottom; }).map(function (item) { return navButton(item, 'vm-bottom-btn', active); }).join('');

    return '<div id="vagaaiNavShell">'
      + '<aside class="sidebar" id="vagaaiSidebar" aria-label="Menu principal">'
        + '<a class="sb-brand" href="/dashboard" id="sbBrandLink"><div class="sb-brand-logo"><img src="/logo-icon.svg" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div><img src="/logo.svg" alt="VagaAI" class="sb-brand-full-logo"></a>'
        + '<div class="sb-section-label" aria-hidden="true">Seu espa\u00e7o</div>'
        + '<nav class="sb-nav" aria-label="Navega\u00e7\u00e3o principal">' + navHtml + '</nav>'
        + '<div class="sb-bottom"><div class="sb-support"><strong>Precisa de ajuda?</strong>' + (opts.supportText || 'Veja dicas para melhorar suas candidaturas.') + '</div>'
          + '<div class="sb-profile-row" id="sbProfileRow" role="button" aria-haspopup="true" aria-label="Menu da conta">'
            + '<div class="sb-dropdown" id="sbDropdown"><div class="sb-dropdown-header"><div class="sb-dropdown-name" id="dropName">-</div><div class="sb-dropdown-email" id="dropEmail">-</div></div>'
              + '<button class="sb-dropdown-item" id="sbDropPerfil">' + ICONS.user + 'Meu Perfil</button>'
              + '<button class="sb-dropdown-item danger" id="sbDropLogout"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>Sair</button>'
            + '</div>'
            + '<button class="sb-avatar" id="avatarBtn" style="border:none;pointer-events:none" tabindex="-1" aria-hidden="true"><span id="avatarInitials">' + (opts.userInitials || '?') + '</span></button>'
            + '<div class="sb-profile-info" id="sbProfileInfo"><strong id="sbDisplayName">' + (opts.userName || '-') + '</strong><span id="sbPlanLabel">' + (opts.planLabel || 'VagaAI') + '</span></div>'
          + '</div></div>'
      + '</aside>'
      + '<div class="vagaai-mobile-ui">'
        + '<div class="vm-top"><button class="vm-menu-btn" id="vmMenuBtn" aria-label="Abrir menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button><a class="vm-brand" href="/dashboard" id="vmBrandLink"><img src="/logo-icon.svg" alt=""><img src="/logo.svg" alt="VagaAI"></a><span class="vm-top-spacer" aria-hidden="true"></span></div>'
        + '<div class="vm-overlay" id="vmOverlay"></div>'
        + '<aside class="vm-drawer" id="vmDrawer" aria-label="Menu mobile"><div class="vm-drawer-head"><div class="vm-drawer-logo"><img src="/logo-icon.svg" alt=""><img src="/logo.svg" alt="VagaAI"></div><button class="vm-close" id="vmClose" aria-label="Fechar menu">x</button></div><div class="vm-drawer-label">Seu espa\u00e7o</div><nav class="vm-drawer-nav">' + drawerHtml + '</nav><div class="vm-drawer-foot"><div class="sb-avatar"><span id="vmAvatarInitials">' + (opts.userInitials || '?') + '</span></div><div class="vm-drawer-user"><strong id="vmDisplayName">' + (opts.userName || '-') + '</strong><span id="vmPlanLabel">' + (opts.planLabel || 'VagaAI') + '</span></div></div></aside>'
        + '<nav class="vm-bottom" aria-label="Navega\u00e7\u00e3o principal mobile">' + bottomHtml + '</nav>'
      + '</div>'
    + '</div>';
  }

  function closeMobileMenu() {
    document.body.classList.remove('vm-open');
    var btn = document.getElementById('vmMenuBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }

  function bindEvents(shell) {
    shell.querySelectorAll('[data-nav]').forEach(function (el) {
      el.addEventListener('click', function () {
        var id = el.getAttribute('data-nav');
        var item = NAV.filter(function (n) { return n.id === id; })[0];
        if (item) {
          closeMobileMenu();
          navigate(item);
        }
      });
    });

    ['sbBrandLink', 'vmBrandLink'].forEach(function (id) {
      var brand = shell.querySelector('#' + id);
      if (brand) brand.addEventListener('click', function (e) { e.preventDefault(); closeMobileMenu(); navigate(NAV[0]); });
    });

    var menuBtn = shell.querySelector('#vmMenuBtn');
    if (menuBtn) menuBtn.addEventListener('click', function () {
      var open = !document.body.classList.contains('vm-open');
      document.body.classList.toggle('vm-open', open);
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    var overlay = shell.querySelector('#vmOverlay');
    if (overlay) overlay.addEventListener('click', closeMobileMenu);
    var closeBtn = shell.querySelector('#vmClose');
    if (closeBtn) closeBtn.addEventListener('click', closeMobileMenu);

    var profileRow = shell.querySelector('#sbProfileRow');
    if (profileRow) {
      profileRow.addEventListener('click', function (e) {
        var dd = document.getElementById('sbDropdown');
        if (!dd || dd.contains(e.target)) return;
        var isOpen = dd.classList.contains('open');
        dd.classList.toggle('open', !isOpen);
        profileRow.setAttribute('aria-expanded', !isOpen ? 'true' : 'false');
      });
    }

    var perfilBtn = shell.querySelector('#sbDropPerfil');
    if (perfilBtn) perfilBtn.addEventListener('click', function () {
      VagaaiSidebar.closeDropdown();
      if (typeof window.openPerfil === 'function') window.openPerfil();
      else navigate(NAV.filter(function (n) { return n.id === 'plano'; })[0]);
    });

    var logoutBtn = shell.querySelector('#sbDropLogout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      VagaaiSidebar.closeDropdown();
      if (typeof window.logout === 'function') window.logout();
    });

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
      var shell = tmp.firstElementChild;
      var existing = document.getElementById('vagaaiNavShell');
      if (existing) existing.parentNode.replaceChild(shell, existing);
      else document.body.insertBefore(shell, document.body.firstChild);
      bindEvents(shell);
    },
    setActive: function (id) {
      document.querySelectorAll('[data-nav]').forEach(function (el) {
        var active = el.getAttribute('data-nav') === id;
        el.classList.toggle('active', active);
        el.setAttribute('aria-current', active ? 'page' : 'false');
      });
    },
    updateUser: function (name, initials, plan, email) {
      ['sbDisplayName','vmDisplayName'].forEach(function (id) { var n = document.getElementById(id); if (n) n.textContent = name || '-'; });
      ['avatarInitials','vmAvatarInitials'].forEach(function (id) { var a = document.getElementById(id); if (a) a.textContent = initials || '?'; });
      ['sbPlanLabel','vmPlanLabel'].forEach(function (id) { var p = document.getElementById(id); if (p) p.textContent = plan || 'VagaAI'; });
      var dn = document.getElementById('dropName'); if (dn) dn.textContent = name || '-';
      var de = document.getElementById('dropEmail'); if (de) de.textContent = email || '';
    },
    closeDropdown: function () {
      var dd = document.getElementById('sbDropdown');
      if (dd) dd.classList.remove('open');
      var row = document.getElementById('sbProfileRow');
      if (row) row.setAttribute('aria-expanded', 'false');
    },
    closeMobileMenu: closeMobileMenu,
    hide: function () {
      var shell = document.getElementById('vagaaiNavShell');
      if (shell) shell.style.display = 'none';
    }
  };

  window.toggleDropdown = function () {
    var dd = document.getElementById('sbDropdown');
    if (!dd) return;
    dd.classList.toggle('open', !dd.classList.contains('open'));
  };
  window.closeDropdown = function () { VagaaiSidebar.closeDropdown(); };
})();
