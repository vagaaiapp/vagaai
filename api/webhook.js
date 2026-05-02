import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Mapeamento: amount_total (em centavos) → créditos
// R$9,90 = 990 → 1 crédito
// R$39,90 = 3990 → 10 créditos
// R$97,00 = 9700 → 50 créditos
const CREDIT_MAP = {
  990: 1,
  3990: 10,
  9700: 50,
};

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, signature, secret) {
  if (!signature) return false;
  const parts = signature.split(',');
  let timestamp = null;
  const v1Signatures = [];
  for (const part of parts) {
    const [key, val] = part.split('=');
    if (key === 't') timestamp = val;
    if (key === 'v1') v1Signatures.push(val);
  }
  if (!timestamp || !v1Signatures.length) return false;

  // Rejeita timestamps mais de 5 minutos no passado
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const payload = `${timestamp}.${rawBody.toString('utf8')}`;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex');

  return v1Signatures.some((sig) => {
    try {
      return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'));
    } catch {
      return false;
    }
  });
}

async function upsertCredits(userId, creditsToAdd) {
  // Tenta buscar registro existente
  const getRes = await fetch(
    `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits,total_purchased`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
    }
  );
  const rows = await getRes.json();

  if (rows.length > 0) {
    // Atualiza créditos existentes
    const newCredits = (rows[0].credits || 0) + creditsToAdd;
    const newTotal = (rows[0].total_purchased || 0) + creditsToAdd;
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
        body: JSON.stringify({
          credits: newCredits,
          total_purchased: newTotal,
          updated_at: new Date().toISOString(),
        }),
      }
    );
    if (!patchRes.ok) {
      const err = await patchRes.text();
      throw new Error(`Supabase PATCH error: ${err}`);
    }
  } else {
    // Cria novo registro
    const postRes = await fetch(`${SUPABASE_URL}/rest/v1/user_credits`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        user_id: userId,
        credits: creditsToAdd,
        total_purchased: creditsToAdd,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!postRes.ok) {
      const err = await postRes.text();
      throw new Error(`Supabase POST error: ${err}`);
    }
  }
}

export const config = {
  api: { bodyParser: false },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('Webhook: missing Supabase env vars');
    return res.status(500).json({ error: 'Config error' });
  }

  // Lê body bruto para verificar assinatura
  let rawBody;
  try {
    rawBody = await getRawBody(req);
  } catch (err) {
    console.error('Webhook: failed to read body', err);
    return res.status(400).json({ error: 'Failed to read body' });
  }

  // Verifica assinatura Stripe
  const signature = req.headers['stripe-signature'];
  if (STRIPE_WEBHOOK_SECRET) {
    const valid = verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
    if (!valid) {
      console.error('Webhook: invalid signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  } else {
    console.warn('Webhook: STRIPE_WEBHOOK_SECRET not set — skipping signature check');
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Webhook: invalid JSON', err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Só processa checkout.session.completed
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data?.object;
  if (!session) {
    return res.status(400).json({ error: 'Missing session object' });
  }

  const userId = session.client_reference_id;
  const amountTotal = session.amount_total; // em centavos
  const customerEmail = session.customer_details?.email || session.customer_email;

  console.log(`Webhook: checkout.session.completed | user=${userId} | amount=${amountTotal} | email=${customerEmail}`);

  if (!userId) {
    // Compra sem usuário logado — registra log mas não adiciona créditos automaticamente
    console.warn(`Webhook: no client_reference_id for session ${session.id} (email: ${customerEmail})`);
    return res.status(200).json({ received: true, note: 'no_user_id' });
  }

  const creditsToAdd = CREDIT_MAP[amountTotal];
  if (!creditsToAdd) {
    console.warn(`Webhook: unknown amount ${amountTotal} for session ${session.id}`);
    // Fallback: tenta inferir pelo modo (produção vs teste com valores diferentes)
    return res.status(200).json({ received: true, note: 'unknown_amount' });
  }

  // Idempotência: verifica se este session já foi processado
  try {
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/webhook_events?stripe_session_id=eq.${encodeURIComponent(session.id)}&select=id`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const existing = await checkRes.json();
    if (existing.length > 0) {
      console.log(`Webhook: session ${session.id} already processed — skipping`);
      return res.status(200).json({ received: true, note: 'already_processed' });
    }
  } catch (e) {
    // Tabela pode não existir ainda — continua sem bloquear
    console.warn('Webhook: idempotency check failed (table may not exist)', e.message);
  }

  try {
    await upsertCredits(userId, creditsToAdd);
    // Registra evento processado
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({ stripe_session_id: session.id, user_id: userId, amount: amountTotal, processed_at: new Date().toISOString() }),
      });
    } catch (e) { /* não bloqueia se falhar */ }
    console.log(`Webhook: added ${creditsToAdd} credits to user ${userId}`);
    return res.status(200).json({ received: true, credits_added: creditsToAdd });
  } catch (err) {
    console.error('Webhook: failed to upsert credits', err);
    return res.status(500).json({ error: 'Failed to update credits' });
  }
}
