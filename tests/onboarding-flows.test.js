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
    assert.equal(first.tracker.created, true);
    assert.equal(first.alert.created, true);

    const second = await api.consume(session, options);
    assert.equal(second.errors.length, 0);
    assert.equal(second.analysis.reason, 'already_claimed');
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

  it('preserva o último upload válido quando o seletor é aberto e cancelado', () => {
    assert.match(
      curriculoHtml,
      /function openCvImport\(\)[\s\S]*?if \(state\.imported && state\.importedName\) \{[\s\S]*?showImportSuccess\(state\.importedName\);/
    );
  });
});
