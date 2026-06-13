// lib/entitlements.js
// Fonte ÚNICA de verdade sobre planos e permissões da VagaAI.
// Importado por api/subscription.js e api/send-alerts.js (e futuramente pelo
// CRUD de alertas na Fase 2). Não é uma serverless function — fica fora de /api
// e é "bundled" dentro de cada função que o importa.

// Status de assinatura que concedem acesso pago.
// past_due = período de graça (mantém o acesso enquanto a cobrança é re-tentada).
export const PAID_STATUSES = ['active', 'trialing', 'past_due'];

const PAID_PLANS = ['starter', 'pro'];

// Resolve o plano efetivo a partir da linha de subscription do Supabase.
// Regra unificada para TODO o app: plano pago só vale com status pago;
// qualquer outro caso (canceled, incomplete, sem sub, plano desconhecido) → free.
export function resolvePlan(sub) {
  if (!sub) return 'free';
  const plan = sub.plan || 'free';
  const status = sub.status || '';
  if (!PAID_PLANS.includes(plan)) return 'free';
  if (!PAID_STATUSES.includes(status)) return 'free';
  return plan;
}

// Matriz de permissões por plano. Forward-compatible com a Fase 2 (multi-alerta):
// a Fase 2 só passa a ENFORCAR max_active_alerts > 1, sem mudar este shape.
const ENTITLEMENTS = {
  free: {
    plan: 'free',
    alerts_enabled: true,
    max_active_alerts: 1,
    allowed_frequencies: ['semanal'],
    max_jobs_per_delivery: 5,
    advanced_filters: false,
    compatibility_details: 'estimated', // só score estimado quando disponível
    // legados / outras features
    can_analyze_unlimited: false,
    analyses_limit: 0,
    cv_otimizado: false,
    simulador_entrevista: false,
  },
  starter: {
    plan: 'starter',
    alerts_enabled: true,
    max_active_alerts: 3,
    allowed_frequencies: ['semanal', 'quinzenal'],
    max_jobs_per_delivery: 15,
    advanced_filters: true,
    compatibility_details: 'summary', // score + motivos resumidos
    can_analyze_unlimited: false,
    analyses_limit: 10,
    cv_otimizado: true,
    simulador_entrevista: false,
  },
  pro: {
    plan: 'pro',
    alerts_enabled: true,
    max_active_alerts: null, // ilimitado
    allowed_frequencies: ['diario', 'semanal', 'quinzenal'],
    max_jobs_per_delivery: 30,
    advanced_filters: true,
    compatibility_details: 'detailed', // explicação detalhada + priorização
    can_analyze_unlimited: true,
    analyses_limit: null,
    cv_otimizado: true,
    simulador_entrevista: true,
  },
};

// Retorna o objeto de entitlements para um plano resolvido.
export function planEntitlements(plan) {
  return ENTITLEMENTS[plan] || ENTITLEMENTS.free;
}

// Ordem de frequências da mais alta (mais frequente) para a mais baixa.
const FREQ_RANK = { diario: 3, semanal: 2, quinzenal: 1, mensal: 0 };

// Coage uma frequência configurada ao que o plano permite.
// Ex.: Pro→free com 'diario' vira 'semanal' (a mais alta permitida no free),
// sem apagar o perfil. Se a frequência já é permitida, retorna ela mesma.
export function coerceFrequency(freq, plan) {
  const allowed = planEntitlements(plan).allowed_frequencies;
  if (allowed.includes(freq)) return freq;
  // escolhe a permitida de maior "rank" (mais frequente) — melhor experiência
  return allowed
    .slice()
    .sort((a, b) => (FREQ_RANK[b] || 0) - (FREQ_RANK[a] || 0))[0] || 'semanal';
}
