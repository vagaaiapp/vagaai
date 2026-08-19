/* /js/eventos.js — registro de eventos de produto.

   O /app e a landing page já tinham um `track()` local cada um. As demais
   páginas (dashboard, carta, currículo, entrevista) não tinham nenhum, então
   os passos que acontecem lá — salvar currículo, gerar carta, configurar
   alerta, assinar — não apareciam em lugar nenhum. Este arquivo dá o mesmo
   contrato para todas, sem colidir com os `track()` que já existem.

   Dois cuidados que a implementação garante:

   1. LGPD — o Consent Mode v2 está em modo negado por padrão em cada página;
      o gtag só envia de fato quando a pessoa aceita. Nada aqui muda isso.
      Mesmo assim, NUNCA passe dado pessoal em `props`: nome, e-mail, texto de
      currículo ou de vaga. Só contagem, categoria e faixa.

   2. Páginas embutidas — dashboard carrega /app, /carta, /cv e /curriculo num
      iframe de mesma origem. Dentro dele o gtag local pode não existir; o do
      pai existe e já está configurado. Por isso a resolução tenta o próprio
      frame primeiro e cai no pai. */
(function (global) {
  'use strict';

  // Chaves que nunca devem sair daqui, mesmo se alguém passar por engano.
  var PROIBIDOS = /^(nome|name|email|e_mail|telefone|phone|cpf|cv|curriculo|texto|vaga_texto|conteudo)$/i;

  function limpar(props) {
    var saida = {};
    if (!props || typeof props !== 'object') return saida;
    Object.keys(props).forEach(function (k) {
      if (PROIBIDOS.test(k)) return;
      var v = props[k];
      if (v === null || v === undefined) return;
      // Só escalar, e string curta: evita despejar objeto ou texto longo.
      if (typeof v === 'object') return;
      saida[k] = typeof v === 'string' ? v.slice(0, 80) : v;
    });
    return saida;
  }

  function gtagDisponivel() {
    if (typeof global.gtag === 'function') return global.gtag;
    // Mesma origem: o shell do dashboard já configurou o GA4 e o consentimento.
    try {
      if (global.parent && global.parent !== global && typeof global.parent.gtag === 'function') {
        return global.parent.gtag;
      }
    } catch (e) { /* origem diferente — ignora */ }
    return null;
  }

  function registrar(nome, props) {
    var dados = limpar(props);
    try {
      var va = global.va || (global.parent && global.parent !== global && global.parent.va);
      if (typeof va === 'function') va('event', Object.assign({ name: nome }, dados));
    } catch (e) {}
    try {
      var g = gtagDisponivel();
      if (g) g('event', nome, dados);
    } catch (e) {}
  }

  global.vagaaiTrack = registrar;
})(typeof window !== 'undefined' ? window : this);
