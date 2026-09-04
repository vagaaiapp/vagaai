import { checkAndCountLimit } from '../lib/ratelimit.js';
import { anonymousKeys } from '../lib/abuse.js';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

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
    ? 'Recebemos seu interesse no VagaAI Hire'
    : 'Recebemos sua mensagem | Suporte VagaAI';
  const intro = isCompanyLead
    ? 'Obrigado pelo interesse no VagaAI Hire! Recebemos os dados da sua empresa e vamos retornar em até <strong>1 dia útil</strong> com os próximos passos.'
    : 'Sua mensagem chegou à nossa equipe de suporte. Respondemos em até <strong>1 dia útil</strong>, normalmente bem antes.';
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

// ── Rate limit por IP ─────────────────────────────────────────────────────────
// Persistente (lib/ratelimit.js, tabela ip_rate_limits). O Map em memória
// anterior valia por instância serverless: com N instâncias quentes o limite
// real era N vezes o configurado, e zerava a cada cold start. cover-letter.js e
// interview.js já tinham migrado; estes ficaram para trás.
// Anti email-bombing do inbox de suporte: um Map por instância significava que
// o teto de 5/hora era, na prática, 5 por instância quente.
const SUPPORT_LIMIT = 5;                  // máx 5 mensagens
const SUPPORT_WINDOW_MS = 60 * 60 * 1000; // por hora
async function checkRateLimit(key) {
  return checkAndCountLimit({ key, limit: SUPPORT_LIMIT, windowMs: SUPPORT_WINDOW_MS });
}

async function createSupportTicket(payload) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return null;
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/support_tickets`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(payload),
    });
    const rows = await response.json().catch(() => []);
    if (!response.ok || !Array.isArray(rows) || !rows[0]) {
      console.error('support ticket persistence failed:', response.status);
      return null;
    }
    return rows[0];
  } catch (error) {
    console.error('support ticket persistence failed:', error.message);
    return null;
  }
}

async function markSupportNotification(ticketId, status, providerMessageId = null) {
  if (!ticketId || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/support_tickets?id=eq.${encodeURIComponent(ticketId)}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({
          notification_status: status,
          notification_message_id: providerMessageId,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!response.ok) console.error('support notification status failed:', response.status);
  } catch (error) {
    console.error('support notification status failed:', error.message);
  }
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
        <span style="font-size:12px;color:#8a9e90;margin-left:10px">Hire | Novo lead</span>
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
        subject: `[Hire] Novo lead: ${empresa}`,
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

  const rateKey = anonymousKeys(req, res, 'suporte').ip;
  if (!(await checkRateLimit(rateKey))) {
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
  const supportReasons = new Set(['duvida', 'problema', 'cobranca', 'sugestao', 'outro']);
  if (typeof motivo !== 'string' || !supportReasons.has(motivo)) {
    return res.status(400).json({ error: 'Motivo inválido.' });
  }

  if (!RESEND_API_KEY) {
    return res.status(500).json({ error: 'Serviço de e-mail não configurado.' });
  }

  // Autenticação opcional — enriquece o e-mail com dados do usuário
  const authHeader = req.headers['authorization'] || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  let authenticatedUser = null;
  if (token) {
    const user = await getUserFromToken(token);
    if (user?.id) authenticatedUser = user;
  }
  const userId = authenticatedUser?.id || null;
  const contactEmail = authenticatedUser?.email || email;

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
          <tr><td style="padding:8px 0;font-size:13px;color:#666;width:130px">De</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${esc(contactEmail)}</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:#666">Motivo</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${esc(motivoLabel)}</td></tr>
          ${userId ? `<tr><td style="padding:8px 0;font-size:13px;color:#666">User ID</td><td style="padding:8px 0;font-size:13px;color:#888;font-family:monospace">${esc(userId)}</td></tr>` : ''}
        </table>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">${esc(mensagem)}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#999">Responda diretamente para este e-mail: ${esc(contactEmail)}</p>
      </div>
    </div>`;

  const ticket = await createSupportTicket({
    user_id: userId,
    email: contactEmail,
    category: motivo,
    message: mensagem.trim(),
    source: userId ? 'dashboard' : 'public',
  });

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
        reply_to: contactEmail,
        subject: `[Suporte] ${motivoLabel}: ${contactEmail}`,
        html,
      }),
    });

    if (!r.ok) {
      const err = await r.text();
      console.error('Resend error:', err);
      await markSupportNotification(ticket?.id, 'failed');
      return res.status(500).json({ error: 'Erro ao enviar. Tente novamente.' });
    }

    const receipt = await r.json().catch(() => ({}));
    await markSupportNotification(ticket?.id, 'sent', receipt.id || null);
    sendAutoReply(contactEmail, false);
    return res.status(200).json({ ok: true, ticket_id: ticket?.id || null });
  } catch (err) {
    console.error('Support handler error:', err);
    await markSupportNotification(ticket?.id, 'failed');
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
