/* VagaAI · completa estados textuais de carregamento com o cometa compartilhado. */
(function () {
  'use strict';

  var LOADING_TEXT = /^(carregando|gerando|processando|avaliando|montando|preparando|analisando|ainda processando)/i;
  var TAGS = 'div,td,p,span,strong,h1,h2';
  var LOADERS = '.spinner,.ob-spin,.ob-spin-sm,.s4-pdf-spinner,.cvol-icon,.vagaai-comet';

  function decorateLoader(loader) {
    if (!loader || loader.nodeType !== 1) return;
    for (var i = 0; i < loader.children.length; i++) {
      if (loader.children[i].classList.contains('vagaai-starfield')) return;
    }
    var stars = document.createElement('span');
    stars.className = 'vagaai-starfield';
    stars.setAttribute('aria-hidden', 'true');
    loader.insertBefore(stars, loader.firstChild);
  }

  function decorateLoaders(root) {
    if (!root) return;
    if (root.nodeType === 1 && root.matches(LOADERS)) decorateLoader(root);
    var loaders = root.querySelectorAll ? root.querySelectorAll(LOADERS) : [];
    for (var i = 0; i < loaders.length; i++) decorateLoader(loaders[i]);
  }

  function directText(el) {
    var value = '';
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) value += el.childNodes[i].nodeValue || '';
    }
    return value.trim();
  }

  function hasAnimatedLoader(el) {
    return !!el.querySelector('.spinner,.ob-spin,.ob-spin-sm,.s4-pdf-spinner,.cvol-icon,.vagaai-comet');
  }

  function enhanceElement(el) {
    if (!el || el.nodeType !== 1) return;
    if (el.matches('script,style,button,a,input,textarea,select,option')) return;

    var text = directText(el);
    if (!LOADING_TEXT.test(text)) {
      if (el.classList.contains('vagaai-loading-leaf')) {
        var oldComet = el.querySelector(':scope > .vagaai-comet');
        if (oldComet) oldComet.remove();
      }
      el.classList.remove('vagaai-loading-leaf');
      return;
    }
    if (hasAnimatedLoader(el)) return;

    var comet = document.createElement('span');
    comet.className = 'vagaai-comet';
    comet.setAttribute('aria-hidden', 'true');
    el.insertBefore(comet, el.firstChild);
    decorateLoader(comet);
    el.classList.add('vagaai-loading-leaf');
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
