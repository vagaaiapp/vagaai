// /api/subscription.js — retorna plano atual do usuário autenticado
// Normaliza planos inválidos/ausentes para 'free'.
// Retorna entitlements explícitos para facilitar rendering no dashboard.
// Fonte única de planos/permissões: lib/entitlements.js

import { resolvePlan, planEntitlements } from '../lib/entitlements.js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.vagaai.app.br');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');

  if (req.method === 'POST') {
    // Cria sessão no Stripe Customer Portal
    if (!process.env.STRIPE_SECRET_KEY) return res.status(500).json({ error: 'Stripe not configured' });
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Token required' });
    try {
      const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
      });
      if (!userRes.ok) return res.status(401).json({ error: 'Invalid token' });
      const user = await userRes.json();
      const subRes = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=stripe_customer_id`,
        { headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` } }
      );
      const rows = await subRes.json();
      const customerId = rows?.[0]?.stripe_customer_id;
      if (!customerId) return res.status(404).json({ error: 'no_subscription', message: 'Nenhuma assinatura encontrada.' });
      const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ customer: customerId, return_url: 'https://www.vagaai.app.br/dashboard' }).toString(),
      });
      if (!portalRes.ok) {
        const errData = await portalRes.json();
        return res.status(502).json({ error: errData?.error?.message || 'Erro ao criar portal Stripe.' });
      }
      const portal = await portalRes.json();
      return res.status(200).json({ url: portal.url });
    } catch (err) {
      console.error('subscription portal error:', err);
      return res.status(500).json({ error: 'Internal error' });
    }
  }

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
    const effectivePlan = resolvePlan(sub);     // free|starter|pro (past_due = graça)
    const isActiveSub = effectivePlan !== 'free';

    // Status normalizado — nunca mostrar "active" para planos cancelados/inválidos
    let effectiveStatus;
    if (!sub) {
      effectiveStatus = 'free';
    } else if (isActiveSub) {
      effectiveStatus = rawStatus; // 'active' | 'trialing' | 'past_due' (graça)
    } else {
      effectiveStatus = rawStatus || 'inactive'; // 'canceled' | 'incomplete' etc.
    }

    // Entitlements explícitos — frontend não precisa inferir nada
    const ent = planEntitlements(effectivePlan);
    const entitlements = {
      // Alertas (novo, estruturado) — fonte: lib/entitlements.js
      alerts_enabled:        ent.alerts_enabled,
      max_active_alerts:     ent.max_active_alerts,
      allowed_frequencies:   ent.allowed_frequencies,
      max_jobs_per_delivery: ent.max_jobs_per_delivery,
      advanced_filters:      ent.advanced_filters,
      compatibility_details: ent.compatibility_details,
      // Features existentes (mantidas para o dashboard) + créditos avulsos
      can_analyze:           effectivePlan !== 'free' || credits > 0,
      unlimited_analyses:    ent.can_analyze_unlimited,
      analyses_limit:        ent.analyses_limit,
      cv_otimizado:          ent.cv_otimizado || credits > 0,
      simulador_entrevista:  ent.simulador_entrevista,
      rastreador:            true, // disponível para todos
      alertas:               ent.alerts_enabled, // retrocompat (agora true p/ todos)
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
