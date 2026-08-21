import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const dashboard = read('dashboard/index.html');
const sidebar = read('sidebar.js');
const app = read('app/index.html');
const curriculo = read('curriculo/index.html');
const cv = read('cv/index.html');
const alerts = read('api/send-alerts.js');
const migration = read('migrations/024_cv_saves_user_unique.sql');
const onboardingShared = read('onboarding/shared.js');
const analyze = read('api/analyze.js');
const cvCompletude = read('js/cv-completude.js');

// A regra de completude saiu do HTML do hub e virou módulo compartilhado (o
// painel mostra o mesmo percentual). Como agora é um arquivo isolado, dá para
// exercitar o comportamento de verdade em vez de casar o texto do fonte.
function loadCompletude() {
  const sandbox = { window: {} };
  vm.runInNewContext(cvCompletude, sandbox, { filename: 'js/cv-completude.js' });
  assert.ok(sandbox.window.VagaAICv, 'módulo não expôs window.VagaAICv');
  return sandbox.window.VagaAICv;
}

// O agrupamento por vaga só é visível com sessão ativa; extrair as funções do
// fonte é o que permite provar o comportamento sem depender de login.
function loadVersionGrouping() {
  const sources = ['versionGroupKey', 'versionTime', 'groupVersions'].map((name) => {
    const match = curriculo.match(new RegExp('function ' + name + '\\([\\s\\S]*?\\n\\}'));
    assert.ok(match, `função ${name} não encontrada em curriculo/index.html`);
    return match[0];
  });
  const sandbox = { Date, String, Object, Array, JSON };
  vm.runInNewContext(sources.join('\n'), sandbox, { filename: 'curriculo/versions.js' });
  return sandbox;
}

function versionRow(id, createdAt, jobInfo) {
  return { id, created_at: createdAt, score: 33, result: { job_info: jobInfo, cv_otimizado: {} } };
}

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
    assert.match(curriculo, /Excluir meu currículo/);
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
    assert.match(curriculo, /1 · Currículo principal/);
    assert.match(curriculo, /2 · Currículos feitos para vagas/);
  });

  it('valoriza o currículo principal antes da leitura de mercado e das versões', () => {
    const market = curriculo.indexOf('id="gapPanel"');
    const base = curriculo.indexOf('class="profile-head curriculum-master"');
    const versions = curriculo.indexOf('id="versionsPanel"');
    assert.ok(base >= 0 && base < market && market < versions);
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

  it('nunca abre o hub em 0% para quem entregou um currículo inteiro', () => {
    const { completude } = loadCompletude();
    // Currículo colado/importado sem estruturação: só raw_text. Zerar o
    // percentual aqui diria que a pessoa não entregou nada.
    assert.ok(completude({ raw_text: 'texto integral do currículo' }) > 0);
    assert.equal(completude({}), 0);
    assert.equal(completude({
      nome: 'Ana', titulo_profissional: 'Analista', resumo_profissional: 'x',
      experiencias: [{ cargo: 'Analista' }], formacao: [{ curso: 'ADM' }], habilidades: ['SQL']
    }), 100);
  });

  it('hub e painel usam a mesma regra de completude', () => {
    // Duas cópias da regra divergiriam na primeira mudança de critério e o
    // usuário veria percentuais diferentes para o mesmo currículo.
    assert.match(curriculo, /src="\/js\/cv-completude\.js"/);
    assert.match(dashboard, /src="\/js\/cv-completude\.js"/);
    assert.doesNotMatch(curriculo, /var temTrajetoria =/, 'a regra não pode voltar a ser duplicada no hub');
    assert.match(dashboard, /window\.VagaAICv\.completude/);
  });

  it('mostra o currículo enviado por inteiro, como a pessoa mandou', () => {
    assert.match(curriculo, /Seu currículo, como você enviou/);
    assert.match(curriculo, /pre class="raw-cv"/);
    assert.doesNotMatch(
      curriculo,
      /raw_text\.slice\(0,1200\)/,
      'o conteúdo enviado não pode voltar a ser truncado na exibição'
    );
  });

  it('não apaga o conteúdo enviado sem confirmação explícita', () => {
    assert.match(curriculo, /function removeRawCv\(\)[\s\S]{0,400}window\.confirm/);
    assert.doesNotMatch(
      curriculo,
      /function startFromScratch/,
      'o botão que apagava o texto enviado sem avisar não deve voltar'
    );
  });

  it('agrupa currículos direcionados por vaga, não por análise', () => {
    assert.match(curriculo, /function versionGroupKey/);
    assert.match(curriculo, /function groupVersions/);
    assert.match(curriculo, /info\.job_url/);
    assert.match(curriculo, /versões anteriores/);
  });

  it('colapsa reanálises da mesma vaga num grupo só, com a mais recente à frente', () => {
    const { groupVersions } = loadVersionGrouping();
    const groups = groupVersions([
      versionRow('a3', '2026-06-27T10:00:00Z', { empresa: 'PRIMIZIE', titulo: 'Gerente de Marketing' }),
      versionRow('a2', '2026-06-26T10:00:00Z', { empresa: 'primizie', titulo: 'gerente de marketing ' }),
      versionRow('a1', '2026-06-20T10:00:00Z', { empresa: 'Outra', titulo: 'Analista' })
    ]);

    assert.equal(groups.length, 2, 'três análises em duas vagas viram dois grupos');
    assert.equal(groups[0].items.length, 2);
    assert.equal(groups[0].latest.id, 'a3');
    assert.equal(groups[1].items.length, 1);
  });

  it('usa a URL da vaga como chave quando ela existe', () => {
    const { groupVersions } = loadVersionGrouping();
    const groups = groupVersions([
      versionRow('b1', '2026-06-27T10:00:00Z', { job_url: 'https://vaga.com/1', empresa: 'A', titulo: 'X' }),
      versionRow('b2', '2026-06-26T10:00:00Z', { job_url: 'https://VAGA.com/1', empresa: 'B', titulo: 'Y' })
    ]);

    assert.equal(groups.length, 1, 'mesma URL é a mesma vaga, mesmo com metadados diferentes');
  });

  it('nunca agrupa análises sem identificação da vaga', () => {
    const { groupVersions } = loadVersionGrouping();
    const groups = groupVersions([
      versionRow('c1', '2026-06-27T10:00:00Z', {}),
      versionRow('c2', '2026-06-26T10:00:00Z', {})
    ]);

    assert.equal(groups.length, 2, 'sem empresa, cargo ou URL, cada versão fica sozinha');
  });

  it('avisa quando a lista de versões é cortada pelo limite', () => {
    assert.match(curriculo, /_versionsCapped = \(response\.data \|\| \[\]\)\.length >= VERSIONS_LIMIT/);
    assert.match(curriculo, /Mostrando as ' \+ VERSIONS_LIMIT/);
  });

  it('oferece uma ação no estado vazio dos currículos por vaga', () => {
    assert.match(curriculo, /onclick="adaptarParaVaga\(\)"/);
    assert.match(curriculo, /function adaptarParaVaga[\s\S]{0,400}\/app\?cv=base/);
    assert.match(app, /'cv'\) === 'base'\) switchCvMode\('salvo'\)/);
  });

  it('exporta o cargo desejado no Word', () => {
    assert.match(cv, /titulo_profissional \? '<p style="color:#555;font-size:10pt">/);
    assert.doesNotMatch(
      cv,
      /cargo_desejado/,
      'o .doc lia um campo que nada escrevia — o cargo sumia só no Word'
    );
  });

  it('tem seção de projetos própria nos seis templates', () => {
    ['clSecProj','modSecProj','exSecProj','cpSecProj','mnSecProj','foSecProj'].forEach((id) => {
      assert.match(cv, new RegExp(`id="${id}"`), `${id} ausente`);
    });
    assert.match(cv, /function _projHtml/);
    assert.match(cv, /function _mnProjHtml/);
    assert.match(cv, /function reRenderProj/);
    assert.match(cv, /sec\('Projetos e Portfólio', projHtml\)/);
  });

  it('não mistura projetos com experiência profissional', () => {
    // A seção de projetos existe justamente para não afirmar emprego onde não
    // houve. Se alguém concatenar as duas listas, este teste cai.
    assert.doesNotMatch(cv, /_expHtml\(\s*\(?\s*cv\.experiencias.*cv\.projetos/);
    assert.match(analyze, /Nunca transforme emprego em projeto/, 'a regra precisa estar no prompt');
    assert.match(curriculo, /function secProjetos/);
    assert.match(curriculo, /function editProjetos/);
  });

  it('leva a situação da formação para todos os templates', () => {
    assert.match(cv, /function _eduPeriodo/);
    assert.doesNotMatch(
      cv,
      /edu-per">'\s*\+?\s*_?esc\(e\.periodo\)/,
      'todo template precisa passar por _eduPeriodo para exibir a situação'
    );
    assert.match(curriculo, /SITUACOES_FORMACAO/);
    assert.match(analyze, /Nunca deduza pelo ano/);
  });

  it('aceita portfólio como contato próprio', () => {
    assert.match(curriculo, /portfolio: document\.getElementById\('mPortfolio'\)/);
    assert.match(cv, /function _href/);
    assert.match(cv, /function _labelUrl/);
    assert.match(cv, /id="sf_portfolio"/);
    assert.match(cv, /id="ef_portfolio"/);
  });

  it('convida a pessoa a colocar número, sem deixar a IA inventar', () => {
    assert.match(curriculo, /function bulletSemNumero/);
    assert.match(curriculo, /function metricaHint/);
    assert.match(curriculo, /oninput="updateMetricHint\(this\)"/);
    assert.match(analyze, /NUNCA invente métricas/);
  });

  it('segue a ordem recomendada de seções', () => {
    const editor = curriculo.match(/html \+= secDadosPessoais[\s\S]*?secProjetos\(d\);/);
    assert.ok(editor, 'bloco de render do hub não encontrado');
    const ordem = editor[0].match(/sec[A-ZÍ][A-Za-zçãéí]+/g);
    assert.deepEqual(ordem, [
      'secDadosPessoais', 'secObjetivo', 'secResumo', 'secExperiencias',
      'secFormacao', 'secHabilidades', 'secCursos', 'secIdiomas', 'secProjetos'
    ]);
    // No .doc, competências vinham depois de cursos e idiomas
    const doc = cv.match(/sec\('Resumo Profissional'[\s\S]*?sec\('Projetos e Portfólio', projHtml\)/);
    assert.ok(doc, 'bloco de export .doc não encontrado');
    assert.ok(
      doc[0].indexOf("sec('Habilidades'") < doc[0].indexOf("sec('Cursos e Especializações'"),
      'habilidades precisa vir antes de cursos e idiomas'
    );
  });

  it('avisa que foto é opcional no Brasil', () => {
    assert.match(cv, /foto raramente é avaliada/i);
  });

  it('não pede dados que não devem entrar num currículo', () => {
    assert.match(curriculo, /Não inclua CPF, RG, endereço completo/);
    for (const campo of [/id="mCpf"/, /id="mRg"/, /id="mNascimento"/, /id="mEstadoCivil"/]) {
      assert.doesNotMatch(curriculo, campo);
    }
  });

  it('nunca renderiza bullet vazio como marcador solto', () => {
    // Um "" na lista virava <li></li>: um ponto órfão no meio do currículo.
    const renders = cv.match(/bullets\s*\|\|\s*\[\]\)\s*\.\s*map/g);
    assert.equal(renders, null, 'todo render de bullet precisa filtrar vazios antes do map');
    assert.match(analyze, /bullets.*filter\(Boolean\)/);
  });

  it('sanitiza no servidor o que a IA devolve para o currículo', () => {
    // A resposta da IA é renderizada direto num documento: limite de tamanho e
    // de quantidade não podem depender do modelo se comportar.
    assert.match(analyze, /MAX_EXPERIENCIAS/);
    assert.match(analyze, /MAX_BULLETS/);
    assert.match(analyze, /function normalizeSituacao/);
    assert.match(analyze, /SITUACOES_FORMACAO = \['Concluído', 'Cursando', 'Trancado'\]/);
  });

  it('não perde projetos e situação no sanitizador do funil sem currículo', () => {
    // obClean é whitelist: campo que o prompt pede mas o sanitizador não lista
    // é descartado em silêncio.
    const obClean = analyze.match(/const obClean = \{[\s\S]*?\n      \};/);
    assert.ok(obClean, 'bloco obClean não encontrado');
    ['projetos', 'situacao', 'portfolio'].forEach((campo) => {
      assert.match(obClean[0], new RegExp(campo), `obClean descarta ${campo}`);
    });
  });

  it('mantém as regras anti-alucinação em todos os prompts de currículo', () => {
    assert.match(analyze, /Não crie bullets novos/);
    assert.match(analyze, /Não transforme requisito da vaga em experiência do candidato/);
    assert.match(analyze, /Não converta responsabilidade em resultado/);
    assert.match(analyze, /prefira DEVOLVER AS LISTAS VAZIAS a chutar empresa, cargo ou data/);
    assert.match(analyze, /Nunca deduza pelo ano/);
    // Uma por prompt que produz conteúdo de currículo
    const absolutas = analyze.match(/REGRA ABSOLUTA/g) || [];
    assert.ok(absolutas.length >= 4, `esperava 4+ regras absolutas, achei ${absolutas.length}`);
  });

  it('escapa tudo que a IA devolve para projetos', () => {
    const proj = cv.match(/function _projHtml[\s\S]*?\n\}/);
    assert.ok(proj);
    assert.doesNotMatch(
      proj[0],
      /\+\s*(p\.nome|p\.contexto|p\.link|p\.periodo)\s*\+/,
      'campo de projeto interpolado sem _esc'
    );
  });

  it('garante ordem cronológica no dado, não só na tela', () => {
    assert.match(curriculo, /window\.VagaAIOnboarding\.ordenarCv\(base\)/);
    assert.match(curriculo, /function ordenarLista/);
    assert.match(cv, /ordenarCv\(data\)/);
    assert.match(cv, /ordenarCv\(cv\)/);
    assert.match(analyze, /Ordene da experiência mais recente para a mais antiga/);
    assert.match(curriculo, /<script src="\/onboarding\/shared\.js"><\/script>/);
  });

  it('nunca monta href de link a partir de esquema não-http', () => {
    // esc() escapa aspas mas não impede href="javascript:...". Um PDF podia
    // trazer isso como "LinkedIn" e virar link executável no próprio currículo.
    assert.doesNotMatch(cv, /href="'\s*\+\s*_?esc\(c\.(linkedin|portfolio)\)/);
    assert.match(cv, /_esc\(_href\(c\.linkedin\)\)|esc\(_href\(c\.linkedin\)\)/);
    assert.match(cv, /replace\(\/\^\\\/\+\/, ''\)/, '_href precisa neutralizar URL protocolo-relativa');
  });

  it('deixa projetos editáveis no editor completo, não só no hub', () => {
    assert.match(cv, /function renderProjEditor/);
    assert.match(cv, /function saveProjEditor/);
    assert.match(cv, /_editSection==='proj'/);
    assert.match(cv, /openEdit\('proj'\)/);
    assert.match(cv, /id="s3ProjList"/);
  });

  it('conta projetos nos indicadores de qualidade', () => {
    // Quem não tem emprego formal põe o número no projeto; olhar só para
    // experiencias deixava o indicador vermelho para sempre.
    assert.match(cv, /\['experiencias', 'projetos'\]/);
    const { completude, completudeFaltantes } = loadCompletude();
    const soProjetos = { nome: 'Ana', titulo_profissional: 'Dev', resumo_profissional: 'x',
      projetos: [{ nome: 'App' }], formacao: [{ curso: 'ADM' }], habilidades: ['JS'] };
    assert.equal(completude(soProjetos), 100);
    // Array.from: o módulo roda em outro realm do vm, então os arrays que ele
    // devolve não compartilham o Array.prototype do teste.
    assert.deepEqual(Array.from(completudeFaltantes(soProjetos)), []);
    // E o painel precisa conseguir nomear o que falta, não só o percentual.
    assert.deepEqual(Array.from(completudeFaltantes({ nome: 'Ana', raw_text: 'texto' })), ['Objetivo profissional']);
  });

  it('permite informar a situação da formação também no editor completo', () => {
    assert.match(cv, /efed_sit_/);
    assert.match(cv, /\['','Concluído','Cursando','Trancado'\]/);
  });

  it('ordena as listas ao salvar pelo editor completo', () => {
    const saveEdit = cv.match(/function saveEdit\(\)[\s\S]*?\n\}/);
    assert.ok(saveEdit);
    assert.match(saveEdit[0], /ordenarCv\(_cvData\)/);
  });

  it('grava currículo base estruturado na primeira análise autenticada', () => {
    assert.match(app, /structureCvFromText\(cvText\)/);
    assert.doesNotMatch(
      app,
      /cv_data: \{ raw_text: cvText\.slice\(0, 30000\) \}/,
      'a primeira análise não deve mais gravar o base como bloco de texto'
    );
  });
});
