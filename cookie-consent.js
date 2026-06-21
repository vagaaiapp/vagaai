/* VagaAI — banner de consentimento de cookies (LGPD + Google Consent Mode v2)
 * O GA carrega com analytics_storage = 'denied' por padrão (definido inline no <head>).
 * Este script só mostra o banner e, ao aceitar, atualiza o consentimento para 'granted'.
 * Sem escolha registrada → cookies de analytics permanecem bloqueados. */
(function () {
  var KEY = 'vagaai_cookie_consent';
  var choice;
  try { choice = localStorage.getItem(KEY); } catch (e) { choice = null; }
  if (choice === 'granted' || choice === 'denied') return; // já decidiu

  function setConsent(granted) {
    try { localStorage.setItem(KEY, granted ? 'granted' : 'denied'); } catch (e) {}
    if (typeof window.gtag === 'function') {
      window.gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
    }
    var el = document.getElementById('vg-cookie-banner');
    if (el) el.remove();
  }

  function render() {
    if (document.getElementById('vg-cookie-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'vg-cookie-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Aviso de cookies');
    bar.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;z-index:2147483000;max-width:560px;margin:0 auto;background:#0a1a10;color:#e8ede9;border:1px solid rgba(62,207,142,.3);border-radius:14px;padding:16px 18px;box-shadow:0 12px 40px rgba(0,0,0,.35);font-family:Inter,system-ui,sans-serif;display:flex;flex-direction:column;gap:12px';
    bar.innerHTML =
      '<div style="font-size:13px;line-height:1.55;color:#cdd8d1">' +
      'Usamos cookies para entender o uso do site e melhorar sua experiência. ' +
      'Você pode aceitar ou recusar os cookies de análise. ' +
      '<a href="/termos#privacidade" style="color:#3ecf8e;text-decoration:underline">Política de Privacidade</a>.' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap">' +
      '<button id="vg-cookie-reject" style="background:transparent;color:#cdd8d1;border:1px solid rgba(255,255,255,.18);border-radius:9px;padding:9px 16px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit">Recusar</button>' +
      '<button id="vg-cookie-accept" style="background:#3ecf8e;color:#06241a;border:none;border-radius:9px;padding:9px 18px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Aceitar</button>' +
      '</div>';
    document.body.appendChild(bar);
    document.getElementById('vg-cookie-accept').addEventListener('click', function () { setConsent(true); });
    document.getElementById('vg-cookie-reject').addEventListener('click', function () { setConsent(false); });
  }

  if (document.body) render();
  else document.addEventListener('DOMContentLoaded', render);
})();
