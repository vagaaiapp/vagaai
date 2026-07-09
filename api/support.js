const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;

async function getUserFromToken(token) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// Escapa texto para uso seguro em HTML (evita injeção no e-mail de suporte)
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Auto-confirmação para o cliente ("recebemos sua mensagem") — fire-and-forget:
// falha aqui nunca derruba o envio principal para o inbox de suporte.
function sendAutoReply(to, isCompanyLead) {
  const subject = isCompanyLead
    ? 'Recebemos seu interesse — VagaAI Hire'
    : 'Recebemos sua mensagem — Suporte VagaAI';
  const intro = isCompanyLead
    ? 'Obrigado pelo interesse no VagaAI Hire! Recebemos os dados da sua empresa e vamos retornar em até <strong>1 dia útil</strong> com os próximos passos.'
    : 'Sua mensagem chegou à nossa equipe de suporte. Respondemos em até <strong>1 dia útil</strong> — normalmente bem antes.';
  fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'VagaAI <ola@vagaai.app.br>',
      to: [to],
      reply_to: 'contato@vagaai.app.br',
      subject,
      html: `<div style="font-family:Inter,sans-serif;max-width:520px;margin:0 auto;background:#0a0f0d;color:#e8ede9;border-radius:12px;overflow:hidden">
  <div style="background:#111814;padding:1.5rem 2rem;border-bottom:1px solid rgba(255,255,255,.07)">
    <div style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#3ecf8e">VagaAI</div>
  </div>
  <div style="padding:2rem">
    <h1 style="font-family:Georgia,serif;font-size:20px;font-weight:700;color:#e8ede9;margin-bottom:.5rem">Mensagem recebida ✅</h1>
    <p style="color:#8a9e90;font-size:14px;line-height:1.7;margin-bottom:1.5rem">${intro}</p>
    <p style="color:#8a9e90;font-size:13px;line-height:1.6">Se precisar acrescentar algo, é só responder este e-mail.</p>
    <p style="color:#4d6e57;font-size:11px;margin-top:1.5rem;text-align:center">VagaAI · <a href="https://vagaai.app.br" style="color:#3ecf8e;text-decoration:none">vagaai.app.br</a></p>
  </div>
</div>`,
    }),
  }).catch((e) => console.error('support auto-reply failed:', e.message));
}

// Rate limit por IP em memória — anti email-bombing do inbox de suporte.
const _ipHits = new Map();
const SUPPORT_LIMIT = 5;            // máx 5 mensagens
const SUPPORT_WINDOW_MS = 60 * 60 * 1000; // por hora
function checkRateLimit(ip) {
  const now = Date.now();
  const entry = _ipHits.get(ip) || { count: 0, resetAt: now + SUPPORT_WINDOW_MS };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + SUPPORT_WINDOW_MS; }
  entry.count++;
  _ipHits.set(ip, entry);
  return entry.count <= SUPPORT_LIMIT;
}

// ── Lead B2B (/paraempresas) ─────────────────────────────────────────────────
async function handleCompanyLead(body, res) {
  const { empresa, site, linkedin, nome, cargo, email, vagas_mes, area } = body;

  if (!empresa || !nome || !cargo || !email) {
    return res.status(400).json({ error: 'Preencha os campos obrigatórios.' });
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  for (const [k, v] of Object.entries({ empresa, site, linkedin, nome, cargo, vagas_mes, area })) {
    if (v != null && (typeof v !== 'string' || v.length > 200)) {
      return res.status(400).json({ error: `Campo inválido: ${k}` });
    }
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Serviço de e-mail não configurado.' });
  }

  const row = (label, value) => value
    ? `<tr><td style="padding:8px 0;font-size:13px;color:#666;width:150px">${label}</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${esc(value)}</td></tr>`
    : '';

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#0a0f0d;padding:20px 28px;border-radius:12px 12px 0 0">
        <span style="font-family:Georgia,serif;font-style:italic;font-size:22px;font-weight:700;color:#3ecf8e">VagaAI</span>
        <span style="font-size:12px;color:#8a9e90;margin-left:10px">Hire — Novo lead</span>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 20px;font-size:18px;color:#0a0f0d">Nova empresa interessada</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          ${row('Empresa', empresa)}
          ${row('Site', site)}
          ${row('LinkedIn', linkedin)}
          ${row('Responsável', nome)}
          ${row('Cargo', cargo)}
          ${row('E-mail', email)}
          ${row('Vagas/mês', vagas_mes)}
          ${row('Área principal', area)}
        </table>
        <p style="margin:20px 0 0;font-size:12px;color:#999">Responda diretamente para este e-mail: ${esc(email)}</p>
      </div>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VagaAI Hire <noreply@vagaai.app.br>',
        to: ['contato@vagaai.app.br'],
        reply_to: email,
        subject: `[Hire] Novo lead — ${empresa}`,
        html,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('Resend error (company-lead):', err);
      return res.status(500).json({ error: 'Erro ao enviar. Tente novamente.' });
    }

    sendAutoReply(email, true);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Company lead handler error:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp = (req.headers['x-real-ip'] || '').trim()
    || (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean).pop()
    || 'unknown';
  if (!checkRateLimit(clientIp)) {
    return res.status(429).json({ error: 'Muitas mensagens. Tente novamente mais tarde.' });
  }

  // Lead B2B do formulário /paraempresas — atendido pelo mesmo endpoint para
  // respeitar o limite de 12 funções serverless do plano Hobby do Vercel.
  if (req.body && req.body.type === 'company-lead') {
    return handleCompanyLead(req.body, res);
  }

  const { email, motivo, mensagem } = req.body || {};

  if (!email || !motivo || !mensagem) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }
  if (typeof email !== 'string' || email.length > 254 || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'E-mail inválido.' });
  }
  if (typeof mensagem !== 'string' || mensagem.trim().length < 10 || mensagem.length > 5000) {
    return res.status(400).json({ error: 'Mensagem inválida.' });
  }
  if (typeof motivo !== 'string' || motivo.length > 50) {
    return res.status(400).json({ error: 'Motivo inválido.' });
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Serviço de e-mail não configurado.' });
  }

  // Autenticação opcional — enriquece o e-mail com dados do usuário
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  let userId = null;
  if (token) {
    const user = await getUserFromToken(token);
    if (user?.id) userId = user.id;
  }

  const motivoLabels = {
    duvida: 'Dúvida',
    problema: 'Problema técnico',
    cobranca: 'Cobrança / Pagamento',
    sugestao: 'Sugestão',
    outro: 'Outro',
  };
  const motivoLabel = motivoLabels[motivo] || motivo;

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;margin:0 auto">
      <div style="background:#0a0f0d;padding:20px 28px;border-radius:12px 12px 0 0">
        <span style="font-family:Georgia,serif;font-style:italic;font-size:22px;font-weight:700;color:#3ecf8e">VagaAI</span>
        <span style="font-size:12px;color:#8a9e90;margin-left:10px">Suporte</span>
      </div>
      <div style="background:#ffffff;padding:28px;border:1px solid #e5e5e5;border-top:none;border-radius:0 0 12px 12px">
        <h2 style="margin:0 0 20px;font-size:18px;color:#0a0f0d">Nova mensagem de suporte</h2>
        <table style="width:100%;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:8px 0;font-size:13px;color:#666;width:130px">De</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${esc(email)}</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:#666">Motivo</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${esc(motivoLabel)}</td></tr>
          ${userId ? `<tr><td style="padding:8px 0;font-size:13px;color:#666">User ID</td><td style="padding:8px 0;font-size:13px;color:#888;font-family:monospace">${esc(userId)}</td></tr>` : ''}
        </table>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">${esc(mensagem)}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#999">Responda diretamente para este e-mail: ${esc(email)}</p>
      </div>
    </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'VagaAI Suporte <noreply@vagaai.app.br>',
        to: ['contato@vagaai.app.br'],
        reply_to: email,
        subject: `[Suporte] ${motivoLabel} — ${email}`,
        html,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Erro ao enviar. Tente novamente.' });
    }

    sendAutoReply(email, false);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Support handler error:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
