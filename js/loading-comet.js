/* VagaAI · aplica o foguete Lottie compartilhado aos estados de carregamento. */
(function () {
  'use strict';

  var PLAYER_SRC = 'https://unpkg.com/lottie-web@5.13.0/build/player/lottie.min.js';
  var ANIMATION_PATH = '/assets/vagaai-loading-rocket.json';
  var LOADING_TEXT = /^(carregando|gerando|processando|avaliando|montando|preparando|analisando|ainda processando)/i;
  var TAGS = 'div,td,p,span,strong,h1,h2';
  var LOADERS = '.spinner,.ob-spin,.ob-spin-sm,.s4-pdf-spinner,.cvol-icon,.vagaai-comet';
  var playerPromise;
  var animationDataPromise;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var visibilityObserver = window.IntersectionObserver ? new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var host = entries[i].target;
      var animation = host._vagaaiAnimation;
      if (!animation || reduceMotion) continue;
      if (entries[i].isIntersecting) animation.play();
      else animation.pause();
    }
  }, { threshold: 0.01 }) : null;

  function loadPlayer() {
    if (window.lottie && window.lottie.loadAnimation) return Promise.resolve(window.lottie);
    if (playerPromise) return playerPromise;

    playerPromise = new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-vagaai-lottie-player]');
      if (existing) {
        existing.addEventListener('load', function () { resolve(window.lottie); }, { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }

      var script = document.createElement('script');
      script.src = PLAYER_SRC;
      script.async = true;
      script.dataset.vagaaiLottiePlayer = 'true';
      script.onload = function () { resolve(window.lottie); };
      script.onerror = reject;
      document.head.appendChild(script);
    });
    return playerPromise;
  }

  function loadAnimationData() {
    if (animationDataPromise) return animationDataPromise;
    animationDataPromise = fetch(ANIMATION_PATH, { cache: 'force-cache' }).then(function (response) {
      if (!response.ok) throw new Error('Falha ao carregar a animação do VagaAI.');
      return response.json();
    });
    return animationDataPromise;
  }

  function destroyLoader(loader) {
    if (!loader) return;
    var host = loader.querySelector(':scope > .vagaai-lottie-host');
    if (!host) return;
    if (visibilityObserver) visibilityObserver.unobserve(host);
    if (host._vagaaiAnimation) host._vagaaiAnimation.destroy();
    host.remove();
    loader.classList.remove('vagaai-lottie-ready');
  }

  function decorateLoader(loader) {
    if (!loader || loader.nodeType !== 1 || loader.dataset.vagaaiLottie === 'pending' || loader.dataset.vagaaiLottie === 'ready') return;
    loader.dataset.vagaaiLottie = 'pending';

    var host = document.createElement('span');
    host.className = 'vagaai-lottie-host';
    host.setAttribute('aria-hidden', 'true');
    loader.insertBefore(host, loader.firstChild);

    Promise.all([loadPlayer(), loadAnimationData()]).then(function (values) {
      if (!host.isConnected) return;
      var lottie = values[0];
      var animationData = JSON.parse(JSON.stringify(values[1]));
      var animation = lottie.loadAnimation({
        container: host,
        renderer: 'svg',
        loop: true,
        autoplay: false,
        animationData: animationData,
        rendererSettings: { preserveAspectRatio: 'xMidYMid meet' }
      });

      host._vagaaiAnimation = animation;
      animation.addEventListener('DOMLoaded', function () {
        if (!host.isConnected) return;
        loader.dataset.vagaaiLottie = 'ready';
        loader.classList.add('vagaai-lottie-ready');
        if (reduceMotion) animation.goToAndStop(Math.round(animation.totalFrames * 0.35), true);
        else if (visibilityObserver) visibilityObserver.observe(host);
        else animation.play();
      });
    }).catch(function () {
      host.remove();
      loader.dataset.vagaaiLottie = 'fallback';
    });
  }

  function decorateLoaders(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches(LOADERS)) decorateLoader(root);
    var loaders = root.querySelectorAll ? root.querySelectorAll(LOADERS) : [];
    for (var i = 0; i < loaders.length; i++) decorateLoader(loaders[i]);
  }

  function directText(element) {
    var value = '';
    for (var i = 0; i < element.childNodes.length; i++) {
      if (element.childNodes[i].nodeType === 3) value += element.childNodes[i].nodeValue || '';
    }
    return value.trim();
  }

  function hasAnimatedLoader(element) {
    if (element.matches(LOADERS) || element.querySelector(LOADERS)) return true;
    var parent = element.parentElement;
    if (!parent) return false;
    for (var i = 0; i < parent.children.length; i++) {
      if (parent.children[i] !== element && parent.children[i].matches(LOADERS)) return true;
    }
    return false;
  }

  function enhanceElement(element) {
    if (!element || element.nodeType !== 1) return;
    if (element.matches('script,style,button,a,input,textarea,select,option')) return;

    var text = directText(element);
    if (!LOADING_TEXT.test(text)) {
      if (element.classList.contains('vagaai-loading-leaf')) {
        var oldRocket = element.querySelector(':scope > .vagaai-comet');
        if (oldRocket) {
          destroyLoader(oldRocket);
          oldRocket.remove();
        }
      }
      element.classList.remove('vagaai-loading-leaf');
      return;
    }
    if (hasAnimatedLoader(element)) return;

    var rocket = document.createElement('span');
    rocket.className = 'vagaai-comet';
    rocket.setAttribute('aria-hidden', 'true');
    element.insertBefore(rocket, element.firstChild);
    element.classList.add('vagaai-loading-leaf');
    decorateLoader(rocket);
  }

  function scan(root) {
    if (!root) return;
    decorateLoaders(root);
    if (root.nodeType === 1 && root.matches(TAGS)) enhanceElement(root);
    var nodes = root.querySelectorAll ? root.querySelectorAll(TAGS) : [];
    for (var i = 0; i < nodes.length; i++) enhanceElement(nodes[i]);
  }

  function start() {
    scan(document.body);
    if (!window.MutationObserver) return;
    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mutation = mutations[i];
        if (mutation.type === 'characterData') {
          enhanceElement(mutation.target.parentElement);
          continue;
        }
        for (var j = 0; j < mutation.addedNodes.length; j++) {
          var node = mutation.addedNodes[j];
          if (node.nodeType === 1) scan(node);
          else if (node.nodeType === 3) enhanceElement(node.parentElement);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
