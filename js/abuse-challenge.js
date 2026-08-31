(function(global) {
  'use strict';
  var loading = null;

  function loadTurnstile() {
    if (global.turnstile) return Promise.resolve(global.turnstile);
    if (loading) return loading;
    loading = new Promise(function(resolve, reject) {
      var script = document.createElement('script');
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = function() { global.turnstile ? resolve(global.turnstile) : reject(new Error('Desafio indisponível.')); };
      script.onerror = function() { reject(new Error('Não foi possível carregar a confirmação.')); };
      document.head.appendChild(script);
    });
    return loading;
  }

  function ensureStyle() {
    if (document.getElementById('vagaaiAbuseStyle')) return;
    var style = document.createElement('style');
    style.id = 'vagaaiAbuseStyle';
    style.textContent = '.vg-abuse-overlay{position:fixed;inset:0;z-index:2147483646;background:rgba(3,18,14,.72);backdrop-filter:blur(8px);display:grid;place-items:center;padding:20px}.vg-abuse-card{width:min(430px,100%);background:#fffef1;color:#141915;border:2px solid #171a17;border-radius:24px;padding:28px;text-align:center;box-shadow:0 24px 80px rgba(0,0,0,.28);font-family:Figtree,Arial,sans-serif}.vg-abuse-card h2{font-family:"EB Garamond",Georgia,serif;font-size:32px;line-height:1;margin:0 0 10px}.vg-abuse-card p{margin:0 0 20px;color:#58625b}.vg-abuse-widget{min-height:70px;display:grid;place-items:center}.vg-abuse-cancel{margin-top:14px;border:0;background:transparent;text-decoration:underline;cursor:pointer;color:#425149;font:inherit}';
    document.head.appendChild(style);
  }

  function challenge(siteKey, message) {
    if (!siteKey) return Promise.reject(new Error('A confirmação de segurança ainda não está configurada.'));
    ensureStyle();
    return loadTurnstile().then(function(turnstile) {
      return new Promise(function(resolve, reject) {
        var overlay = document.createElement('div');
        overlay.className = 'vg-abuse-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'vgAbuseTitle');
        overlay.innerHTML = '<div class="vg-abuse-card"><h2 id="vgAbuseTitle">Confirme para continuar</h2><p></p><div class="vg-abuse-widget"></div><button class="vg-abuse-cancel" type="button">Cancelar</button></div>';
        overlay.querySelector('p').textContent = message || 'Esta confirmação protege as gratuidades contra uso automatizado.';
        document.body.appendChild(overlay);
        var settled = false;
        function close() { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }
        overlay.querySelector('.vg-abuse-cancel').onclick = function() {
          if (settled) return;
          settled = true; close(); reject(new Error('Confirmação cancelada.'));
        };
        turnstile.render(overlay.querySelector('.vg-abuse-widget'), {
          sitekey: siteKey,
          theme: document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light',
          callback: function(token) {
            if (settled) return;
            settled = true; close(); resolve(token);
          },
          'error-callback': function() {
            if (settled) return;
            settled = true; close(); reject(new Error('Não foi possível concluir a confirmação.'));
          },
          'expired-callback': function() {},
        });
      });
    });
  }

  function withToken(options, token) {
    var next = Object.assign({}, options || {});
    var headers = new Headers(next.headers || {});
    var type = headers.get('Content-Type') || headers.get('content-type') || '';
    if (!/application\/json/i.test(type) || typeof next.body !== 'string') return next;
    var body;
    try { body = JSON.parse(next.body); } catch (_) { return next; }
    body.turnstile_token = token;
    next.headers = headers;
    next.body = JSON.stringify(body);
    return next;
  }

  async function protectedFetch(input, options) {
    var response = await global.fetch(input, options);
    if (response.status !== 403) return response;
    var data = await response.clone().json().catch(function() { return {}; });
    if (data.error !== 'abuse_challenge_required') return response;
    var token = await challenge(data.site_key, data.message);
    return global.fetch(input, withToken(options, token));
  }

  global.VagaAIAbuse = { fetch: protectedFetch, challenge: challenge };
})(window);
