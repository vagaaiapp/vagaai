// /api/unsubscribe
// Cancela alertas via link no email. Token = HMAC-SHA256(CRON_SECRET, userId).
// GET /api/unsubscribe?uid=<userId>&tok=<token>

import { createHmac } from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

function makeToken(userId) {
  const secret = process.env.CRON_SECRET || '';
  return createHmac('sha256', secret).update(userId).digest('hex');
}

export default async function handler(req, res) {
  const { uid, tok } = req.method === 'GET' ? req.query : (req.body || {});

  if (!uid || !tok) {
    return res.status(400).send(page('Erro', 'Link inválido ou expirado.', false));
  }

  const expected = makeToken(uid);
  // Constant-time comparison
  if (tok.length !== expected.length || !timingSafeEqual(tok, expected)) {
    return res.status(403).send(page('Erro', 'Token inválido.', false));
  }

  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/job_alert_profiles?user_id=eq.${uid}`,
      {
        method: 'PATCH',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ ativo: false }),
      }
    );
    if (!r.ok) throw new Error('Supabase ' + r.status);
    return res.status(200).send(page('Inscrição cancelada', 'Você foi removido da lista de alertas de vagas. Você pode reativar a qualquer momento no seu painel.', true));
  } catch (e) {
    console.error('unsubscribe error:', e.message);
    return res.status(500).send(page('Erro', 'Não foi possível processar sua solicitação. Tente novamente ou acesse o painel.', false));
  }
}

function timingSafeEqual(a, b) {
  // Manual constant-time comparison for strings of equal length
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function page(title, msg, success) {
  const color = success ? '#1a7a4a' : '#c0392b';
  return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — VagaAI</title>
<style>body{margin:0;font-family:Arial,sans-serif;background:#f2f6f3;display:flex;align-items:center;justify-content:center;min-height:100vh}
.box{background:#fff;border-radius:12px;padding:40px 32px;max-width:420px;text-align:center;box-shadow:0 2px 16px rgba(0,0,0,.08)}
.ico{font-size:40px;margin-bottom:16px}.h{font-size:20px;font-weight:700;color:${color};margin-bottom:12px}
.p{font-size:14px;color:#555;line-height:1.6;margin-bottom:24px}
.btn{display:inline-block;background:#1a7a4a;color:#fff;text-decoration:none;padding:10px 24px;border-radius:8px;font-size:14px;font-weight:600}</style>
</head><body><div class="box">
<div class="ico">${success ? '✅' : '❌'}</div>
<div class="h">${title}</div>
<div class="p">${msg}</div>
<a class="btn" href="https://vagaai.app.br/dashboard">Ir para o painel</a>
</div></body></html>`;
}
