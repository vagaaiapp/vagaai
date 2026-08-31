/* /js/cv-voice.js
   Entrada por voz dos criadores de currículo (/cv e /curriculo).
   Grava → /api/cv-voice transcreve e a IA estrutura no formato do campo.
   O usuário recebe o texto pronto no campo e revisa dali; a transcrição
   crua nunca é exibida. Um "Desfazer" restaura o valor anterior.

   Uso:
     CvVoice.init({ getToken: async () => token, onFilled: (key, field) => {} });
     container.innerHTML = CvVoice.block('sf_resumo', 'resumo', null, 'dica...');

   O módulo injeta o próprio CSS e usa as CSS vars da página quando existem
   (--app-emerald etc.), com fallback para as cores da marca. */
(function(){
  var MAX_SEC = 120;
  var MIN_SEC = 3;

  var _cfg = { getToken: null, onFilled: null };
  var _key = null, _field = '', _idx = null;
  var _rec = null, _stream = null, _chunks = [], _tick = null, _startedAt = 0, _mime = '';
  var _prev = {};

  /* ── GA4 ────────────────────────────────────────────────
     /curriculo roda embedado no painel e não carrega o gtag próprio;
     nesse caso usa o do parent (mesma origem). */
  function track(event, params) {
    try {
      var g = (typeof window.gtag === 'function') ? window.gtag : null;
      if (!g && window.parent && window.parent !== window) {
        try { if (typeof window.parent.gtag === 'function') g = window.parent.gtag; } catch(e) {}
      }
      if (!g) return;
      params = params || {};
      params.page_local = location.pathname;
      g('event', event, params);
    } catch(e) {}
  }

  function injectCss() {
    if (document.getElementById('cvvoice-css')) return;
    var css = ''
      + '.cvmic{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-top:.4rem}'
      + '.cvmic-btn{display:inline-flex;align-items:center;gap:.4rem;padding:.45rem .7rem;background:var(--app-card,rgba(127,127,127,.06));border:1px solid var(--app-border,rgba(127,127,127,.25));border-radius:8px;font-family:inherit;font-size:12px;font-weight:800;color:inherit;cursor:pointer;transition:all .16s;min-height:36px}'
      + '.cvmic-btn:hover:not(:disabled){border-color:var(--app-emerald,#1a7a4a);color:var(--app-emerald,#1a7a4a)}'
      + '.cvmic-btn:disabled{opacity:.55;cursor:not-allowed}'
      + '.cvmic-btn.rec{background:rgba(214,69,69,.1);border-color:rgba(214,69,69,.35);color:#d64545}'
      + '.cvmic-dot{width:7px;height:7px;border-radius:50%;background:#d64545;animation:cvmicPulse 1.1s infinite}'
      + '@keyframes cvmicPulse{0%,100%{opacity:1}50%{opacity:.25}}'
      + '.cvmic-undo{background:none;border:none;font-family:inherit;font-size:11.5px;font-weight:700;color:inherit;opacity:.7;text-decoration:underline;cursor:pointer;padding:.2rem}'
      + '.cvmic-undo:hover{opacity:1}'
      + '.cvmic-time{font-size:12px;font-weight:800;opacity:.65;font-variant-numeric:tabular-nums}'
      + '.cvmic-status{width:100%;font-size:11.5px;line-height:1.45;opacity:.7}'
      + '.cvmic-status.ok{color:var(--app-emerald,#1a7a4a);opacity:1}'
      + '.cvmic-status.err{color:#d64545;opacity:1}'
      + '@media (max-width:720px){.cvmic-btn{min-height:44px}}';
    var st = document.createElement('style');
    st.id = 'cvvoice-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  var MIC_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/></svg>';

  function el(key, sfx) { return document.getElementById('cvmic_'+key+(sfx||'')); }

  function status(key, msg, type) {
    var e = el(key,'_s');
    if (!e) return;
    e.textContent = msg || '';
    e.className = 'cvmic-status' + (type ? ' ' + type : '');
  }
  function setTime(key, sec) {
    var e = el(key,'_t');
    if (!e) return;
    if (sec == null) { e.textContent = ''; return; }
    e.textContent = String(Math.floor(sec/60)).padStart(2,'0') + ':' + String(sec%60).padStart(2,'0');
  }
  function setBtn(key, state, label) {
    var b = el(key,'_b'), l = el(key,'_l');
    if (!b) return;
    b.disabled = (state === 'busy');
    b.className = 'cvmic-btn' + (state === 'rec' ? ' rec' : '') + (state === 'busy' ? ' busy' : '');
    if (l) l.textContent = label;
    var dot = b.querySelector('.cvmic-dot');
    if (state === 'rec' && !dot) { dot = document.createElement('span'); dot.className = 'cvmic-dot'; b.insertBefore(dot, b.firstChild); }
    if (state !== 'rec' && dot) dot.remove();
    var comet = b.querySelector('.vagaai-comet');
    if (state === 'busy' && !comet) {
      comet = document.createElement('span');
      comet.className = 'vagaai-comet vagaai-comet--sm';
      comet.setAttribute('aria-hidden', 'true');
      b.insertBefore(comet, b.firstChild);
    }
    if (state !== 'busy' && comet) comet.remove();
  }

  function pickMime() {
    var types = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    for (var i=0;i<types.length;i++) {
      if (window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(types[i])) return types[i];
    }
    return '';
  }
  function blobToBase64(blob) {
    return new Promise(function(resolve, reject) {
      var r = new FileReader();
      r.onloadend = function(){ resolve(String(r.result||'').split(',')[1] || ''); };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }
  function cleanup() {
    if (_tick) { clearInterval(_tick); _tick = null; }
    if (_stream) { _stream.getTracks().forEach(function(t){ t.stop(); }); _stream = null; }
    _rec = null; _chunks = []; _startedAt = 0;
  }

  /* Contexto extra mandado pra IA. Sobrescrevível por página via init(). */
  function defaultContext(field, idx) {
    var ctx = {};
    if (field === 'resumo') {
      var t = document.getElementById('sf_titulo');
      if (t) ctx.titulo = t.value;
    } else if (idx != null) {
      var c = document.getElementById('efec_cargo_'+idx), e = document.getElementById('efec_emp_'+idx);
      if (c) ctx.cargo = c.value;
      if (e) ctx.empresa = e.value;
    }
    return ctx;
  }

  async function start(key, field, idx) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
      status(key, 'Seu navegador não suporta gravação de áudio. Preencha o campo por texto.', 'err');
      track('cv_voice_failed', { field: field, reason: 'sem_suporte' });
      return;
    }
    // Sem token seguimos: os funis de currículo rodam antes do cadastro e o
    // endpoint aceita anônimo com limite por IP.
    _key = key; _field = field; _idx = (idx == null ? null : idx);
    try {
      status(key, 'Solicitando acesso ao microfone...');
      _mime = pickMime();
      _stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      _chunks = [];
      _rec = _mime ? new MediaRecorder(_stream, { mimeType: _mime }) : new MediaRecorder(_stream);
      _mime = _rec.mimeType || _mime || 'audio/webm';
      _rec.ondataavailable = function(e){ if (e.data && e.data.size > 0) _chunks.push(e.data); };
      _rec.onstop = send;
      _rec.start();

      _startedAt = Date.now();
      _tick = setInterval(function() {
        var s = Math.floor((Date.now() - _startedAt)/1000);
        setTime(key, s);
        if (s >= MAX_SEC && _rec && _rec.state === 'recording') stop();
      }, 250);

      setBtn(key, 'rec', 'Parar e usar');
      setTime(key, 0);
      status(key, 'Gravando... fale naturalmente, até 2 minutos. Cite números sempre que lembrar.');
      track('cv_voice_started', { field: field });
    } catch(e) {
      cleanup();
      setBtn(key, '', 'Preencher falando');
      setTime(key, null);
      status(key, 'Não foi possível acessar o microfone. Verifique a permissão do navegador.', 'err');
      track('cv_voice_failed', { field: field, reason: 'permissao_microfone' });
    }
  }

  function stop() {
    if (!_rec || _rec.state !== 'recording') return;
    setBtn(_key, 'busy', 'Processando...');
    status(_key, 'Transcrevendo e organizando o texto...');
    _rec.stop();
  }

  async function send() {
    var key = _key, field = _field, idx = _idx;
    var secs = _startedAt ? Math.floor((Date.now() - _startedAt)/1000) : 0;
    var blob = new Blob(_chunks, { type: _mime || 'audio/webm' });
    cleanup();
    setTime(key, null);

    if (secs < MIN_SEC || blob.size < 2000) {
      setBtn(key, '', 'Preencher falando');
      status(key, 'Gravação muito curta. Fale por pelo menos alguns segundos.', 'err');
      track('cv_voice_failed', { field: field, reason: 'audio_curto', duration_sec: secs });
      return;
    }

    try {
      var b64 = await blobToBase64(blob);
      var ctx = (_cfg.getContext || defaultContext)(field, idx);
      var token = '';
      try { token = _cfg.getToken ? await _cfg.getToken() : ''; } catch(e) {}

      var headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = 'Bearer ' + token;

      // Vive em /api/interview (action=cv_voice), nao em endpoint proprio: o
      // Hobby plan da Vercel limita a 12 Serverless Functions por deploy e o
      // projeto ja estava no teto.
      var protectedFetch = window.VagaAIAbuse && typeof window.VagaAIAbuse.fetch === 'function'
        ? window.VagaAIAbuse.fetch
        : fetch;
      var res = await protectedFetch('/api/interview', {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({ action: 'cv_voice', field: field, audioBase64: b64, context: ctx })
      });
      var data = await res.json().catch(function(){ return {}; });
      if (!res.ok) {
        setBtn(key, '', 'Preencher falando');
        status(key, data.error || 'Não foi possível processar o áudio. Tente novamente.', 'err');
        track('cv_voice_failed', { field: field, reason: 'http_' + res.status, duration_sec: secs });
        return;
      }

      var target = document.getElementById(key);
      if (!target) return; // campo saiu da tela (editor re-renderizado)
      _prev[key] = target.value;
      target.value = data.text || '';
      if (typeof _cfg.onFilled === 'function') { try { _cfg.onFilled(key, field); } catch(e) {} }
      target.focus();

      setBtn(key, '', 'Gravar de novo');
      status(key, 'Pronto! Revise e ajuste o texto: ele foi escrito a partir do que você falou. ', 'ok');
      var undo = document.createElement('button');
      undo.type = 'button';
      undo.className = 'cvmic-undo';
      undo.textContent = 'Desfazer';
      undo.onclick = function(){ CvVoice.undo(key, field); };
      var st = el(key,'_s');
      if (st) st.appendChild(undo);

      track('cv_voice_completed', { field: field, duration_sec: secs, chars: (data.text || '').length });
    } catch(err) {
      setBtn(key, '', 'Preencher falando');
      status(key, 'Erro de conexão ao enviar o áudio. Tente novamente.', 'err');
      track('cv_voice_failed', { field: field, reason: 'rede', duration_sec: secs });
    }
  }

  var CvVoice = {
    init: function(opts) {
      opts = opts || {};
      _cfg.getToken = opts.getToken || null;
      _cfg.onFilled = opts.onFilled || null;
      _cfg.getContext = opts.getContext || null;
      injectCss();
    },

    /* HTML do bloco de microfone. `key` é o id do textarea alvo. */
    block: function(key, field, idx, hint) {
      var i = (idx == null ? 'null' : JSON.stringify(idx));
      return '<div class="cvmic" id="cvmic_'+key+'">'
        + '<button class="cvmic-btn" type="button" id="cvmic_'+key+'_b" onclick="CvVoice.toggle(\''+key+'\',\''+field+'\','+i+')">'
        + MIC_SVG + '<span id="cvmic_'+key+'_l">Preencher falando</span></button>'
        + '<span class="cvmic-time" id="cvmic_'+key+'_t"></span>'
        + '<div class="cvmic-status" id="cvmic_'+key+'_s">' + (hint || '') + '</div>'
        + '</div>';
    },

    toggle: function(key, field, idx) {
      if (_key === key && _rec && _rec.state === 'recording') return stop();
      if (_rec && _rec.state === 'recording') { status(key, 'Termine a gravação em andamento antes de começar outra.', 'err'); return; }
      start(key, field, idx);
    },

    undo: function(key, field) {
      var target = document.getElementById(key);
      if (!target || !(key in _prev)) return;
      target.value = _prev[key];
      delete _prev[key];
      if (typeof _cfg.onFilled === 'function') { try { _cfg.onFilled(key, field); } catch(e) {} }
      setBtn(key, '', 'Preencher falando');
      status(key, 'Texto anterior restaurado.');
      track('cv_voice_undo', { field: field || '' });
    }
  };

  window.CvVoice = CvVoice;
})();
