// A Vercel valida vercel.json contra um schema fechado: qualquer chave
// desconhecida quebra o BUILD INTEIRO, e o erro so aparece no painel — nao no
// push, nao no git, nao aqui. Uma chave "comment" em headers[0] derrubou
// quatro deploys seguidos sem ninguem notar, porque o site continuava no ar
// servindo o ultimo build bom.
//
// Este teste nao substitui o schema oficial; cobre as chaves que usamos.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));

// JSON nao tem comentario. Quem quiser explicar uma regra: comentario no
// codigo que ela afeta, ou na mensagem do commit.
const ALLOWED = {
  headers: ['source', 'headers', 'has', 'missing'],
  rewrites: ['source', 'destination', 'has', 'missing', 'statusCode'],
  redirects: ['source', 'destination', 'permanent', 'statusCode', 'has', 'missing'],
  crons: ['path', 'schedule'],
};
const ALLOWED_FUNCTION = ['maxDuration', 'memory', 'runtime', 'includeFiles', 'excludeFiles', 'architecture'];

describe('vercel.json', () => {
  for (const [secao, permitidas] of Object.entries(ALLOWED)) {
    it(`${secao}: so usa chaves que a Vercel aceita`, () => {
      for (const item of config[secao] || []) {
        for (const chave of Object.keys(item)) {
          assert.ok(
            permitidas.includes(chave),
            `vercel.json: "${chave}" em ${secao} nao existe no schema da Vercel e quebra o build`
          );
        }
      }
    });
  }

  it('functions: so usa chaves que a Vercel aceita', () => {
    for (const [rota, opcoes] of Object.entries(config.functions || {})) {
      for (const chave of Object.keys(opcoes)) {
        assert.ok(
          ALLOWED_FUNCTION.includes(chave),
          `vercel.json: "${chave}" em functions["${rota}"] nao existe no schema da Vercel`
        );
      }
    }
  });

  it('functions: aponta para arquivos que existem', () => {
    for (const rota of Object.keys(config.functions || {})) {
      assert.ok(
        fs.existsSync(path.join(root, rota)),
        `vercel.json: functions["${rota}"] aponta para um arquivo que nao existe`
      );
    }
  });

  it('interview.js (entrevista + cv_voice) tem maxDuration folgado', () => {
    // O polling do AssemblyAI leva ate ~15s; com os 10s default a rota morre
    // no meio da transcricao.
    const opcoes = (config.functions || {})['api/interview.js'];
    assert.ok(opcoes && opcoes.maxDuration >= 30, 'api/interview.js precisa de maxDuration >= 30');
  });
});

// O Hobby plan da Vercel recusa o deploy inteiro acima de 12 Serverless
// Functions — nao um aviso, o build falha com exceeded_serverless_functions_
// per_deployment e o site fica preso no ultimo build bom, sem sinal nenhum
// de que algo mudou. Ja aconteceu uma vez (api/cv-voice.js estourou o
// teto); por isso cv_voice virou uma action de api/interview.js em vez de
// arquivo proprio. Este teste falha ANTES do push, nao depois do deploy.
describe('Limite de Serverless Functions (Hobby plan)', () => {
  const HOBBY_FUNCTION_LIMIT = 12;

  // Mesma regra da Vercel: todo .js em api/ vira uma function, exceto
  // dentro de pastas que comecam com "_" (convencao de "nao e rota") e
  // arquivos listados no .vercelignore. Conta so o que esta versionado —
  // a Vercel faz deploy do que o GitHub tem, nao da arvore local; um
  // arquivo novo ainda sem commit (rascunho de outra tarefa, por exemplo)
  // nao deve derrubar este teste antes de sequer ser adicionado ao repo.
  function listDeployedFunctions() {
    const ignoreRaw = fs.readFileSync(path.join(root, '.vercelignore'), 'utf8');
    const ignoredFiles = new Set(
      ignoreRaw.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#') && l.startsWith('api/'))
    );

    let tracked;
    try {
      tracked = execFileSync('git', ['ls-files', 'api/'], { cwd: root, encoding: 'utf8' });
    } catch {
      return null; // sem git disponível (ex.: build isolado) — pula a checagem
    }

    return tracked
      .split('\n')
      .map(f => f.trim())
      .filter(f => f.endsWith('.js'))
      .filter(f => !f.split('/').some(seg => seg.startsWith('_'))) // convenção Vercel: não é rota
      .filter(f => !ignoredFiles.has(f));
  }

  it(`api/ nao excede ${HOBBY_FUNCTION_LIMIT} functions deployadas`, () => {
    const deployed = listDeployedFunctions();
    if (deployed === null) return; // sem git disponível neste ambiente
    assert.ok(
      deployed.length <= HOBBY_FUNCTION_LIMIT,
      `${deployed.length} functions em api/ (limite ${HOBBY_FUNCTION_LIMIT} no Hobby plan): ${deployed.join(', ')}. ` +
      `Consolide uma rota como action de outro arquivo (ver api/interview.js#cv_voice) em vez de criar function nova.`
    );
  });
});
