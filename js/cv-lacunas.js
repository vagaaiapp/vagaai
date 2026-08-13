/* /js/cv-lacunas.js — fonte única do cálculo "Seu currículo × o mercado".
   Cruza as keywords_faltando das análises de vaga com o texto do currículo base
   e devolve o que o mercado pede e o currículo ainda não cobre. Gratuito e sem
   IA: usa dado que a plataforma já produziu.

   Existia em duas cópias — o hero de /curriculo e a faixa "Seu material" do
   painel — que divergiam em três pontos ao mesmo tempo: o limite da consulta
   (50 vs 200), o filtro de análises arquivadas (ausente vs presente) e o
   extrator de texto do currículo (um incluía projetos e raw_text, o outro não).
   Resultado: as duas telas mostravam números diferentes para o mesmo usuário.

   Quem chama é responsável por passar as análises já filtradas — veja
   ANALISES_QUERY abaixo para o recorte canônico. */
(function (global) {
  'use strict';

  // Recorte canônico das análises que alimentam o cálculo. Arquivadas ficam de
  // fora: se a pessoa arquivou a análise, aquela vaga não deve mais pautar o
  // que ela precisa ter no currículo.
  var ANALISES_QUERY = {
    limite: 200,
    incluirArquivadas: false
  };

  /* Serialização do currículo para busca. Inclui projetos e o raw_text: uma
     competência citada só num projeto, ou só no texto importado, está no
     currículo — contá-la como lacuna mandaria a pessoa adicionar algo que ela
     já tem. */
  function cvParaTexto(d) {
    if (!d) return '';
    if (d.raw_text && !d.nome) return String(d.raw_text);
    var L = [];
    if (d.nome) L.push(d.nome);
    if (d.titulo_profissional) L.push(d.titulo_profissional);
    if (d.resumo_profissional) L.push(d.resumo_profissional);
    (d.experiencias || []).forEach(function (e) {
      L.push([e.cargo, e.empresa].filter(Boolean).join(' '));
      (e.bullets || []).forEach(function (b) { if (b) L.push(b); });
    });
    (d.formacao || []).forEach(function (e) { L.push([e.curso, e.instituicao].filter(Boolean).join(' ')); });
    (d.cursos || []).forEach(function (e) { L.push([e.nome, e.instituicao].filter(Boolean).join(' ')); });
    (d.idiomas || []).forEach(function (e) { L.push([e.idioma, e.nivel].filter(Boolean).join(' ')); });
    (d.habilidades || []).forEach(function (h) { if (h) L.push(h); });
    (d.projetos || []).forEach(function (e) {
      L.push([e.nome, e.contexto].filter(Boolean).join(' '));
      (e.bullets || []).forEach(function (b) { if (b) L.push(b); });
    });
    if (d.raw_text) L.push(String(d.raw_text));
    return L.filter(Boolean).join('\n');
  }

  /* cvData: objeto cv_saves.cv_data. analises: linhas com .result.keywords_faltando.
     Devolve gaps ordenadas por frequência (mais pedidas primeiro). */
  function calcularLacunas(cvData, analises) {
    analises = Array.isArray(analises) ? analises : [];
    var freq = {};
    analises.forEach(function (row) {
      var res = (row && row.result) || {};
      (res.keywords_faltando || []).forEach(function (k) {
        var chave = String(k == null ? '' : k).trim();
        if (chave) freq[chave] = (freq[chave] || 0) + 1;
      });
    });

    var texto = cvParaTexto(cvData).toLowerCase();
    var todas = Object.keys(freq);
    var gaps = todas
      .filter(function (k) { return texto.indexOf(k.toLowerCase()) === -1; })
      .sort(function (a, b) { return freq[b] - freq[a]; });

    return {
      gaps: gaps,
      freq: freq,
      cobertas: todas.length - gaps.length,
      totalCompetencias: todas.length,
      totalVagas: analises.length
    };
  }

  global.VagaAICv = global.VagaAICv || {};
  global.VagaAICv.cvParaTexto = cvParaTexto;
  global.VagaAICv.calcularLacunas = calcularLacunas;
  global.VagaAICv.ANALISES_QUERY = ANALISES_QUERY;
})(typeof window !== 'undefined' ? window : this);
