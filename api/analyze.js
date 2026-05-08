const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// ─── Rate limit por IP (usuários anônimos) ────────────────────────────────────

async function checkRateLimit(ip) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return { allowed: true };
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/ip_rate_limits?ip=eq.${encodeURIComponent(ip)}&select=count`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const rows = await res.json();
    if (rows.length > 0) return { allowed: false };
    return { allowed: true };
  } catch (err) {
    console.error('Rate limit check error:', err);
    return { allowed: true }; // fail-open
  }
}

async function recordIpUsage(ip) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/ip_rate_limits`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({ ip, count: 1, last_seen: new Date().toISOString() }),
    });
  } catch (err) {
    console.error('Record IP usage error:', err);
  }
}

// ─── Créditos (usuários autenticados) ────────────────────────────────────────

async function getUserFromToken(token) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function checkAndDeductCredit(userId) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return { ok: false, reason: 'config' };
  try {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await getRes.json();
    if (!rows.length || rows[0].credits <= 0) return { ok: false, reason: 'no_credits' };
    const current = rows[0].credits;
    const patchRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ credits: current - 1, updated_at: new Date().toISOString() }),
      }
    );
    if (!patchRes.ok) return { ok: false, reason: 'patch_failed' };
    return { ok: true, remaining: current - 1 };
  } catch (err) {
    console.error('checkAndDeductCredit error:', err);
    return { ok: false, reason: 'error' };
  }
}

async function saveAnalysis(userId, score, nivel, jobExcerpt, result) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/analyses`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        score: score || 0,
        nivel: nivel || '',
        job_excerpt: (jobExcerpt || '').substring(0, 200),
        result: result,
        created_at: new Date().toISOString(),
      }),
    });
  } catch (err) {
    console.error('saveAnalysis error:', err);
  }
}

// ─── Handler principal ────────────────────────────────────────────────────────

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

  // Tenta autenticar via Bearer token Supabase
  const authHeader = req.headers['authorization'] || '';
  const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  let authenticatedUserId = null;

  if (bearerToken) {
    const user = await getUserFromToken(bearerToken);
    if (user && user.id) authenticatedUserId = user.id;
  }

  // Verifica limite / créditos
  let _ip = null;
  if (authenticatedUserId) {
    const deduct = await checkAndDeductCredit(authenticatedUserId);
    if (!deduct.ok) {
      if (deduct.reason === 'no_credits') {
        return res.status(402).json({ error: 'sem_creditos' });
      }
      // Infra falhou: fail-open para não bloquear usuário pagante
      console.warn('Credit deduction failed:', deduct.reason, '— fail-open');
    }
  } else {
    _ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.headers['x-real-ip']
      || 'unknown';
    const { allowed } = await checkRateLimit(_ip);
    if (!allowed) {
      return res.status(429).json({ error: 'limite_atingido' });
    }
  }

  const prompt = `Você é um especialista em recrutamento e sistemas ATS (Applicant Tracking System). Analise a compatibilidade entre o currículo e a vaga abaixo e gere uma versão otimizada do currículo.

VAGA:
${job}

CURRÍCULO:
${cv}

Responda APENAS com um JSON válido, sem texto adicional, no seguinte formato:
{
  "job_info": {
    "empresa": "<nome da empresa contratante. Se não identificada ou anônima, use 'Empresa anônima'>",
    "cargo": "<título exato do cargo/vaga>",
    "salario": "<faixa salarial se mencionada, senão 'Não informado'>",
    "beneficios": ["<benefício 1>", "<benefício 2>", "<benefício 3>"]
  },
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
  },
  "cv_otimizado": {
    "nome": "<nome completo extraído do currículo>",
    "titulo_profissional": "<cargo atual ou objetivo profissional, otimizado para a vaga>",
    "contato": {
      "email": "<email se disponível, senão string vazia>",
      "telefone": "<telefone se disponível, senão string vazia>",
      "linkedin": "<URL do LinkedIn se disponível, senão string vazia>",
      "cidade": "<cidade e estado se disponível, senão string vazia>"
    },
    "resumo_profissional": "<3 a 5 linhas de resumo profissional otimizado para ATS, incorporando naturalmente as principais keywords da vaga sem forçar>",
    "experiencias": [
      {
        "cargo": "<cargo>",
        "empresa": "<empresa>",
        "periodo": "<período ex: Jan 2020 – Dez 2022>",
        "bullets": [
          "<bullet otimizado: verbo de ação + resultado mensurável + keyword relevante da vaga>",
          "<bullet 2>",
          "<bullet 3>"
        ]
      }
    ],
    "formacao": [
      {
        "curso": "<nome do curso>",
        "instituicao": "<nome da instituição>",
        "periodo": "<ano de conclusão ou período>"
      }
    ],
    "habilidades": ["<skill técnica 1>", "<skill 2>", "<keyword da vaga incorporada naturalmente>"]
  },
  "briefing_empresa": {
    "o_que_valorizam": [
      "<valor ou característica cultural inferida da vaga>",
      "<outro valor percebido>"
    ],
    "buscam_em_candidatos": [
      "<qualidade implícita que a empresa busca, além dos requisitos técnicos>",
      "<outra qualidade percebida>"
    ],
    "pontos_para_entrevista": [
      "<ponto concreto para mencionar na entrevista alinhado com a vaga>",
      "<outro ponto de destaque>",
      "<terceiro ponto>"
    ],
    "perguntas_para_fazer": [
      "<pergunta inteligente que demonstra interesse genuíno>",
      "<outra pergunta estratégica>"
    ],
    "pontos_de_atencao": [
      "<sinal de atenção ou ambiguidade percebida na descrição da vaga>"
    ]
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
        model: 'claude-haiku-4-5',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error status:', response.status);
      console.error('Anthropic error body:', errText);
      let userMsg = 'Erro ao chamar a API de análise.';
      try {
        const errJson = JSON.parse(errText);
        const type = errJson?.error?.type || '';
        if (type === 'authentication_error') userMsg = 'Chave de API inválida. Verifique a configuração.';
        else if (type === 'overloaded_error') userMsg = 'Serviço temporariamente sobrecarregado. Tente em alguns segundos.';
        else if (type === 'rate_limit_error') userMsg = 'Limite de uso atingido. Tente novamente em instantes.';
      } catch (_) {}
      return res.status(500).json({ error: userMsg });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: 'Resposta inválida da IA.' });
    }

    const result = JSON.parse(jsonMatch[0]);

    // Pós-análise
    if (authenticatedUserId) {
      saveAnalysis(authenticatedUserId, result.score, result.nivel, job, result);
      // Devolve créditos restantes ao cliente para atualizar o contador
      try {
        const credRows = await fetch(
          `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(authenticatedUserId)}&select=credits`,
          { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
        ).then(r => r.json());
        result._credits_remaining = credRows[0]?.credits ?? null;
      } catch (_) {}
    } else {
      await recordIpUsage(_ip);
    }

    return res.status(200).json(result);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
