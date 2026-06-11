// /api/fetch-job.js
// Extrai texto de uma vaga a partir da URL usando múltiplas estratégias:
// 1. Jina AI Reader (r.jina.ai) — renderiza JS, funciona na maioria dos job boards
// 2. Fetch direto com parser HTML — fallback para sites simples

const MAX_RESPONSE_BYTES = 512 * 1024; // 512 KB

// ── SSRF protection ───────────────────────────────────────────────────────────

function isBlockedHost(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ''); // strip IPv6 brackets

  if (h === '' || h === 'localhost') return true;
  if (h === '::1' || h === '0:0:0:0:0:0:0:1' || h === '0000:0000:0000:0000:0000:0000:0000:0001') return true;

  // Cloud metadata / link-local special hosts
  const blocked = [
    '169.254.169.254',     // AWS / Azure / GCP metadata
    'metadata.google.internal',
    'instance-data',
    'metadata.internal',
    '100.100.100.200',     // Alibaba metadata
  ];
  if (blocked.includes(h)) return true;

  // IPv4 private / reserved ranges
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b, c, d] = [+m[1], +m[2], +m[3], +m[4]];
    if (a === 0) return true;                               // 0.0.0.0/8
    if (a === 10) return true;                              // 10.0.0.0/8
    if (a === 127) return true;                             // 127.0.0.0/8 loopback
    if (a === 100 && b >= 64 && b <= 127) return true;     // 100.64.0.0/10 shared
    if (a === 169 && b === 254) return true;                // 169.254.0.0/16 link-local
    if (a === 172 && b >= 16 && b <= 31) return true;      // 172.16.0.0/12 private
    if (a === 192 && b === 0 && c === 2) return true;      // 192.0.2.0/24 TEST-NET
    if (a === 192 && b === 168) return true;               // 192.168.0.0/16 private
    if (a === 198 && b >= 18 && b <= 19) return true;      // 198.18.0.0/15 benchmark
    if (a === 203 && b === 0 && c === 113) return true;    // 203.0.113.0/24 TEST-NET-3
    if (a === 240) return true;                             // 240.0.0.0/4 reserved
    if (a === 255 && b === 255 && c === 255 && d === 255) return true; // broadcast
  }
  return false;
}

function validateJobUrl(raw) {
  let parsed;
  try { parsed = new URL(raw); } catch { return { ok: false, reason: 'URL inválida' }; }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, reason: 'Protocolo não permitido' };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, reason: 'Destino não permitido' };
  }
  return { ok: true };
}

// ── Handler ────────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const decoded = decodeURIComponent(url);

  const validation = validateJobUrl(decoded);
  if (!validation.ok) return res.status(400).json({ error: validation.reason });

  // ── Estratégia 1: Jina AI Reader ─────────────────────────────────────────────
  // Converte qualquer página em texto limpo, inclusive sites com JS rendering
  try {
    const jinaRes = await fetch('https://r.jina.ai/' + decoded, {
      headers: {
        'Accept': 'text/plain',
        'X-Return-Format': 'text',
        'User-Agent': 'VagaAI/1.0',
      },
      signal: AbortSignal.timeout(12000),
    });

    if (jinaRes.ok) {
      // Limita tamanho da resposta
      const reader = jinaRes.body.getReader();
      const chunks = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > MAX_RESPONSE_BYTES) { reader.cancel(); break; }
        chunks.push(value);
      }
      const raw = new TextDecoder().decode(Buffer.concat(chunks.map(c => Buffer.from(c))));
      const text = cleanText(raw, 8000);
      if (text.length >= 80) {
        return res.status(200).json({ text, length: text.length, source: 'jina' });
      }
    }
  } catch (e) {
    console.warn('Jina fetch failed:', e.message);
  }

  // ── Estratégia 2: Fetch direto com parser HTML ────────────────────────────────
  try {
    const directRes = await fetch(decoded, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
      // Não seguir redirecionamentos para IPs privados
      redirect: 'follow',
    });

    if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);

    // Validate final URL after redirects
    const finalUrl = directRes.url || decoded;
    const finalValidation = validateJobUrl(finalUrl);
    if (!finalValidation.ok) throw new Error('Redirecionamento para destino não permitido');

    // Limita tamanho da resposta
    const reader2 = directRes.body.getReader();
    const chunks2 = [];
    let totalBytes2 = 0;
    while (true) {
      const { done, value } = await reader2.read();
      if (done) break;
      totalBytes2 += value.byteLength;
      if (totalBytes2 > MAX_RESPONSE_BYTES) { reader2.cancel(); break; }
      chunks2.push(value);
    }
    const html = new TextDecoder().decode(Buffer.concat(chunks2.map(c => Buffer.from(c))));
    const text = htmlToText(html, 8000);
    if (text.length >= 80) {
      return res.status(200).json({ text, length: text.length, source: 'direct' });
    }
    throw new Error('Conteúdo muito curto');
  } catch (e) {
    console.warn('Direct fetch failed:', e.message);
  }

  return res.status(400).json({ error: 'Não foi possível extrair o texto da vaga.' });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function cleanText(text, maxLen) {
  return text
    .replace(/\s{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}
