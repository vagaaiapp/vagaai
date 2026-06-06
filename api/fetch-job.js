// /api/fetch-job.js
// Extrai texto de uma vaga a partir da URL usando múltiplas estratégias:
// 1. Jina AI Reader (r.jina.ai) — renderiza JS, funciona na maioria dos job boards
// 2. Fetch direto com parser HTML — fallback para sites simples

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  const decoded = decodeURIComponent(url);

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
      const raw = await jinaRes.text();
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
    });

    if (!directRes.ok) throw new Error(`HTTP ${directRes.status}`);
    const html = await directRes.text();
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
