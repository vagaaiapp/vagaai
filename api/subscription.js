// /api/subscription.js — retorna plano atual do usuário autenticado
// Normaliza planos inválidos/ausentes para 'free'.
// Retorna entitlements explícitos para facilitar rendering no dashboard.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Planos com assinatura paga válida
const PAID_PLANS = new Set(['starter', 'pro']);
// Status que permitem acesso pago
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token required' });

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
    const user = await userRes.json();

    // Busca subscription mais recente
    const subRes = await fetch(
      `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${user.id}&order=created_at.desc&limit=1&select=*`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const rows = await subRes.json();
    const sub = rows?.[0];

    // Busca créditos avulsos
    const credRes = await fetch(
      `${SUPABASE_URL}/rest/v1/user_credits?user_id=eq.${user.id}&select=credits,total_purchased`,
      { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
    );
    const credRows = await credRes.json();
    const credits = credRows?.[0]?.credits || 0;
    const totalPurchased = credRows?.[0]?.total_purchased || 0;

    // Determina plano efetivo:
    // - Sub existe, status ativo e plano conhecido → usar sub
    // - Qualquer outro caso → free
    const rawPlan = sub?.plan || 'free';
    const rawStatus = sub?.status || '';
    const isActiveSub = PAID_PLANS.has(rawPlan) && ACTIVE_STATUSES.has(rawStatus);
    const effectivePlan = isActiveSub ? rawPlan : 'free';

    // Status normalizado — nunca mostrar "active" para planos cancelados/inválidos
    let effectiveStatus;
    if (!sub) {
      effectiveStatus = 'free';
    } else if (isActiveSub) {
      effectiveStatus = rawStatus; // 'active' | 'trialing'
    } else {
      effectiveStatus = rawStatus || 'inactive'; // 'canceled' | 'past_due' | 'incomplete' etc.
    }

    // Entitlements explícitos — frontend não precisa inferir nada
    const entitlements = {
      can_analyze:       effectivePlan === 'pro' || effectivePlan === 'starter' || credits > 0,
      unlimited_analyses: effectivePlan === 'pro',
      analyses_limit:    effectivePlan === 'starter' ? 10 : (effectivePlan === 'pro' ? null : 0),
      cv_otimizado:      effectivePlan === 'starter' || effectivePlan === 'pro' || credits > 0,
      simulador_entrevista: effectivePlan === 'pro',
      rastreador:        true, // disponível para todos
      alertas:           effectivePlan === 'starter' || effectivePlan === 'pro',
    };

    // Preço — só para planos pagos ativos
    const precos = { starter: 'R$19,90/mês', pro: 'R$39,90/mês' };

    return res.status(200).json({
      plan: effectivePlan,
      status: effectiveStatus,
      raw_status: rawStatus,
      cancel_at_period_end: sub?.cancel_at_period_end || false,
      current_period_end: isActiveSub ? (sub?.current_period_end || null) : null,
      current_period_start: isActiveSub ? (sub?.current_period_start || null) : null,
      analyses_used_this_month: sub?.analyses_used_this_month || 0,
      analyses_reset_at: sub?.analyses_reset_at || null,
      credits_legacy: credits,
      total_purchased_legacy: totalPurchased,
      preco: isActiveSub ? (precos[effectivePlan] || null) : null,
      entitlements,
    });
  } catch (err) {
    console.error('subscription.js error:', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
