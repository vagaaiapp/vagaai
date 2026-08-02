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
    assert.match(curriculo, /Currículo base/);
    assert.match(curriculo, /Excluir currículo base/);
    assert.match(curriculo, /function deleteBaseCv/);
    assert.match(curriculo, /function changeVersionState\(id, action\)/);
    assert.match(curriculo, /cv_version_archived_at/);
    assert.match(curriculo, /cv_version_deleted_at/);
    assert.match(curriculo, /Restaurar/);
    assert.match(curriculo, /Excluir definitivamente/);
  });

  it('isola o editor base de qualquer contexto residual de vaga', () => {
    assert.match(curriculo, /function openAdvancedEditor\(\)[\s\S]*?removeItem\('vagaai_cv_from_analysis'\)[\s\S]*?removeItem\('vagaai_cv_context'\)[\s\S]*?removeItem\('vagaai_cv_step'\)/);
    assert.match(cv, /requestedSource === 'base'[\s\S]*?removeItem\('vagaai_cv_context'\)/);
    assert.match(cv, /var contextRaw = _cvEditorSource === 'version'/);
    assert.match(cv, /flag = _cvEditorSource === 'version'/);
    assert.match(cv, /if \(!flag \|\| !_cvData\) return/);
  });

  it('identifica visualmente os dois tipos de currículo dentro do editor', () => {
    assert.match(cv, /function applyCvSourceUi/);
    assert.match(cv, /Currículo para vaga/);
    assert.match(cv, /Currículo base/);
    assert.match(curriculo, /1 · Currículo base/);
    assert.match(curriculo, /2 · Currículos para vagas/);
  });

  it('mantém o posicionamento de mercado no topo do hub', () => {
    const market = curriculo.indexOf('id="gapPanel"');
    const base = curriculo.indexOf('class="profile-head"', market);
    const versions = curriculo.indexOf('id="versionsPanel"', market);
    assert.ok(market >= 0 && market < base && base < versions);
  });

  it('usa uma exportação neutra no currículo base', () => {
    assert.match(cv, /Exporte seu currículo base/);
    assert.match(cv, /sem adaptações de uma vaga específica/);
    assert.match(cv, /if \(cartaCard\) cartaCard\.style\.display = isVersion \? '' : 'none'/);
    assert.match(cv, /if \(_cvEditorSource === 'base'\)[\s\S]*?card\.style\.display = 'none'/);
  });

  it('faz as ações do currículo base ocuparem toda a largura do cartão', () => {
    assert.match(curriculo, /\.profile-actions\{[^}]*flex:1 0 100%[^}]*width:100%/);
    assert.match(curriculo, /\.save-status:empty\{display:none\}/);
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
