/* /js/sessao.js — o cache do navegador pertence a UMA conta.

   Os dados pessoais que as telas guardam em localStorage (currículo, foto,
   última vaga colada, resultado pendente, estado do onboarding) nunca foram
   carimbados com o dono, e logout() só chamava supabase.signOut(). Num
   computador compartilhado — casa, lan house, biblioteca, escritório — a
   próxima pessoa a entrar abria o Treino de entrevista e encontrava o
   currículo de quem usou antes já preenchido no campo, e simulava a entrevista
   contra o CV alheio. Mesma coisa na Carta (?prefill=last) e no editor de
   currículo.

   O banco nunca teve esse problema: RLS por auth.uid() em todas as tabelas de
   usuário, verificado por simulação de JWT (leitura e escrita, zero linhas de
   terceiros). O navegador era o único lugar onde dados de duas contas podiam
   se encontrar.

   Duas defesas, porque logout não é o único caminho: a sessão também expira, o
   usuário fecha a aba, ou outra pessoa entra sem que a primeira tenha saído.
   1. limpar() no logout.
   2. adotar(userId) no init de toda página autenticada — se o cache é de outra
      conta, apaga ANTES que qualquer tela leia. É síncrona e sem rede de
      propósito: precisa terminar antes do primeiro getItem. */
(function (global) {
  'use strict';

  var DONO = 'vagaai_cache_dono';

  /* Só conteúdo de pessoa. Tema, consentimento de cookie e o template escolhido
     são preferências do aparelho e sobrevivem à troca de conta — apagá-las não
     protege ninguém e só piora a experiência de quem divide o computador. */
  var PESSOAIS = [
    'vagaai_cv',
    'vagaai_cv_base',
    'vagaai_cv_photo',
    'vagaai_cv_context',
    'vagaai_cv_version',
    'vagaai_cv_step',
    'vagaai_cv_from_analysis',
    'vagaai_cv_editor_source',
    'vagaai_last_cv',
    'vagaai_last_job',
    'vagaai_pending_result',
    'vagaai_view_analysis',
    'vagaai_return_cv_data',
    'vagaai_analyzed',
    'vagaai_alert_ext',
    'vagaai_job_fb',
    'vagaai_job_return',
    'vagaai_prefill_url',
    'vagaai_pending_checkout',
    'vagaai_from_signup',
    'vagaai_scroll_to',
    'vagaai_onboarding_handoff_v1',
    'vagaai_tour_done'
  ];

  /* Chaves com sufixo variável — uma por vaga vinda do alerta. */
  var PREFIXOS = ['vagaai_alert_prefill_'];

  function chavesPessoais() {
    var achadas = PESSOAIS.slice();
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k) continue;
        for (var j = 0; j < PREFIXOS.length; j++) {
          if (k.indexOf(PREFIXOS[j]) === 0) { achadas.push(k); break; }
        }
      }
    } catch (e) {}
    return achadas;
  }

  function limpar() {
    try {
      chavesPessoais().forEach(function (k) { localStorage.removeItem(k); });
      localStorage.removeItem(DONO);
    } catch (e) {}
  }

  /* Devolve true quando detectou troca de conta e limpou — a página pode usar
     isso para recarregar do banco em vez de confiar no que tinha em memória. */
  function adotar(userId) {
    if (!userId) return false;
    var trocou = false;
    try {
      var dono = localStorage.getItem(DONO);
      if (dono && dono !== userId) { limpar(); trocou = true; }
      localStorage.setItem(DONO, userId);
    } catch (e) {}
    return trocou;
  }

  global.VagaAISessao = {
    adotar: adotar,
    limpar: limpar,
    chavesPessoais: chavesPessoais
  };
})(typeof window !== 'undefined' ? window : this);
