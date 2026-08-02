import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dashboard = read('dashboard/index.html');
const sidebar = read('sidebar.js');
const app = read('app/index.html');
const curriculo = read('curriculo/index.html');
const cv = read('cv/index.html');
const alerts = read('api/send-alerts.js');
const migration = read('migrations/024_cv_saves_user_unique.sql');
const onboardingShared = read('onboarding/shared.js');

describe('Fluxo canônico de currículo', () => {
  it('leva Meu Currículo para o hub de currículo principal', () => {
    assert.match(dashboard, /switchDashTab\('curriculo'\)[\s\S]*?_showShellFrame\(href \|\| '\/curriculo'/);
    assert.match(sidebar, /id: 'curriculo'[\s\S]*?href: '\/curriculo'/);
  });

  it('mantém currículo principal e versão por vaga em chaves diferentes', () => {
    assert.match(app, /setItem\('vagaai_cv_version', JSON\.stringify\(d\.cv_otimizado\)\)/);
    assert.doesNotMatch(app, /setItem\('vagaai_cv', JSON\.stringify\(d\.cv_otimizado\)\)/);
    assert.match(cv, /vagaai_cv_from_analysis[\s\S]*?vagaai_cv_version[\s\S]*?vagaai_cv_base/);
  });

  it('expõe versões vinculadas às análises sem substituir o currículo principal', () => {
    assert.match(curriculo, /id="versionsPanel"/);
    assert.match(curriculo, /from\('analyses'\)\.select\('id,score,result,created_at,archived_at'\)/);
    assert.match(cv, /cvSaveVersionToAnalysis/);
    assert.match(cv, /Seu currículo principal não foi alterado/);
  });

  it('abre a versão correta pelo dashboard e preserva a origem ao recarregar o editor', () => {
    assert.match(dashboard, /function openSavedCv\(id\)[\s\S]*?vagaai_cv_version[\s\S]*?vagaai_cv_editor_source[\s\S]*?source=version&analysis=/);
    assert.match(cv, /new URLSearchParams\(location\.search\)\.get\('source'\)/);
    assert.match(cv, /requestedSource === 'version'[\s\S]*?vagaai_cv_version/);
  });

  it('deixa explícito o currículo principal e permite gerenciar seu ciclo de vida', () => {
    assert.match(curriculo, /Currículo principal/);
    assert.match(curriculo, /Excluir currículo principal/);
    assert.match(curriculo, /function deleteBaseCv/);
    assert.match(curriculo, /function changeVersionState\(id, action\)/);
    assert.match(curriculo, /cv_version_archived_at/);
    assert.match(curriculo, /cv_version_deleted_at/);
    assert.match(curriculo, /Restaurar/);
    assert.match(curriculo, /Excluir definitivamente/);
  });

  it('usa o currículo principal nos alertas de novas vagas', () => {
    assert.match(alerts, /rest\/v1\/cv_saves\?user_id=eq\./);
    assert.match(alerts, /select=cv_data/);
  });

  it('registra atualizações da versão sem alterar o currículo principal', () => {
    assert.match(cv, /cv_version_updated_at: new Date\(\)\.toISOString\(\)/);
    assert.match(cv, /cv_version_archived_at: null/);
  });

  it('persiste o currículo principal no handoff após cadastro', () => {
    assert.match(onboardingShared, /async function persistBaseCv/);
    assert.match(onboardingShared, /output\.baseCv = await persistBaseCv/);
    assert.match(onboardingShared, /storage\.setItem\('vagaai_cv_base'/);
  });

  it('não depende de upsert por user_id sem contrato único documentado', () => {
    for (const source of [app, curriculo, cv]) {
      assert.doesNotMatch(source, /cv_saves'[\s\S]{0,180}upsert\([^\n]*onConflict:\s*'user_id'/);
    }
  });

  it('documenta a unicidade do currículo principal no banco', () => {
    assert.match(migration, /row_number\(\) over/);
    assert.match(migration, /unique \(user_id\)/);
  });
});
