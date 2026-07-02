// /api/send-alerts.js
// Cron job: busca vagas (múltiplas fontes), calcula compatibilidade, envia emails
// Roda 1x/dia às 11:00 UTC (08:00 BRT) via vercel.json cron; cada perfil é enviado
// conforme sua frequência (diário/semanal/quinzenal) quando next_run_at vence.
// Também pode ser chamado manualmente com ?test=1

import crypto from 'crypto';
import { resolvePlan, planEntitlements, coerceFrequency } from '../lib/entitlements.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY;       // jooble.org/api
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;         // developer.adzuna.com
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;       // developer.adzuna.com
const SERPAPI_KEY = process.env.SERPAPI_KEY;             // serpapi.com
const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY;     // rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
const CRON_SECRET = process.env.CRON_SECRET;
// UNSUBSCRIBE_SECRET é separado do CRON_SECRET para isolamento de comprometimento
const UNSUBSCRIBE_SECRET = process.env.UNSUBSCRIBE_SECRET;

// Hash de identidade da vaga: título + empresa normalizados (sem localização).
// Localização varia entre fontes ("São Paulo, SP" vs "São Paulo, Estado de São Paulo")
// e quebrava o dedup, reenviando a mesma vaga. O 3º argumento é aceito por
// compatibilidade com os call-sites antigos, mas ignorado de propósito.
function jobHash(title, company, _location) {
  const norm = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
  return crypto.createHash('md5')
    .update(norm(title) + '|' + norm(company))
    .digest('hex').slice(0, 16);
}

// makeUnsubToken: gera token com timestamp explícito de expiração (30 dias)
// Formato: base64url(userId:expiresAtMs):hmac
// Retorna null se UNSUBSCRIBE_SECRET não estiver configurado —
// o chamador deve interromper o envio em vez de inserir um token inválido.
function makeUnsubToken(userId) {
  if (!UNSUBSCRIBE_SECRET) {
    return null;
  }
  const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
  const payload = Buffer.from(userId + ':' + expiresAt).toString('base64url');
  const sig = crypto.createHmac('sha256', UNSUBSCRIBE_SECRET)
    .update(payload)
    .digest('hex');
  return payload + '.' + sig;
}

// Fontes brasileiras — ganham boost de prioridade no score
const BR_SOURCES = new Set([
  'gupy', 'google', 'greenhouse', 'lever',
  'trampos', 'sine', 'empregos_com_br', 'jobbol',
]);

// Regex de palavras comuns em PT-BR para detectar idioma
const PT_BR_PATTERN = /\b(vaga|empresa|cargo|área|experiência|conhecimento|gestão|análise|desenvolvimento|requisitos|benefícios|você|para|com|são|ção|ões|remuneração|contratação|oportunidade|atuação|salário|remoto|híbrido|presencial)\b/i;

// Marketplaces de freela/bico — publicam pedidos de orçamento, não vagas de emprego.
const GIG_MARKETPLACES = /\b(cronoshare|getninjas|get ninjas|workana|99freelas|99 freelas|freelancer\.com|fiverr|upwork)\b/i;

// Marcadores de idiomas estrangeiros NÃO-PT/NÃO-EN (alemão, francês, holandês, espanhol).
// Vagas com esses sinais são ruído para um alerta brasileiro (ex.: "Produktmanager (m/w/d) Berlin").
// Inglês é mantido de propósito — vagas remotas internacionais em EN são relevantes.
const FOREIGN_LANG_MARKERS = /(\bm\/w\/d\b|\bw\/m\/d\b|\bwir\b|\bsuchen\b|\bmitarbeiter|\bkenntnisse\b|\berfahrung\b|\baufgaben\b|\bunternehmen\b|\bgehalt\b|\bbewerbung\b|\bstelle\b|\bnous\b|\brecherchons\b|\bentreprise\b|\bposte\b|\bsociété\b|\bwij\b|\bzoeken\b|\bmedewerker|\bbuscamos\b|\bempresa busca\b|[äöüßÄÖÜ])/i;

// Vaga claramente em idioma estrangeiro (não-PT, não-EN) → irrelevante p/ alerta BR.
function looksForeignLang(job) {
  const text = ((job.title || '') + ' ' + (job.snippet || job.description || ''));
  if (PT_BR_PATTERN.test(text)) return false;        // tem sinal de português → mantém
  return FOREIGN_LANG_MARKERS.test(text);            // sinal forte de outro idioma → exclui
}

// ── RELEVÂNCIA DE CARGO ──────────────────────────────────────────────────────
// Normaliza texto: minúsculas, sem acentos.
function _norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Grupos de sinônimos por domínio de cargo (valores sem acento).
// Se o cargo do usuário contém uma palavra de um grupo, todo o grupo vira sinal válido.
const CARGO_SYNONYM_GROUPS = [
  ['marketing','growth','branding','conteudo','midia','performance','seo','sem','ads','publicidade','comunicacao','crm','inbound','social','trafego'],
  ['produto','product','pm','po'],
  ['projetos','project','scrum','agile','pmo'],
  ['vendas','sales','comercial','account','sdr','closer','hunter','prevendas','farmer','representante'],
  ['dados','data','analytics','bi','cientista','estatistica'],
  ['design','designer','ux','ui'],
  ['desenvolvedor','developer','engenheiro','engineer','programador','dev','software','fullstack','frontend','backend','mobile'],
  ['rh','recrutamento','recruiter','people','talent','gente'],
  ['financeiro','finance','contabil','controladoria','tesouraria','fpa','fiscal'],
  ['suporte','support','atendimento','customer','sucesso','success','cs'],
  ['juridico','legal','advogado','compliance'],
  ['logistica','supply','operacoes','operations','pcp'],
  ['enfermagem','enfermeiro','tecnico de enfermagem','saude'],
];

// Palavras genéricas de função/senioridade que NÃO devem ancorar o match (são ruído).
const ROLE_STOPWORDS = new Set([
  'gerente','coordenador','coordenadora','analista','assistente','auxiliar','especialista',
  'diretor','diretora','head','lead','supervisor','supervisora','consultor','consultora',
  'tecnico','operador','operadora','estagiario','trainee','vaga','para','com','de','da','do',
  'das','dos','em','e','jr','sr','junior','pleno','senior','profissional','i','ii','iii',
]);

// Tokens que o título da vaga precisa conter para ser considerada relevante ao cargo.
function cargoGateTokens(profile) {
  const cargo = _norm(profile.cargo_desejado);
  let words = cargo.split(/\s+/).map(w => w.trim()).filter(w => w.length > 2 && !ROLE_STOPWORDS.has(w));
  // Cargo era só palavra-função (ex.: "Analista") → usa as palavras cruas para não over-filtrar
  if (!words.length) words = cargo.split(/\s+/).filter(w => w.length > 2);
  const kw = (Array.isArray(profile.keywords) ? profile.keywords : [])
    .map(_norm).filter(w => w && w.length > 2);
  const tokens = new Set();
  for (const w of [...words, ...kw]) {
    tokens.add(w);
    for (const g of CARGO_SYNONYM_GROUPS) { if (g.includes(w)) g.forEach(x => tokens.add(x)); }
  }
  return tokens;
}

// Gate: o TÍTULO da vaga precisa conter ao menos um token de cargo/sinônimo,
// casando por limite de palavra (evita "bi" casar dentro de "bibliotecário").
// Se não há cargo configurado (tokens vazio), não filtra.
function jobMatchesCargo(job, tokens) {
  if (!tokens || !tokens.size) return true;
  const title = ' ' + _norm(job.title).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  for (const t of tokens) {
    if (!t || t.length < 2) continue;
    if (title.includes(' ' + t + ' ')) return true;            // palavra isolada
    if (t.length >= 5 && title.includes(t)) return true;       // raiz longa (ex.: "market" em "marketing")
  }
  return false;
}

// ── SENIORIDADE ──────────────────────────────────────────────────────────────
// Compara o nível-alvo do usuário com o nível inferido do título da vaga.
// Mismatch grande (analista júnior recebendo vaga de diretor, ou um sênior
// recebendo estágio) é ruído. Escala: estágio=0, júnior=1, pleno=2, sênior=3,
// gestão=4, executivo=5.
function userLevelRank(profile) {
  const n = _norm(profile && profile.nivel);
  if (!n || n === 'qualquer') return null;          // sem preferência → não restringe
  if (/estag/.test(n)) return 0;
  if (/junior|\bjr\b|trainee|aprendiz/.test(n)) return 1;
  if (/pleno|\bmid\b|\bpl\b/.test(n)) return 2;
  if (/senior|\bsr\b/.test(n)) return 3;
  if (/coorden|gerent|gestao|\blead\b|\bhead\b|supervis/.test(n)) return 4;
  if (/diretor|\bvp\b|chief|executiv|c-level/.test(n)) return 5;
  return null;
}

function jobLevelRank(job) {
  const t = ' ' + _norm(job && job.title).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
  // Do mais sênior ao menos sênior — primeira correspondência vence.
  if (/\b(diretor|director|vp|chief|ceo|cfo|cto|cmo|coo|head|presidente)\b/.test(t)) return 5;
  if (/\b(gerente|gerencia|manager|coordenador|coordenacao|supervisor|lider|lead|principal|staff)\b/.test(t)) return 4;
  if (/\b(senior|sr|especialista|expert)\b/.test(t)) return 3;
  if (/\b(pleno|mid|pl)\b/.test(t)) return 2;
  if (/\b(junior|jr|trainee|entry)\b/.test(t)) return 1;
  if (/\b(estagio|estagiario|intern|aprendiz)\b/.test(t)) return 0;
  return null;   // título sem marcador de nível → neutro (não penaliza)
}

// ── ENRIQUECIMENTO DE BUSCA (keywords + sinônimos) ───────────────────────────
// Principal keyword do perfil — usada para enriquecer as queries das fontes.
function primaryKeyword(profile) {
  const kws = Array.isArray(profile && profile.keywords) ? profile.keywords : [];
  return (kws.map(x => String(x).trim()).filter(Boolean)[0] || '');
}

// Gera uma variante de query trocando uma palavra do cargo por um sinônimo do
// mesmo grupo de domínio (ex.: "desenvolvedor" → "developer"). Amplia cobertura
// sem mudar a intenção. Retorna '' quando não há sinônimo aplicável.
function cargoSynonymQuery(cargo) {
  const raw = String(cargo || '');
  const words = _norm(raw).split(/\s+/).filter(w => w.length > 2 && !ROLE_STOPWORDS.has(w));
  for (const w of words) {
    for (const g of CARGO_SYNONYM_GROUPS) {
      if (g.includes(w)) {
        const alt = g.find(x => x !== w && x.length > 3);
        if (alt) return _norm(raw).replace(w, alt).replace(/\s+/g, ' ').trim();
      }
    }
  }
  return '';
}

// Variantes de busca em ordem de prioridade: cargo exato, cargo+keyword,
// cargo amplo (sem senioridade) e sinônimo de domínio. As fontes com loop de
// tentativas (Adzuna/JSearch) param assim que juntam vagas suficientes, então
// as variantes extras só rodam quando realmente necessárias (sem custo à toa).
function cargoQueryVariants(profile) {
  const exact = String(profile.cargo_desejado || '').trim();
  const kw = primaryKeyword(profile);
  const broad = broadenJobTitle(exact);
  const syn = cargoSynonymQuery(exact);
  const variants = [];
  if (exact) variants.push(exact);
  if (exact && kw) variants.push(`${exact} ${kw}`);
  if (broad && broad !== exact.toLowerCase()) variants.push(broad);
  if (syn && syn !== exact.toLowerCase()) variants.push(syn);
  return [...new Set(variants.filter(Boolean))];
}

// ── RECÊNCIA ─────────────────────────────────────────────────────────────────
// Normaliza qualquer formato de data de publicação para epoch ms (ou null).
// Aceita ISO string, epoch em segundos e epoch em ms.
function _postedAtMs(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'number') return val < 1e12 ? val * 1000 : val; // segundos → ms
  const t = Date.parse(val);
  return Number.isNaN(t) ? null : t;
}

// Bônus de recência: vaga recém-publicada é mais valiosa (ainda aceita candidatos).
function recencyBonus(job) {
  const ms = _postedAtMs(job && job._posted_at);
  if (!ms) return 0;                       // sem data → neutro
  const days = (Date.now() - ms) / 86400000;
  if (days < 0) return 0;
  if (days <= 3) return 14;
  if (days <= 7) return 10;
  if (days <= 14) return 6;
  if (days <= 30) return 2;
  return -4;                               // mais de 30 dias → leve penalização
}

// ── RE-RANKING POR IA (Claude Haiku) — apenas planos pagos ───────────────────
// Extrai o array JSON [{i, score}] da resposta do modelo de forma robusta.
// Pura e testável; retorna null se não conseguir parsear.
function parseAiScores(text) {
  if (!text) return null;
  const m = String(text).match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return null;
    const out = arr
      .filter(o => o && typeof o.i === 'number' && typeof o.score === 'number')
      .map(o => ({ i: o.i, score: Math.max(0, Math.min(100, Math.round(o.score))) }));
    return out.length ? out : null;
  } catch { return null; }
}

// Detecta se o usuário quer vagas remotas — considera cidade E formato.
// As fontes 100% remotas (Remotive, RemoteOk, Arbeitnow) usam isto para decidir
// se rodam. Bug histórico: gatear só por `cidade` desligava as fontes remotas
// para quem preenchia a cidade mas marcava formato "Remoto" — justamente o caso
// de quem mais precisa delas.
function wantsRemote(profile) {
  const cidade = (profile.cidade || '').toLowerCase();
  if (!profile.cidade || cidade.includes('remoto') || cidade.includes('remote') || cidade.includes('home office')) {
    return true;
  }
  let formatos = [];
  if (Array.isArray(profile.formato)) formatos = profile.formato;
  else if (typeof profile.formato === 'string') formatos = profile.formato.split(',');
  return formatos.some(f => {
    const v = String(f).toLowerCase().trim();
    return v.startsWith('remoto') || v.includes('remote') || v.includes('home office');
  });
}

// Aplica filtros de preferências estendidas ao array de vagas
// Retorna array re-ordenado por _score após aplicação de bônus
function applyExtendedFilters(jobs, profile, options = {}) {
  const relaxPreferences = options.relaxPreferences === true;
  // filtros_negativos é JSONB — pode chegar como objeto ou string, tratar ambos
  let filtrosNeg = profile.filtros_negativos || {};
  if (typeof filtrosNeg === 'string') {
    try { filtrosNeg = JSON.parse(filtrosNeg); } catch { filtrosNeg = {}; }
  }
  const negPalavras = Array.isArray(filtrosNeg.neg_palavras) ? filtrosNeg.neg_palavras.map(w => String(w).toLowerCase()) : [];
  const filtrosNegList = Array.isArray(filtrosNeg.filtros_neg) ? filtrosNeg.filtros_neg.map(w => String(w).toLowerCase()) : [];
  const allNeg = [...negPalavras, ...filtrosNegList];

  const empresasInteresse = Array.isArray(profile.empresas_interesse) ? profile.empresas_interesse.map(e => String(e).toLowerCase()) : [];
  const setoresPref = Array.isArray(profile.setores_preferidos) ? profile.setores_preferidos.map(s => String(s).toLowerCase()) : [];

  // formato pode ser TEXT[] (array) ou TEXT (string separada por vírgula) — normaliza para array
  let formatos = [];
  if (Array.isArray(profile.formato)) {
    formatos = profile.formato.map(f => String(f).toLowerCase().trim()).filter(Boolean);
  } else if (typeof profile.formato === 'string' && profile.formato.trim()) {
    formatos = profile.formato.split(',').map(f => f.toLowerCase().trim()).filter(Boolean);
  }
  // Remove 'qualquer' do array — não filtra
  formatos = formatos.filter(f => f !== 'qualquer' && f !== 'qualquer um');

  const fmtMap = {
    remoto: ['remoto', 'remote', 'home office', 'home-office'],
    presencial: ['presencial', 'on-site', 'on site'],
    híbrido: ['híbrido', 'hibrido', 'hybrid'],
    hibrido: ['híbrido', 'hibrido', 'hybrid'],
  };

  // Normaliza contrato_tipos: suporta acentos, caixa e sinônimos
  const contratosRaw = Array.isArray(profile.contrato_tipos)
    ? profile.contrato_tipos
    : (typeof profile.contrato_tipos === 'string' && profile.contrato_tipos.trim()
        ? profile.contrato_tipos.split(',')
        : []);
  const contratos = contratosRaw
    .map(c => String(c).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim())
    .filter(c => c && c !== 'qualquer' && c !== 'qualquer um');

  // Mapa de sinônimos e variações de tipo de contrato
  const contratoMap = {
    clt:       ['clt', 'clt (efetivo)', 'efetivo', 'contrato clt', 'regime clt'],
    pj:        ['pj', 'pessoa juridica', 'pessoa jurídica', 'contrato pj', 'regime pj'],
    freela:    ['freela', 'freelance', 'freelancer', 'autonomo', 'autônomo', 'free-lance'],
    estagio:   ['estagio', 'estágio', 'estagiario', 'estagiário', 'intern', 'internship'],
    temporario:['temporario', 'temporário', 'contrato temporario', 'trabalho temporario', 'temp'],
  };

  // Tokens de cargo para o gate de relevância (calculado uma vez, fora do loop).
  const cargoTokens = cargoGateTokens(profile);

  // Cargo genérico de 1 palavra ("Marketing") deixa o gate fraco — tudo passa,
  // de "Auxiliar" a "Estagiário". Quando o perfil tem keywords ricas (3+),
  // exige ao menos uma no título/descrição (só no estrito; o relaxado preserva volume).
  const _cargoWordCount = _norm(profile.cargo_desejado || '')
    .split(/\s+/).filter(w => w.length > 2 && !ROLE_STOPWORDS.has(w)).length;
  const _profileKws = (Array.isArray(profile.keywords) ? profile.keywords : [])
    .map(k => _norm(String(k))).filter(k => k.length > 2);
  const _requireKw = _cargoWordCount <= 1 && _profileKws.length >= 3;

  const filtered = jobs.filter(job => {
    const title = (job.title || '').toLowerCase();
    const desc = (job.snippet || job.description || '').toLowerCase();
    const company = (job.company || '').toLowerCase();
    const combined = title + ' ' + desc + ' ' + company;
    const combinedNorm = combined.normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Exclui vagas com palavras/filtros negativos
    if (allNeg.length && allNeg.some(neg => combinedNorm.includes(neg))) return false;

    // GATE DE CARGO: o título precisa ter relação real com o cargo desejado.
    // Vale nos DOIS passes (estrito e relaxado) — relevância de cargo não é "preferência".
    // É o que impede "Auxiliar de Account Payable" / "Data Analyst" num alerta de Marketing.
    if (!jobMatchesCargo(job, cargoTokens)) return false;

    // Gate complementar para cargo de 1 palavra: exige uma keyword do perfil
    if (!relaxPreferences && _requireKw && !_profileKws.some(k => combinedNorm.includes(k))) return false;

    // Exclui dados ruins: empresa com CPF/CNPJ ou placeholder genérico
    const companyRaw = (job.company || '').trim();
    if (/^\d[\d.\-\/]+\d$/.test(companyRaw)) return false; // CPF/CNPJ como nome
    if (/^(empresa|company|empregador|n\/a|confidencial)$/i.test(companyRaw) && !job.title) return false;

    // Exclui marketplaces de freela/bico — são pedidos de orçamento, não vagas.
    // Evidência de produção: "Consultor de Marketing para melhorar o seo" (Cronoshare).
    if (GIG_MARKETPLACES.test(companyRaw) || GIG_MARKETPLACES.test(String(job.link || job.url || ''))) return false;

    // Sinal brasileiro da vaga (fonte BR, texto PT-BR ou localização BR)
    const _brText = title + ' ' + desc + ' ' + (job.location || '');
    const _hasBr = BR_SOURCES.has(job._source) || PT_BR_PATTERN.test(_brText) ||
      /\b(brasil|brazil|são paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|fortaleza|salvador|recife|sp|rj|mg|rs|pr|ba|ce|pe|am|go|sc)\b/i.test(_brText);

    // Exclui vagas claramente internacionais — só quando NÃO há sinal brasileiro
    // (evita cortar vaga BR legítima que cita "LATAM: Brasil, México, Colômbia").
    const INTL_MARKERS = /\b(canada|united states|australia|united kingdom|germany|france|netherlands|ireland|new zealand|singapore|remote us|remote uk|remote canada)\b/i;
    if (!_hasBr && (INTL_MARKERS.test(title) || INTL_MARKERS.test(job.location || ''))) return false;

    // Exclui vagas claramente em idioma estrangeiro (não-PT/não-EN) — ruído p/ alerta BR.
    if (looksForeignLang(job)) return false;

    // Exclui vagas com salário em USD e zero sinal brasileiro — mercado externo irrelevante.
    const _sal = String(job.salary || '');
    const _hasUsd = /\$|usd/i.test(_sal) && !/r\$|brl/i.test(_sal);
    if (_hasUsd && !_hasBr) return false;

    // Exclui vagas de estágio/júnior quando o usuário é pleno ou sênior
    const nivelPerfil = (profile.nivel || '').toLowerCase();
    if (nivelPerfil === 'pleno' || nivelPerfil === 'senior' || nivelPerfil === 'sênior') {
      if (/\b(estágio|estagio|estagiário|estagiario|trainee|jovem aprendiz|aprendiz|junior|júnior)\b/i.test(title)) return false;
    }

    // Estágio nunca paga R$4k+: com salário mínimo definido nesse patamar, corta
    // estágio/aprendiz/trainee mesmo com nível "qualquer" (o default do perfil).
    // Evidência de produção: "Estagiário De Marketing" enviado a perfil com piso de R$6.000.
    const _salFloor = parseInt(profile.salario_min) || 0;
    if (_salFloor >= 4000 && /\b(est[áa]gio|estagi[áa]ri[oa]|jovem aprendiz|aprendiz|trainee)\b/i.test(title)) return false;

    // Senioridade bidirecional: descarta vagas 3+ níveis distantes do alvo (só estrito).
    // Pega o caso oposto ao filtro acima: júnior/pleno recebendo diretoria/C-level.
    // Mantém a vaga quando o nível não pôde ser inferido do título (neutro).
    if (!relaxPreferences) {
      const _uRank = userLevelRank(profile);
      const _jRank = jobLevelRank(job);
      if (_uRank !== null && _jRank !== null && Math.abs(_jRank - _uRank) >= 3) return false;
    }

    // Piso salarial: se a vaga informa salário em R$ abaixo de 70% do mínimo, descarta
    // (só estrito). Dispara apenas com salário explícito em BRL — a maioria das vagas
    // não informa, então não reduz volume injustamente. Usa o TETO da faixa para não
    // cortar uma faixa ampla legítima (ex.: "R$ 5k–12k" para quem pediu R$ 8k).
    if (!relaxPreferences && profile.salario_min) {
      const floor = parseInt(profile.salario_min);
      const salStr = String(job.salary || '');
      if (floor > 0 && /r\$|brl/i.test(salStr)) {
        const nums = (salStr.replace(/\./g, '').match(/\d{4,}/g) || []).map(Number);
        if (nums.length) {
          const topo = Math.max(...nums);
          if (topo > 0 && topo < floor * 0.7) return false;
        }
      }
    }

    // Score mínimo: evita vagas completamente fora do perfil (só no passe estrito)
    if (!relaxPreferences && (job._score || 0) < 20) return false;

    // Filtra por formato(s) preferido(s)
    if (formatos.length > 0) {
      const wantsOnlyRemote = formatos.length === 1 && (formatos[0] === 'remoto' || formatos[0] === 'remote');
      const mentionsAnyMode = /remoto|remote|home.?office|h[ií]brido|presencial|hybrid|on.?site/i.test(combined);

      if (mentionsAnyMode) {
        // Vaga que DECLARA modalidade incompatível nunca entra — nem no passe
        // relaxado. Evidência de produção: "Presencial LONDRINA/PR" enviada a
        // quem pediu Remoto+SP via fallback relaxado → dispensada pelo usuário.
        const matches = formatos.some(fmt => {
          const tokens = fmtMap[fmt] || [fmt];
          return tokens.some(t => combined.includes(t));
        });
        if (!matches) return false;
      } else if (!relaxPreferences && wantsOnlyRemote) {
        // Heurística (só no estrito): usuário quer só remoto e a vaga não declara
        // formato — se a localização parece cidade física, exclui
        const loc = (job.location || '').toLowerCase();
        const locSeemsPhysical = loc.length > 3
          && !/remoto|remote|home.?office|brasil|brazil|worldwide|anywhere/i.test(loc);
        if (locSeemsPhysical) return false;
      }
    }

    // Filtra por tipo de contrato — só quando a vaga menciona contrato explicitamente
    if (!relaxPreferences && contratos.length > 0) {
      const mentionsContract = /\b(clt|pj|freela|freelance|estagio|estágio|temporario|temporário|contrato|regime|efetivo|autonomo|autônomo)\b/i.test(combinedNorm);
      if (mentionsContract) {
        const matches = contratos.some(ct => {
          const tokens = contratoMap[ct] || [ct];
          return tokens.some(t => combinedNorm.includes(t));
        });
        if (!matches) return false;
      }
      // Se a vaga não menciona tipo de contrato, não exclui
    }

    return true;
  });

  // Aplica bônus e re-ordena por _score descrescente
  return filtered
    .map(job => {
      let bonus = 0;
      const title = (job.title || '').toLowerCase();
      const desc = (job.snippet || job.description || '').toLowerCase();
      const company = (job.company || '').toLowerCase();

      if (empresasInteresse.length && empresasInteresse.some(e => company.includes(e) || title.includes(e))) bonus += 25;
      if (setoresPref.length && setoresPref.some(s => title.includes(s) || desc.includes(s))) bonus += 10;

      return { ...job, _score: Math.min(100, (job._score || 0) + bonus) };
    })
    .sort((a, b) => b._score - a._score);
}

// Calcula score de compatibilidade estimado (sem IA)
function calcScore(job, profile) {
  let score = 0;
  const title = (job.title || '').toLowerCase();
  const desc = (job.snippet || job.description || '').toLowerCase();
  const cargo = (profile.cargo_desejado || '').toLowerCase();
  const nivel = (profile.nivel || '').toLowerCase();
  const keywords = profile.keywords || [];

  // Cargo no título
  const cargoWords = cargo.split(/\s+/).filter(w => w.length > 3);
  cargoWords.forEach(w => { if (title.includes(w)) score += 15; });

  // Aderência forte: cargo completo (sem conectivos) presente no título.
  // "Analista de Marketing" cheio no título vale mais que só "marketing" solto.
  const cargoCore = cargo.replace(/\b(de|da|do|para|com|e|em)\b/g, ' ').replace(/\s+/g, ' ').trim();
  if (cargoCore.length > 4 && title.includes(cargoCore)) score += 18;

  // Keywords no título ou descrição
  keywords.forEach(kw => {
    const k = kw.toLowerCase();
    if (title.includes(k)) score += 15;
    else if (desc.includes(k)) score += 8;
  });

  // Nível: bônus por aderência, penalidade graduada por distância de senioridade.
  // Antes só somava +20 no match exato e ignorava mismatches — um júnior recebia
  // vaga de diretor sem qualquer penalização.
  const uRank = userLevelRank(profile);
  const jRank = jobLevelRank(job);
  if (uRank !== null && jRank !== null) {
    const dist = Math.abs(jRank - uRank);
    if (dist === 0) score += 22;
    else if (dist === 1) score += 6;
    else if (dist === 2) score -= 12;
    else score -= 30;            // 3+ níveis de distância → quase certamente ruído
  }

  // Salário (se disponível)
  if (profile.salario_min && job.salary) {
    const salNum = parseInt(String(job.salary).replace(/\D/g, ''));
    if (salNum >= profile.salario_min) score += 10;
  }

  // ── Sinais de mercado brasileiro ─────────────────────────────────────────
  const loc = (job.location || '').toLowerCase();
  const isPtBr = PT_BR_PATTERN.test(title) || PT_BR_PATTERN.test(desc);
  const isBrSource = BR_SOURCES.has(job._source);

  // Fonte BR ou conteúdo em PT: forte sinal de relevância local
  if (isBrSource) score += 20;
  if (isPtBr) score += 20;

  // Localização explicitamente brasileira: cidade, estado ou país
  const BR_LOC = /\b(brasil|brazil|são paulo|rio de janeiro|belo horizonte|curitiba|porto alegre|fortaleza|salvador|recife|manaus|belém|goiânia|brasília|florianópolis|campinas|sp|rj|mg|rs|pr|ba|ce|pe|am|go|sc)\b/i;
  if (BR_LOC.test(loc) || BR_LOC.test(desc) || BR_LOC.test(title)) score += 15;

  // Proximidade: para quem NÃO quer remoto, vaga na própria cidade é mais relevante
  // que outra a milhares de km. Antes toda vaga BR pontuava igual no eixo localização.
  if (profile.cidade && !wantsRemote(profile)) {
    const cidadeNorm = _norm(profile.cidade).replace(/[^a-z0-9]+/g, ' ').trim();
    if (cidadeNorm.length > 2 && _norm(loc).includes(cidadeNorm)) score += 14;
  }

  // Penalidade: salário em dólar sem nenhum sinal BR → vaga claramente de mercado externo
  const sal = String(job.salary || '');
  const hasUsdSalary = /\$|USD/.test(sal) && !/R\$|BRL/.test(sal);
  const hasBrSignal = isBrSource || isPtBr || BR_LOC.test(loc) || BR_LOC.test(desc) || BR_LOC.test(title);
  if (hasUsdSalary && !hasBrSignal) score -= 35;

  // Recência: vagas recém-publicadas valem mais (quando a fonte informa a data)
  score += recencyBonus(job);

  return Math.min(100, Math.max(0, score));
}

function starsFromScore(score) {
  if (score >= 60) return '★★★★☆';
  if (score >= 40) return '★★★☆☆';
  return '★★☆☆☆';
}

function compatLabel(score) {
  if (score >= 60) return 'Alta compatibilidade estimada';
  if (score >= 40) return 'Média compatibilidade estimada';
  return 'Compatibilidade básica';
}

// Normaliza texto removendo acentos e mapeando PT → EN
function normalizeForJooble(text) {
  const ptToEn = {
    'desenvolvedor': 'developer', 'desenvolvedor front-end': 'frontend developer',
    'desenvolvedor backend': 'backend developer', 'desenvolvedor fullstack': 'fullstack developer',
    'engenheiro de software': 'software engineer', 'analista de dados': 'data analyst',
    'cientista de dados': 'data scientist', 'designer': 'designer', 'ux designer': 'ux designer',
    'product manager': 'product manager', 'gerente de produto': 'product manager',
    'analista de marketing': 'marketing analyst', 'marketing': 'marketing',
    'recursos humanos': 'human resources', 'financeiro': 'finance', 'contabilidade': 'accounting',
    'suporte': 'support', 'vendas': 'sales', 'comercial': 'sales',
  };
  const lower = text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  return ptToEn[lower] || lower;
}

function normalizeLocation(cidade) {
  if (!cidade || cidade.toLowerCase().includes('remoto') || cidade.toLowerCase().includes('remote')) return 'Brazil';
  return cidade.normalize('NFD').replace(/[̀-ͯ]/g, '').replace('Sao Paulo', 'Sao Paulo').trim() + ', Brazil';
}

function broadenJobTitle(title) {
  const normalized = String(title || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\b(head|gerente|coordenador|coordenadora|especialista|analista|assistente|diretor|diretora|senior|sênior|pleno|junior|júnior|jr|sr|lead)\b/g, ' ')
    .replace(/\b(de|da|do|das|dos|em|para)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || String(title || '').trim();
}

function uniqueJobs(jobs) {
  return deduplicateJobs((jobs || []).filter(job => job && (job.title || job.position)));
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

// Parse RSS/XML simples sem dependências externas
function parseRSSItems(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const raw = m[1];
    const getTag = (tag) => {
      const r = new RegExp(`<${tag}(?:[^>]*)>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, 'i');
      return (r.exec(raw) || [])[1]?.trim() || '';
    };
    const title   = getTag('title');
    const link    = getTag('link') || getTag('guid');
    const desc    = getTag('description').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
    const company = getTag('source') || getTag('author') || '';
    if (title) items.push({ title, link, description: desc, company });
  }
  return items;
}

// Extrai company + title de strings "Título - Empresa" (padrão Indeed)
function splitTitleCompany(raw) {
  const parts = raw.split(/\s[-–—]\s/);
  if (parts.length >= 2) return { title: parts.slice(0, -1).join(' - '), company: parts[parts.length - 1] };
  return { title: raw, company: '' };
}

// Mapa de cargos PT → categorias Remotive
const REMOTIVE_CATEGORY_MAP = {
  'marketing': 'marketing', 'growth': 'marketing', 'seo': 'marketing', 'ads': 'marketing',
  'design': 'design', 'ux': 'design', 'ui': 'design',
  'developer': 'software-dev', 'desenvolvedor': 'software-dev', 'engenheiro': 'software-dev',
  'frontend': 'software-dev', 'backend': 'software-dev', 'fullstack': 'software-dev',
  'dados': 'data', 'data': 'data', 'analytics': 'data',
  'vendas': 'sales', 'sales': 'sales', 'comercial': 'sales',
  'rh': 'hr', 'recrutamento': 'hr', 'pessoas': 'hr',
  'produto': 'product', 'product': 'product',
  'customer': 'customer-support', 'suporte': 'customer-support',
  'finance': 'finance', 'financeiro': 'finance', 'contab': 'finance',
};
function remotiveCategory(cargo) {
  const lower = (cargo || '').toLowerCase();
  for (const [k, v] of Object.entries(REMOTIVE_CATEGORY_MAP)) {
    if (lower.includes(k)) return v;
  }
  return null;
}

// ── FONTE 1: JOOBLE ───────────────────────────────────────────────────────────

// Busca vagas na Jooble API
async function fetchJoobleJobs(profile) {
  if (!JOOBLE_API_KEY) {
    console.log('fetchJoobleJobs: JOOBLE_API_KEY not configured, skipping source');
    return [];
  }

  const cargoEn = normalizeForJooble(profile.cargo_desejado || '');
  const kwEn = (profile.keywords || []).slice(0, 3).map(k => normalizeForJooble(k)).join(' ');
  const keywords = [cargoEn, kwEn].filter(Boolean).join(' ').trim();
  const location = normalizeLocation(profile.cidade);

  // Tenta busca principal, depois busca ampla se sem resultado
  async function doFetch(kw, loc) {
    const body = JSON.stringify({ keywords: kw, location: loc, page: 1, resultsOnPage: 20 });
    const res = await fetch(`https://jooble.org/api/${JOOBLE_API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`Jooble ${res.status}`);
    const data = await res.json();
    return data.jobs || [];
  }

  let jobs = await doFetch(keywords, location);
  if (!jobs.length && location !== 'Brazil') jobs = await doFetch(keywords, 'Brazil');
  if (!jobs.length) jobs = await doFetch(cargoEn, 'Brazil');
  return jobs;
}

// ── FONTE: GREENHOUSE (ATS usado por Nubank, VTEX, Mercado Livre, iFood) ──────
const GREENHOUSE_BR_COMPANIES = [
  'nubank','vtex','ifood','mercadolibre','rappi','loft','quintoandar',
  'creditas','contabilizei','gympass','nuvemshop','olist','pagseguro',
  'stone','totvs','zup','avenue','matera','dock','cloudwalk',
  // expansão
  'magalu','picpay','xpinc','inter','99taxi','movile',
  'resultadosdigitais','pismo','softplan','enjoei','vindi',
  'oixtelecom','neon','madeiramadeira','americanas','viavarejo',
  'localfrio','linx','stefanini','ci&t','daitan',
];
async function fetchGreenhouseBRJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').toLowerCase();
    const keywords = cargo.split(/\s+/).filter(w => w.length > 3);
    const results = await Promise.allSettled(
      GREENHOUSE_BR_COMPANIES.map(slug =>
        fetch(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs?content=true`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }).then(r => r.ok ? r.json() : { jobs: [] })
          .then(d => (d.jobs || []).map(j => ({ ...j, _company_slug: slug })))
          .catch(() => [])
      )
    );
    const allJobs = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    return allJobs
      .filter(j => {
        const title = (j.title || '').toLowerCase();
        return keywords.some(w => title.includes(w));
      })
      .slice(0, 20)
      .map(j => ({
        title: j.title || 'Vaga',
        company: j.company?.name || j._company_slug || 'Empresa',
        location: j.location?.name || 'Brasil',
        snippet: (j.content || '').replace(/<[^>]+>/g, '').slice(0, 400),
        salary: '',
        link: j.absolute_url || `https://boards.greenhouse.io/${j._company_slug}/jobs/${j.id}`,
        _source: 'greenhouse',
        _posted_at: _postedAtMs(j.updated_at || j.first_published),
      }));
  } catch(e) {
    console.warn('fetchGreenhouseBRJobs error:', e.message);
    return [];
  }
}

// ── FONTE: LEVER (ATS usado por Hotmart, Creditas, Loft, QuintoAndar) ─────────
const LEVER_BR_COMPANIES = [
  'hotmart','creditas','loft-br','quintoandar','cloudwalk','zup',
  'betrybe','descomplica','neon','unico','buser','warren',
  // expansão
  'gympass','pismo','cafedu','maxmilhas','vindi',
  'resultadosdigitais','rdstation','olist','enjoei','contaazul',
  'labenu','trybe','revelo','squadco','softplan',
];
async function fetchLeverBRJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').toLowerCase();
    const keywords = cargo.split(/\s+/).filter(w => w.length > 3);
    const results = await Promise.allSettled(
      LEVER_BR_COMPANIES.map(slug =>
        fetch(`https://api.lever.co/v0/postings/${slug}?mode=json&limit=50`, {
          headers: { Accept: 'application/json' },
          signal: AbortSignal.timeout(6000),
        }).then(r => r.ok ? r.json() : [])
          .then(d => (Array.isArray(d) ? d : []).map(j => ({ ...j, _company_slug: slug })))
          .catch(() => [])
      )
    );
    const allJobs = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
    return allJobs
      .filter(j => {
        const title = (j.text || '').toLowerCase();
        return keywords.some(w => title.includes(w));
      })
      .slice(0, 20)
      .map(j => ({
        title: j.text || 'Vaga',
        company: j.company || j._company_slug || 'Empresa',
        location: j.categories?.location || j.workplaceType || 'Brasil',
        snippet: (j.descriptionPlain || j.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
        salary: '',
        link: j.hostedUrl || j.applyUrl || `https://jobs.lever.co/${j._company_slug}/${j.id}`,
        _source: 'lever',
        _posted_at: _postedAtMs(j.createdAt),
      }));
  } catch(e) {
    console.warn('fetchLeverBRJobs error:', e.message);
    return [];
  }
}

// ── FONTE: WORKDAY ATS (Ambev, Vale, Embraer, Natura, Bosch, Santander…) ─────
// Cada empresa Workday tem um slug e um board próprio. Tentamos o board explícito
// primeiro; se falhar, tentamos variantes comuns ('External', slug). Falhas são
// silenciosas — sem impacto no fluxo principal.
const WORKDAY_BR_COMPANIES = [
  { slug: 'ambev',            board: 'AMBEV_VAGAS'       },
  { slug: 'vale',             board: 'vale_vagas'         },
  { slug: 'embraer',          board: 'Embraer'            },
  { slug: 'naturacosmeticos', board: 'External'           },
  { slug: 'boticario',        board: 'GrupoBoticario'     },
  { slug: 'santanderbr',      board: 'External'           },
  { slug: 'boschgroup',       board: 'ExternalBR'         },
  { slug: 'volkswagen',       board: 'External'           },
  { slug: 'renault',          board: 'External'           },
  { slug: 'vivo',             board: 'Vivo'               },
  { slug: 'nestle',           board: 'External'           },
  { slug: 'unilever',         board: 'External'           },
  { slug: 'philips',          board: 'External'           },
  { slug: '3m',               board: 'External'           },
  { slug: 'emersonbr',        board: 'External'           },
];

async function fetchWorkdayCompany(slug, board, cargo) {
  const boards = [board, slug, 'External', 'external'];
  const keywords = cargo.toLowerCase().split(/\s+/).filter(w => w.length > 3);
  for (const b of boards) {
    try {
      const res = await fetch(
        `https://${slug}.wd3.myworkdayjobs.com/wday/cxs/${slug}/${b}/jobs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ limit: 20, offset: 0, searchText: cargo, appliedFacets: {} }),
          signal: AbortSignal.timeout(6000),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const postings = data.jobPostings || [];
      if (!postings.length) continue;
      return postings
        .filter(j => !keywords.length || keywords.some(w => (j.title || '').toLowerCase().includes(w)))
        .slice(0, 10)
        .map(j => ({
          title: j.title || 'Vaga',
          company: slug,
          location: j.locationsText || 'Brasil',
          snippet: '',
          salary: '',
          link: `https://${slug}.wd3.myworkdayjobs.com/pt-BR/${b}/job/${j.externalPath || ''}`,
          _source: 'workday',
        }));
    } catch (e) { continue; }
  }
  return [];
}

async function fetchWorkdayJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').trim();
    const results = await Promise.allSettled(
      WORKDAY_BR_COMPANIES.map(({ slug, board }) => fetchWorkdayCompany(slug, board, cargo))
    );
    return results.flatMap(r => r.status === 'fulfilled' ? r.value : []).slice(0, 30);
  } catch (e) {
    console.warn('fetchWorkdayJobs error:', e.message);
    return [];
  }
}

// ── FONTE: GEEKHUNTER (tech jobs BR qualificados) ─────────────────────────────
async function fetchGeekHunterJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    // GeekHunter é relevante apenas para perfis tech
    const techKeywords = /dev|software|engineer|dados|data|design|produto|product|ux|ui|mobile|frontend|backend|fullstack|cloud|devops|qa|test|segurança|security/i;
    if (!techKeywords.test(profile.cargo_desejado || '')) return [];
    const res = await fetch(
      `https://www.geekhunter.com.br/api/v3/jobs?term=${cargo}&per_page=20`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = data.jobs || data.data || data.results || [];
    return jobs.slice(0, 20).map(j => ({
      title: j.title || j.role || j.position || 'Vaga',
      company: j.company?.name || j.company_name || j.companyName || 'Empresa',
      location: j.remote || j.is_remote ? 'Remoto' : (j.city || j.location || 'Brasil'),
      snippet: (j.description || j.summary || '').replace(/<[^>]+>/g, '').slice(0, 400),
      salary: j.salary_range || j.salary || '',
      link: j.url || j.apply_url || `https://www.geekhunter.com.br/vagas`,
      _source: 'geekhunter',
    }));
  } catch (e) {
    console.warn('fetchGeekHunterJobs error:', e.message);
    return [];
  }
}

// ── FONTE: BNE (Banco Nacional de Empregos — vagas regionais presenciais) ─────
async function fetchBNEJobs(profile) {
  try {
    const cargoSlug = encodeURIComponent(
      (profile.cargo_desejado || '').toLowerCase().replace(/\s+/g, '-')
    );
    const url = `https://www.bne.com.br/vagas-de-emprego/${cargoSlug}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
      },
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return [];
    const html = await res.text();
    // JSON-LD (structured data)
    const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of ldBlocks) {
      try {
        const json = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ''));
        const items = json['@graph'] || (Array.isArray(json) ? json : [json]);
        const jobs = items.filter(i => i['@type'] === 'JobPosting');
        if (jobs.length) return jobs.slice(0, 15).map(j => ({
          title: j.title || j.name || 'Vaga',
          company: j.hiringOrganization?.name || 'Empresa',
          location: j.jobLocation?.address?.addressLocality || profile.cidade || 'Brasil',
          snippet: (j.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
          salary: j.baseSalary?.value?.value ? `R$ ${j.baseSalary.value.value}` : '',
          link: j.url || j['@id'] || url,
          _source: 'bne',
        }));
      } catch (e) {}
    }
    return [];
  } catch (e) {
    console.warn('fetchBNEJobs error:', e.message);
    return [];
  }
}

// ── FONTE 3: REMOTIVE (vagas remotas) ────────────────────────────────────────
async function fetchRemotiveJobs(profile) {
  try {
    if (!wantsRemote(profile)) return []; // Remotive só faz sentido para vagas remotas
    const cat = remotiveCategory(profile.cargo_desejado);
    const search = encodeURIComponent(profile.cargo_desejado || '');
    const catParam = cat ? `&category=${cat}` : '';
    const url = `https://remotive.com/api/remote-jobs?search=${search}${catParam}&limit=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs || []).map(j => ({
      title: j.title || 'Vaga',
      company: j.company_name || 'Empresa',
      location: 'Remoto',
      snippet: (j.description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
      salary: j.salary || '',
      link: j.url || '',
      _source: 'remotive',
      _posted_at: _postedAtMs(j.publication_date),
    }));
  } catch(e) {
    console.warn('fetchRemotiveJobs error:', e.message);
    return [];
  }
}

// ── FONTE 4: ADZUNA BR (precisa de chaves gratuitas em developer.adzuna.com) ──
async function fetchAdzunaJobs(profile) {
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) {
    console.log('fetchAdzunaJobs: credentials not configured, skipping source');
    return [];
  }
  try {
    const exact = String(profile.cargo_desejado || '').trim();
    const broad = broadenJobTitle(exact);
    const syn = cargoSynonymQuery(exact);   // sinônimo de domínio amplia a cobertura
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const attempts = [
      { what: exact, where: isRemoto ? '' : profile.cidade },
      { what: exact, where: '' },
    ];
    if (broad && broad !== exact.toLowerCase()) attempts.push({ what: broad, where: '' });
    if (syn && syn !== exact.toLowerCase() && syn !== broad) attempts.push({ what: syn, where: '' });

    let collected = [];
    for (const attempt of attempts) {
      if (!attempt.what) continue;
      const where = attempt.where ? `&where=${encodeURIComponent(attempt.where)}` : '';
      const url = `https://api.adzuna.com/v1/api/jobs/br/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&what=${encodeURIComponent(attempt.what)}${where}&results_per_page=20&content-type=application/json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(7000) });
      if (!res.ok) {
        console.warn(`fetchAdzunaJobs: HTTP ${res.status} for ${attempt.where ? 'local' : 'Brazil'} query`);
        continue;
      }
      const data = await res.json();
      collected.push(...(data.results || []).map(j => ({
        title: j.title || 'Vaga',
        company: j.company?.display_name || 'Empresa',
        location: j.location?.display_name || profile.cidade || 'Brasil',
        snippet: (j.description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
        salary: j.salary_min ? `R$ ${Math.round(j.salary_min).toLocaleString('pt-BR')}` : '',
        link: j.redirect_url || '',
        _source: 'adzuna',
        _posted_at: _postedAtMs(j.created),
      })));
      collected = uniqueJobs(collected);
      if (collected.length >= 8) break;
    }
    return collected;
  } catch(e) {
    console.warn('fetchAdzunaJobs error:', e.message);
    return [];
  }
}

// ── FONTE 5: SERPAPI / GOOGLE JOBS (precisa de chave em serpapi.com) ──────────
async function fetchSerpApiJobs(profile) {
  if (!SERPAPI_KEY) return [];
  try {
    const cargo = (profile.cargo_desejado || '').trim();
    const isRemoto = wantsRemote(profile);
    const kw = primaryKeyword(profile);   // termo extra refina relevância no Google Jobs
    // Busca em PT-BR focada em vagas brasileiras
    const query = encodeURIComponent(cargo + (kw ? ' ' + kw : '') + ' vaga emprego Brasil');
    const loc = isRemoto ? 'Brazil' : encodeURIComponent((profile.cidade || '') + ', Brazil');
    const url = `https://serpapi.com/search.json?engine=google_jobs&q=${query}&location=${loc}&hl=pt&gl=br&api_key=${SERPAPI_KEY}&num=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.jobs_results || []).map(j => ({
      title: j.title || 'Vaga',
      company: j.company_name || 'Empresa',
      location: j.location || profile.cidade || 'Brasil',
      snippet: (j.description || '').slice(0, 400),
      salary: (j.detected_extensions?.salary || ''),
      link: j.share_link || (j.apply_options?.[0]?.link) || '',
      _source: 'google',
    }));
  } catch(e) {
    console.warn('fetchSerpApiJobs error:', e.message);
    return [];
  }
}

// ── FONTE GUPY (ATS mais usado no Brasil) ────────────────────────────────────
async function fetchGupyJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').trim();
    const isRemoto = wantsRemote(profile);
    const params = new URLSearchParams({ jobName: cargo, limit: '40', offset: '0' });
    if (isRemoto) {
      params.set('workplaceType', 'remote');
    } else if (profile.cidade) {
      params.set('city', profile.cidade);
    }
    const url = `https://portal.api.gupy.io/api/v1/jobs?${params}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'VagaAI/1.0 (contato@vagaai.app.br)', Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
    return jobs.map(j => ({
      title: j.name || j.title || 'Vaga',
      company: j.company?.name || j.companyName || 'Empresa',
      location: [j.city, j.state].filter(Boolean).join(', ') || (j.isRemote ? 'Remoto' : 'Brasil'),
      snippet: (j.description || j.disabilities || '').replace(/<[^>]+>/g, '').slice(0, 400),
      salary: '',
      link: j.jobUrl || (j.company?.slug && j.id ? `https://portal.gupy.io/job/${j.company.slug}/${j.id}` : null) || `https://portal.gupy.io/jobs?jobName=${encodeURIComponent(j.name||'')}`,
      _source: 'gupy',
      _posted_at: _postedAtMs(j.publishedDate || j.createdDate),
    }));
  } catch(e) {
    console.warn('fetchGupyJobs error:', e.message);
    return [];
  }
}


// ── FONTE 8: VAGAS.COM RSS ────────────────────────────────────────────────────
async function fetchVagasComJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const cidade = isRemoto ? 'brasil' : encodeURIComponent(profile.cidade.toLowerCase());
    const url = `https://www.vagas.com.br/vagas-de-${encodeURIComponent((profile.cargo_desejado||'').toLowerCase().replace(/\s+/g,'-'))}.rss`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/rss+xml, text/xml' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSSItems(xml);
    return items.map(item => {
      const parsed = splitTitleCompany(item.title);
      return {
        title: parsed.title,
        company: item.company || parsed.company || 'Empresa',
        location: profile.cidade || 'Brasil',
        snippet: item.description,
        salary: '',
        link: item.link,
        _source: 'vagas_com',
      };
    });
  } catch(e) {
    console.warn('fetchVagasComJobs error:', e.message);
    return [];
  }
}

// ── FONTE 9: INFOJOBS RSS ─────────────────────────────────────────────────────
async function fetchInfoJobsJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const cidade = isRemoto ? '' : encodeURIComponent(profile.cidade);
    const url = `https://www.infojobs.com.br/vagas-de-emprego-em-${cidade || 'brasil'}.aspx?palabra=${cargo}&format=rss`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/rss+xml, text/xml' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = parseRSSItems(xml);
    return items.map(item => {
      const parsed = splitTitleCompany(item.title);
      return {
        title: parsed.title,
        company: item.company || parsed.company || 'Empresa',
        location: profile.cidade || 'Brasil',
        snippet: item.description,
        salary: '',
        link: item.link,
        _source: 'infojobs',
      };
    });
  } catch(e) {
    console.warn('fetchInfoJobsJobs error:', e.message);
    return [];
  }
}


// ── FONTE 13: TRAMPOS.CO RSS (digital/startup BR) ────────────────────────────
async function fetchTramposJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const urls = [
      `https://trampos.co/oportunidades.rss?q=${cargo}`,
      `https://trampos.co/vagas.rss?q=${cargo}`,
      `https://trampos.co/oportunidades.rss`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/rss+xml, text/xml' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const items = parseRSSItems(xml);
        if (!items.length) continue;
        const cargo_lower = (profile.cargo_desejado || '').toLowerCase();
        const filtered = items.filter(i =>
          cargo_lower.split(/\s+/).some(w => w.length > 3 && (i.title.toLowerCase().includes(w) || i.description.toLowerCase().includes(w)))
        );
        return (filtered.length ? filtered : items).slice(0, 12).map(item => {
          const parsed = splitTitleCompany(item.title);
          return {
            title: parsed.title,
            company: item.company || parsed.company || 'Empresa',
            location: profile.cidade || 'Brasil',
            snippet: item.description,
            salary: '',
            link: item.link,
            _source: 'trampos',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchTramposJobs error:', e.message);
    return [];
  }
}


// ── FONTE 17: CATHO (endpoints internos + RSS) ────────────────────────────────
async function fetchCathoJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').toLowerCase().trim();
    const cargoSlug = encodeURIComponent(cargo.replace(/\s+/g, '-'));
    const cargoQ   = encodeURIComponent(cargo);
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const cidadeSlug = isRemoto ? '' : encodeURIComponent((profile.cidade || '').toLowerCase().replace(/\s+/g, '-'));

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      Accept: 'application/json, text/html, application/rss+xml, text/xml, */*',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      Referer: 'https://www.catho.com.br/',
    };

    // Tenta múltiplos endpoints — Catho não tem API pública documentada
    const attempts = [
      // API interna (usada pelo site via XHR)
      `https://www.catho.com.br/api/v1/search/jobs?q=${cargoQ}${cidadeSlug ? '&where=' + cidadeSlug : ''}&limit=20`,
      `https://www.catho.com.br/api/jobs?keywords=${cargoQ}&limit=20`,
      // RSS
      `https://www.catho.com.br/vagas-de-emprego/${cargoSlug || 'emprego'}.rss`,
      `https://www.catho.com.br/rss/vagas/${cargoSlug}/`,
      // Endpoint SEO que retorna JSON-LD em algumas páginas
      `https://www.catho.com.br/vagas-de-emprego/${cargoSlug}/`,
    ];

    for (const url of attempts) {
      try {
        const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
        if (!res.ok) continue;
        const ct = res.headers.get('content-type') || '';

        // JSON response
        if (ct.includes('json')) {
          const data = await res.json();
          const list = data.jobs || data.results || data.data || data.vagas || [];
          if (Array.isArray(list) && list.length) {
            return list.slice(0, 15).map(j => ({
              title: j.title || j.titulo || j.nome || j.cargo || 'Vaga',
              company: j.company || j.empresa || j.companyName || j.nomeEmpresa || 'Empresa',
              location: j.location || j.cidade || j.localidade || profile.cidade || 'Brasil',
              snippet: (j.description || j.descricao || j.resumo || '').replace(/<[^>]+>/g,'').slice(0,400),
              salary: j.salary || j.salario || j.remuneracao || '',
              link: j.url || j.link || j.redirect_url || `https://www.catho.com.br/vagas-de-emprego/${cargoSlug}/`,
              _source: 'catho',
            }));
          }
        }

        // RSS/XML response
        if (ct.includes('xml') || ct.includes('rss')) {
          const xml = await res.text();
          const items = parseRSSItems(xml);
          if (items.length) {
            return items.slice(0, 15).map(item => {
              const parsed = splitTitleCompany(item.title);
              return {
                title: parsed.title,
                company: item.company || parsed.company || 'Empresa',
                location: profile.cidade || 'Brasil',
                snippet: item.description,
                salary: '',
                link: item.link,
                _source: 'catho',
              };
            });
          }
        }

        // HTML com JSON-LD embutido (structured data)
        if (ct.includes('html')) {
          const html = await res.text();
          const ldMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
          for (const block of ldMatch) {
            try {
              const json = JSON.parse(block.replace(/<\/?script[^>]*>/gi,''));
              const items = json['@graph'] || (Array.isArray(json) ? json : [json]);
              const jobItems = items.filter(i => i['@type'] === 'JobPosting');
              if (jobItems.length) {
                return jobItems.slice(0,15).map(j => ({
                  title: j.title || j.name || 'Vaga',
                  company: j.hiringOrganization?.name || 'Empresa',
                  location: j.jobLocation?.address?.addressLocality || profile.cidade || 'Brasil',
                  snippet: (j.description || '').replace(/<[^>]+>/g,'').slice(0,400),
                  salary: j.baseSalary?.value?.value ? `R$ ${j.baseSalary.value.value}` : '',
                  link: j.url || j['@id'] || '',
                  _source: 'catho',
                }));
              }
            } catch(e) {}
          }
        }
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchCathoJobs error:', e.message);
    return [];
  }
}


// ── FONTE 20: JSEARCH / RAPIDAPI (agrega LinkedIn, Indeed, Glassdoor) ────────
async function fetchJSearchJobs(profile) {
  if (!JSEARCH_API_KEY) {
    console.log('fetchJSearchJobs: JSEARCH_API_KEY not configured, skipping source');
    return [];
  }
  try {
    const cargo = String(profile.cargo_desejado || '').trim();
    const broad = broadenJobTitle(cargo);
    const kw = primaryKeyword(profile);       // Google for Jobs trata termos extras como sinal suave
    const syn = cargoSynonymQuery(cargo);
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const location = isRemoto ? 'Brazil' : `${profile.cidade}, Brazil`;
    const attempts = [
      { query: `${cargo} in ${location}`, date: 'month' },
      { query: `${cargo} in Brazil`, date: 'month' },
    ];
    if (kw) attempts.push({ query: `${cargo} ${kw} in Brazil`, date: 'month' });
    if (broad && broad !== cargo.toLowerCase()) attempts.push({ query: `${broad} in Brazil`, date: 'month' });
    if (syn && syn !== cargo.toLowerCase() && syn !== broad) attempts.push({ query: `${syn} in Brazil`, date: 'month' });

    let collected = [];
    for (const attempt of attempts) {
      const url = `https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(attempt.query)}&country=br&num_pages=1&page=1&date_posted=${attempt.date}`;
      const res = await fetch(url, {
        headers: {
          'X-RapidAPI-Key': JSEARCH_API_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
          'Accept': 'application/json',
        },
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) {
        console.warn(`fetchJSearchJobs: HTTP ${res.status} for query variant`);
        continue;
      }
      const data = await res.json();
      collected.push(...(data.data || []).map(j => {
      let salary = '';
      if (j.job_min_salary && j.job_max_salary) {
        const currency = j.job_salary_currency === 'BRL' ? 'R$' : (j.job_salary_currency || 'R$');
        salary = `${currency} ${Math.round(j.job_min_salary).toLocaleString('pt-BR')} – ${Math.round(j.job_max_salary).toLocaleString('pt-BR')}`;
      } else if (j.job_min_salary) {
        salary = `R$ ${Math.round(j.job_min_salary).toLocaleString('pt-BR')}`;
      }
      const loc = [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', ') || profile.cidade || 'Brasil';
      return {
        title: j.job_title || 'Vaga',
        company: j.employer_name || 'Empresa',
        location: loc,
        snippet: (j.job_description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
        salary,
        link: j.job_apply_link || j.job_google_link || '',
        _source: 'jsearch',
        _posted_at: _postedAtMs(j.job_posted_at_timestamp || j.job_posted_at_datetime_utc),
      };
      }));
      collected = uniqueJobs(collected);
      if (collected.length >= 8) break;
    }
    return collected.slice(0, 30);
  } catch(e) {
    console.warn('fetchJSearchJobs error:', e.message);
    return [];
  }
}

// ── FONTE: EMPREGOS.COM.BR ───────────────────────────────────────────────────
async function fetchEmpregosComBrJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').trim();
    const cargoSlug = cargo.toLowerCase().replace(/\s+/g, '-');
    const isRemoto = !profile.cidade || /remoto|remote/i.test(profile.cidade);
    const cidadeSlug = isRemoto ? '' : profile.cidade.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const url = cidadeSlug
      ? `https://www.empregos.com.br/vagas/${cargoSlug}/${cidadeSlug}`
      : `https://www.empregos.com.br/vagas/${cargoSlug}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const html = await res.text();
    // Tenta JSON-LD primeiro
    const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of ldBlocks) {
      try {
        const json = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ''));
        const items = json['@graph'] || (Array.isArray(json) ? json : [json]);
        const jobs = items.filter(i => i['@type'] === 'JobPosting');
        if (jobs.length) return jobs.slice(0, 15).map(j => ({
          title: j.title || j.name || 'Vaga',
          company: j.hiringOrganization?.name || 'Empresa',
          location: j.jobLocation?.address?.addressLocality || profile.cidade || 'Brasil',
          snippet: (j.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
          salary: j.baseSalary?.value?.value ? `R$ ${j.baseSalary.value.value}` : '',
          link: j.url || j['@id'] || url,
          _source: 'empregos_com_br',
        }));
      } catch(e) {}
    }
    // Fallback: extrai cards de vagas do HTML
    const jobs = [];
    const cardRe = /href="(https?:\/\/www\.empregos\.com\.br\/vaga[^"]+)"[^>]*>[\s\S]*?<[^>]+class="[^"]*(?:title|cargo|nome)[^"]*"[^>]*>([\s\S]*?)<\/[^>]+>/gi;
    let m;
    while ((m = cardRe.exec(html)) !== null && jobs.length < 15) {
      jobs.push({ title: m[2].replace(/<[^>]+>/g,'').trim(), company: 'Empresa', location: profile.cidade || 'Brasil', snippet: '', salary: '', link: m[1], _source: 'empregos_com_br' });
    }
    return jobs;
  } catch(e) {
    console.warn('fetchEmpregosComBrJobs error:', e.message);
    return [];
  }
}

// ── FONTE: JOBBOL ─────────────────────────────────────────────────────────────
async function fetchJobbolJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || /remoto|remote/i.test(profile.cidade);
    const cidadeQ = isRemoto ? '' : `&city=${encodeURIComponent(profile.cidade)}`;
    const url = `https://www.jobbol.com.br/vagas?q=${cargo}${cidadeQ}`;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const html = await res.text();
    // Tenta JSON-LD
    const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of ldBlocks) {
      try {
        const json = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ''));
        const items = json['@graph'] || (Array.isArray(json) ? json : [json]);
        const jobs = items.filter(i => i['@type'] === 'JobPosting');
        if (jobs.length) return jobs.slice(0, 15).map(j => ({
          title: j.title || j.name || 'Vaga',
          company: j.hiringOrganization?.name || 'Empresa',
          location: j.jobLocation?.address?.addressLocality || profile.cidade || 'Brasil',
          snippet: (j.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
          salary: '',
          link: j.url || j['@id'] || url,
          _source: 'jobbol',
        }));
      } catch(e) {}
    }
    return [];
  } catch(e) {
    console.warn('fetchJobbolJobs error:', e.message);
    return [];
  }
}

// ── FONTE: SINE ESTADUAL ──────────────────────────────────────────────────────
// Detecta o estado do usuário pela cidade e consulta o portal SINE correspondente.
// Só é chamada quando o usuário tem formato presencial ou híbrido + cidade definida.
const SINE_PORTALS = {
  AC: { url: 'https://sine.ac.gov.br/vagas?q={cargo}', name: 'SINE Acre' },
  AL: { url: 'https://online.maceio.al.gov.br/n/talentos?q={cargo}', name: 'SINE Alagoas' },
  AP: { url: 'https://sine.ap.gov.br/vagas?q={cargo}', name: 'SINE Amapá' },
  AM: { url: 'https://empregaamazonas.am.gov.br/vagas?cargo={cargo}', name: 'SINE Amazonas' },
  BA: { url: 'https://empregos.saeb.ba.gov.br/vagas?q={cargo}', name: 'SINE Bahia' },
  CE: { url: 'https://idt.org.br/empregar?q={cargo}', name: 'IDT/SINE Ceará' },
  DF: { url: 'https://www.trabalho.df.gov.br/vagas?q={cargo}', name: 'SINE DF' },
  ES: { url: 'https://maisemprego.es.gov.br/vagas?q={cargo}', name: 'SINE ES' },
  GO: { url: 'https://segplan.go.gov.br/sine/vagas?q={cargo}', name: 'SINE Goiás' },
  MA: { url: 'https://trabalho.ma.gov.br/vagas?q={cargo}', name: 'SINE Maranhão' },
  MT: { url: 'https://emprego.mt.gov.br/vagas?q={cargo}', name: 'SINE MT' },
  MS: { url: 'https://funtrab.ms.gov.br/vagas?q={cargo}', name: 'FUNTRAB MS' },
  MG: { url: 'https://mg.gov.br/trabalho?q={cargo}', name: 'SINE MG' },
  PA: { url: 'https://seaster.pa.gov.br/vagas?q={cargo}', name: 'SINE Pará' },
  PB: { url: 'https://sedet.pb.gov.br/sine-pb?q={cargo}', name: 'SINE Paraíba' },
  PR: { url: 'https://trabalho.pr.gov.br/vagas?q={cargo}', name: 'Agência do Trabalhador PR' },
  PE: { url: 'https://seteq.pe.gov.br/vagas?q={cargo}', name: 'SINE Pernambuco' },
  PI: { url: 'https://setre.pi.gov.br/vagas?q={cargo}', name: 'SINE Piauí' },
  RJ: { url: 'https://www.trabalho.rj.gov.br/vagas?q={cargo}', name: 'Emprega Rio' },
  RN: { url: 'https://sine.rn.gov.br/vagas?q={cargo}', name: 'SINE RN' },
  RS: { url: 'https://fgtas.rs.gov.br/vagas?q={cargo}', name: 'FGTAS/SINE RS' },
  RO: { url: 'https://rondonia.ro.gov.br/sine?q={cargo}', name: 'SINE Rondônia' },
  RR: { url: 'https://roraima.rr.gov.br/sine?q={cargo}', name: 'SINE Roraima' },
  SC: { url: 'https://sine.sc.gov.br/vagas?q={cargo}', name: 'SINE SC' },
  SP: { url: 'https://www.empregasaopaulo.sp.gov.br/vagas?cargo={cargo}', name: 'Emprega SP' },
  SE: { url: 'https://seteem.se.gov.br/vagas?q={cargo}', name: 'SINE Sergipe' },
  TO: { url: 'https://sine.to.gov.br/vagas?q={cargo}', name: 'SINE Tocantins' },
};

// Mapa cidade → UF para as principais capitais e cidades
const CIDADE_UF = {
  'são paulo': 'SP', 'sao paulo': 'SP', 'guarulhos': 'SP', 'campinas': 'SP', 'santos': 'SP', 'ribeirão preto': 'SP', 'sorocaba': 'SP',
  'rio de janeiro': 'RJ', 'niterói': 'RJ', 'nova iguaçu': 'RJ', 'duque de caxias': 'RJ',
  'belo horizonte': 'MG', 'uberlândia': 'MG', 'contagem': 'MG', 'juiz de fora': 'MG',
  'curitiba': 'PR', 'londrina': 'PR', 'maringá': 'PR',
  'porto alegre': 'RS', 'caxias do sul': 'RS', 'pelotas': 'RS',
  'florianópolis': 'SC', 'joinville': 'SC', 'blumenau': 'SC',
  'salvador': 'BA', 'feira de santana': 'BA',
  'fortaleza': 'CE', 'caucaia': 'CE',
  'recife': 'PE', 'caruaru': 'PE', 'olinda': 'PE',
  'manaus': 'AM', 'belém': 'PA', 'goiânia': 'GO', 'brasília': 'DF',
  'maceió': 'AL', 'natal': 'RN', 'teresina': 'PI', 'campo grande': 'MS',
  'cuiabá': 'MT', 'macapá': 'AP', 'porto velho': 'RO', 'boa vista': 'RR',
  'palmas': 'TO', 'aracaju': 'SE', 'são luís': 'MA', 'vitória': 'ES', 'rio branco': 'AC',
};

function detectUF(cidade) {
  const c = (cidade || '').toLowerCase().trim();
  // Tenta match direto
  if (CIDADE_UF[c]) return CIDADE_UF[c];
  // Tenta sigla direta (ex: "SP", "RJ")
  const upper = c.toUpperCase();
  if (SINE_PORTALS[upper]) return upper;
  // Tenta encontrar cidade no texto (ex: "São Paulo, SP")
  for (const [nome, uf] of Object.entries(CIDADE_UF)) {
    if (c.includes(nome)) return uf;
  }
  // Tenta sigla no final da string (ex: "São Paulo - SP")
  const siglaMatch = c.match(/\b([a-z]{2})$/);
  if (siglaMatch && SINE_PORTALS[siglaMatch[1].toUpperCase()]) return siglaMatch[1].toUpperCase();
  return null;
}

async function fetchSineJobs(profile) {
  try {
    const uf = detectUF(profile.cidade);
    if (!uf || !SINE_PORTALS[uf]) return [];
    const portal = SINE_PORTALS[uf];
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const url = portal.url.replace('{cargo}', cargo);
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/json',
      'Accept-Language': 'pt-BR,pt;q=0.9',
    };
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return [];
    const ct = res.headers.get('content-type') || '';
    // JSON response
    if (ct.includes('json')) {
      const data = await res.json();
      const list = data.vagas || data.jobs || data.results || data.data || [];
      if (Array.isArray(list) && list.length) {
        return list.slice(0, 15).map(j => ({
          title: j.titulo || j.cargo || j.title || j.nome || 'Vaga',
          company: j.empresa || j.company || j.empregador || portal.name,
          location: j.cidade || j.municipio || j.location || profile.cidade || 'Brasil',
          snippet: (j.descricao || j.description || j.requisitos || '').slice(0, 400),
          salary: j.salario || j.remuneracao || '',
          link: j.url || j.link || url,
          _source: 'sine',
        }));
      }
    }
    // HTML: tenta JSON-LD
    const html = await res.text().catch(() => '');
    const ldBlocks = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || [];
    for (const block of ldBlocks) {
      try {
        const json = JSON.parse(block.replace(/<\/?script[^>]*>/gi, ''));
        const items = json['@graph'] || (Array.isArray(json) ? json : [json]);
        const jobs = items.filter(i => i['@type'] === 'JobPosting');
        if (jobs.length) return jobs.slice(0, 15).map(j => ({
          title: j.title || j.name || 'Vaga',
          company: j.hiringOrganization?.name || portal.name,
          location: j.jobLocation?.address?.addressLocality || profile.cidade || 'Brasil',
          snippet: (j.description || '').replace(/<[^>]+>/g, '').slice(0, 400),
          salary: '',
          link: j.url || j['@id'] || url,
          _source: 'sine',
        }));
      } catch(e) {}
    }
    return [];
  } catch(e) {
    console.warn('fetchSineJobs error:', e.message);
    return [];
  }
}

// ── FONTE 19: TALENT.COM BR RSS ───────────────────────────────────────────────
async function fetchTalentComJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const loc = isRemoto ? 'brasil' : encodeURIComponent(profile.cidade);
    const urls = [
      `https://br.talent.com/rss?k=${cargo}&l=${loc}`,
      `https://br.talent.com/jobs?k=${cargo}&l=${loc}&format=rss`,
      `https://www.talent.com/jobs?k=${cargo}&l=Brazil&format=rss`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/rss+xml, text/xml' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const items = parseRSSItems(xml);
        if (!items.length) continue;
        return items.slice(0, 15).map(item => {
          const parsed = splitTitleCompany(item.title);
          return {
            title: parsed.title,
            company: item.company || parsed.company || 'Empresa',
            location: profile.cidade || 'Brasil',
            snippet: item.description,
            salary: '',
            link: item.link,
            _source: 'talent_com',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchTalentComJobs error:', e.message);
    return [];
  }
}

// ── PRÓXIMO ENVIO ─────────────────────────────────────────────────────────────
// Todos os cálculos de horário respeitam America/Sao_Paulo independente do fuso do servidor.

const BRT_OFFSET_HOURS = -3; // America/Sao_Paulo (UTC-3, sem considerar horário de verão)

// Retorna o horário alvo como Date UTC, dado hora/minuto no fuso de SP
function nextOccurrenceAt(hh, mm, fromDateUTC, dayOfWeek = null) {
  // Converte fromDate para SP
  const spNow = new Date(fromDateUTC.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);

  // Constrói candidato no fuso SP
  const candidate = new Date(spNow);
  candidate.setUTCHours(hh, mm, 0, 0);

  if (dayOfWeek !== null) {
    const curDay = candidate.getUTCDay();
    let daysUntil = (dayOfWeek - curDay + 7) % 7;
    if (daysUntil === 0 && candidate <= spNow) daysUntil = 7;
    candidate.setUTCDate(candidate.getUTCDate() + daysUntil);
  } else {
    // Mesmo dia mas horário já passou → próximo dia
    if (candidate <= spNow) candidate.setUTCDate(candidate.getUTCDate() + 1);
  }

  // Converte de volta para UTC
  return new Date(candidate.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
}

// Hora-âncora (BRT) para o next_run. O cron roda 1x/dia de manhã (11:00 UTC = 08:00 BRT);
// ancorar o next_run a uma hora <= cron garante que o envio ocorra no DIA correto.
// Antes, o horário default (08:00 BRT = 11:00 UTC) caía DEPOIS do cron das 08:00 UTC
// e só era pego no dia seguinte (atraso de ~1 dia). O horário exato não é entregável
// num cron diário, então o anchor é o teto efetivo do agendamento.
const ALERT_ANCHOR_HOUR_BRT = 7;

function calculateNextRun(profile, fromDate = new Date()) {
  const frequencia = profile.frequencia || 'semanal';
  const diaEnvio = (profile.dia_envio !== undefined && profile.dia_envio !== null)
    ? parseInt(profile.dia_envio) : 5; // default sexta (5)
  const cfgHour = parseInt(String(profile.horario_envio || '08:00').split(':')[0]) || 8;
  const hh = Math.min(cfgHour, ALERT_ANCHOR_HOUR_BRT);
  const mm = 0;

  if (frequencia === 'diario') {
    return nextOccurrenceAt(hh, mm, fromDate, null);
  }

  if (frequencia === 'semanal') {
    return nextOccurrenceAt(hh, mm, fromDate, diaEnvio);
  }

  if (frequencia === 'quinzenal') {
    if (profile.ultimo_envio) {
      // Próximo envio = último + 14 dias, no horário configurado em SP
      let candidate = new Date(new Date(profile.ultimo_envio).getTime() + 14 * 24 * 60 * 60 * 1000);
      // Ajusta para o horário correto no fuso SP
      const spCandidate = new Date(candidate.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);
      spCandidate.setUTCHours(hh, mm, 0, 0);
      candidate = new Date(spCandidate.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
      // Se ainda estiver no passado (envio atrasado), avança de 14 em 14 até o futuro
      while (candidate <= fromDate) {
        candidate = new Date(candidate.getTime() + 14 * 24 * 60 * 60 * 1000);
      }
      return candidate;
    }
    // Primeiro envio: usa o dia da semana configurado como referência (como semanal)
    return nextOccurrenceAt(hh, mm, fromDate, diaEnvio);
  }

  if (frequencia === 'mensal') {
    const spNow = new Date(fromDate.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);
    const spNext = new Date(spNow);
    spNext.setUTCMonth(spNext.getUTCMonth() + 1);
    spNext.setUTCDate(1);
    spNext.setUTCHours(hh, mm, 0, 0);
    return new Date(spNext.getTime() - BRT_OFFSET_HOURS * 60 * 60 * 1000);
  }

  return null;
}

// ── DEDUPLICAÇÃO ──────────────────────────────────────────────────────────────
// URL canônica (host+path, sem query/hash) — pega a mesma vaga anunciada com
// títulos ligeiramente diferentes ("Analista - Especialista" vs "Analista | Especialista").
function canonicalJobLink(link) {
  try {
    const u = new URL(String(link || ''));
    const path = u.pathname.replace(/\/+$/, '');
    if (!path || path === '/') return '';   // raiz do site não identifica vaga
    return (u.host + path).toLowerCase();
  } catch { return ''; }
}

function deduplicateJobs(jobs) {
  const seen = new Set();
  const seenLinks = new Set();
  return jobs.filter(j => {
    const key = jobHash(j.title, j.company, j.location);
    if (seen.has(key)) return false;
    const lk = canonicalJobLink(j.link || j.url);
    if (lk && seenLinks.has(lk)) return false;
    seen.add(key);
    if (lk) seenLinks.add(lk);
    return true;
  });
}

// Normaliza campos do objeto de vaga (Jooble pode variar)
function normalizeJob(j) {
  return {
    title: j.title || j.position || 'Vaga',
    company: j.company || j.employer || j.companyName || 'Empresa',
    location: j.location || j.city || 'Brasil',
    snippet: j.snippet || j.description || '',
    salary: j.salary || '',
    link: j.link || j.url || 'https://vagaai.app.br',
    _score: j._score || 0,
    _source: j._source || '',          // preserva a fonte p/ o filtro (BR_SOURCES)
    // preserva a data de publicação; Jooble entrega raw com `updated`
    _posted_at: j._posted_at || _postedAtMs(j.updated || j.date),
  };
}

// Remove vagas já enviadas para este usuário
// Janela de dedup: uma vaga não enviada nos últimos N dias pode ser reenviada.
// Sem isso, o conjunto de "já enviadas" cresceria para sempre e o usuário diário
// passaria a receber "nenhuma vaga nova" cada vez mais cedo.
const DEDUP_WINDOW_DAYS = 60;

async function filterSentJobs(userId, jobs) {
  if (!jobs.length) return [];
  const hashes = jobs.map(j => jobHash(j.title, j.company, j.location));
  const sinceIso = new Date(Date.now() - DEDUP_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  // Exclui se: enviada dentro da janela de dedup OU dispensada (permanente, sem janela).
  // Uma vaga que o usuário excluiu NUNCA deve voltar, mesmo após 60 dias.
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/job_alert_sent?user_id=eq.${userId}&job_hash=in.(${hashes.join(',')})&or=(sent_at.gte.${encodeURIComponent(sinceIso)},dismissed_reason.not.is.null)&select=job_hash`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const sent = await res.json();
  const sentSet = new Set((Array.isArray(sent) ? sent : []).map(s => s.job_hash));
  return jobs.filter(j => !sentSet.has(jobHash(j.title, j.company, j.location)));
}

// Registra vagas enviadas
async function markJobsSent(userId, jobs) {
  if (!jobs.length) return;
  const rows = jobs.map(j => ({
    user_id: userId,
    job_hash: jobHash(j.title, j.company, j.location),
    job_title: j.title,
    job_company: j.company,
    job_url: j.link,
    sent_at: new Date().toISOString(),
  }));
  await fetch(`${SUPABASE_URL}/rest/v1/job_alert_sent`, {
    method: 'POST',
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
    body: JSON.stringify(rows),
  });
}

// Gera HTML do email
function buildEmailHTML(profile, jobs, userName, userId, plan = 'free', ent = null) {
  const name = userName || 'você';
  // CTA por plano: free conduz à análise ("Analisar esta vaga"); pagos reforçam compatibilidade
  const ctaLabel = plan === 'free' ? '⚡ Analisar esta vaga →' : '⚡ Analisar compatibilidade →';
  const jobsHTML = jobs.map(j => {
    try {
    const analyzeUrl = `https://www.vagaai.app.br/app?vaga=${encodeURIComponent(String(j.link || 'https://vagaai.app.br'))}`;
    const company = String(j.company || j.employer || j.companyName || 'Empresa');
    const companyInitial = (company[0] || 'E').toUpperCase();
    const colors = ['#820AD1','#EA1D2C','#21C25E','#F04E23','#003D7B','#FF6B00','#0061FF'];
    const color = colors[Math.abs((company.charCodeAt(0) || 69)) % colors.length];
    return `
    <div style="border:1px solid #e8f5ee;border-radius:10px;padding:14px;margin-bottom:10px;background:#fff;font-family:Arial,sans-serif">
      <div style="display:flex;gap:10px;align-items:flex-start">
        <div style="width:36px;height:36px;border-radius:8px;background:${color};display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0">${companyInitial}</div>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:#555;margin-bottom:2px">${escEmail(company)}</div>
          <div style="font-size:14px;font-weight:700;color:#1a8f5c;margin-bottom:4px">${escEmail(j.title)}</div>
          <div style="font-size:11px;color:#888;margin-bottom:6px">📍 ${escEmail(j.location || 'Brasil')} · 💰 ${j.salary ? escEmail(j.salary) : 'Salário não informado'}</div>
          <div style="font-size:11px;color:#f0a500;margin-bottom:6px">${starsFromScore(j._score)} <span style="color:#888">${compatLabel(j._score)} (estimado)</span></div>
          <a href="${analyzeUrl}" style="display:inline-block;background:#1a8f5c;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:6px;text-decoration:none">${ctaLabel}</a>${j.link ? ` <a href="${escEmail(j.link)}" target="_blank" style="display:inline-block;background:#f4f9f6;color:#1a8f5c;font-size:12px;font-weight:600;padding:6px 14px;border-radius:6px;text-decoration:none;border:1.5px solid #1a8f5c;margin-left:6px">🔗 Ver vaga</a>` : ''}
        </div>
      </div>
    </div>`;
    } catch(e) { return `<div style="padding:10px;color:#888;font-size:12px">Vaga indisponível</div>`; }
  }).join('');

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f2f6f3;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:0 auto;background:#fff">
  <div style="background:#0a1a10;padding:28px;text-align:center">
    <div style="font-family:Georgia,serif;font-size:24px;font-weight:700;color:#3ecf8e;margin-bottom:4px">VagaAI</div>
    <div style="font-size:12px;color:rgba(62,207,142,.6)">Seu copiloto para conseguir o emprego</div>
  </div>
  <div style="padding:24px">
    <div style="font-size:16px;font-weight:700;color:#111;margin-bottom:6px">Olá, ${escEmail(name)}! 👋</div>
    <div style="font-size:13px;color:#555;line-height:1.6;margin-bottom:20px">
      ${plan === 'pro'
        ? `Suas <strong>${jobs.length} melhores oportunidades</strong> foram priorizadas por aderência ao seu perfil. Veja por que cada vaga combina com você.`
        : plan === 'starter'
        ? `Selecionamos <strong>${jobs.length} oportunidade${jobs.length > 1 ? 's' : ''}</strong> com base no seu perfil, senioridade, localização e preferências.`
        : `Encontramos <strong>${jobs.length} oportunidade${jobs.length > 1 ? 's' : ''}</strong> para você. Veja as vagas gratuitamente e analise a que mais combina com seu perfil.`}
      <br>Perfil: <strong>${escEmail(profile.cargo_desejado)}</strong>${profile.cidade ? ' · <strong>' + escEmail(profile.cidade) + '</strong>' : ''}.
      Clique em "Analisar" para ver o score ATS real do seu currículo antes de se candidatar.
      ${profile._proSummary
        ? `<div style="margin-top:12px;background:#f0faf4;border:1px solid #bfe8d2;border-left:3px solid #1a8f5c;border-radius:8px;padding:10px 13px;color:#14532d;font-size:13px;line-height:1.6"><strong style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#1a8f5c;margin-bottom:3px">Análise do dia · Pro</strong>${escEmail(profile._proSummary)}</div>`
        : ''}
      ${profile._relaxedMatches
        ? '<br><span style="display:inline-block;margin-top:8px;color:#8a6513;background:#fff8e9;border:1px solid #f0d7a5;border-radius:6px;padding:6px 9px">Algumas oportunidades próximas ao seu perfil foram incluídas porque os filtros exatos não retornaram resultados.</span>'
        : ''}
    </div>
    ${jobsHTML}
    <div style="border-top:1px solid #eee;margin-top:20px;padding-top:16px;text-align:center;font-size:12px;color:#aaa;line-height:1.8">
      Compatibilidades acima são <em>estimadas</em>. O score real aparece após analisar.<br>
      <a href="https://www.vagaai.app.br/dashboard" style="color:#1a8f5c;text-decoration:none;font-weight:600">Gerenciar alertas</a>
      &nbsp;·&nbsp;
      <a href="https://www.vagaai.app.br/api/unsubscribe?uid=${encodeURIComponent(userId || '')}&tok=${makeUnsubToken(userId || '')}" style="color:#aaa;text-decoration:none">Cancelar inscrição</a>
    </div>
  </div>
  <div style="background:#f9f9f9;padding:14px;text-align:center;font-size:11px;color:#bbb;border-top:1px solid #eee">
    © 2026 VagaAI · <a href="https://vagaai.app.br" style="color:#1a8f5c;text-decoration:none">vagaai.app.br</a>
  </div>
</div>
</body></html>`;
}

function escEmail(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Salva as vagas do último envio no cache (dashboard lê daqui, sem nova busca às APIs).
// On-demand: mescla com o cache existente para não apagar vagas de envios anteriores.
async function upsertAlertCache(userId, jobs, { isDemand = false } = {}) {
  const nowIso = new Date().toISOString();
  const normalize = j => ({
    title: j.title, company: j.company || j.employer || j.companyName || '',
    location: j.location || '', salary: j.salary || '', link: j.link || '',
    _score: j._score || 0, source: j.source || '',
    first_seen_at: j.first_seen_at || nowIso,
    last_seen_at: nowIso,
  });
  const cacheKey = j => {
    if (j.link) return `link:${String(j.link).trim().toLowerCase()}`;
    return `hash:${jobHash(j.title || '', j.company || '', j.location || '')}`;
  };

  const mergedMap = new Map();

  // Preserva o historico visual de oportunidades: cron e busca manual sempre
  // mesclam com o cache existente, em vez de apagar a lista a cada envio.
  try {
    const existing = await fetch(
      `${SUPABASE_URL}/rest/v1/job_alert_cache?user_id=eq.${userId}&select=jobs`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    if (existing.ok) {
      const rows = await existing.json();
      if (rows[0]?.jobs) {
        const prev = typeof rows[0].jobs === 'string' ? JSON.parse(rows[0].jobs) : rows[0].jobs;
        if (Array.isArray(prev)) {
          for (const p of prev) {
            const normalized = normalize(p);
            normalized.first_seen_at = p.first_seen_at || p.cached_at || normalized.first_seen_at;
            normalized.last_seen_at = p.last_seen_at || p.cached_at || normalized.last_seen_at;
            mergedMap.set(cacheKey(normalized), normalized);
          }
        }
      }
    }
  } catch (e) { console.warn('job_alert_cache merge fetch failed:', e.message); }

  for (const j of jobs.map(normalize)) {
    const key = cacheKey(j);
    const prev = mergedMap.get(key);
    mergedMap.set(key, {
      ...prev,
      ...j,
      first_seen_at: prev?.first_seen_at || j.first_seen_at || nowIso,
      last_seen_at: nowIso,
    });
  }

  const mergedJobs = Array.from(mergedMap.values())
    .sort((a, b) => {
      const seenDiff = new Date(b.last_seen_at || 0) - new Date(a.last_seen_at || 0);
      if (seenDiff) return seenDiff;
      return (b._score || 0) - (a._score || 0);
    })
    .slice(0, 120);

  const row = {
    user_id: userId,
    jobs: JSON.stringify(mergedJobs),
    cached_at: nowIso,
    source: isDemand ? 'demand' : 'cron',
    ...(isDemand ? { last_manual_at: nowIso } : {}),
  };
  await fetch(`${SUPABASE_URL}/rest/v1/job_alert_cache`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(row),
  }).catch(e => console.warn('job_alert_cache upsert failed:', e.message));
}

// Re-ranqueia as melhores vagas com Claude Haiku para compatibilidade real (nao
// estimada) - apenas planos pagos. Timeout curto + fallback ao score heuristico:
// se a IA falhar ou demorar, devolve as vagas como estavam (nunca bloqueia o envio).
// Resumo executivo do lote (Pro): 2 frases em PT-BR citando a melhor vaga e o
// porquê. Retorna '' em qualquer falha — o e-mail nunca depende disto.
async function aiProSummary(topJobs, profile, cvHint = '') {
  if (!process.env.ANTHROPIC_API_KEY || !Array.isArray(topJobs) || !topJobs.length) return '';
  const lines = topJobs.map((j, i) =>
    `${i + 1}. ${String(j.title || '').slice(0, 80)} — ${String(j.company || '').slice(0, 40)} (${String(j.location || '').slice(0, 30)})`
  ).join('\n');
  const prompt = `Você é um conselheiro de carreira. Em NO MÁXIMO 2 frases curtas em português (sem markdown, sem emoji, sem saudação), diga ao candidato qual das vagas abaixo é a melhor aposta e por quê, considerando o perfil dele. Seja específico e direto.

PERFIL: ${profile.cargo_desejado || ''} · ${profile.nivel || 'qualquer'} · ${profile.cidade || ''}${cvHint ? `\nCURRÍCULO: ${cvHint}` : ''}

VAGAS DE HOJE:
${lines}`;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        temperature: 0.3,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!resp.ok) return '';
    const data = await resp.json();
    const text = (data.content?.[0]?.text || '').trim();
    // Guarda-chuva: resposta longa demais ou com cara de erro → descarta
    if (!text || text.length > 420) return '';
    return text;
  } catch { return ''; }
}

async function aiRescoreJobs(jobs, profile, cvHint = '') {
  if (!process.env.ANTHROPIC_API_KEY || !Array.isArray(jobs) || jobs.length < 2) return jobs;
  const top = jobs.slice(0, 20);
  // Inclui salário e um trecho da descrição — só título|empresa|local fazia a IA
  // dar score parecido para match forte e vaga genérica de mesmo nome.
  const compact = top.map((j, i) =>
    `${i}. ${String(j.title || '').slice(0, 90)} | ${String(j.company || '').slice(0, 40)} | ${String(j.location || '').slice(0, 40)} | ${String(j.salary || 's/sal').slice(0, 30)} | ${String(j.snippet || j.description || '').replace(/\s+/g, ' ').slice(0, 140)}`
  ).join('\n');
  const formatoStr = Array.isArray(profile.formato) ? profile.formato.join(', ')
    : (profile.formato || 'qualquer');
  const prompt = `Você avalia a compatibilidade de vagas com o perfil de um candidato brasileiro.

PERFIL:
- Cargo desejado: ${profile.cargo_desejado || 'não informado'}
- Senioridade: ${profile.nivel || 'qualquer'}
- Cidade: ${profile.cidade || 'não informada'} · Modalidade preferida: ${formatoStr}
- Competências: ${(Array.isArray(profile.keywords) ? profile.keywords.join(', ') : '') || 'não informadas'}
${profile.salario_min ? `- Salário mínimo desejado: R$ ${profile.salario_min}` : ''}
${cvHint ? `\nCURRÍCULO REAL DO CANDIDATO (use como sinal mais forte que o perfil declarado):\n${cvHint}\n` : ''}
VAGAS (índice. título | empresa | local | salário | trecho da descrição):
${compact}

Para cada vaga dê um score de 0 a 100 de compatibilidade, pesando aderência de cargo/experiência real, senioridade, modalidade e localização. Penalize fortemente (score < 25): estágio/aprendiz quando o perfil não é de estágio; anúncios de freela/bico/orçamento; vaga que declara modalidade incompatível com a preferida (ex.: presencial em outra cidade para quem quer remoto); vagas claramente de outro país sem opção Brasil. Responda APENAS com um array JSON, sem nenhum texto extra, no formato:
[{"i":0,"score":87},{"i":1,"score":42}]`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        temperature: 0,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!resp.ok) { console.warn('aiRescoreJobs: HTTP', resp.status); return jobs; }
    const data = await resp.json();
    const scores = parseAiScores(data.content?.[0]?.text || '');
    if (!scores) return jobs;
    const map = new Map(scores.map(s => [s.i, s.score]));
    const rescoredTop = top.map((j, idx) =>
      map.has(idx) ? { ...j, _score: map.get(idx), _ai_scored: true } : j
    );
    return [...rescoredTop, ...jobs.slice(20)].sort((a, b) => (b._score || 0) - (a._score || 0));
  } catch (e) {
    console.warn('aiRescoreJobs failed, heurística mantida:', e.message);
    return jobs;
  }
}

// Processa alertas para um usuário
// options.skipSideEffects=true → modo teste legado (sem dedup, sem mark sent, sem cache)
// options.isDemand=true → on-demand real (dedup, mark sent, atualiza next_run, salva cache)
// options.deadline=ms → guarda de tempo p/ pular a IA e não estourar o maxDuration
async function processUserAlert(profile, options = {}) {
  const isTest = options.skipSideEffects === true;
  const isDemand = options.isDemand === true;
  const userId = profile.user_id;
  let email = profile.email;
  if (!email) return { skipped: 'no email' };

  // Verifica token antes de qualquer processamento pesado
  // Se UNSUBSCRIBE_SECRET não estiver configurado, aborta para não enviar links inválidos
  if (!UNSUBSCRIBE_SECRET) {
    console.error('processUserAlert: UNSUBSCRIBE_SECRET não configurado — envio abortado para', userId);
    return { skipped: 'unsubscribe_secret_missing' };
  }

  // ── Revalida o plano NO MOMENTO DO ENVIO ────────────────────────────────────
  // Trata downgrade / cancelamento / past_due de forma consistente (lib/entitlements).
  let plan = 'free';
  try {
    const sr = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId}&order=created_at.desc&limit=1&select=plan,status`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const sRows = await sr.json();
    plan = resolvePlan(Array.isArray(sRows) ? sRows[0] : null);
  } catch (e) {
    console.warn('plan lookup failed, defaulting free:', e.message);
    plan = 'free';
  }
  const ent = planEntitlements(plan);
  // Coage a frequência ao permitido pelo plano (ex.: ex-Pro com 'diario' → 'semanal'),
  // sem apagar nem sobrescrever a preferência salva (vale de novo se reassinar).
  const effectiveFreq = coerceFrequency(profile.frequencia || 'semanal', plan);
  const effectiveProfile = { ...profile, frequencia: effectiveFreq };

  // SINE só roda quando o usuário tem formato presencial ou híbrido + cidade definida
  let formatsArr = [];
  if (Array.isArray(profile.formato)) formatsArr = profile.formato.map(f => String(f).toLowerCase());
  else if (typeof profile.formato === 'string') formatsArr = profile.formato.split(',').map(f => f.toLowerCase().trim());
  const hasCidade = profile.cidade && !/remoto|remote/i.test(profile.cidade);
  const querPresencial = formatsArr.some(f => f.includes('presencial') || f.includes('híbrido') || f.includes('hibrido'));
  const runSine = hasCidade && (querPresencial || formatsArr.length === 0);

  const settled = (r) => r && r.status === 'fulfilled' ? (r.value || []) : [];

  // FASE 1 — fontes gratuitas (ATS BR + agregadores sem custo por chamada).
  const [gupy, greenhouse, lever, workday, geekhunter, bne, adzuna, jooble, trampos, talentCom, remotive, empregos, jobbol, sine] = await Promise.allSettled([
    fetchGupyJobs(profile),
    fetchGreenhouseBRJobs(profile),
    fetchLeverBRJobs(profile),
    fetchWorkdayJobs(profile),
    fetchGeekHunterJobs(profile),
    fetchBNEJobs(profile),
    fetchAdzunaJobs(profile),
    fetchJoobleJobs(profile),
    fetchTramposJobs(profile),
    fetchTalentComJobs(profile),
    fetchRemotiveJobs(profile),
    fetchEmpregosComBrJobs(profile),
    fetchJobbolJobs(profile),
    runSine ? fetchSineJobs(profile) : Promise.resolve([]),
  ]);

  const freeJobs = deduplicateJobs([
    ...settled(gupy), ...settled(greenhouse), ...settled(lever),
    ...settled(workday), ...settled(geekhunter), ...settled(bne),
    ...settled(sine), ...settled(empregos), ...settled(jobbol),
    ...settled(trampos), ...settled(adzuna), ...settled(jooble),
    ...settled(talentCom), ...settled(remotive),
  ]);

  // FASE 2 — APIs PAGAS (SerpApi/JSearch) com orçamento de quota:
  // planos pagos sempre recebem; no plano grátis só chamamos quando as fontes
  // gratuitas vieram fracas (< PAID_TOPUP_THRESHOLD). Conserva SerpApi (250/mês)
  // e JSearch (200/mês) sem prejudicar quem paga.
  const PAID_TOPUP_THRESHOLD = 20; // ajustado: +3 fontes gratuitas aumentam o baseline
  const callPaid = (plan !== 'free') || (freeJobs.length < PAID_TOPUP_THRESHOLD);
  let serp = { status: 'fulfilled', value: [] };
  let jsearch = { status: 'fulfilled', value: [] };
  if (callPaid) {
    [serp, jsearch] = await Promise.allSettled([
      fetchSerpApiJobs(profile),
      fetchJSearchJobs(profile),
    ]);
  }

  const sourceCounts = {
    gupy: settled(gupy).length,
    greenhouse: settled(greenhouse).length,
    lever: settled(lever).length,
    workday: settled(workday).length,
    geekhunter: settled(geekhunter).length,
    bne: settled(bne).length,
    serp: settled(serp).length,
    jsearch: settled(jsearch).length,
    adzuna: settled(adzuna).length,
    jooble: settled(jooble).length,
    trampos: settled(trampos).length,
    talentCom: settled(talentCom).length,
    remotive: settled(remotive).length,
    empregos: settled(empregos).length,
    jobbol: settled(jobbol).length,
    sine: settled(sine).length,
  };
  const rawCount = Object.values(sourceCounts).reduce((sum, count) => sum + count, 0);
  let jobs = deduplicateJobs([
    ...settled(gupy),       // ATS brasileiro — vagas nacionais confiáveis
    ...settled(greenhouse), // Greenhouse: Nubank, VTEX, iFood, Mercado Livre
    ...settled(lever),      // Lever: Hotmart, Creditas, QuintoAndar
    ...settled(workday),    // Workday: Ambev, Vale, Embraer, Natura, Bosch
    ...settled(geekhunter), // GeekHunter: tech jobs qualificados
    ...settled(bne),        // BNE: vagas regionais presenciais
    ...settled(serp),       // Google Jobs em PT-BR
    ...settled(jsearch),    // LinkedIn/Indeed/Glassdoor via JSearch
    ...settled(sine),       // SINE estadual — vagas locais presenciais
    ...settled(empregos),   // Empregos.com.br
    ...settled(jobbol),     // Jobbol
    ...settled(trampos),
    ...settled(adzuna),
    ...settled(jooble),
    ...settled(talentCom),
    ...settled(remotive),
  ]);
  const dedupCount = jobs.length;
  console.log(`Sources: gupy=${sourceCounts.gupy} greenhouse=${sourceCounts.greenhouse} lever=${sourceCounts.lever} workday=${sourceCounts.workday} geekhunter=${sourceCounts.geekhunter} bne=${sourceCounts.bne} serp=${sourceCounts.serp} jsearch=${sourceCounts.jsearch} sine=${sourceCounts.sine}(${runSine ? detectUF(profile.cidade)||'?' : 'skip'}) empregos=${sourceCounts.empregos} jobbol=${sourceCounts.jobbol} trampos=${sourceCounts.trampos} adzuna=${sourceCounts.adzuna} jooble=${sourceCounts.jooble} talentCom=${sourceCounts.talentCom} remotive=${sourceCounts.remotive} paid=${callPaid ? 'yes' : 'skip'} → dedup=${jobs.length}`);

  // Remove já enviadas (exceto em modo teste)
  if (!isTest) {
    jobs = await filterSentJobs(userId, jobs);
  }
  const newCount = jobs.length;

  if (!jobs.length) {
    // Mesmo sem vagas, atualizar next_run_at para evitar re-tentativas imediatas
    if (!isTest) {
      const now = new Date();
      const nextRun = calculateNextRun(effectiveProfile, now);
      await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({
          last_run_at: now.toISOString(),
          next_run_at: nextRun ? nextRun.toISOString() : null,
        }),
      }).catch(e => console.warn('next_run_at update (no jobs) failed:', e.message));
    }
    return {
      skipped: rawCount > 0 ? 'no new jobs' : 'sources_empty',
      diagnostics: { sourceCounts, rawCount, dedupCount, newCount, strictCount: 0, relaxedCount: 0 },
    };
  }

  // Normaliza e calcula scores
  jobs = jobs
    .map(j => normalizeJob({ ...j, _score: calcScore(j, profile) }))
    .sort((a, b) => b._score - a._score);

  // Aplica filtros de preferências estendidas (formato, filtros negativos, empresas, setores)
  // applyExtendedFilters já re-ordena por _score após aplicar bônus
  const scoredJobs = jobs;
  jobs = applyExtendedFilters(scoredJobs, profile);
  const strictCount = jobs.length;
  let relaxedMatches = false;

  if (!jobs.length) {
    // Mantém palavras negativas como bloqueio absoluto, mas transforma formato e
    // contrato em preferência quando eles eliminariam 100% das oportunidades.
    jobs = applyExtendedFilters(scoredJobs, profile, { relaxPreferences: true });
    relaxedMatches = jobs.length > 0;
  }

  const relaxedCount = jobs.length;
  if (!jobs.length) {
    if (!isTest) {
      const now = new Date();
      const nextRun = calculateNextRun(effectiveProfile, now);
      await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${userId}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ last_run_at: now.toISOString(), next_run_at: nextRun ? nextRun.toISOString() : null }),
      }).catch(e => console.warn('next_run_at update (no jobs after filters) failed:', e.message));
    }
    return {
      skipped: 'no jobs after filters',
      diagnostics: { sourceCounts, rawCount, dedupCount, newCount, strictCount, relaxedCount },
    };
  }

  // Re-ranking por IA (planos pagos): compatibilidade real via Claude Haiku.
  // Guarda de deadline reserva tempo do maxDuration p/ não derrubar o lote inteiro
  // conforme a base cresce. Em modo teste legado não roda (sem efeitos colaterais).
  const deadline = options.deadline || (Date.now() + 50000);
  let cvHint = '';
  if (!isTest && plan !== 'free' && jobs.length > 1 && Date.now() < deadline - 12000) {
    // CV real da última análise do usuário: sinal muito mais forte que o perfil
    // declarado ("compatibilidade estimada" vira quase score ATS real).
    try {
      const ar = await fetch(
        `${SUPABASE_URL}/rest/v1/analyses?user_id=eq.${userId}&order=created_at.desc&limit=1&select=result`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const arRows = await ar.json();
      const cv = arRows?.[0]?.result?.cv_otimizado;
      if (cv) {
        const skills = Array.isArray(cv.habilidades) ? cv.habilidades.slice(0, 12).join(', ') : '';
        const exps = Array.isArray(cv.experiencias)
          ? cv.experiencias.slice(0, 3).map(e => e && e.cargo).filter(Boolean).join('; ') : '';
        cvHint = [
          cv.titulo_profissional || '',
          exps ? `Experiências: ${exps}` : '',
          skills ? `Skills: ${skills}` : '',
        ].filter(Boolean).join(' | ').slice(0, 400);
      }
    } catch (e) { /* sem CV → re-rank segue só com o perfil */ }
    jobs = await aiRescoreJobs(jobs, profile, cvHint);
  }

  // Volume por plano: free=5, starter=15, pro=sem limite
  const maxJobs = ent.max_jobs_per_delivery ?? jobs.length;
  jobs = jobs.slice(0, maxJobs);

  // Busca email atual e nome do usuário diretamente do auth (evita email desatualizado no perfil)
  let userName = email.split('@')[0];
  try {
    const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
    });
    const ud = await ur.json();
    // Sempre usa o email mais recente do auth, não o gravado no perfil
    if (ud.email) { email = ud.email; userName = email.split('@')[0]; }
    if (ud.user_metadata?.name) userName = ud.user_metadata.name.split(' ')[0];
  } catch(e) {}

  // Resumo executivo por IA no topo do e-mail (exclusivo Pro): 2 frases sobre
  // o lote e a melhor vaga. Fail-open: qualquer falha → e-mail sai sem resumo.
  let proSummary = '';
  if (!isTest && plan === 'pro' && jobs.length >= 2 && Date.now() < deadline - 9000) {
    proSummary = await aiProSummary(jobs.slice(0, 6), profile, cvHint);
  }

  // Envia email (copy e profundidade variam por plano)
  const deliveryProfile = { ...effectiveProfile, _relaxedMatches: relaxedMatches, _proSummary: proSummary };
  const html = buildEmailHTML(deliveryProfile, jobs, userName, userId, plan, ent);
  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'VagaAI Alertas <alertas@vagaai.app.br>',
      to: [email],
      subject: `🎯 ${jobs.length} vaga${jobs.length > 1 ? 's novas' : ' nova'} compatíveis com seu perfil`,
      html,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.text();
    // Falha de e-mail NÃO marca como enviado. Registra a falha no histórico.
    if (!isTest) {
      fetch(`${SUPABASE_URL}/rest/v1/job_alert_history`, {
        method: 'POST',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, sent_at: new Date().toISOString(), jobs_count: 0, status: 'failed', error: String(err).slice(0, 500), diagnostics: { sourceCounts, rawCount, dedupCount, newCount, strictCount, relaxedCount } }),
      }).catch(e => console.warn('job_alert_history (failed) insert failed:', e.message));
    }
    throw new Error(`Resend error: ${err}`);
  }

  // Registra vagas enviadas, atualiza timestamps e grava histórico
  if (!isTest) {
    const now = new Date();
    const nextRun = calculateNextRun(effectiveProfile, now);
    await markJobsSent(userId, jobs);
    await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${userId}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({
        ultimo_envio: now.toISOString(),
        last_run_at: now.toISOString(),
        next_run_at: nextRun ? nextRun.toISOString() : null,
      }),
    });
    // Grava no histórico de envios
    fetch(`${SUPABASE_URL}/rest/v1/job_alert_history`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ user_id: userId, sent_at: now.toISOString(), jobs_count: jobs.length, status: 'sent', diagnostics: { sourceCounts, rawCount, dedupCount, newCount, strictCount, relaxedCount, aiRescored: jobs.some(j => j._ai_scored) || false } }),
    }).catch(e => console.warn('job_alert_history insert failed:', e.message));
    // Atualiza cache do dashboard
    await upsertAlertCache(userId, jobs, { isDemand });
  }

  return {
    sent: true,
    jobs: jobs.length,
    jobsData: jobs.map(j => ({
      title: j.title, company: j.company || j.employer || j.companyName || '',
      location: j.location || '', salary: j.salary || '', link: j.link || '',
      _score: j._score || 0, source: j.source || '',
    })),
    email,
    relaxedMatches,
    diagnostics: { sourceCounts, rawCount, dedupCount, newCount, strictCount, relaxedCount },
  };
}

// Autentica token JWT do usuário e confirma que pertence ao userId informado
async function authenticateUserToken(authHeader, userId) {
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  if (!bearerToken) return { error: 'Token de autenticação obrigatório', status: 401 };
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${bearerToken}` },
  });
  if (!userRes.ok) return { error: 'Token inválido ou expirado', status: 401 };
  const userData = await userRes.json();
  if (!userData?.id || userData.id !== userId) return { error: 'Acesso negado: token não pertence a este usuário', status: 403 };
  return { ok: true };
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';

  // ── POST ?action=dismiss — registra exclusão de vaga com motivo ──────────
  if (req.method === 'POST' && req.query.action === 'dismiss') {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
      return res.status(500).json({ error: 'Supabase não configurado' });
    }
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!bearerToken) return res.status(401).json({ error: 'Token obrigatório' });
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${bearerToken}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Token inválido ou expirado' });
    const userData = await userRes.json();
    const userId = userData?.id;
    if (!userId) return res.status(401).json({ error: 'Usuário não identificado' });
    const { job_link, job_title, job_company, job_location, reason } = req.body || {};
    if (!job_link) return res.status(400).json({ error: 'job_link obrigatório' });
    const hash = jobHash(job_title || '', job_company || '', job_location || '');
    const now = new Date().toISOString();
    const r = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_sent?on_conflict=user_id,job_hash`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        job_hash: hash,
        job_title: (job_title || '').slice(0, 255),
        job_company: (job_company || '').slice(0, 255),
        job_url: (job_link || '').slice(0, 1000),
        sent_at: now,
        dismissed_reason: reason || null,
        dismissed_at: reason ? now : null,
      }),
    });
    if (!r.ok) {
      const err = await r.text();
      console.error('dismiss upsert failed:', err);
      return res.status(500).json({ error: 'Erro ao registrar exclusão' });
    }
    return res.status(200).json({ ok: true, hash });
  }

  const isTest    = req.query.test === '1';
  const isDemand  = req.query.demand === '1';
  const manualUserId = req.query.user_id;  // test ou demand

  if (isTest || isDemand) {
    // Ambos os modos manuais exigem JWT válido do próprio usuário
    if (!manualUserId) {
      return res.status(400).json({ error: 'user_id obrigatório' });
    }
    const auth = await authenticateUserToken(authHeader, manualUserId);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    // Rate limit: on-demand máximo 1x a cada 15 minutos
    if (isDemand) {
      let cacheRes = null;
      try {
        cacheRes = await fetch(
          `${SUPABASE_URL}/rest/v1/job_alert_cache?user_id=eq.${manualUserId}&select=last_manual_at`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
        );
      } catch (e) {
        // Falha ao buscar cache → bloqueia por segurança (evita bypass por indisponibilidade)
        return res.status(429).json({ error: 'rate_limit', wait_minutes: 15 });
      }
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json().catch(() => []);
        const lastManual = cacheData?.[0]?.last_manual_at;
        if (lastManual) {
          const elapsed = Date.now() - new Date(lastManual).getTime();
          if (elapsed < 15 * 60 * 1000) {
            const waitMin = Math.ceil((15 * 60 * 1000 - elapsed) / 60000);
            return res.status(429).json({ error: 'rate_limit', wait_minutes: waitMin });
          }
        }
      }
    }
  } else {
    // ── FIX CRÍTICO 2: cron sem fallback público ─────────────────────────────
    // CRON_SECRET é obrigatório — Vercel injeta automaticamente nas chamadas de cron
    if (!CRON_SECRET) {
      console.error('send-alerts: CRON_SECRET env var não configurada');
      return res.status(500).json({ error: 'CRON_SECRET não configurado' });
    }
    const cronExpected = Buffer.from(`Bearer ${CRON_SECRET}`, 'utf8');
    const cronReceived = Buffer.alloc(cronExpected.length);
    Buffer.from(authHeader || '', 'utf8').copy(cronReceived);
    if ((authHeader || '').length !== cronExpected.length || !crypto.timingSafeEqual(cronExpected, cronReceived)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Missing Supabase config' });
  }
  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Missing RESEND_API_KEY' });
  }

  try {
    let profiles;

    if ((isTest || isDemand) && manualUserId) {
      // Modo manual: só para o usuário autenticado (já validado acima)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${manualUserId}&select=*`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      profiles = await r.json();
      if (!profiles?.length) return res.status(404).json({ error: 'Perfil de alerta não encontrado. Configure o perfil primeiro.' });
    } else {
      // Cron: usuários ativos cujo next_run_at já passou (ou ainda não foi calculado)
      const nowIso = new Date().toISOString();
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/job_alert_profiles?ativo=eq.true&or=(next_run_at.is.null,next_run_at.lte.${encodeURIComponent(nowIso)})&select=*`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      profiles = await r.json();
    }

    // Processa em lotes paralelos para caber no maxDuration do cron.
    // Sequencial (1 por vez) estourava o timeout além de ~1-2 usuários e a maioria
    // ficava sem alerta. Lotes de 5 mantêm o tempo total sob controle conforme a base cresce.
    const results = [];
    const BATCH_SIZE = 5;
    // Deadline global do invocation: reserva ~10s dos 60s de maxDuration para o
    // re-ranking por IA não arriscar estourar o tempo e derrubar lotes seguintes.
    const runDeadline = Date.now() + 50000;
    for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
      const slice = profiles.slice(i, i + BATCH_SIZE);
      const settledBatch = await Promise.allSettled(
        slice.map(p => processUserAlert(p, { skipSideEffects: isTest, isDemand, deadline: runDeadline }))
      );
      settledBatch.forEach((s, idx) => {
        const profile = slice[idx];
        if (s.status === 'fulfilled') {
          const result = s.value || {};
          results.push({ user: profile.user_id, ...result });
          if (result.sent) console.log(`Alert sent: user=${profile.user_id} jobs=${result.jobs || 0}`);
          else console.log(`Alert skipped: user=${profile.user_id} reason=${result.skipped}`);
        } else {
          const msg = s.reason?.message || String(s.reason);
          console.error(`Alert error for ${profile.user_id}:`, msg);
          results.push({ user: profile.user_id, error: msg, sent: false });
        }
      });
    }

    // Modo manual (test ou demand): resposta explícita para o frontend
    if (isTest || isDemand) {
      const r = results[0] || {};
      if (r.sent === true) {
        return res.status(200).json({
          ok: true,
          sent: true,
          jobs: r.jobs,
          jobs_data: r.jobsData || [],
          email: r.email,
          relaxed_matches: r.relaxedMatches === true,
          diagnostics: r.diagnostics,
          results,
        });
      }
      if (r.skipped) {
        const skipMsg = r.skipped === 'sources_empty'
          ? 'As fontes de vagas não responderam com oportunidades agora. Tente novamente em alguns minutos.'
          : r.skipped === 'no new jobs'
          ? 'Todas as vagas encontradas já foram enviadas anteriormente. Novas oportunidades aparecerão no próximo ciclo.'
          : r.skipped === 'no jobs after filters'
          ? 'Encontramos vagas, mas todas foram excluídas pelos filtros negativos configurados.'
          : r.skipped === 'no email'
          ? 'E-mail não encontrado no perfil.'
          : r.skipped;
        return res.status(200).json({
          ok: false,
          sent: false,
          skipped: r.skipped,
          message: skipMsg,
          diagnostics: r.diagnostics,
          results,
        });
      }
      if (r.error) {
        return res.status(200).json({ ok: false, sent: false, error: r.error, results });
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('send-alerts error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// Exports nomeados das funções puras de matching — para testes de unidade.
// O Vercel usa apenas o `export default handler`; estes não afetam o runtime.
export {
  calcScore, applyExtendedFilters, userLevelRank, jobLevelRank, jobMatchesCargo, cargoGateTokens,
  primaryKeyword, cargoSynonymQuery, cargoQueryVariants, _postedAtMs, recencyBonus, parseAiScores,
};
