import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Mapeamento: amount_total (em centavos) → créditos
// R$9,90 = 990 → 1 crédito
// R$39,90 = 3990 → 10 créditos
// R$97,00 = 9700 → 50 créditos
const CREDIT_MAP = {
  990: 1,
  3990: 10,
  9700: 50,
};

// Fallback por faixas de valor (cobre cupons e descontos)
// Se o valor exato não estiver no CREDIT_MAP, infere pelo plano mais próximo abaixo
function inferCreditsFromAmount(amount) {
  if (amount >= 9700) return 50;
  if (amount >= 3990) return 10;
  if (amount >= 500) return 1;   // qualquer valor ≥ R$5 no plano entrada
  return null;
}

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

  // ── Mapeamento price_id → plano ──────────────────────────────────────────────
  const PRICE_PLAN_MAP = {
    // TEST mode — substituir por IDs live quando ativar live mode
    'price_1Tf1HfHB7lmotVJh5IgNzspi': { plan: 'starter', billing: 'mensal' },
    'price_1Tf1HhHB7lmotVJhGEYqS3ST': { plan: 'starter', billing: 'anual' },
    'price_1Tf1HsHB7lmotVJhuEA9Fxc3': { plan: 'pro', billing: 'mensal' },
    'price_1Tf1HuHB7lmotVJhoEmWpotx': { plan: 'pro', billing: 'anual' },
  };

  // ── Upsert subscription no Supabase ──────────────────────────────────────────
  async function upsertSubscription(userId, stripeSubId, stripeCustomerId, plan, status, periodEnd) {
    await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        user_id: userId,
        stripe_subscription_id: stripeSubId,
        stripe_customer_id: stripeCustomerId,
        plan,
        status,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }),
    });
  }

  // ── Busca user_id pelo customer_id ou email ───────────────────────────────────
  async function getUserIdByCustomerOrEmail(customerId, email) {
    // 1. Tenta pelo stripe_customer_id
    if (customerId) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${customerId}&select=user_id`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      const rows = await r.json();
      if (rows?.length) return rows[0].user_id;
    }
    // 2. Fallback: busca pelo email na tabela auth.users via service role
    if (email) {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      const data = await r.json();
      if (data?.users?.length) return data.users[0].id;
    }
    return null;
  }

  const eventType = event.type;
  const obj = event.data?.object;
  if (!obj) return res.status(400).json({ error: 'Missing event object' });

  console.log(`Webhook: ${eventType}`);

  // ── Assinatura criada ou atualizada ──────────────────────────────────────────
  if (eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated') {
    const sub = obj;
    const priceId = sub.items?.data?.[0]?.price?.id;
    const planInfo = PRICE_PLAN_MAP[priceId];
    if (!planInfo) {
      console.warn(`Webhook: unknown price ${priceId} for subscription ${sub.id}`);
      return res.status(200).json({ received: true, note: 'unknown_price' });
    }
    const customerId = sub.customer;
    const email = sub.customer_email || sub.metadata?.email;
    const userId = await getUserIdByCustomerOrEmail(customerId, email);
    if (!userId) {
      console.warn(`Webhook: no user found for customer ${customerId}`);
      return res.status(200).json({ received: true, note: 'no_user' });
    }
    await upsertSubscription(userId, sub.id, customerId, planInfo.plan, sub.status, sub.current_period_end);
    // Email de boas-vindas
    if (eventType === 'customer.subscription.created' && RESEND_API_KEY && email) {
      const planLabel = planInfo.plan === 'pro' ? 'Pro' : 'Starter';
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'VagaAI <noreply@vagaai.app.br>',
          to: [email],
          subject: `✓ Plano ${planLabel} ativado — VagaAI`,
          html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#0a0f0d;color:#e8ede9;border-radius:12px">
  <h1 style="color:#3ecf8e;font-size:22px;margin-bottom:.5rem">Plano ${planLabel} ativado! 🎉</h1>
  <p style="color:#8a9e90;margin-bottom:1.5rem">Seu plano já está ativo. Aproveite todos os recursos disponíveis.</p>
  <a href="https://www.vagaai.app.br/dashboard" style="display:inline-block;background:#3ecf8e;color:#0a0f0d;font-weight:700;padding:.8rem 1.5rem;border-radius:8px;text-decoration:none">→ Acessar meu painel</a>
  <p style="color:#4d6e57;font-size:12px;margin-top:2rem">VagaAI · vagaai.app.br</p>
</div>`,
        }),
      }).catch(e => console.error('Subscription welcome email error:', e.message));
    }
    console.log(`Webhook: subscription ${sub.id} → plan=${planInfo.plan} user=${userId}`);
    return res.status(200).json({ received: true, plan: planInfo.plan });
  }

  // ── Assinatura cancelada ─────────────────────────────────────────────────────
  if (eventType === 'customer.subscription.deleted') {
    const sub = obj;
    const customerId = sub.customer;
    const userId = await getUserIdByCustomerOrEmail(customerId, null);
    if (userId) {
      await upsertSubscription(userId, sub.id, customerId, 'free', 'canceled', null);
      console.log(`Webhook: subscription canceled → user=${userId} downgraded to free`);
    }
    return res.status(200).json({ received: true, note: 'subscription_canceled' });
  }

  // ── Checkout session: compra de créditos avulsos OU início de assinatura ──────
  if (event.type !== 'checkout.session.completed') {
    return res.status(200).json({ received: true, skipped: true });
  }

  const session = event.data?.object;
  if (!session) {
    return res.status(400).json({ error: 'Missing session object' });
  }

  // Se for assinatura, o evento customer.subscription.created já cuida
  if (session.mode === 'subscription') {
    // Apenas salva o customer_id vinculado ao user_id para lookups futuros
    const userId2 = session.client_reference_id;
    const customerId2 = session.customer;
    if (userId2 && customerId2) {
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${userId2}`, {
        method: 'PATCH',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
        body: JSON.stringify({ stripe_customer_id: customerId2 }),
      }).catch(() => {});
    }
    return res.status(200).json({ received: true, note: 'subscription_checkout_handled' });
  }

  const userId = session.client_reference_id;
  const amountTotal = session.amount_total; // em centavos
  const customerEmail = session.customer_details?.email || session.customer_email;

  console.log(`Webhook: checkout.session.completed | user=${userId} | amount=${amountTotal} | email=${customerEmail}`);

  if (!userId) {
    console.warn(`Webhook: no client_reference_id for session ${session.id} (email: ${customerEmail})`);
    return res.status(200).json({ received: true, note: 'no_user_id' });
  }

  const creditsToAdd = CREDIT_MAP[amountTotal] ?? inferCreditsFromAmount(amountTotal);
  if (!creditsToAdd) {
    console.warn(`Webhook: unknown amount ${amountTotal} for session ${session.id} — could not infer credits`);
    return res.status(200).json({ received: true, note: 'unknown_amount' });
  }

  // Idempotência
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
    console.warn('Webhook: idempotency check failed', e.message);
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

    // Envia e-mail de confirmação via Resend
    if (RESEND_API_KEY && customerEmail) {
      const AMOUNT_LABEL = { 990: 'R$9,90', 3990: 'R$39,90', 9700: 'R$97,00' };
      const credLabel = creditsToAdd === 1 ? '1 crédito' : `${creditsToAdd} créditos`;
      const priceLabel = AMOUNT_LABEL[amountTotal] || '';
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'VagaAI <noreply@vagaai.app.br>',
          to: [customerEmail],
          subject: `✓ Compra confirmada — ${credLabel} VagaAI`,
          html: `<div style="font-family:Inter,sans-serif;max-width:480px;margin:0 auto;padding:2rem;background:#0a0f0d;color:#e8ede9;border-radius:12px">
  <h1 style="color:#3ecf8e;font-size:22px;margin-bottom:.5rem">Compra confirmada!</h1>
  <p style="color:#8a9e90;margin-bottom:1.5rem">Seus créditos já estão disponíveis na sua conta.</p>
  <div style="background:rgba(62,207,142,0.1);border:1px solid rgba(62,207,142,0.25);border-radius:8px;padding:1rem;margin-bottom:1.5rem">
    <strong style="color:#3ecf8e">${credLabel}</strong>${priceLabel ? ` · ${priceLabel}` : ''}
  </div>
  <p style="color:#8a9e90;font-size:14px;margin-bottom:1rem">Acesse seu painel para usar seus créditos:</p>
  <a href="https://www.vagaai.app.br/dashboard" style="display:inline-block;background:#3ecf8e;color:#0a0f0d;font-weight:700;padding:.8rem 1.5rem;border-radius:8px;text-decoration:none">→ Ir para o painel</a>
  <p style="color:#4d6e57;font-size:12px;margin-top:2rem">VagaAI · vagaai.app.br</p>
</div>`,
        }),
      }).catch((e) => console.error('Webhook: email send failed', e.message));
    }

    console.log(`Webhook: added ${creditsToAdd} credits to user ${userId}`);
    return res.status(200).json({ received: true, credits_added: creditsToAdd });
  } catch (err) {
    console.error('Webhook: failed to upsert credits', err);
    return res.status(500).json({ error: 'Failed to update credits' });
  }
}
