export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { cv, job } = req.body || {};

  if (!cv || !job) {
    return res.status(400).json({ error: 'CV e descrição da vaga são obrigatórios.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'Chave de API não configurada.' });
  }

  const prompt = `Você é um especialista em recrutamento e sistemas ATS (Applicant Tracking System). Analise a compatibilidade entre o currículo e a vaga abaixo.

VAGA:
${job}

CURRÍCULO:
${cv}

Responda APENAS com um JSON válido, sem texto adicional, no seguinte formato:
{
  "score": <número de 0 a 100>,
  "nivel": "<Fraco|Regular|Bom|Excelente>",
  "resumo": "<uma frase resumindo a análise>",
  "falhas": [
    "<principal problema 1>",
    "<principal problema 2>",
    "<principal problema 3>"
  ],
  "sugestoes": [
    "<sugestão de melhoria 1>",
    "<sugestão de melhoria 2>",
    "<sugestão de melhoria 3>"
  ],
  "keywords_encontradas": ["<keyword1>", "<keyword2>"],
  "keywords_faltando": ["<keyword1>", "<keyword2>"],
  "fatores": {
    "compatibilidade": <0-100>,
    "keywords_ats": <0-100>,
    "legibilidade": <0-100>,
    "forca_bullets": <0-100>
  }
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', err);
      return res.status(500).json({ error: 'Erro ao chamar a API de análise.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Resposta inválida da IA.' });
    }

    const result = JSON.parse(jsonMatch[0]);
    return res.status(200).json(result);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
