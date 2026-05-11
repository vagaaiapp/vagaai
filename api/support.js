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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, motivo, mensagem } = req.body || {};

  if (!email || !motivo || !mensagem) {
    return res.status(400).json({ error: 'Preencha todos os campos.' });
  }
  if (mensagem.trim().length < 10) {
    return res.status(400).json({ error: 'Mensagem muito curta.' });
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
          <tr><td style="padding:8px 0;font-size:13px;color:#666;width:130px">De</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${email}</td></tr>
          <tr><td style="padding:8px 0;font-size:13px;color:#666">Motivo</td><td style="padding:8px 0;font-size:13px;font-weight:600;color:#0a0f0d">${motivoLabel}</td></tr>
          ${userId ? `<tr><td style="padding:8px 0;font-size:13px;color:#666">User ID</td><td style="padding:8px 0;font-size:13px;color:#888;font-family:monospace">${userId}</td></tr>` : ''}
        </table>
        <div style="background:#f5f5f5;border-radius:8px;padding:16px;font-size:14px;color:#333;line-height:1.6;white-space:pre-wrap">${mensagem.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
        <p style="margin:20px 0 0;font-size:12px;color:#999">Responda diretamente para este e-mail: ${email}</p>
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

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Support handler error:', err);
    return res.status(500).json({ error: 'Erro interno. Tente novamente.' });
  }
}
