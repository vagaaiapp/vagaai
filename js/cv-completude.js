/* /js/cv-completude.js — fonte única do cálculo de completude do currículo base.
   Antes vivia só em /curriculo. O painel passou a mostrar o mesmo percentual,
   e duas cópias da regra divergiriam na primeira mudança de critério. */
(function (global) {
  'use strict';

  // Cada item é um par [rótulo, preenchido?]. O rótulo é usado pelo painel
  // para dizer QUAL campo falta, em vez de só mostrar um percentual.
  function checklist(d) {
    d = d || {};
    var temTexto = !!d.raw_text;
    // Projeto, voluntariado ou freela vale como trajetória: a seção existe
    // justamente para quem ainda não tem emprego formal, e não contar deixaria
    // esse público preso num percentual baixo por algo que já preencheu.
    var temTrajetoria = (d.experiencias || []).length > 0 || (d.projetos || []).length > 0;
    return [
      ['Nome',                   !!d.nome],
      ['Objetivo profissional',  !!d.titulo_profissional],
      ['Resumo profissional',    !!d.resumo_profissional || temTexto],
      ['Experiências',           temTrajetoria || temTexto],
      ['Formação',               (d.formacao || []).length > 0 || temTexto],
      ['Habilidades',            (d.habilidades || []).length > 0 || temTexto]
    ];
  }

  function completude(d) {
    var checks = checklist(d);
    var done = checks.filter(function (c) { return c[1]; }).length;
    return Math.round(done / checks.length * 100);
  }

  // Rótulos dos itens ainda não preenchidos, na ordem do checklist.
  function completudeFaltantes(d) {
    return checklist(d)
      .filter(function (c) { return !c[1]; })
      .map(function (c) { return c[0]; });
  }

  global.VagaAICv = global.VagaAICv || {};
  global.VagaAICv.completude = completude;
  global.VagaAICv.completudeFaltantes = completudeFaltantes;
  global.VagaAICv.completudeChecklist = checklist;
})(typeof window !== 'undefined' ? window : this);
