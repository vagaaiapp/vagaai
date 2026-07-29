(function (root, factory) {
  var api = factory(root && root.localStorage ? root.localStorage : null);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.VagaAIOnboarding = api;
})(typeof window !== 'undefined' ? window : globalThis, function (storage) {
  'use strict';

  var KEY = 'vagaai_onboarding_handoff_v1';
  var VERSION = 1;

  function emptyState() {
    return {
      version: VERSION,
      entry: '',
      flow: '',
      hasCv: null,
      hasJob: null,
      intent: '',
      situation: '',
      job: { raw: '', url: '', preview: null },
      cv: { raw: '', name: '', data: null, template: '' },
      analysis: null,
      marketDiagnosis: null,
      alertDraft: {
        cargo: '',
        local: '',
        modalidade: '',
        salario: '',
        nivel: '',
        interesses: [],
        frequencia: 'semanal',
        scoreMinimo: 70,
        activate: false
      },
      nextAction: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  function merge(base, patch) {
    var out = Object.assign({}, base || {}, patch || {});
    out.job = Object.assign({}, (base && base.job) || {}, (patch && patch.job) || {});
    out.cv = Object.assign({}, (base && base.cv) || {}, (patch && patch.cv) || {});
    out.alertDraft = Object.assign(
      {},
      (base && base.alertDraft) || {},
      (patch && patch.alertDraft) || {}
    );
    return out;
  }

  function read() {
    var fallback = emptyState();
    if (!storage) return fallback;
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return fallback;
      return merge(fallback, JSON.parse(raw));
    } catch (e) {
      return fallback;
    }
  }

  function write(next) {
    var current = read();
    var value = merge(current, next || {});
    value.version = VERSION;
    value.updatedAt = new Date().toISOString();
    if (!value.createdAt) value.createdAt = value.updatedAt;
    if (storage) {
      try { storage.setItem(KEY, JSON.stringify(value)); } catch (e) {}
    }
    return value;
  }

  function deriveFlow(hasCv, hasJob) {
    if (hasCv === true && hasJob === true) return 'cv_job';
    if (hasCv === true && hasJob === false) return 'cv_no_job';
    if (hasCv === false && hasJob === true) return 'no_cv_job';
    if (hasCv === false && hasJob === false) return 'no_cv_no_job';
    return '';
  }

  var JOURNEY_PROFILES = {
    cv_job: {
      label: 'Currículo + vaga',
      overviewTitle: 'Seu currículo encontra uma vaga específica.',
      overviewSub: 'Vamos comparar os dois, mostrar onde você já é forte e o que precisa ajustar antes de aplicar.',
      situation: 'Você já tem currículo e uma oportunidade em vista.',
      problem: 'Um currículo bom ainda pode perder aderência quando não destaca o que esta vaga prioriza.',
      implication: 'Sem essa comparação, você pode enviar uma candidatura genérica e descobrir tarde demais o que faltou.',
      payoff: 'Você recebe diagnóstico completo, score, lacunas e prioridades para uma versão direcionada.',
      jobTitle: 'Mostre qual vaga você quer avaliar',
      jobSub: 'Cole o link ou a descrição. A VagaAI organiza os requisitos e prepara a comparação.',
      jobCta: 'Usar esta vaga no diagnóstico →',
      cvTitle: 'Agora traga o currículo que você pretende enviar',
      cvSub: 'Vamos comparar sua experiência real com os requisitos desta vaga.',
      cvCta: 'Gerar meu diagnóstico completo →',
      quickTitle: 'Conte sua experiência para esta vaga',
      quickSub: 'Escreva do seu jeito. A VagaAI organiza o conteúdo sem inventar experiências.',
      quickCta: 'Montar currículo e gerar diagnóstico →'
    },
    cv_no_job: {
      label: 'Currículo + radar de vagas',
      overviewTitle: 'Seu currículo pode orientar uma busca mais precisa.',
      overviewSub: 'Vamos revisar seu perfil e preparar alertas para oportunidades mais alinhadas.',
      situation: 'Você já tem currículo, mas ainda não escolheu uma vaga específica.',
      problem: 'Procurar em todos os lugares consome tempo e aumenta candidaturas pouco aderentes.',
      implication: 'Sem critérios claros, você pode perder energia em vagas que não combinam com seu momento.',
      payoff: 'Seu currículo fica estruturado e seu radar de vagas nasce com cargo, local e preferências.',
      importTitle: 'Comece pelo currículo que você já tem',
      importSub: 'A VagaAI extrai os dados para você apenas revisar, sem recomeçar do zero.',
      importCta: 'Revisar meus dados extraídos →',
      formTitle: 'Revise o perfil que orientará currículo e alertas',
      formSub: 'Confirme o essencial para que o currículo e o radar usem o mesmo objetivo profissional.',
      formCta: 'Ver meu currículo estruturado →',
      templateTitle: 'Escolha como seu currículo será apresentado',
      templateSub: 'Veja seus próprios dados no modelo e escolha uma versão pronta para revisar.',
      templateCta: 'Gerar meu currículo e preparar alertas →',
      gateTitle: 'Seu currículo e seu radar estão prontos',
      gateSub: 'Crie a conta grátis para salvar o currículo e revisar o primeiro alerta antes de ativar.',
      gateCta: 'Salvar currículo e ativar meu alerta grátis →'
    },
    no_cv_job: {
      label: 'Currículo para uma vaga',
      overviewTitle: 'Transforme sua experiência em um currículo para esta oportunidade.',
      overviewSub: 'A vaga define as prioridades; você conta sua experiência e a VagaAI estrutura o currículo.',
      situation: 'Você já encontrou a oportunidade, mas ainda precisa de um currículo pronto.',
      problem: 'Sem um currículo estruturado, competências relevantes podem ficar invisíveis para o ATS e recrutador.',
      implication: 'Você pode perder uma vaga compatível por não conseguir apresentar sua experiência com clareza.',
      payoff: 'Você recebe currículo profissional direcionado e o diagnóstico de aderência à mesma vaga.',
      jobTitle: 'Mostre a vaga que vai orientar seu currículo',
      jobSub: 'Cole o link ou a descrição para identificarmos cargo, requisitos e prioridades.',
      jobCta: 'Usar esta vaga como direção →',
      quickTitle: 'Conte sua experiência do seu jeito',
      quickSub: 'A VagaAI transforma o conteúdo em um currículo profissional e alinhado à vaga.',
      quickCta: 'Montar currículo e analisar esta vaga →',
      importTitle: 'Comece pelo que você já tem',
      importSub: 'Se houver um currículo antigo, aproveitamos os dados; se não, você conta sua experiência do zero.',
      importCta: 'Revisar os dados para esta vaga →',
      formTitle: 'Conte o essencial para esta oportunidade',
      formSub: 'Confirme sua experiência e competências para montarmos um currículo direcionado à vaga.',
      formCta: 'Ver meu currículo para esta vaga →',
      templateTitle: 'Escolha como seu currículo será apresentado',
      templateSub: 'Veja seus dados no modelo e escolha a versão que você pretende enviar.',
      templateCta: 'Gerar currículo e calcular aderência →',
      gateTitle: 'Seu currículo para esta vaga está pronto',
      gateSub: 'Crie a conta grátis para salvar, baixar e acompanhar a candidatura.',
      gateCta: 'Salvar currículo e continuar candidatura →'
    },
    no_cv_no_job: {
      label: 'Currículo + direção de busca',
      overviewTitle: 'Construa seu currículo e comece a busca com direção.',
      overviewSub: 'A VagaAI organiza sua experiência e usa seu objetivo para orientar oportunidades.',
      situation: 'Você está começando a busca sem um currículo pronto e sem uma vaga definida.',
      problem: 'Sem um perfil estruturado, fica difícil escolher vagas e demonstrar seu valor.',
      implication: 'A busca tende a ficar ampla, cansativa e baseada em tentativas.',
      payoff: 'Você sai com currículo profissional, objetivo claro e caminho para receber vagas compatíveis.',
      importTitle: 'Aproveite o que você já tiver',
      importSub: 'Se houver um arquivo antigo, importamos os dados; se não, você monta do zero com orientação.',
      importCta: 'Revisar meus dados →',
      formTitle: 'Conte o essencial para começar',
      formSub: 'Escreva do seu jeito. A VagaAI organiza sua experiência e conecta o currículo ao objetivo.',
      formCta: 'Ver meu currículo tomando forma →',
      templateTitle: 'Escolha o modelo que representa seu perfil',
      templateSub: 'Veja seus dados aplicados em uma versão profissional antes de decidir.',
      templateCta: 'Gerar meu currículo grátis →',
      gateTitle: 'Seu currículo está pronto para começar',
      gateSub: 'Crie a conta grátis para salvar, baixar e configurar oportunidades compatíveis.',
      gateCta: 'Salvar e baixar meu currículo grátis →'
    }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getJourneyProfile(flow, state) {
    var key = JOURNEY_PROFILES[flow]
      ? flow
      : deriveFlow(state && state.hasCv, state && state.hasJob);
    var profile = clone(JOURNEY_PROFILES[key] || JOURNEY_PROFILES.no_cv_no_job);
    var preview = state && ((state.job && state.job.preview) || state.preview) || {};
    var cargo = preview.cargo || preview.title ||
      (state && state.alertDraft && state.alertDraft.cargo) || '';
    var empresa = preview.empresa || preview.company || '';
    profile.flow = key || 'no_cv_no_job';
    profile.target = cargo + (cargo && empresa ? ' na ' + empresa : '');
    return profile;
  }

  function setContext(hasCv, hasJob, extra) {
    return write(Object.assign({}, extra || {}, {
      hasCv: hasCv,
      hasJob: hasJob,
      flow: deriveFlow(hasCv, hasJob)
    }));
  }

  function clear() {
    if (storage) {
      try { storage.removeItem(KEY); } catch (e) {}
    }
    return emptyState();
  }

  function stageProductData() {
    var state = read();
    if (!storage || state.productStagedAt) return state;

    try {
      if (state.cv && state.cv.data) {
        storage.setItem('vagaai_cv', JSON.stringify(state.cv.data));
        if (state.cv.template) storage.setItem('vagaai_cv_tpl', state.cv.template);
      }
      if (state.job && state.job.raw) storage.setItem('vagaai_last_job', state.job.raw);
      if (state.cv && state.cv.raw) storage.setItem('vagaai_last_cv', state.cv.raw);
      if (state.analysis) {
        storage.setItem('vagaai_pending_result', JSON.stringify(state.analysis));
      }
    } catch (e) {}

    return write({ productStagedAt: new Date().toISOString() });
  }

  function alertSignature(userId, draft) {
    return [
      userId || '',
      draft.cargo || '',
      draft.local || '',
      draft.modalidade || '',
      draft.salario || '',
      draft.nivel || '',
      draft.frequencia || 'semanal'
    ].join('|').toLowerCase();
  }

  async function provisionAlert(session, options) {
    var state = read();
    var draft = state.alertDraft || {};
    if (!session || !session.user || !draft.activate || !String(draft.cargo || '').trim()) {
      return { created: false, reason: 'not_requested', state: state };
    }

    var signature = alertSignature(session.user.id, draft);
    if (draft.provisionedSignature === signature) {
      return { created: false, reason: 'already_provisioned', state: state };
    }

    options = options || {};
    var supabaseUrl = options.supabaseUrl || '';
    var anonKey = options.anonKey || '';
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!supabaseUrl || !anonKey || !fetchFn) {
      return { created: false, reason: 'missing_config', state: state };
    }

    var modalidade = {
      remoto: 'Remoto',
      hibrido: 'Híbrido',
      presencial: 'Presencial'
    }[String(draft.modalidade || '').toLowerCase()];
    var salary = parseInt(String(draft.salario || '').replace(/\D/g, ''), 10) || 0;
    var body = {
      user_id: session.user.id,
      email: session.user.email || '',
      cargo_desejado: String(draft.cargo || '').trim(),
      nivel: draft.nivel || 'qualquer',
      cidade: String(draft.local || '').trim(),
      salario_min: salary,
      keywords: Array.isArray(draft.interesses) ? draft.interesses : [],
      frequencia: draft.frequencia || 'semanal',
      ativo: true,
      formato: modalidade ? [modalidade] : [],
      updated_at: new Date().toISOString()
    };

    var response = await fetchFn(supabaseUrl + '/rest/v1/job_alert_profiles?on_conflict=user_id', {
      method: 'POST',
      headers: {
        apikey: anonKey,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(body)
    });
    if (!response.ok && response.status !== 204) {
      var detail = '';
      try { detail = await response.text(); } catch (e) {}
      throw new Error('alert_profile_' + response.status + (detail ? ':' + detail : ''));
    }

    var nextDraft = Object.assign({}, draft, {
      provisionedSignature: signature,
      provisionedAt: new Date().toISOString()
    });
    var nextState = write({ alertDraft: nextDraft, nextAction: 'open_dashboard' });
    return { created: true, reason: 'created', state: nextState };
  }

  async function claimAnalysis(session, options) {
    var state = read();
    var analysis = state.analysis;
    if (!session || !session.user || !analysis) {
      return { claimed: false, reason: 'not_available', state: state };
    }

    var existingId = analysis._analysis_id || analysis.analysis_id || state.analysisId;
    if (existingId) {
      return { claimed: false, reason: 'already_claimed', analysisId: existingId, state: state };
    }

    options = options || {};
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!fetchFn) return { claimed: false, reason: 'missing_fetch', state: state };

    var response = await fetchFn('/api/analyze', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'claim_onboarding_analysis',
        result: analysis,
        cv: state.cv && state.cv.raw ? state.cv.raw : '',
        job: state.job && state.job.raw ? state.job.raw : ''
      })
    });
    var payload = {};
    try { payload = await response.json(); } catch (e) {}
    if (!response.ok || !payload.analysis_id) {
      throw new Error('claim_analysis_' + response.status);
    }

    var claimedResult = payload.result || Object.assign({}, analysis, {
      _analysis_id: payload.analysis_id
    });
    var nextState = write({
      analysis: claimedResult,
      analysisId: payload.analysis_id,
      analysisClaimedAt: new Date().toISOString(),
      productStagedAt: null
    });
    return {
      claimed: true,
      reason: 'claimed',
      analysisId: payload.analysis_id,
      state: nextState
    };
  }

  function trackerFields(state) {
    var result = state.analysis || {};
    var info = result.job_info || {};
    var preview = (state.job && state.job.preview) || {};
    return {
      empresa: String(info.empresa || preview.empresa || 'Empresa não informada').trim(),
      cargo: String(info.cargo || preview.cargo || state.alertDraft.cargo || 'Oportunidade analisada').trim(),
      score: Math.max(0, Math.min(100, Number(result.score) || 0)),
      job_url: String(info.job_url || (state.job && state.job.url) || '').trim(),
      salario: String(info.salario || preview.salario || '').trim()
    };
  }

  async function provisionTracker(session, options) {
    var state = read();
    var analysisId = state.analysisId ||
      (state.analysis && (state.analysis._analysis_id || state.analysis.analysis_id));
    if (!session || !session.user || !analysisId || state.hasJob !== true) {
      return { created: false, reason: 'not_available', state: state };
    }

    options = options || {};
    var supabaseUrl = options.supabaseUrl || '';
    var anonKey = options.anonKey || '';
    var fetchFn = options.fetchFn || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!supabaseUrl || !anonKey || !fetchFn) {
      return { created: false, reason: 'missing_config', state: state };
    }

    var headers = {
      apikey: anonKey,
      Authorization: 'Bearer ' + session.access_token
    };
    var existingResponse = await fetchFn(
      supabaseUrl + '/rest/v1/job_tracker?user_id=eq.' +
      encodeURIComponent(session.user.id) + '&analysis_id=eq.' +
      encodeURIComponent(analysisId) + '&select=id&limit=1',
      { headers: headers }
    );
    var existing = [];
    try { existing = await existingResponse.json(); } catch (e) {}
    if (existingResponse.ok && Array.isArray(existing) && existing.length) {
      var existingState = write({
        trackerId: existing[0].id,
        trackerProvisionedAt: new Date().toISOString()
      });
      return { created: false, reason: 'already_provisioned', id: existing[0].id, state: existingState };
    }

    var fields = trackerFields(state);
    var response = await fetchFn(supabaseUrl + '/rest/v1/job_tracker', {
      method: 'POST',
      headers: Object.assign({}, headers, {
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      }),
      body: JSON.stringify({
        user_id: session.user.id,
        analysis_id: analysisId,
        empresa: fields.empresa,
        cargo: fields.cargo,
        score: fields.score,
        status: 'analisada',
        nota: '',
        job_url: fields.job_url || null,
        salario: fields.salario || null,
        origem: 'onboarding'
      })
    });
    var rows = [];
    try { rows = await response.json(); } catch (e) {}
    if (!response.ok) throw new Error('tracker_' + response.status);

    var trackerId = Array.isArray(rows) && rows[0] ? rows[0].id : null;
    var nextState = write({
      trackerId: trackerId,
      trackerProvisionedAt: new Date().toISOString(),
      nextAction: 'open_dashboard'
    });
    return { created: true, reason: 'created', id: trackerId, state: nextState };
  }

  async function consume(session, options) {
    var output = { state: read(), analysis: null, tracker: null, alert: null, errors: [] };
    try { output.analysis = await claimAnalysis(session, options); }
    catch (error) { output.errors.push({ stage: 'analysis', error: error }); }

    output.state = stageProductData();

    try { output.tracker = await provisionTracker(session, options); }
    catch (error) { output.errors.push({ stage: 'tracker', error: error }); }

    try { output.alert = await provisionAlert(session, options); }
    catch (error) { output.errors.push({ stage: 'alert', error: error }); }

    output.state = read();
    if (output.errors.length && typeof console !== 'undefined' && console.warn) {
      console.warn('VagaAI onboarding handoff incompleto:', output.errors);
    }
    return output;
  }

  return {
    KEY: KEY,
    VERSION: VERSION,
    emptyState: emptyState,
    read: read,
    write: write,
    merge: merge,
    deriveFlow: deriveFlow,
    getJourneyProfile: getJourneyProfile,
    setContext: setContext,
    stageProductData: stageProductData,
    claimAnalysis: claimAnalysis,
    provisionTracker: provisionTracker,
    provisionAlert: provisionAlert,
    consume: consume,
    clear: clear
  };
});
