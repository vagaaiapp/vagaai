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

  /* Identidade da VAGA, nao da analise. Reanalisar a mesma vaga cria uma
     analise nova: contar analises fazia o painel dizer "2 vagas" para uma
     vaga so analisada duas vezes. Mesma chave que o hub usa para agrupar
     curriculos por vaga. */
  function chaveDaVaga(row) {
    var info = (row && row.result && row.result.job_info) || {};
    var url = String(info.job_url || '').trim().toLowerCase();
    if (url) return 'u:' + url;
    var empresa = String(info.empresa || '').trim().toLowerCase();
    var cargo = String(info.titulo || info.cargo || '').trim().toLowerCase();
    if (empresa || cargo) return 'v:' + empresa + '|' + cargo;
    return 'a:' + ((row && row.id) || Math.random()); // sem identificacao: nunca agrupa errado
  }

  function contarVagasDistintas(analises) {
    var vistas = {};
    (analises || []).forEach(function (row) { vistas[chaveDaVaga(row)] = true; });
    return Object.keys(vistas).length;
  }

  /* Uma vaga pode ser reanalisada várias vezes. Para a leitura de mercado,
     usamos somente o resultado mais recente de cada oportunidade: reprocessar
     o mesmo anúncio não transforma uma evidência em tendência de mercado. */
  function analisesDistintasPorVaga(analises) {
    var porChave = {};
    var ordem = [];
    (Array.isArray(analises) ? analises : []).forEach(function (row) {
      var chave = chaveDaVaga(row);
      if (!porChave[chave]) {
        porChave[chave] = row;
        ordem.push(chave);
        return;
      }
      var atual = Date.parse((porChave[chave] && porChave[chave].created_at) || 0) || 0;
      var candidata = Date.parse((row && row.created_at) || 0) || 0;
      if (candidata > atual) porChave[chave] = row;
    });
    return ordem.map(function (chave) { return porChave[chave]; });
  }

  /* cvData: objeto cv_saves.cv_data. analises: linhas com .result.keywords_faltando.
     Devolve gaps ordenadas por frequência (mais pedidas primeiro). */
  function calcularLacunas(cvData, analises) {
    analises = Array.isArray(analises) ? analises : [];
    var vagas = analisesDistintasPorVaga(analises);
    var freq = {};
    var nomes = {};
    vagas.forEach(function (row) {
      var res = (row && row.result) || {};
      var vistasNestaVaga = {};
      (res.keywords_faltando || []).forEach(function (k) {
        var chave = String(k == null ? '' : k).trim();
        var normalizada = chave.toLocaleLowerCase('pt-BR');
        if (!chave || vistasNestaVaga[normalizada]) return;
        vistasNestaVaga[normalizada] = true;
        if (!nomes[normalizada]) nomes[normalizada] = chave;
        var nome = nomes[normalizada];
        freq[nome] = (freq[nome] || 0) + 1;
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
      totalVagas: vagas.length,
      totalAnalises: analises.length
    };
  }

  /* O currículo direcionado a uma vaga nunca ensinava nada ao currículo mestre.
     Dez análises produziam dez versões otimizadas, e o principal — o que
     alimenta o re-ranking dos alertas e todas as telas — continuava igual ao do
     primeiro dia. Toda a inteligência gerada ficava presa dentro do `result` da
     análise que a produziu.

     Sobrescrever o mestre com uma versão direcionada seria errado, e o código
     dos alertas já explica por quê: a versão pertence à vaga que a originou e
     enviesaria recomendações futuras. Mas uma competência que a IA já articulou
     em várias versões diferentes não é viés — é uma melhoria do perfil que
     ninguém levou de volta.

     Devolve as habilidades presentes nas versões por vaga e ausentes do
     currículo principal, ordenadas por em quantas vagas apareceram. Quem decide
     o que entra é a pessoa: isto é sugestão, nunca escrita automática. */
  function habilidadesDasVersoes(cvData, analises) {
    var vagas = analisesDistintasPorVaga(Array.isArray(analises) ? analises : []);
    var freq = {};
    var nomes = {};

    vagas.forEach(function (row) {
      var otimizado = (row && row.result && row.result.cv_otimizado) || null;
      var habilidades = (otimizado && otimizado.habilidades) || [];
      if (!Array.isArray(habilidades)) return;
      var vistasNestaVaga = {};
      habilidades.forEach(function (h) {
        var nome = String(h == null ? '' : h).trim();
        if (!nome) return;
        var normalizada = nome.toLocaleLowerCase('pt-BR');
        if (vistasNestaVaga[normalizada]) return;
        vistasNestaVaga[normalizada] = true;
        if (!nomes[normalizada]) nomes[normalizada] = nome;
        freq[nomes[normalizada]] = (freq[nomes[normalizada]] || 0) + 1;
      });
    });

    // Mesmo critério de "já está no currículo" que calcularLacunas usa, para as
    // duas leituras não discordarem sobre o mesmo currículo.
    var texto = cvParaTexto(cvData).toLowerCase();
    var novas = Object.keys(freq)
      .filter(function (k) { return texto.indexOf(k.toLowerCase()) === -1; })
      .sort(function (a, b) { return freq[b] - freq[a]; });

    return { novas: novas, freq: freq, totalVagas: vagas.length };
  }

  global.VagaAICv = global.VagaAICv || {};
  global.VagaAICv.cvParaTexto = cvParaTexto;
  global.VagaAICv.calcularLacunas = calcularLacunas;
  global.VagaAICv.habilidadesDasVersoes = habilidadesDasVersoes;
  global.VagaAICv.chaveDaVaga = chaveDaVaga;
  global.VagaAICv.contarVagasDistintas = contarVagasDistintas;
  global.VagaAICv.analisesDistintasPorVaga = analisesDistintasPorVaga;
  global.VagaAICv.ANALISES_QUERY = ANALISES_QUERY;
})(typeof window !== 'undefined' ? window : this);
