// /api/send-alerts.js
// Cron job: busca vagas (múltiplas fontes), calcula compatibilidade, envia emails
// Roda toda sexta às 8h via vercel.json cron
// Também pode ser chamado manualmente com ?test=1

import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const JOOBLE_API_KEY = process.env.JOOBLE_API_KEY;       // jooble.org/api
const ADZUNA_APP_ID = process.env.ADZUNA_APP_ID;         // developer.adzuna.com
const ADZUNA_APP_KEY = process.env.ADZUNA_APP_KEY;       // developer.adzuna.com
const SERPAPI_KEY = process.env.SERPAPI_KEY;             // serpapi.com
const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY;     // rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch
const CRON_SECRET = process.env.CRON_SECRET;

function jobHash(title, company, location) {
  return crypto.createHash('md5')
    .update((title + company + location).toLowerCase())
    .digest('hex').slice(0, 16);
}

// Fontes brasileiras — ganham boost de prioridade no score
const BR_SOURCES = new Set([
  'indeed', 'vagas_com', 'infojobs', 'catho', 'empregos_br',
  'trampos', 'bne', 'monster_br', 'glassdoor', 'jora',
  'talent_com', 'sine', 'adzuna',
]);

// Regex de palavras comuns em PT-BR para detectar idioma
const PT_BR_PATTERN = /\b(vaga|empresa|cargo|área|experiência|conhecimento|gestão|análise|desenvolvimento|requisitos|benefícios|você|para|com|são|ção|ões|remuneração|contratação|oportunidade|atuação|salário|remoto|híbrido|presencial)\b/i;

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

  // ── Boost BR: fonte brasileira +10, idioma português +8 ──────────────────
  if (BR_SOURCES.has(job._source)) score += 10;
  if (PT_BR_PATTERN.test(title) || PT_BR_PATTERN.test(desc)) score += 8;

  return Math.min(100, score);
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
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    if (!isRemoto) return []; // Remotive só faz sentido para vagas remotas
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
  if (!ADZUNA_APP_ID || !ADZUNA_APP_KEY) return [];
  try {
    const cargo = encodeURIComponent(profile.cargo_desejado || '');
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const where = isRemoto ? '' : `&where=${encodeURIComponent(profile.cidade)}`;
    const url = `https://api.adzuna.com/v1/api/jobs/br/search/1?app_id=${ADZUNA_APP_ID}&app_key=${ADZUNA_APP_KEY}&what=${cargo}${where}&results_per_page=20&content-type=application/json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(j => ({
      title: j.title || 'Vaga',
      company: j.company?.display_name || 'Empresa',
      location: j.location?.display_name || profile.cidade || 'Brasil',
      snippet: (j.description || '').replace(/<[^>]+>/g, ' ').trim().slice(0, 400),
      salary: j.salary_min ? `R$ ${Math.round(j.salary_min).toLocaleString('pt-BR')}` : '',
      link: j.redirect_url || '',
      _source: 'adzuna',
    }));
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
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    if (!isRemoto) return []; // Remote OK só tem vagas remotas
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
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    if (!isRemoto) return []; // Arbeitnow foca em vagas remotas/internacionais
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
const MUSE_CATEGORY_MAP = {
  'marketing': 'Marketing and PR', 'growth': 'Marketing and PR', 'seo': 'Marketing and PR',
  'design': 'Design and UX', 'ux': 'Design and UX', 'ui': 'Design and UX',
  'developer': 'Software Engineer', 'desenvolvedor': 'Software Engineer',
  'engenheiro': 'Software Engineer', 'frontend': 'Software Engineer',
  'backend': 'Software Engineer', 'fullstack': 'Software Engineer',
  'dados': 'Data Science', 'data': 'Data Science', 'analytics': 'Data Science',
  'vendas': 'Sales', 'comercial': 'Sales',
  'rh': 'Human Resources', 'pessoas': 'Human Resources',
  'produto': 'Product', 'product': 'Product',
  'financeiro': 'Finance', 'contab': 'Finance',
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
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const cat = museCategoryFromCargo(profile.cargo_desejado);
    if (!cat) return []; // Só busca quando consegue mapear categoria
    const catParam = encodeURIComponent(cat);
    // The Muse tem filtro de "flexible" (remoto) e "all" (presencial+remoto)
    const location = isRemoto ? '&location=Flexible%20%2F%20Remote' : '';
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
  if (!JSEARCH_API_KEY) return [];
  try {
    const cargo = profile.cargo_desejado || '';
    const isRemoto = !profile.cidade || profile.cidade.toLowerCase().includes('remoto');
    const location = isRemoto ? 'Brazil' : `${profile.cidade}, Brazil`;
    const query = encodeURIComponent(`${cargo} ${location}`);
    const url = `https://jsearch.p.rapidapi.com/search?query=${query}&country=br&num_pages=1&page=1&date_posted=month`;
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': JSEARCH_API_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const jobs = data.data || [];
    return jobs.slice(0, 20).map(j => {
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
    });
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

function calculateNextRun(profile, fromDate = new Date()) {
  const frequencia = profile.frequencia || 'semanal';
  const diaEnvio = typeof profile.dia_envio === 'number' ? profile.dia_envio : 5; // default sexta
  const horario = profile.horario_envio || '08:00';
  const [hh = 8, mm = 0] = horario.split(':').map(Number);

  const next = new Date(fromDate);
  next.setSeconds(0, 0);
  next.setHours(hh, mm, 0, 0);

  if (frequencia === 'diario') {
    if (next <= fromDate) next.setDate(next.getDate() + 1);
    return next;
  }

  if (frequencia === 'semanal') {
    const currentDay = next.getDay();
    let daysUntil = (diaEnvio - currentDay + 7) % 7;
    if (daysUntil === 0 && next <= fromDate) daysUntil = 7;
    next.setDate(next.getDate() + daysUntil);
    return next;
  }

  if (frequencia === 'quinzenal') {
    // Usa ultimo_envio como base; fallback: 14 dias a partir de agora
    const base = profile.ultimo_envio ? new Date(profile.ultimo_envio) : fromDate;
    const candidate = new Date(base);
    candidate.setDate(candidate.getDate() + 14);
    candidate.setHours(hh, mm, 0, 0);
    return candidate > fromDate ? candidate : new Date(fromDate.getTime() + 14 * 86400000);
  }

  if (frequencia === 'mensal') {
    const candidate = new Date(next);
    candidate.setMonth(candidate.getMonth() + 1);
    candidate.setDate(1);
    candidate.setHours(hh, mm, 0, 0);
    return candidate;
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
async function filterSentJobs(userId, jobs) {
  if (!jobs.length) return [];
  const hashes = jobs.map(j => jobHash(j.title, j.company, j.location));
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/job_alert_sent?user_id=eq.${userId}&job_hash=in.(${hashes.join(',')})&select=job_hash`,
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
function buildEmailHTML(profile, jobs, userName) {
  const name = userName || 'você';
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
          <div style="font-size:11px;color:#888;margin-bottom:6px">📍 ${escEmail(j.location || 'Brasil')}${j.salary ? ' · 💰 ' + escEmail(j.salary) : ''}</div>
          <div style="font-size:11px;color:#f0a500;margin-bottom:6px">${starsFromScore(j._score)} <span style="color:#888">${compatLabel(j._score)}</span></div>
          <a href="${analyzeUrl}" style="display:inline-block;background:#1a8f5c;color:#fff;font-size:12px;font-weight:700;padding:6px 14px;border-radius:6px;text-decoration:none">⚡ Analisar essa vaga →</a>
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
      Encontramos <strong>${jobs.length} vaga${jobs.length > 1 ? 's novas' : ' nova'}</strong> compatíveis com seu perfil de
      <strong>${escEmail(profile.cargo_desejado)}</strong>${profile.cidade ? ' em <strong>' + escEmail(profile.cidade) + '</strong>' : ''}.
      Clique em "Analisar" para ver o score ATS real do seu currículo antes de candidatar.
    </div>
    ${jobsHTML}
    <div style="border-top:1px solid #eee;margin-top:20px;padding-top:16px;text-align:center;font-size:12px;color:#aaa;line-height:1.8">
      Compatibilidades acima são <em>estimadas</em>. O score real aparece após analisar.<br>
      <a href="https://www.vagaai.app.br/dashboard" style="color:#1a8f5c;text-decoration:none;font-weight:600">Gerenciar alertas</a>
      &nbsp;·&nbsp;
      <a href="https://www.vagaai.app.br/dashboard" style="color:#aaa;text-decoration:none">Cancelar inscrição</a>
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

// Processa alertas para um usuário
async function processUserAlert(profile, isTest = false) {
  const userId = profile.user_id;
  let email = profile.email;
  if (!email) return { skipped: 'no email' };

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
  console.log(`Sources: jsearch=${settled(jsearch).length} jooble=${settled(jooble).length} indeed=${settled(indeed).length} adzuna=${settled(adzuna).length} empregos=${settled(empregos).length} sine=${settled(sine).length} vagasCom=${settled(vagasCom).length} infojobs=${settled(infojobs).length} trampos=${settled(trampos).length} monster=${settled(monster).length} glassdoor=${settled(glassdoor).length} bne=${settled(bne).length} catho=${settled(catho).length} jora=${settled(jora).length} talentCom=${settled(talentCom).length} remoteok=${settled(remoteok).length} remotive=${settled(remotive).length} arbeitnow=${settled(arbeitnow).length} themuse=${settled(themuse).length} → dedup=${jobs.length}`);

  // Remove já enviadas (exceto em modo teste)
  if (!isTest) {
    jobs = await filterSentJobs(userId, jobs);
  }

  if (!jobs.length) return { skipped: 'no new jobs' };

  // Normaliza e calcula scores
  jobs = jobs
    .map(j => normalizeJob({ ...j, _score: calcScore(j, profile) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, 8);

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

  // Envia email
  const html = buildEmailHTML(profile, jobs, userName);
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
    throw new Error(`Resend error: ${err}`);
  }

  // Registra vagas enviadas, atualiza timestamps e grava histórico
  if (!isTest) {
    const now = new Date();
    const nextRun = calculateNextRun(profile, now);
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
  }

  return { sent: true, jobs: jobs.length, email };
}

export default async function handler(req, res) {
  // Segurança: verifica Authorization ou secret
  const authHeader = req.headers.authorization || '';
  const isTest = req.query.test === '1';
  const testUserId = req.query.user_id;

  if (isTest) {
    // ── FIX CRÍTICO 1: modo teste exige token válido do próprio usuário ──────
    // Impede que qualquer pessoa dispare alertas para user_ids alheios
    if (!testUserId) {
      return res.status(400).json({ error: 'user_id obrigatório no modo teste' });
    }
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    if (!bearerToken) {
      return res.status(401).json({ error: 'Token de autenticação obrigatório' });
    }
    // Valida token e confirma que pertence ao testUserId informado
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${bearerToken}` },
    });
    if (!userRes.ok) {
      return res.status(401).json({ error: 'Token inválido ou expirado' });
    }
    const userData = await userRes.json();
    if (!userData?.id || userData.id !== testUserId) {
      return res.status(403).json({ error: 'Acesso negado: token não pertence a este usuário' });
    }
  } else {
    // ── FIX CRÍTICO 2: cron sem fallback público ─────────────────────────────
    // CRON_SECRET é obrigatório — Vercel injeta automaticamente nas chamadas de cron
    if (!CRON_SECRET) {
      console.error('send-alerts: CRON_SECRET env var não configurada');
      return res.status(500).json({ error: 'CRON_SECRET não configurado' });
    }
    if (authHeader !== `Bearer ${CRON_SECRET}`) {
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

    if (isTest && testUserId) {
      // Modo teste: só para o usuário autenticado (já validado acima)
      const r = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${testUserId}&select=*`, {
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
        const result = await processUserAlert(profile, isTest);
        results.push({ user: profile.user_id, ...result });
        console.log(`Alert sent: user=${profile.user_id} jobs=${result.jobs || 0}`);
      } catch (e) {
        console.error(`Alert error for ${profile.user_id}:`, e.message);
        results.push({ user: profile.user_id, error: e.message });
      }
    }

    return res.status(200).json({ ok: true, processed: results.length, results });
  } catch (err) {
    console.error('send-alerts error:', err);
    return res.status(500).json({ error: err.message });
  }
}
