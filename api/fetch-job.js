// /api/fetch-job.js
// Extrai texto de uma vaga a partir da URL.
//
// SSRF: dns.lookup(all:true) resolve todos os IPs antes de qualquer conexão,
// rejeita IPs privados/reservados/loopback/metadata, usa redirect:manual,
// valida cada salto antes de seguir. Sem DNS rebinding: o lookup ocorre por
// requisição, não só na validação inicial.

import { lookup as dnsLookup } from 'dns';
import { promisify } from 'util';

const lookupAll = promisify((hostname, opts, cb) => dnsLookup(hostname, opts, cb));

const MAX_RESPONSE_BYTES = 512 * 1024;
const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 10000;
const MAX_CONTENT_TYPE_LEN = 256;

// ── SSRF: bloqueio de IPs ─────────────────────────────────────────────────────

function isPrivateIPv4(a, b, c, d) {
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 0 && c === 2) return true;
  if (a === 192 && b === 168) return true;
  if (a === 198 && b >= 18 && b <= 19) return true;
  if (a === 203 && b === 0 && c === 113) return true;
  if (a === 224) return true;  // multicast 224.0.0.0/4
  if (a === 240) return true;  // reserved
  if (a === 255 && b === 255 && c === 255 && d === 255) return true;
  return false;
}

function isBlockedIPString(ip) {
  const h = (ip || '').toLowerCase().replace(/^\[|\]$/g, '').trim();
  if (!h) return true;

  // Loopback / link-local / private IPv6
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fe80:')) return true;  // link-local
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // ULA
  if (h.startsWith('ff')) return true;  // multicast
  // IPv4-mapped in IPv6: ::ffff:127.0.0.1 or ::ffff:7f00:1
  const v4mapped = h.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (v4mapped) {
    const parts = v4mapped[1].split('.').map(Number);
    if (parts.length === 4) return isPrivateIPv4(...parts);
  }
  // IPv4-in-IPv6 hex form: ::ffff:7f00:0001
  const v4hex = h.match(/^::ffff:([0-9a-f]{4}):([0-9a-f]{4})$/i);
  if (v4hex) {
    const hi = parseInt(v4hex[1], 16), lo = parseInt(v4hex[2], 16);
    return isPrivateIPv4((hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff);
  }

  const BLOCKED_LITERAL = [
    'localhost',
    '169.254.169.254',     // AWS metadata
    '100.100.100.200',     // Alibaba metadata
    'metadata.google.internal',
    'instance-data',
    'metadata.internal',
  ];
  if (BLOCKED_LITERAL.includes(h)) return true;

  // Decimal-encoded IPv4: 2130706433 = 127.0.0.1
  if (/^\d{8,10}$/.test(h)) {
    const n = parseInt(h, 10);
    return isPrivateIPv4((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  // Hex-encoded: 0x7f000001
  if (/^0x[0-9a-f]+$/i.test(h)) {
    const n = parseInt(h, 16);
    return isPrivateIPv4((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  }
  // Octal: 0177.0.0.1
  if (/^0\d+/.test(h)) {
    try {
      const parts = h.split('.').map(p => parseInt(p, 8));
      if (parts.length === 4 && parts.every(p => !isNaN(p))) return isPrivateIPv4(...parts);
    } catch {}
  }

  // Dotted IPv4
  const m4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m4) return isPrivateIPv4(+m4[1], +m4[2], +m4[3], +m4[4]);

  return false;
}

function validateUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return { ok: false, reason: 'URL inválida' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: 'Protocolo não permitido' };
  }
  if (isBlockedIPString(parsed.hostname)) {
    return { ok: false, reason: 'Destino não permitido' };
  }
  return { ok: true, parsed };
}

// dns.lookup com all:true para evitar DNS rebinding:
// resolve TODOS os IPs do hostname e rejeita se qualquer um for privado.
async function resolveDnsAndValidate(hostname) {
  // Rejeita IPs literais blocklist (hostname pode já ser um IP)
  if (isBlockedIPString(hostname)) {
    return { ok: false, reason: 'Destino não permitido' };
  }
  try {
    const entries = await lookupAll(hostname, { all: true, verbatim: true });
    if (!entries || entries.length === 0) {
      return { ok: false, reason: 'DNS sem resposta' };
    }
    for (const entry of entries) {
      if (isBlockedIPString(entry.address)) {
        return { ok: false, reason: 'Destino não permitido' };
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'DNS sem resposta' };
  }
}

// Fetch com redirect:manual, validação de cada salto e DNS re-resolve por salto
async function safeFetch(url, headers, timeoutMs = FETCH_TIMEOUT_MS) {
  let currentUrl = url;
  let redirectCount = 0;

  while (redirectCount <= MAX_REDIRECTS) {
    const urlCheck = validateUrl(currentUrl);
    if (!urlCheck.ok) throw new Error(urlCheck.reason);

    // Re-resolve DNS a cada salto para evitar DNS rebinding entre saltos
    const dnsCheck = await resolveDnsAndValidate(urlCheck.parsed.hostname);
    if (!dnsCheck.ok) throw new Error(dnsCheck.reason);

    const fetchRes = await fetch(currentUrl, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });

    // Segue redirecionamentos 3xx
    if (fetchRes.status >= 300 && fetchRes.status < 400) {
      const location = fetchRes.headers.get('location');
      if (!location) throw new Error('Redirecionamento sem Location');

      const nextUrl = new URL(location, currentUrl).href;

      // Bloqueia downgrade HTTPS → HTTP
      if (currentUrl.startsWith('https://') && nextUrl.startsWith('http://')) {
        throw new Error('Redirecionamento HTTPS→HTTP bloqueado');
      }
      // Bloqueia protocolos não HTTP/HTTPS no destino
      if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
        throw new Error('Protocolo de redirecionamento não permitido');
      }

      redirectCount++;
      if (redirectCount > MAX_REDIRECTS) throw new Error('Redirecionamentos excessivos');
      currentUrl = nextUrl;
      continue;
    }

    return fetchRes;
  }
  throw new Error('Redirecionamentos excessivos');
}

// ── Rate limit por IP (em memória) ────────────────────────────────────────────
const _ipHits = new Map();
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;

function checkRateLimit(ip) {
  const now = Date.now();
  const entry = _ipHits.get(ip) || { count: 0, resetAt: now + RATE_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + RATE_WINDOW_MS; }
  entry.count++;
  _ipHits.set(ip, entry);
  return entry.count <= RATE_LIMIT;
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  // Sem CORS: o app chama este endpoint same-origin. Um header '*' aqui só
  // serviria para sites de terceiros usarem o scraper como proxy gratuito.
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Prefere x-real-ip (definido pela Vercel, não spoofável) e, na ausência, o
  // ÚLTIMO salto do x-forwarded-for. O 1º item do XFF é forjável pelo cliente —
  // usá-lo permitiria burlar o rate-limit (mesma lógica do analyze.js).
  const clientIp = (req.headers['x-real-ip'] || '').trim()
    || (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop()
    || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em um minuto.' });
  }

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const decoded = decodeURIComponent(url);

  // Validação inicial (protocolo + hostname blacklist literal)
  const initialCheck = validateUrl(decoded);
  if (!initialCheck.ok) return res.status(400).json({ error: 'URL não permitida' });

  // DNS pre-resolution (não expõe detalhes ao cliente)
  const dnsCheck = await resolveDnsAndValidate(initialCheck.parsed.hostname);
  if (!dnsCheck.ok) return res.status(400).json({ error: 'URL não permitida' });

    // ── Estratégia 1: Jina AI Reader ─────────────────────────────────────────────
  try {
    const jinaUrl = 'https://r.jina.ai/' + decoded;
    const jinaRes = await safeFetch(jinaUrl, {
      'Accept': 'text/plain',
      'X-Return-Format': 'text',
      'User-Agent': 'VagaAI/1.0',
    }, 12000);

    if (jinaRes.ok) {
      const ct = (jinaRes.headers.get('content-type') || '').slice(0, MAX_CONTENT_TYPE_LEN);
      if (!ct.includes('text/') && !ct.includes('application/json') && ct !== '') {
        throw new Error('Content-Type inesperado: ' + ct);
      }
      const raw = await readBodyLimited(jinaRes);
      const text = cleanText(raw, 8000);
      if (text.length >= 300 && isJobContent(text)) {
        return res.status(200).json({ text, length: text.length, source: 'jina' });
      }
      console.warn('Jina returned boilerplate or short content:', text.length, 'chars');
    }
  } catch (e) {
    console.warn('Jina fetch failed:', e.message);
  }

  // ── Estratégia 2: Fetch direto ────────────────────────────────────────────────
  try {
    const directRes = await safeFetch(decoded, {
      'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)',
      'Accept': 'text/html,application/xhtml+xml',
    }, 8000);

    if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);

    const ct = (directRes.headers.get('content-type') || '').slice(0, MAX_CONTENT_TYPE_LEN);
    if (ct && !ct.includes('text/') && !ct.includes('application/xhtml')) {
      throw new Error('Content-Type não suportado: ' + ct);
    }

    const html = await readBodyLimited(directRes);
    const text = htmlToText(html, 8000);
    if (text.length >= 300 && isJobContent(text)) {
      return res.status(200).json({ text, length: text.length, source: 'direct' });
    }
    throw new Error('Conteúdo muito curto ou boilerplate');
  } catch (e) {
    console.warn('Direct fetch failed:', e.message);
  }

  // ── Nenhuma estratégia funcionou: plataforma bloqueia scraping ────────────────
  return res.status(422).json({
    error: 'scraping_blocked',
    message: 'Não foi possível ler o conteúdo desta vaga automaticamente. Cole o texto da descrição manualmente.'
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function readBodyLimited(fetchRes) {
  const reader = fetchRes.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > MAX_RESPONSE_BYTES) { reader.cancel(); break; }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
}

function htmlToText(html, maxLen) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, maxLen);
}

// Frases de boilerplate de sites de vagas que não fazem parte da descrição real
const BOILERPLATE_PATTERNS = [
  // Catho
  /ela ser[aá] analisada em breve por nossa equipe/i,
  /obrigado por contribuir para uma catho/i,
  /contribuir para uma catho cada vez mais segura/i,
  /denuncie esta vaga/i,
  /reportar problema/i,
  // LinkedIn
  /linkedin.*não.*divulgar/i,
  /ao clicar em.*concordo/i,
  /inscreva-se com um clique/i,
  /candidatura simplificada/i,
  // Indeed
  /indeed pode ser compensado/i,
  /encontre empregos/i,
  // Gerais
  /javascript (está|esta) desativado/i,
  /ative o javascript/i,
  /esta página usa cookies/i,
  /aceitar cookies/i,
  /política de privacidade/i,
  /termos de uso/i,
  /compartilhe esta vaga/i,
  /salvar vaga/i,
  /candidatar-?se agora/i,
  /ver mais vagas/i,
  /vagas similares/i,
  /enviar currículo/i,
];

function cleanText(text, maxLen) {
  const lines = text.replace(/\s{3,}/g, '\n\n').trim().split('\n');
  const filtered = lines.filter(line => {
    const trimmed = line.trim();
    if (!trimmed) return true; // mantém linhas vazias para espaçamento
    return !BOILERPLATE_PATTERNS.some(p => p.test(trimmed));
  });
  return filtered.join('\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, maxLen);
}

// Detecta se o texto é conteúdo real de vaga ou boilerplate de navegação.
// Plataformas como Indeed bloqueiam scraping e retornam nav/login pages.
function isJobContent(text) {
  const lower = text.toLowerCase();

  // Sinais fortes de bloqueio: 1 hit já é suficiente para rejeitar
  const hardBlockSignals = [
    'tráfego incomum', 'trafego incomum', 'não é um robô', 'nao e um robo',
    'sistemas detectaram', 'captcha', 'recaptcha', 'not a robot',
    'prove you are human', 'unusual traffic', 'automated requests',
    'i am not a robot', 'por que isso aconteceu', 'esta página verifica',
    'cloudflare', 'checking your browser', 'ddos protection', 'one more step',
    'your connection', 'ray id', 'attention required',
  ];
  if (hardBlockSignals.some(s => lower.includes(s))) return false;

  // Sinais leves de navegação/bloqueio: se 2+ presentes, é boilerplate
  const navSignals = [
    'ir para o conteúdo principal', 'ajuda sobre acessibilidade', 'fazer login',
    'sign in to', 'enable javascript', 'please enable', 'javascript is required',
    'cookies required', 'your browser does not', 'access denied', 'robot check',
    'são necessários cookies', 'verificação de segurança',
  ];
  const navHits = navSignals.filter(s => lower.includes(s)).length;
  if (navHits >= 2) return false;

  // Sinais de conteúdo de vaga: precisa de pelo menos 1 para validar
  const jobSignals = [
    'requisitos', 'responsabilidades', 'benefícios', 'qualificações',
    'experiência', 'salário', 'contrato', 'vaga', 'empresa', 'cargo',
    'requirements', 'responsibilities', 'benefits', 'qualifications',
    'experience', 'salary', 'job description', 'we are looking',
    'você irá', 'você vai', 'o candidato', 'perfil desejado',
    'sobre a vaga', 'sobre a empresa', 'o que buscamos',
  ];
  const hasJobContent = jobSignals.some(s => lower.includes(s));
  return hasJobContent;
}
