// api/_lib/email-tracking.js
//
// Helper compartilhado pelos pontos de envio de e-mail (onboarding-emails.js,
// cron-onboarding.js, send-alerts.js, webhook.js) e pelo webhook do Resend
// (api/resend-webhook.js). Único módulo compartilhado do projeto — os demais
// api/*.js são standalone de propósito, mas duplicar esta lógica 4x arriscava
// divergência silenciosa no dashboard de e-mail marketing.
//
// Prefixo `_` no nome da pasta exclui este arquivo do roteamento de functions
// da Vercel (não vira endpoint público).

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Tags aceitas pelo Resend: [a-zA-Z0-9_-], sem espaços/acentos. email_type já
// segue esse formato (ex: 'day7_alerts'); user_id é um UUID (hex+hífen).
export function buildResendTags({ emailType, userId }) {
  const tags = [{ name: 'email_type', value: emailType }];
  if (userId) tags.push({ name: 'user_id', value: userId });
  return tags;
}

// Grava a linha 'sent' em email_events. Fire-and-forget por padrão (retorna a
// promise, cabe ao chamador decidir se aguarda ou só faz .catch()) — nunca deve
// bloquear nem derrubar o fluxo de envio de e-mail em si.
export async function recordEmailSent({ resendId, userId, emailType, toEmail }) {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) return;
  if (!emailType) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/email_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates',
      },
      body: JSON.stringify({
        resend_id: resendId || null,
        user_id: userId || null,
        email_type: emailType,
        event: 'sent',
        to_email: toEmail || null,
        occurred_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.error(`recordEmailSent falhou (type=${emailType}):`, e.message);
  }
}
