import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const sharedSource = fs.readFileSync(
  new URL('../onboarding/shared.js', import.meta.url),
  'utf8'
);
const vagaHtml = fs.readFileSync(
  new URL('../onboarding/vaga/index.html', import.meta.url),
  'utf8'
);
const curriculoHtml = fs.readFileSync(
  new URL('../onboarding/curriculo/index.html', import.meta.url),
  'utf8'
);
const analyzeSource = fs.readFileSync(
  new URL('../api/analyze.js', import.meta.url),
  'utf8'
);

function createStorage() {
  const values = new Map();
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createOnboarding(storage = createStorage()) {
  const sandbox = {
    window: { localStorage: storage },
    globalThis: {},
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Math,
    parseInt,
    encodeURIComponent
  };
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(sharedSource, sandbox, { filename: 'onboarding/shared.js' });
  return { api: sandbox.window.VagaAIOnboarding, storage };
}

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return typeof payload === 'string' ? payload : JSON.stringify(payload);
    }
  };
}

function completeFlowState(overrides = {}) {
  return {
    hasCv: true,
    hasJob: true,
    flow: 'cv_job',
    job: {
      raw: 'Cargo: Analista\nEmpresa: Empresa X',
      url: 'https://example.com/vaga',
      preview: { cargo: 'Analista', empresa: 'Empresa X', salario: 'R$ 5.000' }
    },
    cv: {
      raw: 'Curriculo de teste',
      data: { nome: 'Pessoa Teste', objetivo: 'Analista' },
      template: 'moderno'
    },
    analysis: {
      score: 72,
      job_info: {
        cargo: 'Analista',
        empresa: 'Empresa X',
        salario: 'R$ 5.000',
        job_url: 'https://example.com/vaga'
      }
    },
    alertDraft: {
      cargo: 'Analista',
      local: 'São Paulo',
      modalidade: 'remoto',
      salario: '5000',
      nivel: 'pleno',
      interesses: ['SQL', 'Dados'],
      frequencia: 'semanal',
      activate: true
    },
    ...overrides
  };
}

describe('Onboarding adaptativo', () => {
  it('deriva corretamente os quatro cenários', () => {
    const { api } = createOnboarding();
    assert.equal(api.deriveFlow(true, true), 'cv_job');
    assert.equal(api.deriveFlow(true, false), 'cv_no_job');
    assert.equal(api.deriveFlow(false, true), 'no_cv_job');
    assert.equal(api.deriveFlow(false, false), 'no_cv_no_job');
  });

  it('entrega análise, candidatura e alerta uma única vez', async () => {
    const { api } = createOnboarding();
    api.write(completeFlowState());

    const calls = [];
    let trackerId = null;
    const fetchFn = async (url, options = {}) => {
      calls.push({ url, method: options.method || 'GET', body: options.body });
      if (url === '/api/analyze') {
        return response(200, {
          analysis_id: 'analysis-1',
          result: { ...api.read().analysis, _analysis_id: 'analysis-1' }
        });
      }
      if (url.includes('/rest/v1/job_tracker?')) {
        return response(200, trackerId ? [{ id: trackerId }] : []);
      }
      if (url.endsWith('/rest/v1/job_tracker')) {
        trackerId = 'tracker-1';
        return response(201, [{ id: trackerId }]);
      }
      if (url.includes('/rest/v1/job_alert_profiles?')) {
        return response(204, null);
      }
      if (url.includes('/rest/v1/cv_saves?')) {
        return response(200, []);
      }
      if (url.endsWith('/rest/v1/cv_saves')) {
        return response(201, [{ id: 'cv-1' }]);
      }
      return response(404, {});
    };
    const session = {
      access_token: 'token',
      user: { id: 'user-1', email: 'pessoa@example.com' }
    };
    const options = {
      supabaseUrl: 'https://supabase.example',
      anonKey: 'anon',
      fetchFn
    };

    const first = await api.consume(session, options);
    assert.equal(first.errors.length, 0);
    assert.equal(first.analysis.claimed, true);
    assert.equal(first.baseCv.saved, true);
    assert.equal(first.tracker.created, true);
    assert.equal(first.alert.created, true);

    const second = await api.consume(session, options);
    assert.equal(second.errors.length, 0);
    assert.equal(second.analysis.reason, 'already_claimed');
    assert.equal(second.baseCv.reason, 'not_available');
    assert.equal(second.tracker.reason, 'already_provisioned');
    assert.equal(second.alert.reason, 'already_provisioned');

    assert.equal(calls.filter((call) => call.url === '/api/analyze').length, 1);
    assert.equal(
      calls.filter(
        (call) => call.url.endsWith('/rest/v1/job_tracker') && call.method === 'POST'
      ).length,
      1
    );
    assert.equal(
      calls.filter(
        (call) => call.url.includes('/rest/v1/job_alert_profiles?') && call.method === 'POST'
      ).length,
      1
    );
    assert.equal(
      calls.filter(
        (call) => call.url.endsWith('/rest/v1/cv_saves') && call.method === 'POST'
      ).length,
      1
    );
  });

  it('não cria alerta quando a pessoa não solicita o radar', async () => {
    const { api } = createOnboarding();
    const state = completeFlowState({
      hasJob: false,
      flow: 'cv_no_job',
      analysis: null,
      alertDraft: {
        ...completeFlowState().alertDraft,
        activate: false
      }
    });
    api.write(state);

    let alertCalls = 0;
    const result = await api.consume(
      { access_token: 'token', user: { id: 'user-2', email: 'pessoa@example.com' } },
      {
        supabaseUrl: 'https://supabase.example',
        anonKey: 'anon',
        fetchFn: async (url) => {
          if (url.includes('/job_alert_profiles')) alertCalls += 1;
          return response(204, null);
        }
      }
    );

    assert.equal(result.errors.length, 0);
    assert.equal(result.alert.reason, 'not_requested');
    assert.equal(alertCalls, 0);
  });

  it('mantém uma saída explícita após importar o currículo', () => {
    assert.match(curriculoHtml, /id="importNext"[^>]*onclick="continueAfterImport\(\)"/);
    assert.match(curriculoHtml, /function continueAfterImport\(\)/);
    assert.match(curriculoHtml, /function continueWithoutImport\(\)/);
    assert.doesNotMatch(
      curriculoHtml,
      /setTimeout\(function\(\)\s*\{\s*goStep\(3\);\s*\}/,
      'o upload não deve depender de redirecionamento automático'
    );
  });

  it('restaura o CTA quando um currículo já foi processado', () => {
    assert.match(curriculoHtml, /if \(n === 2\) restoreImportUi\(\)/);
    assert.match(
      curriculoHtml,
      /if \(state\.imported && state\.importedName\) showImportSuccess\(state\.importedName\)/
    );
  });

  it('estrutura o currículo importado antes da revisão e mantém fallback local', () => {
    assert.match(curriculoHtml, /function parseImportedCvLocally/);
    assert.match(curriculoHtml, /function structureImportedCv/);
    assert.match(curriculoHtml, /action:'onboarding_cv_extract'/);
    assert.match(curriculoHtml, /function applyFormToInputs/);
    assert.match(curriculoHtml, /id="importReviewNote"/);
    assert.match(curriculoHtml, /exp:\s*exp \|\| joined\.slice/);
    assert.match(
      curriculoHtml,
      /state\.form = mergeImportedForm\(await structureImportedCv\(state\.imported\), localForm\)/
    );
  });

  it('preenche a revisão com dados extraídos de um currículo importado', () => {
    const parserBlock = curriculoHtml.match(
      /function cleanImportedLines[\s\S]*?(?=async function structureImportedCv)/
    );
    assert.ok(parserBlock, 'bloco do parser local não encontrado');

    const sandbox = {};
    vm.createContext(sandbox);
    vm.runInContext(parserBlock[0], sandbox);

    const parsed = sandbox.parseImportedCvLocally([
      'Marina Costa',
      'Analista de Marketing',
      'marina@example.com',
      'Rio de Janeiro - RJ',
      'EXPERIÊNCIA PROFISSIONAL',
      'Analista de Marketing',
      'Empresa X | 2022 a 2024',
      'Criei campanhas digitais',
      'FORMAÇÃO',
      'Marketing - Universidade X',
      'HABILIDADES',
      'Excel',
      'Google Ads'
    ].join('\n'));

    assert.equal(parsed.nome, 'Marina Costa');
    assert.equal(parsed.cargo, 'Analista de Marketing');
    assert.match(parsed.exp, /Empresa X/);
    assert.match(parsed.form, /Universidade X/);
    assert.equal(parsed.skills, 'Excel, Google Ads');
    assert.equal(parsed.email, 'marina@example.com');
    assert.equal(parsed.cidade, 'Rio de Janeiro - RJ');
  });

  it('expõe uma ação de extração separada da geração gratuita', () => {
    assert.match(analyzeSource, /action === 'onboarding_cv_extract'/);
    assert.match(analyzeSource, /OB_CV_EXTRACT_IP_LIMIT/);
    assert.match(analyzeSource, /ip:\$\{extractIp\}:obcvextract/);
  });

  it('limita a geração gratuita pelo navegador e usa o IP apenas contra abuso', () => {
    // A identidade anônima vive em shared.js; cada funil só a referencia.
    assert.match(sharedSource, /var ANON_ID_KEY = 'vagaai_ob_anon_id'/);
    assert.match(sharedSource, /function anonymousBrowserId\(\)/);
    assert.match(curriculoHtml, /var getAnonymousBrowserId = OB\.anonymousBrowserId/);
    assert.match(curriculoHtml, /anon_id: getAnonymousBrowserId\(\)/);
    assert.match(vagaHtml, /var getAnonymousBrowserId = OB\.anonymousBrowserId/);
    assert.match(
      vagaHtml,
      /action:\s*'onboarding_cv'[\s\S]*?anon_id:\s*getAnonymousBrowserId\(\)/
    );

    assert.match(analyzeSource, /const OB_CV_ANON_LIMIT = 2/);
    assert.match(analyzeSource, /const OB_CV_IP_ABUSE_LIMIT = 100/);
    assert.match(analyzeSource, /anon:\$\{obAnonHash\}:obcv/);
    assert.match(analyzeSource, /ip:\$\{obIp\}:obcv-abuse/);
    assert.doesNotMatch(analyzeSource, /ip:\$\{obIp\}:obcv`/);
    assert.match(curriculoHtml, /limitData\.reason === 'network_abuse_limit'/);
    assert.match(curriculoHtml, /function showNetworkLimit\(\)/);
  });

  it('conta apenas currículos gerados com sucesso', () => {
    const block = analyzeSource.match(
      /if \(action === 'onboarding_cv'\) \{[\s\S]*?(?=\n  \/\/ .*Modo: Raio-X)/
    );
    assert.ok(block, 'bloco onboarding_cv não encontrado');
    const source = block[0];
    const validationAt = source.indexOf("if (!obNome)");
    const limitAt = source.indexOf('isWithinLimit');
    const successAt = source.indexOf('await countLimit');
    const responseAt = source.indexOf("return res.status(200).json({ cv: obClean })");

    assert.ok(validationAt >= 0 && validationAt < limitAt, 'validação deve ocorrer antes do limite');
    assert.ok(successAt > limitAt, 'contador de sucesso deve ocorrer após o preflight');
    assert.ok(responseAt > successAt, 'contador deve ser atualizado somente antes da resposta de sucesso');
  });

  it('informa os mesmos formatos que os campos de upload aceitam', () => {
    for (const html of [vagaHtml, curriculoHtml]) {
      assert.match(html, /accept="\.txt,\.pdf,\.docx"/);
      assert.match(html, /PDF, DOCX ou TXT/);
      assert.doesNotMatch(html, /PDF, Word ou TXT/);
    }
  });

  it('permite reenviar o mesmo arquivo depois de uma falha', () => {
    assert.match(curriculoHtml, /function openCvImport\(\)[\s\S]*?input\.value = '';/);
    assert.match(vagaHtml, /function openCvUpload\(\)[\s\S]*?input\.value = '';/);
  });

  it('oferece um diagnóstico completo sem escolhas sobrepostas', () => {
    // O checklist de valor continua existindo, mas como contexto da etapa 2 —
    // não mais atrás de um clique de confirmação na etapa 1.
    assert.match(vagaHtml, /O diagnóstico inclui:/);
    assert.match(vagaHtml, /state\.intent = 'complete'/);
    // Proteção original: não voltar a ter perguntas de intenção sobrepostas.
    assert.doesNotMatch(vagaHtml, /Qual seu maior receio com essa vaga/);
    assert.doesNotMatch(vagaHtml, /onclick="pickIntent\(/);
  });

  it('não pede confirmação extra depois de responder que tem uma vaga', () => {
    // Responder "Sim, analisar uma vaga" leva direto à etapa 2. O painel
    // intermediário ("Começar diagnóstico gratuito") foi removido — sem ele,
    // a resposta da etapa 1 é o único clique necessário.
    // Ancorado no markup, não no texto solto: a frase ainda aparece em
    // comentários explicando por que o painel saiu.
    assert.doesNotMatch(vagaHtml, /startCompleteDiagnostic/);
    assert.doesNotMatch(vagaHtml, /id="intentPanel"/);
    assert.doesNotMatch(vagaHtml, /<button[^>]*>Começar diagnóstico/);
    assert.match(vagaHtml, /function chooseHasJob\(hasJob\)[\s\S]*?goStep\(2\)/);
    // Quem chega redirecionado de /curriculo já respondeu lá: não repergunta.
    assert.match(vagaHtml, /skipQualification[\s\S]*?initialStep = 2/);
  });

  it('leva quem não tem vaga para uma jornada de currículo com alerta como objetivo', () => {
    assert.match(vagaHtml, /Sim, analisar uma vaga →/);
    assert.match(vagaHtml, /Não, encontrar vagas para meu perfil →/);
    assert.match(
      vagaHtml,
      /\/onboarding\/curriculo\/1\?mode=cv_no_job&amp;goal=alerts|\/onboarding\/curriculo\/1\?mode=cv_no_job&goal=alerts/
    );
    assert.doesNotMatch(vagaHtml, /Não, quero melhorar meu currículo/);

    assert.match(curriculoHtml, /state\.goal === 'alerts'/);
    assert.match(curriculoHtml, /Salvar currículo e ativar meu alerta grátis →/);
    assert.match(curriculoHtml, /state\.goal = goal === 'alerts' \? 'alerts' : ''/);
    assert.match(
      curriculoHtml,
      /_wantAlerts = state\.goal === 'alerts' && state\.alertDraft\.activate !== false/
    );
  });

  it('preserva o último upload válido quando o seletor é aberto e cancelado', () => {
    assert.match(
      curriculoHtml,
      /function openCvImport\(\)[\s\S]*?if \(state\.imported && state\.importedName\) \{[\s\S]*?showImportSuccess\(state\.importedName\);/
    );
  });
});

/* Regressões de bugs encontrados em auditoria. Não substituem um teste de
   jornada real (que exigiria um DOM), mas impedem a reintrodução de cada
   causa raiz específica. */
describe('Regressões de navegação e estado', () => {
  it('não deixa a etapa de carregamento órfã quando nenhuma análise roda', () => {
    // Refresh/deep-link na etapa 4 mostrava spinner eterno, sem saída na tela
    assert.match(vagaHtml, /if \(n === 4 && !state\.result && !_analysisRunning\)/);
    assert.match(vagaHtml, /function showAnalysisInterrupted\(\)/);
    // O markup de carregamento precisa voltar na tentativa seguinte
    assert.match(vagaHtml, /function resetStep4\(\)/);
    assert.match(vagaHtml, /resetStep4\(\);[\s\S]{0,140}goStep\(4\)/);
    // Quem bateu o limite não recebe um "retomar" que falharia de novo
    assert.match(vagaHtml, /state\.analysisBlocked = true/);
    assert.match(vagaHtml, /if \(state\.analysisBlocked\) showLimitReached\(\)/);
  });

  it('reavalia o CTA do currículo ao voltar para a etapa 3', () => {
    assert.match(vagaHtml, /if \(n === 3\) configureCvStep\(\)/);
    // O estado do botão vem de state.cv, não de quem preencheu por último
    assert.match(vagaHtml, /cvNext\.disabled = String\(state\.cv \|\| ''\)\.trim\(\)\.length < 50/);
  });

  it('anda no histórico de verdade ao voltar uma etapa', () => {
    for (const html of [vagaHtml, curriculoHtml]) {
      assert.match(html, /history\.pushState\(\{ step:n, depth: currentDepth\(\) \+ 1 \}/);
      assert.match(html, /if \(currentDepth\(\) > 0\) \{ history\.back\(\); return; \}/);
    }
  });

  it('só registra escolha de modelo quando a pessoa escolhe', () => {
    assert.match(curriculoHtml, /if \(state\.tpl\) applyTpl\(state\.tpl\)/);
    const applyBody = curriculoHtml.match(/function applyTpl\(tpl\) \{[\s\S]*?\n\}/);
    const pickBody = curriculoHtml.match(/function pickTpl\(tpl\) \{[\s\S]*?\n\}/);
    assert.ok(applyBody && pickBody);
    assert.doesNotMatch(applyBody[0], /onboarding_cv_template_selected/);
    assert.doesNotMatch(applyBody[0], /_tplViews\+\+/);
    assert.match(pickBody[0], /onboarding_cv_template_selected/);
  });

  it('mantém as utilidades comuns em um lugar só', () => {
    for (const html of [vagaHtml, curriculoHtml]) {
      assert.match(html, /var OB = window\.VagaAIOnboarding/);
      for (const dup of [
        /^function esc\(/m,
        /^function track\(/m,
        /^function trackPageView\(/m,
        /^function getAnonymousBrowserId\(/m,
        /^function currentDepth\(/m,
        /^function toggleTheme\(/m
      ]) {
        assert.doesNotMatch(html, dup);
      }
    }
    for (const shared of [
      /function esc\(/,
      /function track\(/,
      /function trackPageView\(/,
      /function anonymousBrowserId\(/,
      /function currentDepth\(/,
      /function toggleTheme\(/
    ]) {
      assert.match(sharedSource, shared);
    }
  });
});
