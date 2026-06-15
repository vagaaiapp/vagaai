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

function jobHash(title, company, location) {
  return crypto.createHash('md5')
    .update((title + company + location).toLowerCase())
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
  'indeed', 'vagas_com', 'infojobs', 'catho', 'empregos_br',
  'trampos', 'bne', 'monster_br', 'glassdoor', 'jora',
  'talent_com', 'sine', 'adzuna',
]);

// Regex de palavras comuns em PT-BR para detectar idioma
const PT_BR_PATTERN = /\b(vaga|empresa|cargo|área|experiência|conhecimento|gestão|análise|desenvolvimento|requisitos|benefícios|você|para|com|são|ção|ões|remuneração|contratação|oportunidade|atuação|salário|remoto|híbrido|presencial)\b/i;

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

  const filtered = jobs.filter(job => {
    const title = (job.title || '').toLowerCase();
    const desc = (job.snippet || job.description || '').toLowerCase();
    const company = (job.company || '').toLowerCase();
    const combined = title + ' ' + desc + ' ' + company;
    const combinedNorm = combined.normalize('NFD').replace(/[̀-ͯ]/g, '');

    // Exclui vagas com palavras/filtros negativos
    if (allNeg.length && allNeg.some(neg => combinedNorm.includes(neg))) return false;

    // Exclui vagas claramente em idioma estrangeiro (não-PT/não-EN) — ruído p/ alerta BR.
    // Vale nos dois passes (estrito e relaxado): idioma não é "preferência", é relevância.
    if (looksForeignLang(job)) return false;

    // Filtra por formato(s) preferido(s) — só quando a vaga menciona modalidade explicitamente
    if (!relaxPreferences && formatos.length > 0) {
      const mentionsAnyMode = /remoto|remote|home.?office|h[ií]brido|presencial|hybrid|on.?site/i.test(combined);
      if (mentionsAnyMode) {
        const matches = formatos.some(fmt => {
          const tokens = fmtMap[fmt] || [fmt];
          return tokens.some(t => combined.includes(t));
        });
        if (!matches) return false;
      }
      // Se a vaga não menciona modalidade, não exclui (evita over-filtering)
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

  // Keywords no título ou descrição
  keywords.forEach(kw => {
    const k = kw.toLowerCase();
    if (title.includes(k)) score += 15;
    else if (desc.includes(k)) score += 8;
  });

  // Nível
  const nivelMap = { junior: ['júnior','junior','jr','entry'], pleno: ['pleno','mid','pl'], senior: ['sênior','senior','sr','lead'] };
  if (nivel && nivelMap[nivel]) {
    nivelMap[nivel].forEach(n => { if (title.includes(n) || desc.includes(n)) score += 20; });
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

  // Penalidade: salário em dólar sem nenhum sinal BR → vaga claramente de mercado externo
  const sal = String(job.salary || '');
  const hasUsdSalary = /\$|USD/.test(sal) && !/R\$|BRL/.test(sal);
  if (hasUsdSalary && !isPtBr && !isBrSource) score -= 20;

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

// ── FONTE 2: INDEED BR RSS ────────────────────────────────────────────────────
async function fetchIndeedJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const loc = isRemoto ? 'Brasil' : profile.cidade;
    const url = `https://br.indeed.com/jobs?q=${cargo}&l=${encodeURIComponent(loc)}&format=rss&sort=date&limit=20`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSSItems(xml).map(item => {
      const parsed = splitTitleCompany(item.title);
      return {
        title: parsed.title,
        company: item.company || parsed.company || 'Empresa',
        location: loc,
        snippet: item.description,
        salary: '',
        link: item.link,
        _source: 'indeed',
      };
    });
  } catch(e) {
    console.warn('fetchIndeedJobs error:', e.message);
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
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const attempts = [
      { what: exact, where: isRemoto ? '' : profile.cidade },
      { what: exact, where: '' },
    ];
    if (broad && broad !== exact.toLowerCase()) attempts.push({ what: broad, where: '' });

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
    const query = encodeURIComponent((profile.cargo_desejado || '') + ' vagas');
    const loc = (!profile.cidade || profile.cidade.toLowerCase().includes('remoto'))
      ? 'Brazil' : encodeURIComponent(profile.cidade + ', Brazil');
    const url = `https://serpapi.com/search.json?engine=google_jobs&q=${query}&location=${loc}&hl=pt&gl=br&api_key=${SERPAPI_KEY}&num=20`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
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

// ── FONTE 6: EMPREGOS.COM.BR RSS ─────────────────────────────────────────────
async function fetchEmpregosBRJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const cidade = isRemoto ? '' : encodeURIComponent(profile.cidade);
    // Tenta dois formatos de URL conhecidos
    const urls = [
      `https://www.empregos.com.br/vagas/busca.rss?q=${cargo}&onde=${cidade}`,
      `https://www.empregos.com.br/rss/vagas/?q=${cargo}&l=${cidade}`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const xml = await res.text();
        const items = parseRSSItems(xml);
        if (!items.length) continue;
        return items.map(item => {
          const parsed = splitTitleCompany(item.title);
          return {
            title: parsed.title,
            company: item.company || parsed.company || 'Empresa',
            location: profile.cidade || 'Brasil',
            snippet: item.description,
            salary: '',
            link: item.link,
            _source: 'empregos_br',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchEmpregosBRJobs error:', e.message);
    return [];
  }
}

// ── FONTE 7: TRABALHA BRASIL / SINE (API pública do governo) ─────────────────
async function fetchTrabalhaBrasilJobs(profile) {
  try {
    const cargo = (profile.cargo_desejado || '').toLowerCase();
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');

    // Monta query para o portal SINE (empregabrasil.mte.gov.br)
    // Endpoint público de busca de vagas
    const params = new URLSearchParams({
      descricaoVaga: cargo,
      tipoDeficiencia: 'N',
      pagina: '1',
      quantidade: '20',
    });
    if (!isRemoto && profile.cidade) {
      params.set('municipio', profile.cidade);
    }

    const url = `https://servicospublicos.empregabrasil.mte.gov.br/sine/vaga/buscaVagasAtivas?${params}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();

    // O SINE retorna { vagas: [...] } ou { content: [...] } dependendo da versão
    const list = data.vagas || data.content || data.results || data || [];
    if (!Array.isArray(list)) return [];

    return list.map(v => ({
      title: v.descricaoVaga || v.titulo || v.cargo || v.nomeVaga || 'Vaga',
      company: v.nomeEmpresa || v.empresa || v.razaoSocial || 'Empresa',
      location: v.municipio || v.cidade || v.localidade || profile.cidade || 'Brasil',
      snippet: v.descricaoAtividades || v.descricao || v.atividades || '',
      salary: v.salario || v.remuneracao || '',
      link: v.url || `https://www.empregabrasil.mte.gov.br/vagas/${v.id || ''}`,
      _source: 'sine',
    }));
  } catch(e) {
    console.warn('fetchTrabalhaBrasilJobs error:', e.message);
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

// ── FONTE 10: REMOTE OK (API pública, sem chave) ──────────────────────────────
async function fetchRemoteOkJobs(profile) {
  try {
    if (!wantsRemote(profile)) return []; // Remote OK só tem vagas remotas
    const tag = encodeURIComponent((profile.cargo_desejado || '').toLowerCase().replace(/\s+/g, '-'));
    // Tenta busca com tag específica, fallback para lista geral
    const urls = [
      `https://remoteok.com/api?tag=${tag}`,
      `https://remoteok.com/api`,
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/json' },
          signal: AbortSignal.timeout(5000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        // Remote OK retorna array onde primeiro item é metadata — pular
        const jobs = Array.isArray(data) ? data.filter(j => j && j.id && j.position) : [];
        if (!jobs.length) continue;
        const cargo = (profile.cargo_desejado || '').toLowerCase();
        // Filtra por relevância mínima
        const filtered = jobs.filter(j => {
          const pos = (j.position || '').toLowerCase();
          const tags = (j.tags || []).join(' ').toLowerCase();
          return cargo.split(/\s+/).some(w => w.length > 3 && (pos.includes(w) || tags.includes(w)));
        }).slice(0, 15);
        return (filtered.length ? filtered : jobs.slice(1, 11)).map(j => ({
          title: j.position || 'Vaga',
          company: j.company || 'Empresa',
          location: 'Remoto',
          snippet: (j.description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
          salary: j.salary || '',
          link: j.url || `https://remoteok.com/remote-jobs/${j.id}`,
          _source: 'remoteok',
        }));
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchRemoteOkJobs error:', e.message);
    return [];
  }
}

// ── FONTE 11: ARBEITNOW (API pública, sem chave) ──────────────────────────────
async function fetchArbeitnowJobs(profile) {
  try {
    if (!wantsRemote(profile)) return []; // Arbeitnow foca em vagas remotas/internacionais
    const search = encodeURIComponent(profile.cargo_desejado || '');
    const url = `https://www.arbeitnow.com/api/job-board-api?search=${search}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = data.data || [];
    const cargo = (profile.cargo_desejado || '').toLowerCase();
    // Filtra por relevância
    return jobs.filter(j => {
      const title = (j.title || '').toLowerCase();
      const desc = (j.description || '').toLowerCase();
      return cargo.split(/\s+/).some(w => w.length > 3 && (title.includes(w) || desc.includes(w)));
    }).slice(0, 10).map(j => ({
      title: j.title || 'Vaga',
      company: j.company_name || 'Empresa',
      location: j.location || 'Remoto',
      snippet: (j.description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
      salary: '',
      link: j.url || '',
      _source: 'arbeitnow',
    }));
  } catch(e) {
    console.warn('fetchArbeitnowJobs error:', e.message);
    return [];
  }
}

// ── FONTE 12: THE MUSE (API pública, sem chave) ────────────────────────────────
// Categorias verificadas da API atual do The Muse (jun/2026). Os nomes antigos
// ('Marketing and PR', 'Software Engineer', 'Data Science', 'Product', 'Finance',
// 'Human Resources') foram renomeados e passaram a retornar 0 — atualizado abaixo.
const MUSE_CATEGORY_MAP = {
  'marketing': 'Advertising and Marketing', 'growth': 'Advertising and Marketing', 'seo': 'Advertising and Marketing',
  'design': 'Design and UX', 'ux': 'Design and UX', 'ui': 'Design and UX',
  'developer': 'Software Engineering', 'desenvolvedor': 'Software Engineering',
  'engenheiro': 'Software Engineering', 'frontend': 'Software Engineering',
  'backend': 'Software Engineering', 'fullstack': 'Software Engineering',
  'dados': 'Data and Analytics', 'data': 'Data and Analytics', 'analytics': 'Data and Analytics',
  'vendas': 'Sales', 'comercial': 'Sales',
  'rh': 'Human Resources and Recruitment', 'pessoas': 'Human Resources and Recruitment',
  'produto': 'Product Management', 'product': 'Product Management',
  'financeiro': 'Accounting and Finance', 'contab': 'Accounting and Finance',
  'customer': 'Customer Service', 'suporte': 'Customer Service',
};
function museCategoryFromCargo(cargo) {
  const lower = (cargo || '').toLowerCase();
  for (const [k, v] of Object.entries(MUSE_CATEGORY_MAP)) {
    if (lower.includes(k)) return v;
  }
  return null;
}
async function fetchTheMuseJobs(profile) {
  try {
    const cat = museCategoryFromCargo(profile.cargo_desejado);
    if (!cat) return []; // Só busca quando consegue mapear categoria
    const catParam = encodeURIComponent(cat);
    // The Muse tem filtro de "flexible" (remoto) e "all" (presencial+remoto)
    const location = wantsRemote(profile) ? '&location=Flexible%20%2F%20Remote' : '';
    const url = `https://www.themuse.com/api/public/jobs?category=${catParam}${location}&page=1&descending=true`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)', Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results = data.results || [];
    return results.slice(0, 12).map(j => ({
      title: j.name || 'Vaga',
      company: j.company?.name || 'Empresa',
      location: (j.locations?.[0]?.name) || 'Remoto',
      snippet: (j.contents || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
      salary: '',
      link: j.refs?.landing_page || '',
      _source: 'themuse',
    }));
  } catch(e) {
    console.warn('fetchTheMuseJobs error:', e.message);
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

// ── FONTE 14: MONSTER BRASIL RSS ─────────────────────────────────────────────
async function fetchMonsterBRJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const loc = isRemoto ? 'brasil' : encodeURIComponent(profile.cidade);
    const urls = [
      `https://www.monster.com.br/jobs/search/?q=${cargo}&where=${loc}&format=rss`,
      `https://www.monster.com.br/jobs/search/?q=${cargo}&format=rss`,
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
            _source: 'monster_br',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchMonsterBRJobs error:', e.message);
    return [];
  }
}

// ── FONTE 15: GLASSDOOR BR RSS ────────────────────────────────────────────────
async function fetchGlassdoorBRJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const loc = isRemoto ? 'Brasil' : encodeURIComponent(profile.cidade);
    const urls = [
      `https://www.glassdoor.com.br/Vagas/${loc}-vagas-SRCH_IL.0,${loc.length}_IS_KO${loc.length+1},${loc.length+1+(profile.cargo_desejado||'').length}.htm?format=rss`,
      `https://www.glassdoor.com.br/Job/jobs.htm?suggestCount=0&suggestChosen=false&clickSource=searchBtn&typedKeyword=${cargo}&locT=N&format=rss`,
      `https://www.glassdoor.com/Job/jobs.htm?suggestCount=0&suggestChosen=false&typedKeyword=${cargo}&locT=N&locId=178&format=rss`, // Brasil locId=178
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
        return items.slice(0, 12).map(item => {
          const parsed = splitTitleCompany(item.title);
          return {
            title: parsed.title,
            company: item.company || parsed.company || 'Empresa',
            location: profile.cidade || 'Brasil',
            snippet: item.description,
            salary: '',
            link: item.link,
            _source: 'glassdoor',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchGlassdoorBRJobs error:', e.message);
    return [];
  }
}

// ── FONTE 16: BNE (bne.com.br) ───────────────────────────────────────────────
async function fetchBNEJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const cidade = isRemoto ? '' : encodeURIComponent(profile.cidade);
    const urls = [
      `https://www.bne.com.br/vagas-de-emprego/${encodeURIComponent((profile.cargo_desejado||'').toLowerCase().replace(/\s+/g,'-'))}.rss`,
      `https://www.bne.com.br/vagas-de-emprego.rss?q=${cargo}&l=${cidade}`,
      `https://www.bne.com.br/rss/vagas?q=${cargo}`,
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
        return items.slice(0, 12).map(item => {
          const parsed = splitTitleCompany(item.title);
          return {
            title: parsed.title,
            company: item.company || parsed.company || 'Empresa',
            location: profile.cidade || 'Brasil',
            snippet: item.description,
            salary: '',
            link: item.link,
            _source: 'bne',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchBNEJobs error:', e.message);
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

// ── FONTE 18: JORA BRASIL RSS ─────────────────────────────────────────────────
async function fetchJoraJobs(profile) {
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const loc = isRemoto ? '' : encodeURIComponent(profile.cidade);
    const urls = [
      `https://br.jora.com/jobs?q=${cargo}&l=${loc}&format=rss`,
      `https://br.jora.com/jobs/rss?q=${cargo}&l=${loc}`,
      `https://br.jora.com/jobs?q=${cargo}&format=rss`,
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
            _source: 'jora',
          };
        });
      } catch(e) { continue; }
    }
    return [];
  } catch(e) {
    console.warn('fetchJoraJobs error:', e.message);
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
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const location = isRemoto ? 'Brazil' : `${profile.cidade}, Brazil`;
    const attempts = [
      { query: `${cargo} in ${location}`, date: 'month' },
      { query: `${cargo} in Brazil`, date: 'month' },
    ];
    if (broad && broad !== cargo.toLowerCase()) attempts.push({ query: `${broad} in Brazil`, date: 'month' });

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
function deduplicateJobs(jobs) {
  const seen = new Set();
  return jobs.filter(j => {
    const key = jobHash(j.title, j.company, j.location);
    if (seen.has(key)) return false;
    seen.add(key);
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
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/job_alert_sent?user_id=eq.${userId}&sent_at=gte.${encodeURIComponent(sinceIso)}&job_hash=in.(${hashes.join(',')})&select=job_hash`,
    { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
  );
  const sent = await res.json();
  const sentSet = new Set((sent || []).map(s => s.job_hash));
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
          <a href="${analyzeUrl}" style="display:inline-block;background:#1a8f5c;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:6px;text-decoration:none">${ctaLabel}</a>
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
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// Salva as vagas do último envio no cache (dashboard lê daqui, sem nova busca às APIs)
async function upsertAlertCache(userId, jobs, { isDemand = false } = {}) {
  const row = {
    user_id: userId,
    jobs: JSON.stringify(jobs.map(j => ({
      title: j.title, company: j.company || j.employer || j.companyName || '',
      location: j.location || '', salary: j.salary || '', link: j.link || '',
      _score: j._score || 0, source: j.source || '',
    }))),
    cached_at: new Date().toISOString(),
    source: isDemand ? 'demand' : 'cron',
    ...(isDemand ? { last_manual_at: new Date().toISOString() } : {}),
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

// Processa alertas para um usuário
// options.skipSideEffects=true → modo teste legado (sem dedup, sem mark sent, sem cache)
// options.isDemand=true → on-demand real (dedup, mark sent, atualiza next_run, salva cache)
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

  // Busca vagas de todas as fontes em paralelo
  const [jooble, indeed, remotive, adzuna, serp, empregos, sine, vagasCom, infojobs, remoteok, arbeitnow, themuse, trampos, monster, glassdoor, bne, catho, jora, talentCom, jsearch] = await Promise.allSettled([
    fetchJoobleJobs(profile),
    fetchIndeedJobs(profile),
    fetchRemotiveJobs(profile),
    fetchAdzunaJobs(profile),
    fetchSerpApiJobs(profile),
    fetchEmpregosBRJobs(profile),
    fetchTrabalhaBrasilJobs(profile),
    fetchVagasComJobs(profile),
    fetchInfoJobsJobs(profile),
    fetchRemoteOkJobs(profile),
    fetchArbeitnowJobs(profile),
    fetchTheMuseJobs(profile),
    fetchTramposJobs(profile),
    fetchMonsterBRJobs(profile),
    fetchGlassdoorBRJobs(profile),
    fetchBNEJobs(profile),
    fetchCathoJobs(profile),
    fetchJoraJobs(profile),
    fetchTalentComJobs(profile),
    fetchJSearchJobs(profile),
  ]);
  const settled = (r) => r.status === 'fulfilled' ? (r.value || []) : [];
  const sourceCounts = {
    jsearch: settled(jsearch).length,
    adzuna: settled(adzuna).length,
    jooble: settled(jooble).length,
    indeed: settled(indeed).length,
    empregos: settled(empregos).length,
    sine: settled(sine).length,
    vagasCom: settled(vagasCom).length,
    infojobs: settled(infojobs).length,
    trampos: settled(trampos).length,
    monster: settled(monster).length,
    glassdoor: settled(glassdoor).length,
    bne: settled(bne).length,
    catho: settled(catho).length,
    jora: settled(jora).length,
    talentCom: settled(talentCom).length,
    remoteok: settled(remoteok).length,
    remotive: settled(remotive).length,
    arbeitnow: settled(arbeitnow).length,
    themuse: settled(themuse).length,
    serp: settled(serp).length,
  };
  const rawCount = Object.values(sourceCounts).reduce((sum, count) => sum + count, 0);
  let jobs = deduplicateJobs([
    ...settled(jsearch),  // JSearch primeiro — maior qualidade (LinkedIn/Indeed/Glassdoor)
    ...settled(jooble),
    ...settled(indeed),
    ...settled(remotive),
    ...settled(adzuna),
    ...settled(serp),
    ...settled(empregos),
    ...settled(sine),
    ...settled(vagasCom),
    ...settled(infojobs),
    ...settled(remoteok),
    ...settled(arbeitnow),
    ...settled(themuse),
    ...settled(trampos),
    ...settled(monster),
    ...settled(glassdoor),
    ...settled(bne),
    ...settled(catho),
    ...settled(jora),
    ...settled(talentCom),
  ]);
  const dedupCount = jobs.length;
  console.log(`Sources: jsearch=${settled(jsearch).length} jooble=${settled(jooble).length} indeed=${settled(indeed).length} adzuna=${settled(adzuna).length} empregos=${settled(empregos).length} sine=${settled(sine).length} vagasCom=${settled(vagasCom).length} infojobs=${settled(infojobs).length} trampos=${settled(trampos).length} monster=${settled(monster).length} glassdoor=${settled(glassdoor).length} bne=${settled(bne).length} catho=${settled(catho).length} jora=${settled(jora).length} talentCom=${settled(talentCom).length} remoteok=${settled(remoteok).length} remotive=${settled(remotive).length} arbeitnow=${settled(arbeitnow).length} themuse=${settled(themuse).length} → dedup=${jobs.length}`);

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

  // Volume por plano: free=5, starter=15, pro=30
  jobs = jobs.slice(0, ent.max_jobs_per_delivery);

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

  // Envia email (copy e profundidade variam por plano)
  const deliveryProfile = { ...effectiveProfile, _relaxedMatches: relaxedMatches };
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
        body: JSON.stringify({ user_id: userId, sent_at: new Date().toISOString(), jobs_count: 0, status: 'failed', error: String(err).slice(0, 500) }),
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
      body: JSON.stringify({ user_id: userId, sent_at: now.toISOString(), jobs_count: jobs.length, status: 'sent' }),
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

    // Rate limit: on-demand máximo 1x por hora
    if (isDemand) {
      const cacheRes = await fetch(
        `${SUPABASE_URL}/rest/v1/job_alert_cache?user_id=eq.${manualUserId}&select=last_manual_at`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      ).catch(() => null);
      if (cacheRes?.ok) {
        const cacheData = await cacheRes.json().catch(() => []);
        const lastManual = cacheData?.[0]?.last_manual_at;
        if (lastManual) {
          const elapsed = Date.now() - new Date(lastManual).getTime();
          if (elapsed < 60 * 60 * 1000) {
            const waitMin = Math.ceil((60 * 60 * 1000 - elapsed) / 60000);
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

    const results = [];
    for (const profile of profiles) {
      try {
        const result = await processUserAlert(profile, { skipSideEffects: isTest, isDemand });
        results.push({ user: profile.user_id, ...result });
        if (result.sent) console.log(`Alert sent: user=${profile.user_id} jobs=${result.jobs || 0}`);
        else console.log(`Alert skipped: user=${profile.user_id} reason=${result.skipped}`);
      } catch (e) {
        console.error(`Alert error for ${profile.user_id}:`, e.message);
        results.push({ user: profile.user_id, error: e.message, sent: false });
      }
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

