// /api/fetch-job.js
// Extrai texto de uma vaga a partir da URL (para pré-preencher o /app)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const url = req.query.url;
  if (!url) return res.status(400).json({ error: 'URL obrigatória' });

  try {
    const response = await fetch(decodeURIComponent(url), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VagaAI/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();

    // Extrai texto limpo removendo HTML
    const text = html
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
      .slice(0, 8000);

    if (text.length < 100) throw new Error('Conteúdo muito curto');

    return res.status(200).json({ text, length: text.length });
  } catch (err) {
    return res.status(400).json({ error: 'Não foi possível extrair o texto da vaga: ' + err.message });
  }
}
