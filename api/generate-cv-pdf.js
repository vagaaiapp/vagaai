// api/generate-cv-pdf.js
// Receives the full CV HTML from the client, renders it with headless Chromium,
// and returns a pixel-perfect A4 PDF — no browser print dialog, ATS-readable text.

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { checkAndCountLimit } from '../lib/ratelimit.js';

export const config = { maxDuration: 30 };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function getUserFromToken(token) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// Rate limit por usuário — evita abuso do Chromium headless, que é o mais caro
// em compute de todo o projeto. Persistente (lib/ratelimit.js): o Map em
// memória valia por instância serverless, então o teto real era o configurado
// vezes o número de instâncias quentes, e zerava a cada cold start.
const PDF_USER_LIMIT = 15;                 // máx 15 PDFs/hora por usuário
const PDF_USER_WINDOW_MS = 60 * 60 * 1000;
async function checkUserRateLimit(userId) {
  return checkAndCountLimit({ key: `u:${userId}:pdf`, limit: PDF_USER_LIMIT, windowMs: PDF_USER_WINDOW_MS });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Autenticação obrigatória — o endpoint roda Chromium headless (caro), então
  // não pode ser invocado anonimamente.
  const token = (req.headers['authorization'] || '').startsWith('Bearer ')
    ? req.headers['authorization'].slice(7).trim() : null;
  if (!token) return res.status(401).json({ error: 'Autenticação necessária.' });
  const user = await getUserFromToken(token);
  if (!user?.id) return res.status(401).json({ error: 'Token inválido. Faça login novamente.' });
  if (!(await checkUserRateLimit(user.id))) {
    return res.status(429).json({ error: 'Limite de geração de PDF atingido. Aguarde antes de tentar novamente.' });
  }

  let html, filename;
  try {
    ({ html, filename } = req.body);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  if (!html || typeof html !== 'string' || html.length > 4_000_000) {
    return res.status(400).json({ error: 'Missing or oversized html' });
  }

  filename = (filename || 'Currículo').replace(/[/\\:*?"<>|]/g, '').trim() || 'Currículo';

  let browser;
  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    // Block external network requests to keep latency low; fonts are inlined via
    // the Google Fonts @import already embedded in the HTML styles.
    await page.setRequestInterception(true);
    page.on('request', req => {
      const url = req.url();
      if (url.startsWith('data:') || url.startsWith('about:') || url.includes('fonts.googleapis') || url.includes('fonts.gstatic')) {
        req.continue();
      } else if (req.resourceType() === 'document' && req.frame() === page.mainFrame()) {
        // Só o documento principal. Subframe também é resourceType 'document':
        // liberar todos deixava um <iframe src="http://169.254.169.254/..."> no
        // HTML enviado pelo cliente buscar endereço interno e devolver o
        // conteúdo renderizado dentro do PDF.
        req.continue();
      } else {
        req.abort();
      }
    });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 20_000 });

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: false,
    });

    await browser.close();
    browser = null;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}.pdf`);
    res.setHeader('Content-Length', pdf.length);
    return res.status(200).send(Buffer.from(pdf));
  } catch (err) {
    if (browser) try { await browser.close(); } catch (_) {}
    console.error('[generate-cv-pdf] error:', err);
    return res.status(500).json({ error: 'PDF generation failed', detail: err.message });
  }
}
