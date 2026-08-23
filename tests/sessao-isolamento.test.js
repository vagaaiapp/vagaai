import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

/* O cache do navegador é o único lugar onde dados de duas contas podem se
   encontrar — o banco tem RLS por auth.uid() em toda tabela de usuário. Estes
   testes cobrem os dois lados da defesa: o comportamento de /js/sessao.js e a
   regra estrutural de que nenhuma página escreve chave pessoal sem carregá-lo.

   O furo que originou o teste: os funis de onboarding rodam ANTES do cadastro,
   gravavam currículo e vaga sem carimbar o dono, e não carregavam sessao.js.
   Num computador compartilhado, quem voltasse à própria conta abria o editor
   com o currículo do visitante anônimo — inclusive depois de um logout
   correto, porque limpar() remove o carimbo e carimbo ausente era lido como
   "mesmo dono". */

const sessaoSource = fs.readFileSync(new URL('../js/sessao.js', import.meta.url), 'utf8');

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    get length() { return values.size; },
    key(i) { return Array.from(values.keys())[i] ?? null; },
    getItem(k) { return values.has(k) ? values.get(k) : null; },
    setItem(k, v) { values.set(k, String(v)); },
    removeItem(k) { values.delete(k); },
    _raw: values
  };
}

function carregarSessao(storage) {
  const sandbox = { window: { localStorage: storage }, localStorage: storage };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(sessaoSource, sandbox);
  return sandbox.window.VagaAISessao;
}

const AGORA = () => new Date().toISOString();
const ANTIGO = () => new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

describe('sessao.js — troca de conta no mesmo navegador', () => {
  it('mesma conta preserva o cache', () => {
    const storage = createStorage({ vagaai_cache_dono: 'user-A', vagaai_cv: 'cv-de-A' });
    const trocou = carregarSessao(storage).adotar({ id: 'user-A', created_at: ANTIGO() });
    assert.equal(trocou, false);
    assert.equal(storage.getItem('vagaai_cv'), 'cv-de-A');
  });

  it('conta diferente apaga o cache antes de qualquer leitura', () => {
    const storage = createStorage({ vagaai_cache_dono: 'user-A', vagaai_cv: 'cv-de-A' });
    const trocou = carregarSessao(storage).adotar({ id: 'user-B', created_at: ANTIGO() });
    assert.equal(trocou, true);
    assert.equal(storage.getItem('vagaai_cv'), null);
    assert.equal(storage.getItem('vagaai_cache_dono'), 'user-B');
  });

  it('preferências do aparelho sobrevivem à troca de conta', () => {
    const storage = createStorage({
      vagaai_cache_dono: 'user-A',
      vagaai_cv: 'cv-de-A',
      vagaai_theme: 'dark',
      vagaai_cookie_consent: 'granted'
    });
    carregarSessao(storage).adotar({ id: 'user-B', created_at: ANTIGO() });
    assert.equal(storage.getItem('vagaai_theme'), 'dark');
    assert.equal(storage.getItem('vagaai_cookie_consent'), 'granted');
  });

  it('chave com sufixo variável (alerta por vaga) também é apagada', () => {
    const storage = createStorage({
      vagaai_cache_dono: 'user-A',
      vagaai_alert_prefill_abc123: 'vaga-de-A'
    });
    carregarSessao(storage).adotar({ id: 'user-B', created_at: ANTIGO() });
    assert.equal(storage.getItem('vagaai_alert_prefill_abc123'), null);
  });
});

describe('sessao.js — funil anônimo (o furo do ISO-06)', () => {
  it('adotarAnonimo carimba o cache como anônimo', () => {
    const storage = createStorage();
    carregarSessao(storage).adotarAnonimo();
    assert.equal(storage.getItem('vagaai_cache_dono'), 'anon');
  });

  it('adotarAnonimo apaga o cache da conta que usou o aparelho antes', () => {
    const storage = createStorage({ vagaai_cache_dono: 'user-A', vagaai_cv: 'cv-de-A' });
    const trocou = carregarSessao(storage).adotarAnonimo();
    assert.equal(trocou, true);
    assert.equal(storage.getItem('vagaai_cv'), null);
  });

  it('conta antiga NÃO herda o currículo deixado por um visitante anônimo', () => {
    // A usou o aparelho; B chegou depois, fez o funil sem se cadastrar; A volta.
    const storage = createStorage();
    const sessao = carregarSessao(storage);
    sessao.adotar({ id: 'user-A', created_at: ANTIGO() });
    sessao.adotarAnonimo();
    storage.setItem('vagaai_cv', 'cv-do-visitante-B');
    const trocou = sessao.adotar({ id: 'user-A', created_at: ANTIGO() });
    assert.equal(trocou, true, 'a volta de A tem que limpar o cache anônimo');
    assert.equal(storage.getItem('vagaai_cv'), null);
  });

  it('logout correto não reabre o furo', () => {
    // limpar() remove o carimbo; antes, carimbo ausente era lido como mesmo dono.
    const storage = createStorage();
    const sessao = carregarSessao(storage);
    sessao.adotar({ id: 'user-A', created_at: ANTIGO() });
    sessao.limpar();
    sessao.adotarAnonimo();
    storage.setItem('vagaai_cv', 'cv-do-visitante-B');
    sessao.adotar({ id: 'user-A', created_at: ANTIGO() });
    assert.equal(storage.getItem('vagaai_cv'), null);
  });

  it('quem acabou de criar a conta no funil herda o próprio trabalho', () => {
    const storage = createStorage();
    const sessao = carregarSessao(storage);
    sessao.adotarAnonimo();
    storage.setItem('vagaai_cv', 'cv-que-eu-acabei-de-montar');
    const trocou = sessao.adotar({ id: 'user-novo', created_at: AGORA() });
    assert.equal(trocou, false, 'cadastro recém-feito continua o mesmo fluxo');
    assert.equal(storage.getItem('vagaai_cv'), 'cv-que-eu-acabei-de-montar');
    assert.equal(storage.getItem('vagaai_cache_dono'), 'user-novo');
  });

  it('sem created_at, cache anônimo é tratado como de terceiro', () => {
    // Chamada legada passando só o id: erra para o lado seguro.
    const storage = createStorage();
    const sessao = carregarSessao(storage);
    sessao.adotarAnonimo();
    storage.setItem('vagaai_cv', 'cv-de-origem-desconhecida');
    const trocou = sessao.adotar('user-A');
    assert.equal(trocou, true);
    assert.equal(storage.getItem('vagaai_cv'), null);
  });
});

/* ── Regra estrutural ────────────────────────────────────────────────────
   O defeito original foi de cobertura, não de lógica: sessao.js existia e
   estava certo, e quatro páginas simplesmente não o carregavam. Cobertura
   regride sozinha — por isso a regra vira teste. */

const PAGINAS_DE_PRODUCAO = [
  'app/index.html',
  'carta/index.html',
  'criar-curriculo/index.html',
  'curriculo/index.html',
  'cv/index.html',
  'dashboard/index.html',
  'entrevista/index.html',
  'login/index.html',
  'onboarding/curriculo/index.html',
  'onboarding/vaga/index.html'
];

function chavesPessoaisDeclaradas() {
  const bloco = sessaoSource.slice(
    sessaoSource.indexOf('var PESSOAIS'),
    sessaoSource.indexOf('var PREFIXOS')
  );
  return Array.from(bloco.matchAll(/'([a-z0-9_]+)'/gi)).map(m => m[1]);
}

describe('nenhuma página escreve dado pessoal sem carregar sessao.js', () => {
  const pessoais = new Set(chavesPessoaisDeclaradas());

  it('a lista PESSOAIS não está vazia (o parser continua válido)', () => {
    assert.ok(pessoais.size > 10, `esperava mais de 10 chaves, achei ${pessoais.size}`);
    assert.ok(pessoais.has('vagaai_cv'));
  });

  for (const pagina of PAGINAS_DE_PRODUCAO) {
    it(pagina, () => {
      const html = fs.readFileSync(new URL(`../${pagina}`, import.meta.url), 'utf8');

      const escritas = Array.from(
        html.matchAll(/localStorage\.setItem\(\s*'([a-z0-9_]+)'/gi)
      ).map(m => m[1]).filter(k => pessoais.has(k));

      if (escritas.length === 0) return; // só preferência de aparelho: dispensada

      // A tag, não a menção: o comentário que explica o furo cita o caminho do
      // arquivo, e um `includes` cru passava com o script removido.
      assert.ok(
        /<script[^>]+src=["']\/js\/sessao\.js["']/.test(html),
        `${pagina} grava ${[...new Set(escritas)].join(', ')} e não carrega /js/sessao.js`
      );
      assert.ok(
        /VagaAISessao\.(adotar|adotarAnonimo)\(/.test(html),
        `${pagina} carrega sessao.js mas nunca chama adotar()/adotarAnonimo()`
      );
    });
  }
});
