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

  it('rotas que dependem de transcricao tem maxDuration folgado', () => {
    // O polling do AssemblyAI leva ate ~15s; com os 10s default a rota morre
    // no meio da transcricao.
    for (const rota of ['api/interview.js', 'api/cv-voice.js']) {
      const opcoes = (config.functions || {})[rota];
      assert.ok(opcoes && opcoes.maxDuration >= 30, `${rota} precisa de maxDuration >= 30`);
    }
  });
});
