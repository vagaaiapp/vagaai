/* Invariantes que atravessam páginas. Nasceram de uma varredura que achou três
   bugs da mesma família: código que lê uma chave que ninguém escreve, duas
   chaves para a mesma preferência, e a mesma regra calculada em dois lugares
   com resultados diferentes. Testar o caso pontual corrigido não impede a
   próxima ocorrência — estes testes travam a classe inteira. */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* Só o que vai para produção. Diretórios excluídos do deploy pelo .vercelignore
   (protótipos, mockups, versões alternativas) não precisam seguir as regras. */
const IGNORAR_DIR = /^(\.git|\.vercel|\.claude|\.codex|\.agents|node_modules|tests|migrations|tmp|scripts|.*-preview.*|.*-v[2-5]|mockup-.*|manual-.*|jornada-.*|planejamento-.*|produto-.*|email-marketing-.*|lp-nova-aprovacao)$/;

function arquivosDeCodigo(dir = ROOT, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.isDirectory()) {
      if (IGNORAR_DIR.test(ent.name)) continue;
      arquivosDeCodigo(path.join(dir, ent.name), out);
    } else if (/\.(html|js)$/.test(ent.name) && ent.name !== 'index.html.txt') {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

const FONTES = arquivosDeCodigo().map((abs) => ({
  rel: path.relative(ROOT, abs).replace(/\\/g, '/'),
  src: fs.readFileSync(abs, 'utf8')
}));

function chaves(regex) {
  const achados = new Map();
  for (const { rel, src } of FONTES) {
    for (const m of src.matchAll(regex)) {
      if (!achados.has(m[1])) achados.set(m[1], new Set());
      achados.get(m[1]).add(rel);
    }
  }
  return achados;
}

describe('Integridade entre páginas', () => {
  it('toda chave de localStorage lida por alguém é escrita por alguém', () => {
    // `vagaai_prefill_url` e `vagaai_scroll_to` eram lidas em /app e nunca
    // escritas: duas features descritas em comentário que nunca rodaram.
    const lidas = chaves(/localStorage\.getItem\(\s*['"]([^'"]+)['"]/g);
    const escritas = chaves(/localStorage\.(?:setItem|removeItem)\(\s*['"]([^'"]+)['"]/g);
    // Chaves que ninguém escreve de propósito: o SDK do Supabase grava a sessão
    // com prefixo sb-, o cookie-consent guarda o nome numa constante, e
    // 'vagaai-theme' é a chave antiga de tema — lida só para migrar quem já
    // tinha preferência salva, nunca mais escrita (ver teste do tema abaixo).
    const externas = /^sb-|^vagaai_cookie_consent$|^vagaai-theme$/;

    const orfas = [...lidas.keys()]
      .filter((k) => !externas.test(k) && !escritas.has(k))
      .map((k) => `${k} (lida em ${[...lidas.get(k)].join(', ')})`);

    assert.deepEqual(orfas, [], 'chave lida que ninguém escreve');
  });

  it('a preferência de tema usa uma chave só em todo o produto', () => {
    // O site institucional gravava em 'vagaai-theme' e o produto em
    // 'vagaai_theme': quem escolhia escuro na home voltava ao claro no /app.
    const escritas = chaves(/localStorage\.setItem\(\s*['"]([^'"]*theme[^'"]*)['"]/g);
    assert.deepEqual([...escritas.keys()].sort(), ['vagaai_theme']);

    // A chave antiga só pode sobreviver como leitura de migração.
    for (const { rel, src } of FONTES) {
      if (!src.includes('vagaai-theme')) continue;
      assert.match(
        src,
        /getItem\('vagaai_theme'\)\s*\|\|\s*localStorage\.getItem\('vagaai-theme'\)/,
        `${rel} menciona a chave antiga sem ler a nova antes`
      );
    }
  });

  it('nenhum href é montado só com escape de HTML', () => {
    // escHtml escapa & < >, mas deixa passar href="javascript:...". O link da
    // vaga vem do feed externo de vagas, não só do próprio usuário.
    const VALIDADORES = /(safeExternalUrl|_href)\(/;

    // Valor do próprio browser, não do dado: a origem da página não pode
    // carregar esquema executável.
    const INTRINSECOS = /^(location|window\.location)\.(origin|href|pathname)\s*$/;

    // Aceita tanto a chamada direta — _esc(_href(x)) — quanto o valor guardado
    // antes numa variável: var jobUrlSafe = safeExternalUrl(...).
    const validado = (expr, src) => {
      if (INTRINSECOS.test(expr) || VALIDADORES.test(expr)) return true;
      return (expr.match(/[A-Za-z_$][\w$]*/g) || []).some((id) =>
        new RegExp(`\\b${id}\\s*=\\s*(safeExternalUrl|_href)\\(`).test(src)
      );
    };

    for (const { rel, src } of FONTES) {
      for (const m of src.matchAll(/href="'\s*\+\s*([\s\S]{0,200}?)\+\s*'/g)) {
        assert.ok(
          validado(m[1], src),
          `${rel}: href sem validação de esquema em \`${m[1].trim().slice(0, 80)}\``
        );
      }
    }
  });

  it('safeExternalUrl rejeita esquema que não seja http(s)', () => {
    const dash = read('dashboard/index.html');
    const fn = dash.match(/function safeExternalUrl\([\s\S]*?\n\}/);
    assert.ok(fn, 'safeExternalUrl não encontrada');
    const sandbox = { URL, String };
    vm.runInNewContext(fn[0] + '\nvar _r = safeExternalUrl;', sandbox);
    assert.equal(sandbox._r('javascript:alert(1)'), '');
    assert.equal(sandbox._r('data:text/html,<script>x</script>'), '');
    assert.equal(sandbox._r('vbscript:msgbox'), '');
    assert.equal(sandbox._r('  '), '');
    assert.equal(sandbox._r('https://vaga.com/x'), 'https://vaga.com/x');
  });

  it('o gerador de PDF só carrega o documento principal', () => {
    // Subframe também é resourceType 'document': liberar todos permitia um
    // <iframe src="http://169.254.169.254/..."> render­izar endereço interno
    // dentro do PDF devolvido ao usuário.
    const pdf = read('api/generate-cv-pdf.js');
    assert.match(pdf, /resourceType\(\)\s*===\s*'document'\s*&&\s*req\.frame\(\)\s*===\s*page\.mainFrame\(\)/);
  });

  it('as lacunas de mercado são calculadas num lugar só', () => {
    const curriculo = read('curriculo/index.html');
    const dashboard = read('dashboard/index.html');
    for (const [rel, src] of [['curriculo', curriculo], ['dashboard', dashboard]]) {
      assert.match(src, /src="\/js\/cv-lacunas\.js"/, `${rel} não carrega o módulo`);
      assert.match(src, /VagaAICv\.calcularLacunas/, `${rel} não usa o módulo`);
      assert.doesNotMatch(src, /keywords_faltando \|\| \[\]\)\.forEach/, `${rel} recriou o cálculo local`);
    }
    // As duas telas precisam do mesmo recorte de análises.
    assert.match(curriculo, /VagaAICv\.ANALISES_QUERY\.limite/);
    assert.match(curriculo, /\.is\('archived_at', null\)/);
    assert.match(dashboard, /archived_at=is\.null/);
  });
});

describe('Cálculo de lacunas', () => {
  function carregar() {
    const sandbox = { window: {} };
    vm.runInNewContext(read('js/cv-lacunas.js'), sandbox, { filename: 'js/cv-lacunas.js' });
    return sandbox.window.VagaAICv;
  }
  const analises = (...listas) => listas.map((l) => ({ result: { keywords_faltando: l } }));

  it('ordena as lacunas pelas mais pedidas', () => {
    const { calcularLacunas } = carregar();
    const r = calcularLacunas({ nome: 'Ana' }, analises(['SQL', 'Growth'], ['SQL'], ['SQL', 'CRM']));
    assert.deepEqual(Array.from(r.gaps), ['SQL', 'Growth', 'CRM']);
    assert.equal(r.freq.SQL, 3);
    assert.equal(r.totalVagas, 3);
  });

  it('não acusa lacuna de competência citada só num projeto', () => {
    // O extrator do painel ignorava projetos: quem só tinha Python num projeto
    // pessoal via "Python" listado como lacuna na home e como coberto no hub.
    const { calcularLacunas } = carregar();
    const cv = { nome: 'Ana', projetos: [{ nome: 'ETL', bullets: ['Pipeline em Python'] }] };
    const r = calcularLacunas(cv, analises(['Python', 'Kafka']));
    assert.deepEqual(Array.from(r.gaps), ['Kafka']);
    assert.equal(r.cobertas, 1);
  });

  it('não acusa lacuna de competência que está só no texto importado', () => {
    const { calcularLacunas } = carregar();
    const cv = { nome: 'Ana', raw_text: 'Experiência com Salesforce e HubSpot' };
    const r = calcularLacunas(cv, analises(['Salesforce', 'SAP']));
    assert.deepEqual(Array.from(r.gaps), ['SAP']);
  });

  it('ignora keyword vazia e não quebra com entrada malformada', () => {
    const { calcularLacunas } = carregar();
    const r = calcularLacunas(null, [{ result: { keywords_faltando: ['', '  ', null] } }, {}, null]);
    assert.deepEqual(Array.from(r.gaps), []);
    assert.equal(r.totalVagas, 3);
  });
});
