/* Avatar único da conta — reutilizado pelo painel e pelo shell lateral.
   A foto é opcional; sem ela, todas as superfícies usam a mesma regra de
   iniciais. Não usa imagem gerada e não guarda foto no localStorage. */
(function (global) {
  'use strict';

  function words(value) {
    return String(value || '').trim().split(/\s+/).filter(Boolean);
  }

  function initials(name, email) {
    var parts = words(name);
    // Primeiros dois nomes: João Victor Heringer continua sendo "JV" em todo
    // o produto, em vez de variar entre "JO", "JV" e "JH" conforme a tela.
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
    var local = String(email || '').split('@')[0].replace(/[^\p{L}\p{N}]/gu, '');
    return Array.from(local).slice(0, 2).join('').toUpperCase() || '?';
  }

  function safeUrl(value) {
    if (!value || typeof value !== 'string') return '';
    try {
      var url = new URL(value, global.location && global.location.origin);
      var local = global.location && /^(localhost|127\.0\.0\.1)$/i.test(global.location.hostname || '');
      if (url.protocol === 'https:' || (local && url.protocol === 'http:')) return url.href;
    } catch (e) {}
    return '';
  }

  function render(element, profile) {
    if (!element) return;
    profile = profile || {};
    var name = profile.name || profile.displayName || '';
    var avatarUrl = safeUrl(profile.avatarUrl || profile.avatar_url || '');
    element.setAttribute('aria-label', name ? 'Foto de perfil de ' + name : 'Foto de perfil');
    element.classList.toggle('has-profile-photo', !!avatarUrl);
    element.style.overflow = 'hidden';
    element.textContent = '';
    if (avatarUrl) {
      var image = document.createElement('img');
      image.src = avatarUrl;
      image.alt = '';
      image.decoding = 'async';
      image.referrerPolicy = 'no-referrer';
      image.style.cssText = 'display:block;width:100%;height:100%;object-fit:cover;border-radius:inherit;';
      image.addEventListener('error', function () {
        if (image.parentNode === element) render(element, { name: name, email: profile.email });
      }, { once: true });
      element.appendChild(image);
      return;
    }
    element.textContent = initials(name, profile.email);
  }

  function renderAll(profile, scope) {
    var root = scope || document;
    if (!root || !root.querySelectorAll) return;
    root.querySelectorAll('[data-profile-avatar]').forEach(function (element) {
      render(element, profile);
    });
  }

  global.VagaAIProfile = {
    initials: initials,
    safeUrl: safeUrl,
    render: render,
    renderAll: renderAll
  };
})(window);
