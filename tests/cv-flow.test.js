import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dashboard = read('dashboard/index.html');
const sidebar = read('sidebar.js');
const app = read('app/index.html');
const curriculo = read('curriculo/index.html');
const cv = read('cv/index.html');
const onboardingShared = read('onboarding/shared.js');

describe('Fluxo canônico de currículo', () => {
  it('leva Meu Currículo para o hub de currículo-base', () => {
    assert.match(dashboard, /switchDashTab\('curriculo'\)[\s\S]*?_showShellFrame\(href \|\| '\/curriculo'/);
    assert.match(sidebar, /id: 'curriculo'[\s\S]*?href: '\/curriculo'/);
  });

  it('mantém currículo-base e versão por vaga em chaves diferentes', () => {
    assert.match(app, /setItem\('vagaai_cv_version', JSON\.stringify\(d\.cv_otimizado\)\)/);
    assert.doesNotMatch(app, /setItem\('vagaai_cv', JSON\.stringify\(d\.cv_otimizado\)\)/);
    assert.match(cv, /vagaai_cv_from_analysis[\s\S]*?vagaai_cv_version[\s\S]*?vagaai_cv_base/);
  });

  it('expõe versões vinculadas às análises sem substituir o currículo principal', () => {
    assert.match(curriculo, /id="versionsPanel"/);
    assert.match(curriculo, /from\('analyses'\)\.select\('id,result,created_at'\)/);
    assert.match(cv, /cvSaveVersionToAnalysis/);
    assert.match(cv, /Seu currículo principal não foi alterado/);
  });

  it('persiste o currículo-base no handoff após cadastro', () => {
    assert.match(onboardingShared, /async function persistBaseCv/);
    assert.match(onboardingShared, /output\.baseCv = await persistBaseCv/);
    assert.match(onboardingShared, /storage\.setItem\('vagaai_cv_base'/);
  });

  it('não depende de upsert por user_id sem contrato único documentado', () => {
    for (const source of [app, curriculo, cv]) {
      assert.doesNotMatch(source, /cv_saves'[\s\S]{0,180}upsert\([^\n]*onConflict:\s*'user_id'/);
    }
  });
});
