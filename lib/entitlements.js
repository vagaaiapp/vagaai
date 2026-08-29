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

// Matriz de permissões por plano.
//
// max_active_alerts é ESPELHO de public.max_alertas_do_plano() no banco
// (migração 025). O limite de verdade é o trigger trg_max_active_alerts: a
// policy de RLS de job_alert_profiles é FOR ALL com auth.uid() = user_id, então
// o navegador insere direto via PostgREST e um limite só no cliente não limita
// nada. Os dois números são comparados por teste — se mudar aqui, mude lá.
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
    letters_limit: 0,
    interviews_limit: 0,
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
    // Uma carta por análise. Sem este teto o Starter (mais barato) permitiria
    // mais cartas que o Pro, que passou a ter 50 — inversão que não se explica
    // numa tabela de preços.
    letters_limit: 10,
    interviews_limit: 0, // simulador é exclusivo do Pro
    cv_otimizado: true,
    simulador_entrevista: false,
  },
  pro: {
    plan: 'pro',
    alerts_enabled: true,
    // Teto real, não "ilimitado": cada alerta ativo consulta 20 fontes de vaga
    // e passa por re-ranking de IA, e o Pro envia diariamente. Alerta sem teto
    // é custo sem teto num plano de preço fixo.
    //
    // Eram 10, e 10 não cabiam: o cron roda uma vez por dia e entrega no máximo
    // TETO_ALERTAS_POR_USUARIO perfis por rodada, então quem configurava 10
    // recebia cada um a cada ~3 dias enquanto a página prometia "diários".
    // 5 é o número que o sistema entrega de verdade todo dia — o teto de
    // entregas em api/send-alerts.js é este mesmo 5, e não por coincidência.
    max_active_alerts: 5,
    allowed_frequencies: ['diario', 'semanal', 'quinzenal'],
    max_jobs_per_delivery: null, // sem limite — todas as vagas encontradas
    advanced_filters: true,
    compatibility_details: 'detailed', // explicação detalhada + priorização
    // Tetos mensais do Pro. "Ilimitado" num produto de IA é custo variável
    // vendido por preço fixo: cada análise custa ~R$ 0,08, cada carta ~R$ 0,07
    // e cada treino ~R$ 0,16, contra R$ 37,92 líquidos por assinatura. Sem teto,
    // um único usuário intenso consome a margem de vários.
    //
    // Os números vêm do uso real medido, não de chute: nenhuma conta existente
    // chega perto deles. Servem para o pior caso não virar prejuízo, não para
    // serem alcançados no uso normal.
    can_analyze_unlimited: false,
    analyses_limit: 100,
    letters_limit: 50,
    interviews_limit: 15,
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
