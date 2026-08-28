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

  it('as áreas autenticadas usam o mesmo controle visual de tema', () => {
    const paginas = [
      'dashboard/index.html',
      'app/index.html',
      'curriculo/index.html',
      'cv/index.html',
      'carta/index.html',
      'entrevista/index.html',
      'login/index.html',
      'onboarding/vaga/index.html',
      'onboarding/curriculo/index.html'
    ];

    for (const pagina of paginas) {
      const src = read(pagina);
      assert.match(src, /class="[^"]*vui-theme-control/, `${pagina} não usa o controle compartilhado`);
      assert.match(src, /aria-label="Alternar tema claro ou escuro"/, `${pagina} não descreve a ação do controle`);
      assert.match(src, /product-ui\.css\?v=20260824-theme2/, `${pagina} não carrega a versão atual do componente`);
      assert.doesNotMatch(src, /vui-theme-label/, `${pagina} ainda exibe texto no controle de tema`);
    }

    const css = read('assets/product-ui.css');
    assert.match(css, /\.vui-theme-control\s*\{[\s\S]*?width:\s*40px;[\s\S]*?min-width:\s*40px;/);
    assert.match(css, /html\[data-theme="dark"\][\s\S]*\.vui-theme-sun/);
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
        // valor validado por helper...
        new RegExp(`\\b${id}\\s*=\\s*(safeExternalUrl|_href)\\(`).test(src) ||
        // ...ou construído a partir da própria origem da página, que não pode
        // carregar esquema executável (ex.: var x = location.origin + rota).
        new RegExp(`\\b${id}\\s*=\\s*location\\.origin\\s*\\+`).test(src)
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

describe('Superfície pública', () => {
  it('nenhum endereço IP público hardcoded no código de servidor', () => {
    // O repositório é público. Um bypass de rate limit "temporário" deixou um
    // IP residencial no fonte por semanas depois de expirar — endereço pessoal
    // exposto, e um atalho de autorização que ninguém lembrava de remover.
    // Restrito a código de servidor/compartilhado: HTML tem SVG e CSS inline
    // que produzem falso positivo.
    const alvo = FONTES.filter((f) => /^(api|lib|js)\//.test(f.rel) || f.rel === 'middleware.js');
    const privado = /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|22[4-9]\.|2[3-5]\d\.)/;
    // Endpoints de metadados de nuvem: aparecem no denylist de SSRF do
    // fetch-job.js, ou seja, são controle de segurança e não atalho.
    const DENYLIST_CONHECIDO = new Set(['100.100.100.200']);
    for (const { rel, src } of alvo) {
      const ips = [...src.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\b/g)]
        .map((m) => m[1])
        .filter((ip) => ip.split('.').every((o) => Number(o) <= 255))
        .filter((ip) => !privado.test(ip) && !DENYLIST_CONHECIDO.has(ip));
      assert.deepEqual(ips, [], `${rel}: IP público hardcoded`);
    }
  });

  it('toda página indexável está no sitemap', () => {
    // Página com robots "index, follow" fora do sitemap depende de link interno
    // para ser descoberta — foi o caso de /criar-curriculo.
    const middleware = read('middleware.js');
    const dinamicas = ['/blog/post']; // entram no sitemap via blog_posts
    for (const { rel, src } of FONTES) {
      if (!/\.html$/.test(rel)) continue;
      if (!/name="robots"\s+content="index/.test(src)) continue;
      const rota = rel === 'index.template.html' ? '/' : '/' + rel.replace(/\/index\.html$/, '').replace(/\.html$/, '');
      if (dinamicas.includes(rota)) continue;
      const alvo = rota === '/' ? `loc: '/'` : `loc: '${rota}'`;
      assert.ok(middleware.includes(alvo), `${rota} é indexável mas não está no sitemap (middleware.js)`);
    }
  });

  it('o limite sem cadastro não acusa quem nunca analisou', () => {
    // O limite é por IP, e CGNAT de operadora móvel faz milhares de pessoas
    // saírem pelo mesmo endereço: "você já usou" é dito a quem acabou de chegar.
    const app = read('app/index.html');
    assert.doesNotMatch(app, /Você já usou sua análise gratuita'/,
      'a mensagem do limite anônimo voltou a culpar o usuário');
    assert.match(app, /uma por rede a cada 30 dias/);
  });
});

describe('Funções órfãs', () => {
  /* Funcao declarada e nunca chamada de lugar nenhum. Nao e so codigo morto: e
     armadilha. renderManualItem PARECIA o renderizador da lista de
     candidaturas, e uma acao adicionada nela nunca chegava a tela — quem monta
     a lista e renderCandList. O mesmo padrao aparece em varias funcoes que
     perderam o ponto de entrada em trocas de layout: o recurso existe inteiro
     no codigo e some da interface sem erro.

     Ratchet: a lista e a divida em 13/08/2026. Funcao orfa nova quebra a suite. */
  const ORFAS_CONHECIDAS = {
    'app/index.html': ['toggleAppDropdown', 'closeAppDropdown', 'renderList'],
    'cv/index.html': [
      'cvSaveToCloud',        // usa spCloudSaveBtn — painel lateral removido
      'goBackToDashboardTab', 'fitToOnePage',
      'applySmartFix',        // aplicar correção sugerida
      's4SaveCloud',          // salvar currículo na nuvem no passo 4
      '_closePanelMob',
    ],
    'dashboard/index.html': [
      'setVagasFilter', 'renderFilterBar', 'renderVagasList',  // wrappers da lista antiga
      'openTracker',
      'saveRecommendedJob',   // salvar vaga do alerta — a grade só analisa, abre ou descarta
      'openJobAnalysis', '_saveJobFromCache',
      'renderKwTags', 'handleKwInput', 'removeKw', 'setFreq',  // stubs vazios do editor de alerta
      'addToTracker', 'saveTracker',
    ],
    'entrevista/index.html': ['_jobInfoToText'],
  };

  it('nenhuma função órfã nova', () => {
    const declaradas = (src) =>
      [...src.matchAll(/^\s*(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)].map((m) => m[1]);
    const TUDO = FONTES.map((f) => f.src).join('\n');

    for (const [pagina, conhecidas] of Object.entries(ORFAS_CONHECIDAS)) {
      const src = read(pagina);
      const orfas = [...new Set(declaradas(src))].filter((nome) => {
        const usos = (TUDO.match(new RegExp('\\b' + nome + '\\b', 'g')) || []).length;
        return usos <= 1; // só a própria declaração
      });
      const novas = orfas.filter((n) => !conhecidas.includes(n));
      assert.deepEqual(novas, [], `${pagina}: função declarada e nunca chamada`);
    }
  });

  it('a ação de analisar vaga sem análise está no renderizador vivo', () => {
    // Regressão do erro que originou este teste: a ação foi parar em
    // renderManualItem (morta) e nunca renderizou.
    const dash = read('dashboard/index.html');
    const detalhe = dash.match(/function renderCandDetail\([\s\S]*?\n\}/);
    assert.ok(detalhe, 'renderCandDetail não encontrada');
    assert.match(detalhe[0], /buildTrackerAnalyzeUrl/, 'a ação não está no painel de detalhe');
    assert.doesNotMatch(dash, /function renderManualItem/, 'o renderizador morto voltou');
  });
});

describe('Elementos referenciados existem', () => {
  /* getElementById de um id que não existe no markup e uma falha muda: o codigo
     e guardado (if (el)), entao o recurso simplesmente nao aparece — sem erro,
     sem log. Foi assim que o botao "Adicionar ao rastreador" de /app e a faixa
     de progresso de /cv ficaram invisiveis com o codigo inteiro funcionando.

     Este teste e um ratchet: a lista abaixo e a divida conhecida em 13/08/2026.
     Qualquer id novo sem markup quebra a suite. Tirar um daqui exige restaurar
     o markup — nunca ampliar a lista sem uma razao escrita. */
  const ORFAOS_CONHECIDOS = {
    'app/index.html': [
      'appUserDropdown',   // dropdown do usuario: substituido pela sidebar compartilhada
      'alertVagaNotice',   // criado em runtime via notice.id = ... (nao e orfao de fato)
    ],
    'dashboard/index.html': [
      'alMHora',           // campo de hora do modal de alerta, removido do formulario
    ],
    'cv/index.html': [
      // jobSummary* saiu: o contexto da vaga vive no widget da navegacao
      // (cn-ats-widget), que mostra score, cargo, empresa, palavras a priorizar
      // e agora o link para reabrir o anuncio.
      // s3ReforcarIA() nao e chamada de lugar nenhum: religar o botao significa
      // decidir se a acao (que altera o CV da pessoa) deve existir.
      's3AiBtn', 's3AiBtnLabel',
      'pdfPreflightOverlay', // ausencia e tratada como "fechado" — default seguro
      'sf_resumo_count',     // contador de caracteres do resumo
    ],
  };

  it('nenhum id novo referenciado sem markup', () => {
    for (const [pagina, conhecidos] of Object.entries(ORFAOS_CONHECIDOS)) {
      const src = read(pagina);
      const referenciados = new Set(
        [...src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
      );
      // Conta como presente o id posto em runtime (el.id = 'x'), nao so o atributo.
      const existe = (id) => src.includes(`id="${id}"`) || src.includes(`id='${id}'`)
        || new RegExp(`\\.id\\s*=\\s*['"]${id}['"]`).test(src);
      const novos = [...referenciados].filter((id) => !existe(id) && !conhecidos.includes(id));
      assert.deepEqual(novos, [], `${pagina}: id referenciado sem markup`);
    }
  });

  it('os recursos restaurados continuam com markup', () => {
    // Regressao direta: estes tres sumiram uma vez e o produto perdeu a funcao.
    assert.match(read('app/index.html'), /id="trackerCTA"/);
    assert.match(read('app/index.html'), /id="trackerAddBtn"/);
    assert.match(read('cv/index.html'), /id="s4ProgressStrip"/);
    // E o contêiner precisa ter a classe que tem CSS, senão renderiza sem estilo.
    assert.match(read('cv/index.html'), /class="s4-progress-strip" id="s4ProgressStrip"/);
  });
});

describe('Shell do dashboard', () => {
  it('a base injetada é a URL do documento, não a origem', () => {
    // O shell escreve o HTML da página num iframe about:blank, então precisa de
    // <base> para resolver caminhos. Com base na ORIGEM, href="#formSection"
    // resolvia para "https://dominio/#formSection": clicar em "Revisar os dados
    // antes da análise" trocava /app pela landing page dentro do iframe e
    // perdia a vaga e o currículo já digitados.
    const dash = read('dashboard/index.html');
    const injecao = dash.match(/html = html\.replace\(\/\(<head\[\^>\]\*>\)\/i,[^;]+;/);
    assert.ok(injecao, 'injeção da base não encontrada');
    assert.match(injecao[0], /<base href="' \+ embeddedHref \+ '"/,
      'a base voltou a ser a origem — âncoras saem da página');
    assert.doesNotMatch(injecao[0], /<base href="' \+ location\.origin/);
  });

  it('âncora resolve para a própria página com a base corrigida', () => {
    // Mesmo cálculo que o navegador faz, para provar o comportamento e não só
    // a presença da string no fonte.
    const base = 'https://www.vagaai.app.br/app?embedded=1';
    assert.equal(new URL('#formSection', base).href, 'https://www.vagaai.app.br/app?embedded=1#formSection');
    // E a resolução de caminhos não muda em relação à base antiga.
    const origem = 'https://www.vagaai.app.br';
    for (const caminho of ['/js/cv-base.js', 'favicon.svg', '/curriculo']) {
      assert.equal(new URL(caminho, base).href, new URL(caminho, origem).href, caminho);
    }
  });

  it('toda âncora das páginas do shell aponta para um id existente', () => {
    // Âncora para id inexistente não navega — o clique simplesmente não faz nada.
    for (const pagina of ['app/index.html', 'curriculo/index.html', 'carta/index.html', 'entrevista/index.html']) {
      const src = read(pagina);
      for (const m of src.matchAll(/href="#([A-Za-z][\w-]*)"/g)) {
        assert.ok(src.includes(`id="${m[1]}"`), `${pagina}: âncora #${m[1]} sem alvo`);
      }
    }
  });
});

describe('Crons têm limite e ordem', () => {
  const API = FONTES.filter((f) => f.rel.startsWith('api/'));

  it('nenhuma paginação de base roda sem teto de páginas', () => {
    // Paginar a base inteira faz o custo crescer com o total de cadastros e não
    // com os destinatários: a função passa a ser morta pelo maxDuration sem
    // erro nenhum, e os e-mails simplesmente param de sair.
    //
    // A regra mira paginação, não todo `while(true)`: readBodyLimited em
    // fetch-job.js é um leitor de stream com dois cortes (fim do corpo e teto
    // de bytes), que é justamente um laço já limitado.
    for (const { rel, src } of API) {
      if (!/\bpage\+\+/.test(src)) continue;
      // O teto vale como constante nomeada ou literal (webhook.js usa `page <= 5`).
      assert.match(src, /page\s*<=?\s*([A-Z_]{3,}|\d+)/,
        `${rel}: pagina sem teto — precisa de um limite de páginas`);
    }
  });

  it('a fila do cron de alertas é ordenada e limitada', () => {
    const src = read('api/send-alerts.js');
    const consulta = src.match(/job_alert_profiles\?ativo=eq\.true[^`]*/);
    assert.ok(consulta, 'consulta do cron não encontrada');
    // Sem ORDER BY, o PostgREST devolve na ordem física e os mesmos usuários
    // ficam sempre no início: quem não cabe no corte nunca é alcançado.
    assert.match(consulta[0], /order=next_run_at\.asc/, 'fila sem ordenação: causa inanição da cauda');
    assert.match(consulta[0], /limit=/, 'fila sem teto de leitura');
    // E o laço precisa parar sozinho antes do maxDuration, não ser morto.
    assert.match(src, /runDeadline - Date\.now\(\) < maiorLote/);
  });

  it('todo cron declara maxDuration', () => {
    const vercel = JSON.parse(read('vercel.json'));
    const funcs = vercel.functions || {};
    for (const cron of vercel.crons || []) {
      const arquivo = cron.path.replace(/^\//, '') + '.js';
      assert.ok(funcs[arquivo] && funcs[arquivo].maxDuration,
        `${arquivo} roda em cron sem maxDuration declarado`);
    }
  });
});

describe('Paginação de usuários do onboarding', () => {
  function carregar() {
    /* Normaliza CRLF antes de fatiar. O corte abaixo procura a sequencia
       quebra-de-linha + '}' + quebra-de-linha como fim da funcao; num clone
       Windows o arquivo vem com CRLF, o indexOf devolve -1, e a funcao
       extraida vira string vazia. O teste falhava por fim de linha, nao por
       codigo — e so aparecia depois de um checkout, nunca durante a edicao. */
    const src = read('api/cron-onboarding.js').replace(/\r\n/g, '\n');
    const partes = ['const MAX_PAGINAS', 'function direcaoDaPagina', 'async function getUsersCreatedAround']
      .map((assinatura) => {
        const i = src.indexOf(assinatura);
        assert.ok(i >= 0, `não achei: ${assinatura}`);
        const fim = src.indexOf('\n}\n', i);
        return assinatura.startsWith('const') ? src.slice(i, src.indexOf('\n', i) + 1) : src.slice(i, fim + 3);
      });
    const sandbox = { Date, Number, Math, JSON, console };
    sandbox.SUPABASE_URL = 'https://x';
    sandbox.SUPABASE_SERVICE_KEY = 'k';
    return { sandbox, codigo: partes.join('\n') };
  }

  // Base sintética: 3 páginas cheias, do mais novo para o mais antigo.
  function paginasDesc(totalPaginas, perPage) {
    return (url) => {
      const page = Number((url.match(/page=(\d+)/) || [])[1]);
      const users = [];
      for (let i = 0; i < perPage; i++) {
        const idx = (page - 1) * perPage + i;
        users.push({ id: 'u' + idx, created_at: new Date(Date.now() - idx * 60 * 60 * 1000).toISOString() });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ users: page <= totalPaginas ? users : [] }) });
    };
  }

  it('para de paginar assim que passa da janela', async () => {
    const { sandbox, codigo } = carregar();
    const paginasPedidas = [];
    sandbox.fetch = (url) => { paginasPedidas.push(Number((url.match(/page=(\d+)/) || [])[1])); return paginasDesc(50, 10)(url); };
    vm.runInNewContext(codigo + '\nvar _f = getUsersCreatedAround;', sandbox);

    // Janela em torno de 2 dias atrás; com 10 usuários por página de 1h em 1h,
    // a janela acaba bem antes da 50ª página.
    const achados = await sandbox._f(2, 12);
    assert.ok(paginasPedidas.length < 50, `paginou ${paginasPedidas.length} páginas — deveria cortar cedo`);
    assert.ok(Array.isArray(achados));
  });

  it('respeita o teto de páginas mesmo sem conseguir detectar a ordem', async () => {
    const { sandbox, codigo } = carregar();
    let chamadas = 0;
    // Todas as páginas com a MESMA data: direcaoDaPagina não decide o sentido.
    sandbox.fetch = () => {
      chamadas++;
      const users = Array.from({ length: 10 }, (_, i) => ({ id: 'u' + i, created_at: new Date().toISOString() }));
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ users }) });
    };
    vm.runInNewContext(codigo + '\nvar _f = getUsersCreatedAround;\nvar _max = MAX_PAGINAS;', sandbox);
    await sandbox._f(2, 12);
    assert.ok(chamadas <= sandbox._max, `paginou ${chamadas} vezes, acima do teto ${sandbox._max}`);
  });

  it('detecta a direção da página pelos próprios dados', () => {
    const { sandbox, codigo } = carregar();
    vm.runInNewContext(codigo + '\nvar _d = direcaoDaPagina;', sandbox);
    assert.equal(sandbox._d([300, 200, 100]), 'desc');
    assert.equal(sandbox._d([100, 200, 300]), 'asc');
    assert.equal(sandbox._d([100]), null, 'uma data só não define direção');
    assert.equal(sandbox._d([]), null);
  });
});

describe('Falha de envio de alerta é visível', () => {
  function carregar(historico) {
    const src = read('dashboard/index.html');
    const fn = src.match(/function ultimaFalhaDeEnvio\(\)[\s\S]*?\n\}/);
    assert.ok(fn, 'ultimaFalhaDeEnvio não encontrada');
    const sandbox = { Date, _alertHistory: historico };
    vm.runInNewContext(fn[0] + '\nvar _r = ultimaFalhaDeEnvio();', sandbox);
    return sandbox._r;
  }

  it('avisa quando o último envio falhou', () => {
    // send-alerts grava status:'failed' quando o provedor recusa o e-mail, mas
    // o painel só olhava 'sent': quem tinha entrega falhando via "0 alertas
    // enviados" e nenhuma pista do motivo.
    const r = carregar([
      { sent_at: '2026-08-01T10:00:00Z', status: 'sent' },
      { sent_at: '2026-08-08T10:00:00Z', status: 'failed' }
    ]);
    assert.ok(r);
    assert.equal(r.status, 'failed');
  });

  it('não alarma por falha antiga já superada', () => {
    const r = carregar([
      { sent_at: '2026-08-01T10:00:00Z', status: 'failed' },
      { sent_at: '2026-08-08T10:00:00Z', status: 'sent' }
    ]);
    assert.equal(r, null);
  });

  it('não quebra com histórico vazio ou malformado', () => {
    assert.equal(carregar([]), null);
    assert.equal(carregar([{ status: 'failed' }]), null, 'registro sem data não conta');
    assert.equal(carregar(null), null);
  });
});

describe('Currículo base como fonte única', () => {
  it('as páginas que usam o currículo o buscam no banco, não só no navegador', () => {
    // localStorage é cache do dispositivo. Páginas que liam só o cache diziam
    // "nenhum currículo salvo" para quem tinha feito login em outro aparelho.
    for (const pagina of ['carta/index.html', 'entrevista/index.html']) {
      const src = read(pagina);
      assert.match(src, /src="\/js\/cv-base\.js"/, `${pagina} não carrega o módulo`);
      assert.match(src, /VagaAICv\.carregarBase\(/, `${pagina} não busca o currículo no banco`);
    }
  });

  it('o serializador legível não perde projetos nem o texto importado', () => {
    const sandbox = { window: {} };
    vm.runInNewContext(read('js/cv-base.js'), sandbox, { filename: 'js/cv-base.js' });
    const { cvParaTextoLegivel } = sandbox.window.VagaAICv;

    const texto = cvParaTextoLegivel({
      nome: 'Ana',
      experiencias: [{ cargo: 'Analista', empresa: 'Acme', bullets: ['Reduziu custo em 20%'] }],
      projetos: [{ nome: 'ETL', contexto: 'Voluntariado', bullets: ['Pipeline em Python'] }],
      habilidades: ['SQL'],
      raw_text: 'Texto original do PDF'
    });
    assert.match(texto, /EXPERIÊNCIA PROFISSIONAL/);
    assert.match(texto, /Reduziu custo em 20%/);
    assert.match(texto, /PROJETOS E PORTFÓLIO/);
    assert.match(texto, /Pipeline em Python/);
    assert.match(texto, /Texto original do PDF/);

    // Currículo só importado: devolve o texto cru, sem cabeçalho inventado.
    assert.equal(cvParaTextoLegivel({ raw_text: 'Só o texto' }), 'Só o texto');
    assert.equal(cvParaTextoLegivel(null), '');
    assert.equal(cvParaTextoLegivel('já é texto'), 'já é texto');
  });
});

describe('Fluxo de candidatura', () => {
  it('vaga adicionada à mão oferece análise, levando o link junto', () => {
    // A linha "Sem análise" só tinha editar e remover: para analisar, o usuário
    // recolava no formulário em branco uma URL que o tracker já guardava.
    const dash = read('dashboard/index.html');
    assert.match(dash, /⚡ Analisar/);

    const fn = dash.match(/function buildTrackerAnalyzeUrl\([\s\S]*?\n\}/);
    const safe = dash.match(/function safeExternalUrl\([\s\S]*?\n\}/);
    assert.ok(fn && safe);
    const sandbox = { URL, String, encodeURIComponent };
    vm.runInNewContext(`${safe[0]}\n${fn[0]}\nvar _b = buildTrackerAnalyzeUrl;`, sandbox);

    const url = sandbox._b({ job_url: 'https://vagas.com/x', cargo: 'Analista', empresa: 'Acme' });
    assert.match(url, /^\/app\?/);
    assert.match(url, /vaga=https%3A%2F%2Fvagas\.com%2Fx/);
    assert.match(url, /job_title=Analista/);
    assert.match(url, /job_company=Acme/);

    // Link com esquema executável não pode virar parâmetro de navegação.
    assert.doesNotMatch(sandbox._b({ job_url: 'javascript:alert(1)', cargo: 'X' }), /javascript/);
    // Sem link, ainda abre o analisador — só sem pré-preenchimento de URL.
    assert.equal(sandbox._b({}), '/app');
  });

  it('o menu avisa quais abas o plano atual não libera', () => {
    const dash = read('dashboard/index.html');
    assert.match(dash, /function marcarItensPagosNoMenu/);
    // Os selos precisam bater com o gate real do servidor: cover-letter recusa
    // free; interview recusa quem não é pro.
    assert.match(read('api/cover-letter.js'), /plan === 'free'/);
    assert.match(read('api/interview.js'), /plan !== 'pro'/);
    assert.match(dash, /tab: 'carta',\s*bloqueado: plano === 'free'/);
    assert.match(dash, /tab: 'entrevistas',\s*bloqueado: !\(plano === 'pro'/);
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

describe('Números coerentes entre telas', () => {
  function modulo() {
    const sandbox = { window: {} };
    vm.runInNewContext(read('js/cv-lacunas.js'), sandbox, { filename: 'js/cv-lacunas.js' });
    return sandbox.window.VagaAICv;
  }
  const vaga = (empresa, cargo, kw, id) => ({
    id, created_at: '2026-08-01T00:00:00Z',
    result: { job_info: { empresa, cargo }, keywords_faltando: kw }
  });

  it('conta vagas distintas, não análises', () => {
    // Reanalisar a mesma vaga cria outra análise. O painel dizia "2 vagas" para
    // uma vaga só, analisada duas vezes.
    const { calcularLacunas, contarVagasDistintas } = modulo();
    const duas = [vaga('PRIMIZIE', 'Gerente de Marketing', ['SQL'], 'a1'),
                  vaga('PRIMIZIE', 'Gerente de Marketing', ['CRM'], 'a2')];
    assert.equal(contarVagasDistintas(duas), 1);
    const r = calcularLacunas({ nome: 'Ana' }, duas);
    assert.equal(r.totalVagas, 1, 'totalVagas deve ser por vaga');
    assert.equal(r.totalAnalises, 2, 'totalAnalises preserva a contagem crua');
    // Vagas realmente diferentes continuam separadas
    assert.equal(contarVagasDistintas([...duas, vaga('Acme', 'Dev', [], 'a3')]), 2);
  });

  it('reanálise não multiplica recorrência e usa o resultado mais recente', () => {
    const { calcularLacunas } = modulo();
    const antiga = vaga('PRIMIZIE', 'Gerente de Marketing', ['SQL'], 'a1');
    antiga.created_at = '2026-08-01T00:00:00Z';
    const nova = vaga('PRIMIZIE', 'Gerente de Marketing', ['CRM', 'crm', 'CRM'], 'a2');
    nova.created_at = '2026-08-02T00:00:00Z';
    const r = calcularLacunas({ nome: 'Ana' }, [antiga, nova]);
    assert.equal(r.totalVagas, 1);
    assert.equal(r.totalAnalises, 2);
    assert.deepEqual(Array.from(r.gaps), ['CRM']);
    assert.equal(r.freq.CRM, 1, 'a mesma competência conta no máximo uma vez por vaga');
    assert.equal(r.freq.SQL, undefined, 'o resultado antigo não deve contaminar a leitura atual');
  });

  it('sem identificação da vaga, nunca agrupa errado', () => {
    const { contarVagasDistintas } = modulo();
    const anonimas = [{ id: 'x', result: {} }, { id: 'y', result: {} }];
    assert.equal(contarVagasDistintas(anonimas), 2);
  });

  it('a contagem de requisitos do bloco 02 cruza com o currículo', () => {
    // keywords_faltando vem crua da IA: numa conta real, 6 das 16 "faltantes"
    // estavam no CV. O card dizia 16 e a faixa acima dizia 10.
    const dash = read('dashboard/index.html');
    const pba = dash.match(/function buildPBACard\([\s\S]*?\n\}/);
    assert.ok(pba);
    assert.match(pba[0], /VagaAICv\.calcularLacunas\(_cvBase\.cv_data, \[alvo\]\)/,
      'buildPBACard voltou a usar keywords_faltando cru');
    // E o painel precisa re-renderizar quando o currículo base chega
    assert.match(dash, /_cvBaseLoaded = true;[\s\S]{0,400}buildPainelV2\(window\._lastAnalysesData/);
  });

  it('a lista de oportunidades mostra uma linha por vaga', () => {
    assert.match(read('dashboard/index.html'), /chaveDaVaga\(a\)[\s\S]{0,300}var sorted = unicas/);
  });

  it('o hub conta vagas distintas, não análises', () => {
    // O módulo agrupava certo, mas o hub interpolava rows.length e dizia
    // "2 vaga(s)" enquanto o painel dizia "1 vaga" — mesma divergência, outra tela.
    const c = read('curriculo/index.html');
    assert.ok(!c.includes("rows.length + ' vaga(s)"), 'hub voltou a contar análises');
    assert.ok(c.includes("lac.totalVagas + ' ' + (lac.totalVagas === 1 ? 'vaga analisada' : 'vagas analisadas')"), 'hub não usa a contagem por vaga');
    assert.ok(c.includes("metric(lac.totalVagas, lac.totalVagas === 1 ? 'vaga analisada' : 'vagas analisadas')"), 'métrica do hero ainda conta análises');
  });

  it('versão de análise arquivada não conta como ativa', () => {
    // O hub anunciava "Ativas (46)" com as 46 vindas de análises arquivadas,
    // enquanto o painel dizia 0.
    assert.match(read('curriculo/index.html'),
      /versaoArquivada = function\(row\)\{ return !!row\.result\.cv_version_archived_at \|\| !!row\.archived_at; \}/);
  });

  it('texto secundário passa no contraste mínimo nos dois temas', () => {
    const dash = read('dashboard/index.html');
    const t3 = [...dash.matchAll(/--t3:\s*(#[0-9a-f]{6})/gi)].map((m) => m[1].toLowerCase());
    assert.equal(t3.length, 2, 'esperado um --t3 por tema');
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.substr(i, 2), 16));
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const razao = (a, b) => { const x = lum(hex(a)), y = lum(hex(b));
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    // claro sobre card branco; escuro sobre card #0d1610
    assert.ok(razao(t3[0], '#ffffff') >= 4.5, `--t3 claro ${t3[0]}: ${razao(t3[0], '#ffffff').toFixed(2)}:1`);
    assert.ok(razao(t3[1], '#0d1610') >= 4.5, `--t3 escuro ${t3[1]}: ${razao(t3[1], '#0d1610').toFixed(2)}:1`);
  });
});

describe('Carta de apresentação usa a análise', () => {
  const api = () => read('api/cover-letter.js');
  const front = () => read('carta/index.html');

  it('o prompt recebe requisitos comprovados, ausentes e briefing', () => {
    // Sem isso a carta é escrita de texto cru — igual à de qualquer gerador
    // genérico, que é justamente o que recrutador descarta.
    const s = api();
    assert.match(s, /keywords_encontradas/, 'prompt ignora o que o CV comprova');
    assert.match(s, /keywords_faltando/, 'prompt ignora as lacunas');
    assert.match(s, /briefing_empresa/, 'prompt ignora o briefing da empresa');
    assert.match(s, /REQUISITOS QUE O CURR[Í\u00cd]CULO COMPROVA/);
    // A lacuna nunca pode virar afirmação de que a pessoa possui o requisito.
    assert.match(s, /NUNCA afirme possu/);
  });

  it('a estratégia da carta muda com o score', () => {
    // A carta importa mais quando a aderência é baixa: 49% dos gestores dizem
    // que uma carta forte garante entrevista a quem parece fraco no papel.
    const s = api();
    assert.match(s, /score >= 75/);
    assert.match(s, /score >= 50/);
    assert.match(s, /N[ã\u00e3]o esconda a lacuna/);
  });

  it('a motivação da pessoa entra sem poder ser inventada', () => {
    const s = api();
    assert.match(s, /MOTIVA[Ç\u00c7][Ã\u00c3]O DITA PELA PR[Ó\u00d3]PRIA PESSOA/);
    assert.match(s, /NUNCA invente detalhe que ela n[ã\u00e3]o disse/);
    // Opcional: não pode virar campo obrigatório e criar atrito.
    assert.doesNotMatch(front(), /porqueInput[^>]*required/);
    assert.match(front(), /id="porqueInput"/);
  });

  it('devolve os três formatos e o front sabe alterná-los', () => {
    const s = api();
    for (const campo of ['"curta"', '"mensagem"', '"requisitos_citados"', '"lacuna_enderecada"']) {
      assert.ok(s.includes(campo), `resposta sem ${campo}`);
    }
    const f = front();
    assert.match(f, /function setFormato/);
    assert.match(f, /data-fmt="curta"/);
    assert.match(f, /data-fmt="mensagem"/);
    // O assunto só faz sentido no formato de e-mail.
    assert.match(f, /_formatoAtivo === 'carta' \? \('Assunto: '/);
  });

  it('o chip da lacuna nao quebra com resposta verbosa do modelo', () => {
    // Na primeira chamada real o modelo devolveu a explicacao inteira no campo
    // em vez do nome do requisito. O prompt pede curto, mas a tela nao pode
    // depender disso.
    const f = front();
    assert.match(f, /lac\.length <= 60/, 'sem guarda de tamanho no chip');
    assert.match(f, /Cobriu o principal ponto que faltava/, 'sem fallback para texto longo');
    assert.match(api(), /no maximo 4 palavras/, 'prompt nao restringe o campo');
  });

  it('resposta truncada vira erro claro, nao 500 generico', () => {
    // A resposta passou de um texto para tres. Truncada, o JSON chega invalido
    // e o JSON.parse estoura — a pessoa perde a geracao sem saber por que.
    const s = api();
    assert.match(s, /data\.stop_reason === 'max_tokens'/);
    assert.match(s, /A carta ficou incompleta/);
  });

  it('requisito citado que nao esta na lista real e descartado', () => {
    // Sem o cruzamento, a tela poderia mostrar "Menciona 12 dos 9 requisitos".
    const s = api();
    const bloco = s.match(/const norm = \(v\)[\s\S]*?result\.requisitos_total/);
    assert.ok(bloco, 'filtro de requisitos citados ausente');
    const atende = ['SEO', 'Google Ads', 'Copywriting'];
    const rodar = (citados) => {
      const result = { requisitos_citados: citados };
      eval(bloco[0].replace('result.requisitos_total', 'void 0'));
      return result.requisitos_citados;
    };
    assert.deepEqual(rodar(['SEO', 'Kubernetes']), ['SEO'], 'nao filtrou item inventado');
    assert.deepEqual(rodar(['SEO', 'seo']), ['SEO'], 'nao removeu duplicata');
    assert.deepEqual(rodar(['google ads']), ['Google Ads'], 'nao normalizou a caixa');
    assert.deepEqual(rodar('nao e array'), []);
    // E o numero exibido nunca pode passar do total real.
    assert.ok(rodar(['SEO','Google Ads','Copywriting','Extra']).length <= atende.length);
  });

  it('o total de requisitos vem do servidor, não da IA', () => {
    // "Menciona X dos Y" — se Y viesse do modelo, seria alucinável.
    assert.match(api(), /result\.requisitos_total = atende\.length/);
  });
});

describe('Eventos de produto', () => {
  function helper() {
    const enviados = [];
    const sandbox = { window: { gtag: (t, n, p) => enviados.push({ n, p }) } };
    sandbox.window.parent = sandbox.window;
    vm.runInNewContext(read('js/eventos.js'), sandbox);
    return { track: sandbox.window.vagaaiTrack, enviados };
  }

  it('nunca deixa dado pessoal sair nos parâmetros', () => {
    // LGPD: o Consent Mode já barra o envio sem aceite, mas o parâmetro não
    // pode carregar nome, e-mail ou texto de currículo em hipótese nenhuma.
    const { track, enviados } = helper();
    track('carta_gerada', {
      tom: 'direto', nome: 'João Victor', email: 'a@b.com',
      cv: 'texto do currículo', curriculo: 'idem', telefone: '11999999999'
    });
    // Object.assign traz do realm do vm para o do teste antes de comparar.
    assert.deepEqual(Object.assign({}, enviados[0].p), { tom: 'direto' });
  });

  it('descarta objeto e trunca string longa', () => {
    const { track, enviados } = helper();
    track('x', { obj: { a: 1 }, longa: 'y'.repeat(300), num: 7 });
    assert.equal(enviados[0].p.obj, undefined);
    assert.equal(enviados[0].p.longa.length, 80);
    assert.equal(enviados[0].p.num, 7);
  });

  it('não quebra quando não há gtag na página', () => {
    const sandbox = { window: {} };
    sandbox.window.parent = sandbox.window;
    vm.runInNewContext(read('js/eventos.js'), sandbox);
    assert.doesNotThrow(() => sandbox.window.vagaaiTrack('qualquer', { a: 1 }));
  });

  it('os passos do funil que faltavam agora disparam', () => {
    const esperado = {
      'curriculo_salvo': ['curriculo/index.html', 'app/index.html'],
      'carta_gerada': ['carta/index.html'],
      'alerta_configurado': ['dashboard/index.html'],
      'checkout_iniciado': ['dashboard/index.html', 'js/lp-editorial.js'],
    };
    for (const [evento, arquivos] of Object.entries(esperado)) {
      for (const arq of arquivos) {
        assert.ok(read(arq).includes(`'${evento}'`), `${arq} não dispara ${evento}`);
      }
    }
  });

  it('as páginas que disparam eventos carregam o helper', () => {
    for (const p of ['dashboard/index.html', 'carta/index.html', 'curriculo/index.html']) {
      assert.match(read(p), /src="\/js\/eventos\.js"/, `${p} sem o helper`);
    }
  });
});

/* Dois bugs do painel que só apareceram na tela, nunca no código: um <span> de
   valor sem display:block colando no rótulo ("1 vagaVagas analisadas"), e um
   `transition:all` segurando o background antigo quando o tema muda com a tela
   já renderizada. Nenhum dos dois quebra teste de comportamento — só ratchet
   de CSS pega. */
describe('CSS do painel: armadilhas que só aparecem renderizadas', () => {
  const dash = read('dashboard/index.html');

  it('valor e rótulo empilham: <span> precisa de display:block', () => {
    for (const classe of ['fer-nome', 'fer-estado', 'bus-num', 'bus-lbl', 'mat-val', 'mat-lbl']) {
      const regra = dash.match(new RegExp(`^\.${classe} \{([^}]*)\}`, 'm'));
      if (!regra) continue; // classe pode ter sido removida
      const ehSpan = new RegExp(`<span class="${classe}"`).test(dash);
      if (!ehSpan) continue; // se virou <div>, já é bloco por padrão
      assert.match(regra[1], /display\s*:\s*(block|flex|grid)/,
        `.${classe} é <span> e não declara display de bloco: valor e rótulo saem na mesma linha`);
    }
  });

  /* Dívida conhecida, não meta zerada. O Chrome mantém o valor antigo do
     background quando a custom property muda sob `transition:all` — provado no
     par .fer-card (transition:all, ficava branco no escuro) contra .mat-tile
     (sem transition, atualiza), mesmo arquivo e mesma var. Estas regras têm o
     mesmo defeito latente e só aparecem para quem troca de tema com a tela
     aberta. Trocar as 12 de uma vez mexeria no hover de componentes que ninguém
     revisou; o ratchet impede que a lista cresça. */
  const FUNDO_PRESO_NO_TEMA = [
    '.icon-btn', '.mv-track-btn', '.vf-chip', '.job-card', '.opp-chip',
    '.funil-per-btn', '.cc-chip', '.kk-card', '.al-sum-btn', '.al-qf',
    '.al-jact-btn', '.tour-balloon',
  ];

  it('nenhum card novo entra na lista de fundo preso ao tema', () => {
    const regras = dash.match(/^\.[a-z-]+ \{[^}]*\}/gm) || [];
    const suspeitas = regras
      .filter((r) => /background\s*:\s*var\(--bg-card\)/.test(r))
      .filter((r) => /transition\s*:\s*all/.test(r))
      .map((r) => r.slice(0, r.indexOf(' {')));
    const novas = suspeitas.filter((c) => !FUNDO_PRESO_NO_TEMA.includes(c));
    assert.deepEqual(novas, [],
      `regra nova com fundo preso ao tema anterior: ${novas.join(', ')}. ` +
      'Liste as propriedades da transition em vez de usar `all`.');
  });
});

/* O banco isola contas por RLS (auth.uid() = user_id em toda tabela de
   usuário). O navegador não isolava nada: o currículo, a foto, a última vaga
   colada e o estado do onboarding ficavam em localStorage sem dono, e logout()
   só chamava signOut(). Num computador compartilhado a próxima pessoa abria o
   Treino de entrevista com o CV da anterior já no campo. Ver /js/sessao.js. */
describe('Cache do navegador não atravessa contas', () => {
  const sessao = read('js/sessao.js');

  // Páginas autenticadas que leem dados pessoais do localStorage.
  const PAGINAS = [
    'dashboard/index.html', 'app/index.html', 'cv/index.html',
    'carta/index.html', 'entrevista/index.html', 'curriculo/index.html',
  ];

  it('toda página autenticada carrega o módulo e adota a sessão', () => {
    for (const p of PAGINAS) {
      const src = read(p);
      assert.match(src, /src="\/js\/sessao\.js"/, `${p} não carrega /js/sessao.js`);
      assert.match(src, /VagaAISessao\.adotar\(/, `${p} não chama VagaAISessao.adotar()`);
    }
  });

  it('todo logout limpa o cache pessoal antes de encerrar a sessão', () => {
    for (const p of ['dashboard/index.html', 'app/index.html', 'carta/index.html', 'entrevista/index.html']) {
      const src = read(p);
      assert.match(src, /VagaAISessao\.limpar\(\)/, `${p} faz signOut sem limpar o cache`);
    }
  });

  /* Ratchet: chave nova de dado pessoal precisa entrar na lista de limpeza.
     Sem isto, o próximo `localStorage.setItem('vagaai_algo', cv)` reabre o
     mesmo vazamento sem que nenhum teste perceba. */
  it('nenhuma chave vagaai_* de dado pessoal fica fora da limpeza', () => {
    // Preferências do aparelho — seguem a pessoa que senta no computador, não a conta.
    const DO_APARELHO = new Set([
      'vagaai_theme', 'vagaai-theme', 'vagaai_cookie_consent',
      'vagaai_cv_tpl', 'vagaai_ob_anon_id', 'vagaai_cache_dono',
    ]);

    const encontradas = new Set();
    const arquivos = ['sidebar.js', 'cookie-consent.js', 'onboarding/shared.js', ...PAGINAS];
    for (const f of arquivos) {
      let src;
      try { src = read(f); } catch { continue; }
      for (const m of src.matchAll(/localStorage\.setItem\(\s*['"`](vagaai[_-][a-z0-9_]+)/gi)) {
        encontradas.add(m[1]);
      }
    }

    const fora = [...encontradas].filter(
      (k) => !DO_APARELHO.has(k) && !sessao.includes(`'${k}'`)
    );
    assert.deepEqual(fora, [],
      `chave gravada mas nunca limpa na troca de conta: ${fora.join(', ')}. ` +
      'Adicione a PESSOAIS em js/sessao.js, ou a DO_APARELHO aqui se for preferência do aparelho.');
  });
});

/* Instrumentação que decide se verba de anúncio vira aprendizado. A /obrigado
   é a única página que sabe que houve receita e não tinha GA4 nem tag de
   conversão — disparava só window.va(), que o Google não enxerga. */
describe('Rastreamento de conversão', () => {
  const obrigado = read('obrigado/index.html');
  const consent = read('cookie-consent.js');

  it('a página de pagamento confirmado carrega o GA4', () => {
    assert.match(obrigado, /googletagmanager\.com\/gtag\/js\?id=G-/,
      '/obrigado sem GA4: a conversão não chega ao Google');
    assert.match(obrigado, /gtag\('consent','default'/,
      '/obrigado sem Consent Mode: o padrão negado precisa valer aqui também');
  });

  it('a página de pagamento dispara purchase e tem ponto para a tag do Ads', () => {
    assert.match(obrigado, /gtag\('event',\s*'purchase'/, 'sem evento purchase no GA4');
    assert.match(obrigado, /var ADS_ID\s*=/, 'sem ponto de configuração do Google Ads');
    assert.match(obrigado, /send_to:\s*ADS_ID/, 'ADS_ID declarado mas não usado no envio');
  });

  it('a mesma compra não conta duas vezes ao recarregar', () => {
    assert.match(obrigado, /sessionStorage\.(get|set)Item\(\s*chave/,
      'sem trava de recarga: F5 na /obrigado contaria a venda de novo');
  });

  /* Com ad_storage preso em 'denied' o Ads não observa conversão — cai para
     modelagem, que é justamente o que falha com pouco volume no início. */
  it('aceitar os cookies libera os sinais de publicidade', () => {
    const bloco = consent.match(/gtag\('consent',\s*'update',\s*\{[\s\S]*?\}\)/);
    assert.ok(bloco, 'cookie-consent.js sem consent update');
    for (const sinal of ['ad_storage', 'ad_user_data']) {
      assert.doesNotMatch(bloco[0], new RegExp(`${sinal}:\s*'denied'`),
        `${sinal} fixo em 'denied' mesmo com o "Aceitar" clicado`);
    }
  });

  it('o banner declara a finalidade publicitária do consentimento', () => {
    assert.match(consent, /public|campanh|an[úu]ncio/i,
      'consentimento para ad_* precisa de finalidade informada no texto do banner');
  });
});


/* O teto de alertas por plano vive em DOIS lugares: lib/entitlements.js (o que
   a interface mostra) e public.max_alertas_do_plano() no banco (o que o trigger
   trg_max_active_alerts realmente aplica). A policy de RLS de job_alert_profiles
   e FOR ALL com auth.uid() = user_id, entao o navegador insere direto via
   PostgREST — limite so no cliente nao limita nada. Se os dois numeros
   divergirem, a tela promete um numero e o banco recusa outro. */
describe('Teto de alertas: interface e banco contam a mesma coisa', () => {
  const ents = read('lib/entitlements.js');
  const sql = read('migrations/025_multi_alerta.sql');

  const doJs = (plano) => {
    const bloco = ents.match(new RegExp(`\\b${plano}:\\s*\\{[\\s\\S]*?\\n  \\}`));
    assert.ok(bloco, `plano ${plano} nao encontrado em entitlements`);
    const m = bloco[0].match(/max_active_alerts:\s*(\d+|null)/);
    assert.ok(m, `max_active_alerts ausente no plano ${plano}`);
    return m[1];
  };

  it('free, starter e pro têm o mesmo teto nos dois lados', () => {
    // CASE plan WHEN 'pro' THEN 10 WHEN 'starter' THEN 3 ELSE 1 END
    const caso = sql.match(/CASE v_plan WHEN 'pro' THEN (\d+) WHEN 'starter' THEN (\d+)/);
    assert.ok(caso, 'max_alertas_do_plano nao declara os tetos esperados');
    const noBanco = { pro: caso[1], starter: caso[2], free: '1' };

    for (const plano of ['free', 'starter', 'pro']) {
      assert.equal(doJs(plano), noBanco[plano],
        `${plano}: entitlements diz ${doJs(plano)} e o banco aplica ${noBanco[plano]}`);
    }
  });

  it('nenhum plano promete alertas ilimitados', () => {
    // null = sem teto. Cada alerta consulta 20 fontes e passa por IA, diariamente
    // no Pro: sem teto e custo sem teto num plano de preco fixo.
    assert.doesNotMatch(ents, /max_active_alerts:\s*null/,
      'max_active_alerts: null volta a prometer alerta ilimitado');
  });

  it('o limite é aplicado por trigger, não apenas pelo cliente', () => {
    assert.match(sql, /CREATE TRIGGER trg_max_active_alerts/, 'trigger de limite ausente');
    assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.max_alertas_do_plano/,
      'SECURITY DEFINER em public sem REVOKE fica executavel por qualquer usuario via /rpc');
  });
});


/* Carta e treino eram descartáveis: cover-letter.js e interview.js só geravam e
   devolviam, e o conteúdo morria ao fechar a aba. Dois dos cinco produtos do
   plano pago não deixavam rastro — e era por isso que o painel não tinha número
   honesto para mostrar deles. Migração 026 criou as tabelas; estes testes
   impedem que a gravação seja removida sem que ninguém perceba. */
describe('Carta e treino ficam guardados', () => {
  const carta = read('api/cover-letter.js');
  const entrevistaApi = read('api/interview.js');
  const entrevistaFront = read('entrevista/index.html');
  const sql = read('migrations/026_cartas_e_treinos.sql');

  it('a API da carta grava antes de responder', () => {
    assert.match(carta, /rest\/v1\/cover_letters/, 'cover-letter.js não escreve em cover_letters');
    assert.match(carta, /result\.id = linha\[0\]\.id/, 'a resposta não devolve o id da carta salva');
  });

  it('a API do treino abre a sessão ao gerar as perguntas', () => {
    assert.match(entrevistaApi, /rest\/v1\/interview_sessions/, 'interview.js não abre sessão');
    assert.match(entrevistaApi, /result\.session_id = linha\[0\]\.id/, 'não devolve session_id ao cliente');
  });

  it('o treino é fechado quando a pessoa chega ao resultado', () => {
    assert.match(entrevistaFront, /salvarSessaoTreino\(/, 'nada fecha a sessão no fim do treino');
    assert.match(entrevistaFront, /finished_at:/, 'a sessão nunca recebe finished_at');
  });

  /* Gravar historico nao pode custar o produto: se o insert falhar, a pessoa
     ainda precisa receber a carta e as perguntas que acabou de esperar. */
  it('falha ao gravar não derruba a geração', () => {
    assert.match(carta, /console\.warn\('cover_letters insert falhou:/,
      'cover-letter.js: gravação sem tratamento de falha derruba a resposta');
    assert.match(carta, /console\.warn\('cover_letters insert erro:/,
      'cover-letter.js: gravação fora de try/catch');
    assert.match(entrevistaApi, /console\.warn\('interview_sessions insert falhou:/,
      'interview.js: gravação sem tratamento de falha derruba a resposta');
    assert.match(entrevistaApi, /console\.warn\('interview_sessions insert erro:/,
      'interview.js: gravação fora de try/catch');
  });

  it('as duas tabelas nascem com RLS de dono', () => {
    for (const t of ['cover_letters', 'interview_sessions']) {
      assert.match(sql, new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY`),
        `${t} sem RLS: qualquer conta leria as cartas e treinos das outras`);
      assert.match(sql, new RegExp(`CREATE POLICY ${t}_owner`), `${t} sem policy de dono`);
    }
    // FOR ALL com auth.uid() = user_id nos dois sentidos (leitura e escrita).
    const donos = sql.match(/USING \(\(SELECT auth\.uid\(\)\) = user_id\)/g) || [];
    assert.equal(donos.length, 2, 'esperava USING por dono nas duas tabelas');
  });
});


/* extractJobPreview alimenta a previa na tela e, desde que as cartas passaram a
   ser salvas, tambem o nome com que a carta entra no historico. A empresa so
   era lida da URL — quem COLA a vaga ficava sempre sem empresa. Estes casos sao
   os formatos que as pessoas realmente colam. */
describe('Leitura de cargo e empresa da vaga colada', () => {
  const src = read('carta/index.html');
  const corpo = src.match(/function extractJobPreview\(text, url\) \{[\s\S]*?\n\}/);
  assert.ok(corpo, 'extractJobPreview nao encontrada em carta/index.html');
  const ctx = { URL };
  vm.createContext(ctx);
  vm.runInContext(corpo[0] + '\nglobalThis.__parse = extractJobPreview;', ctx);
  const parse = (t) => ctx.__parse(t, '');

  it('LinkedIn: cargo, empresa e local em linhas seguidas', () => {
    const r = parse('Gerente de Marketing\nPRIMIZIE\nSão Paulo, SP · Híbrido\n\nSobre a vaga\nBuscamos alguém com experiência em Growth.');
    assert.equal(r.cargo, 'Gerente de Marketing');
    assert.equal(r.empresa, 'PRIMIZIE');
  });

  it('Gupy: empresa antes do bloco de requisitos', () => {
    const r = parse('Analista de Dados Pleno\nGrupo Boticário\nRemoto\n\nRequisitos\n- SQL avançado\n- Python');
    assert.equal(r.cargo, 'Analista de Dados Pleno');
    assert.equal(r.empresa, 'Grupo Boticário');
  });

  it('não confunde cidade com empresa', () => {
    const r = parse('Desenvolvedor Backend\nBelo Horizonte, MG\nCLT\n\nAtividades\nManter APIs REST.');
    assert.notEqual(r.empresa, 'Belo Horizonte, MG');
  });

  it('não confunde título de seção com empresa', () => {
    const r = parse('Coordenador Comercial\nSobre a vaga\nProcuramos um profissional para liderar o time de vendas da região sul.');
    assert.notEqual(r.empresa, 'Sobre a vaga');
  });

  it('não inventa empresa quando a vaga vem num parágrafo só', () => {
    const r = parse('Vaga: Gerente de Marketing na PRIMIZIE. Buscamos profissional com experiência em Growth Marketing e gestão de campanhas pagas.');
    // Uma linha só: nao ha linha seguinte de onde tirar a empresa. Vazio e a
    // resposta certa — melhor sem nome que com nome errado.
    assert.equal(r.empresa, '');
  });
});
