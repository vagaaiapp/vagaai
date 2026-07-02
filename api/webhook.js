import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// Busca o e-mail do customer direto na API do Stripe. Usado como fallback de
// resolução de usuário quando o evento de assinatura não traz client_reference_id
// nem customer_email (o objeto Subscription normalmente não carrega o e-mail).
async function getStripeCustomerEmail(customerId) {
  if (!customerId || !STRIPE_SECRET_KEY) return null;
  try {
    const r = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(customerId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    });
    if (!r.ok) return null;
    const c = await r.json();
    return c && !c.deleted ? (c.email || null) : null;
  } catch {
    return null;
  }
}

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
  const headers = { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` };
  // Read-modify-write com optimistic lock + retry: o PATCH só altera a linha
  // se `credits` ainda for igual ao valor lido; se outra requisição concorrente
  // alterou nesse intervalo, 0 linhas mudam e tentamos de novo (sem perder soma).
  for (let attempt = 0; attempt < 4; attempt++) {
    const getRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&select=credits,total_purchased`,
      { headers }
    );
    if (!getRes.ok) throw new Error(`Supabase GET error: ${await getRes.text()}`);
    const rows = await getRes.json();

    if (rows.length > 0) {
      const current = rows[0].credits || 0;
      const patchRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${encodeURIComponent(userId)}&credits=eq.${current}`,
        {
          method: 'PATCH',
          headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({
            credits: current + creditsToAdd,
            total_purchased: (rows[0].total_purchased || 0) + creditsToAdd,
            updated_at: new Date().toISOString(),
          }),
        }
      );
      if (!patchRes.ok) throw new Error(`Supabase PATCH error: ${await patchRes.text()}`);
      const updated = await patchRes.json().catch(() => []);
      if (Array.isArray(updated) && updated.length > 0) return; // sucesso
      continue; // corrida: outro processo alterou credits → relê e retenta
    }

    // Sem linha: cria. merge-duplicates evita erro se outra requisição criar
    // a linha ao mesmo tempo; nesse caso o próximo retry do loop faz o PATCH.
    const postRes = await fetch(`${SUPABASE_URL}/rest/v1/user_credits`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' },
      body: JSON.stringify({
        user_id: userId,
        credits: creditsToAdd,
        total_purchased: creditsToAdd,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!postRes.ok) throw new Error(`Supabase POST error: ${await postRes.text()}`);
    const inserted = await postRes.json().catch(() => []);
    if (Array.isArray(inserted) && inserted.length > 0) return; // criou a linha
    continue; // linha já existia (corrida) → retry cai no ramo do PATCH
  }
  throw new Error('upsertCredits: optimistic lock falhou após retries');
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

  // Verifica assinatura Stripe — obrigatório em produção
  const signature = req.headers['stripe-signature'];
  if (!STRIPE_WEBHOOK_SECRET) {
    console.error('Webhook: STRIPE_WEBHOOK_SECRET não configurado — rejeitando requisição');
    return res.status(500).json({ error: 'Webhook não configurado' });
  }
  const valid = verifyStripeSignature(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  if (!valid) {
    console.error('Webhook: assinatura inválida');
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let event;
  try {
    event = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    console.error('Webhook: invalid JSON', err);
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // ── Mapeamento price_id → plano ──────────────────────────────────────────────
  // Configure STRIPE_PRICE_* env vars com os IDs live para evitar mudança de código
  const PRICE_PLAN_MAP = Object.fromEntries(
    [
      [process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_1Tf3H9HSfV7EaBVqkMxyK2Pq', { plan: 'starter', billing: 'mensal' }],
      [process.env.STRIPE_PRICE_STARTER_ANNUAL  || 'price_1Tf3IlHSfV7EaBVqI70JVVrR', { plan: 'starter', billing: 'anual' }],
      [process.env.STRIPE_PRICE_PRO_MONTHLY     || 'price_1Tf3JmHSfV7EaBVqbgfQ1vv3', { plan: 'pro', billing: 'mensal' }],
      [process.env.STRIPE_PRICE_PRO_ANNUAL      || 'price_1Tf3KaHSfV7EaBVqFYYhyqhu', { plan: 'pro', billing: 'anual' }],
    ].filter(([k]) => k)
  );

  // ── Upsert subscription no Supabase ──────────────────────────────────────────
  async function upsertSubscription(userId, stripeSubId, stripeCustomerId, plan, status, periodEnd, periodStart, isNew = false) {
    const now = new Date();
    const body = {
      user_id: userId,
      stripe_subscription_id: stripeSubId,
      stripe_customer_id: stripeCustomerId,
      plan,
      status,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      // current_period_start é necessário para o reset mensal da cota Starter
      // (ver resetStarterCounterIfNeeded em analyze.js).
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      updated_at: now.toISOString(),
    };
    if (isNew) {
      body.analyses_used_this_month = 0;
      body.analyses_reset_at = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    }
    await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(body),
    });
  }

  // ── Busca user_id pelo customer_id ou email ───────────────────────────────────
  async function getUserIdByCustomerOrEmail(customerId, email) {
    // 1. Tenta pelo stripe_customer_id na tabela subscriptions
    if (customerId) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions?stripe_customer_id=eq.${encodeURIComponent(customerId)}&select=user_id`, {
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
      });
      const rows = await r.json();
      if (rows?.length) return rows[0].user_id;
    }
    // 1b. Sem e-mail no evento? Busca direto no Stripe pelo customer.
    // Resolve a corrida de ordem de eventos (subscription.created antes do
    // checkout.session.completed) e provisiona mesmo sem client_reference_id.
    if (!email && customerId) {
      email = await getStripeCustomerEmail(customerId);
    }
    // 2. Fallback: busca pelo email via SQL (admin users endpoint não filtra por query param)
    if (email) {
      const r = await fetch(
        `${SUPABASE_URL}/rest/v1/rpc/get_user_id_by_email`,
        {
          method: 'POST',
          headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_email: email }),
        }
      );
      if (r.ok) {
        const uid = await r.json();
        if (uid) return uid;
      }
      // Fallback secundário: lista usuários e filtra por email
      try {
        let page = 1;
        while (page <= 5) { // máximo 5 páginas
          const ur = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=1000`, {
            headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` }
          });
          const data = await ur.json();
          const users = data?.users || [];
          const found = users.find(u => u.email === email);
          if (found) return found.id;
          if (users.length < 1000) break;
          page++;
        }
      } catch(e) { console.warn('Webhook: email lookup failed', e.message); }
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
      // FAIL-OPEN seria perigoso: o cliente pagou e ficaria sem o plano.
      // Retorna 5xx para o Stripe RE-TENTAR (com backoff, por ~3 dias). Quando o
      // checkout.session.completed criar o mapeamento — ou o usuário criar a
      // conta com esse e-mail — uma re-tentativa provisiona corretamente.
      console.warn(`Webhook: no user found for customer ${customerId} — pedindo retry ao Stripe`);
      return res.status(503).json({ error: 'user_not_resolved_yet', customer: customerId });
    }
    await upsertSubscription(userId, sub.id, customerId, planInfo.plan, sub.status, sub.current_period_end, sub.current_period_start, eventType === 'customer.subscription.created');
    // Email de boas-vindas (apenas na criação)
    if (eventType === 'customer.subscription.created' && email && process.env.CRON_SECRET) {
      fetch(`https://www.vagaai.app.br/api/onboarding-emails`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: '', type: 'welcome' }),
      }).catch(() => {});
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
      await upsertSubscription(userId, sub.id, customerId, 'free', 'canceled', null, null);
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

  // Se for assinatura: salva mapeamento user_id → customer_id via UPSERT
  // (PATCH não funciona se a linha ainda não existe — novo assinante)
  if (session.mode === 'subscription') {
    let userId2 = session.client_reference_id;
    const customerId2 = session.customer;
    const subId2 = session.subscription;
    // Sem client_reference_id (ex.: compra fora do fluxo autenticado)? Tenta
    // resolver pelo e-mail do checkout antes de desistir, para ainda criar o
    // mapeamento customer→user que o subscription.created vai usar.
    if (!userId2) {
      const email2 = session.customer_details?.email || session.customer_email;
      if (email2) userId2 = await getUserIdByCustomerOrEmail(null, email2);
    }
    if (userId2 && customerId2) {
      const now = new Date().toISOString();
      // UPSERT: cria a linha se não existir, atualiza se existir
      await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify({
          user_id: userId2,
          stripe_customer_id: customerId2,
          stripe_subscription_id: subId2 || null,
          plan: 'free',       // placeholder — customer.subscription.created atualiza para o plano real
          status: 'pending',
          updated_at: now,
        }),
      }).catch((e) => console.error('Webhook: upsert sub mapping failed', e.message));
      console.log(`Webhook: checkout subscription → mapped user=${userId2} customer=${customerId2}`);
    } else {
      console.warn(`Webhook: checkout subscription sem client_reference_id session=${session.id}`);
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

  // ── Idempotência atômica ──────────────────────────────────────────────────
  // Insere o marcador ANTES de creditar. webhook_events.stripe_session_id é
  // UNIQUE, então uma 2ª entrega da mesma sessão é ignorada (retorna vazio) e
  // pulamos — sem a janela de corrida do antigo "checa, depois processa".
  let firstDelivery = false;
  try {
    const insRes = await fetch(`${SUPABASE_URL}/rest/v1/webhook_events`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=ignore-duplicates,return=representation',
      },
      body: JSON.stringify({ stripe_session_id: session.id, user_id: userId, amount: amountTotal, processed_at: new Date().toISOString() }),
    });
    if (!insRes.ok) {
      console.error('Webhook: idempotency insert HTTP', insRes.status);
      // Sem o marcador não há como garantir exatamente-uma-vez: aborta com 500
      // para o Stripe reenviar (melhor reprocessar que creditar em dobro).
      return res.status(500).json({ error: 'Idempotency store unavailable' });
    }
    const inserted = await insRes.json().catch(() => []);
    firstDelivery = Array.isArray(inserted) && inserted.length > 0;
  } catch (e) {
    console.error('Webhook: idempotency insert failed', e.message);
    return res.status(500).json({ error: 'Idempotency store unavailable' });
  }

  if (!firstDelivery) {
    console.log(`Webhook: session ${session.id} already processed — skipping`);
    return res.status(200).json({ received: true, note: 'already_processed' });
  }

  try {
    await upsertCredits(userId, creditsToAdd);

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
    // Reverte o marcador de idempotência para o Stripe poder reprocessar —
    // senão o usuário pagaria e ficaria sem créditos (o retry seria pulado).
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/webhook_events?stripe_session_id=eq.${encodeURIComponent(session.id)}`, {
        method: 'DELETE',
        headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
      });
    } catch (_) {}
    return res.status(500).json({ error: 'Failed to update credits' });
  }
}
