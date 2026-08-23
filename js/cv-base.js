/* /js/cv-base.js — acesso ao currículo base a partir de qualquer página.

   O currículo base mora em cv_saves (uma linha por usuário); o localStorage é
   só um cache do navegador. Páginas que liam apenas o cache não enxergavam o
   currículo de quem tinha feito login em outro dispositivo: o dado existia no
   banco e a tela dizia que não havia currículo. */
(function (global) {
  'use strict';

  /* Serialização legível, com seções — para preencher textarea e alimentar
     prompt. Diferente de cvParaTexto (/js/cv-lacunas.js), que produz um blob
     achatado, bom para busca de palavra e ruim para leitura. */
  function cvParaTextoLegivel(d) {
    if (!d) return '';
    if (typeof d === 'string') return d;
    if (d.raw_text && !d.nome) return String(d.raw_text);

    var L = [];
    if (d.nome) L.push(d.nome);
    if (d.titulo_profissional) L.push(d.titulo_profissional);
    var c = d.contato || {};
    var contato = [c.email, c.telefone, c.linkedin, c.portfolio, c.cidade].filter(Boolean).join(' | ');
    if (contato) L.push(contato);

    function secao(titulo, linhas) {
      if (!linhas.length) return;
      L.push('');
      L.push(titulo);
      linhas.forEach(function (l) { if (l) L.push(l); });
    }

    if (d.resumo_profissional) secao('RESUMO PROFISSIONAL', [d.resumo_profissional]);

    var exps = [];
    (d.experiencias || []).forEach(function (e) {
      exps.push([e.cargo, e.empresa].filter(Boolean).join(' - ') + (e.periodo ? ' (' + e.periodo + ')' : ''));
      (e.bullets || []).forEach(function (b) { if (b) exps.push('- ' + b); });
    });
    secao('EXPERIÊNCIA PROFISSIONAL', exps);

    secao('FORMAÇÃO ACADÊMICA', (d.formacao || []).map(function (e) {
      var det = [e.periodo, e.situacao].filter(Boolean).join(' · ');
      return [e.curso, e.instituicao].filter(Boolean).join(' - ') + (det ? ' (' + det + ')' : '');
    }));

    secao('CURSOS E ESPECIALIZAÇÕES', (d.cursos || []).map(function (e) {
      return [e.nome, e.instituicao].filter(Boolean).join(' - ') + (e.periodo ? ' (' + e.periodo + ')' : '');
    }));

    secao('IDIOMAS', (d.idiomas || []).map(function (e) {
      return [e.idioma, e.nivel].filter(Boolean).join(' - ');
    }));

    if ((d.habilidades || []).length) secao('HABILIDADES', [d.habilidades.join(', ')]);

    var projs = [];
    (d.projetos || []).forEach(function (e) {
      projs.push([e.nome, e.contexto].filter(Boolean).join(' - ') + (e.periodo ? ' (' + e.periodo + ')' : ''));
      if (e.link) projs.push(e.link);
      (e.bullets || []).forEach(function (b) { if (b) projs.push('- ' + b); });
    });
    secao('PROJETOS E PORTFÓLIO', projs);

    if (d.raw_text) secao('CONTEÚDO DO CURRÍCULO IMPORTADO', [String(d.raw_text)]);

    return L.join('\n');
  }

  function doCache() {
    // Chaves em ordem de preferência: a base primeiro, depois a legada.
    var chaves = ['vagaai_cv_base', 'vagaai_cv'];
    for (var i = 0; i < chaves.length; i++) {
      try {
        var bruto = localStorage.getItem(chaves[i]);
        if (bruto) return JSON.parse(bruto);
      } catch (e) { /* chave ausente ou JSON corrompido: tenta a próxima */ }
    }
    return null;
  }

  /* Busca o currículo base no banco e cai no cache local se a rede falhar ou o
     usuário não estiver autenticado. Devolve o cv_data (não a linha inteira). */
  function carregarBase(sbClient, userId) {
    if (!sbClient || !userId) return Promise.resolve(doCache());
    return sbClient
      .from('cv_saves')
      .select('cv_data')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .then(function (r) {
        var dados = r && r.data && r.data[0] && r.data[0].cv_data;
        if (!dados) return doCache();
        try { localStorage.setItem('vagaai_cv_base', JSON.stringify(dados)); } catch (e) {}
        return dados;
      })
      .catch(function () { return doCache(); });
  }

  global.VagaAICv = global.VagaAICv || {};
  global.VagaAICv.carregarBase = carregarBase;
  global.VagaAICv.cvParaTextoLegivel = cvParaTextoLegivel;
  global.VagaAICv.curriculoDoCache = doCache;
})(typeof window !== 'undefined' ? window : this);
