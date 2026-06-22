// api/generate-cv-pdf.js
// Receives the full CV HTML from the client, renders it with headless Chromium,
// and returns a pixel-perfect A4 PDF — no browser print dialog, ATS-readable text.

import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
      } else if (req.resourceType() === 'document') {
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
