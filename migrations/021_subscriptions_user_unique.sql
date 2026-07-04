-- Migration 021: constraint única em subscriptions.user_id
--
-- O webhook do Stripe usava POST com Prefer: resolution=merge-duplicates SEM
-- on_conflict=user_id. O PostgREST só resolve merge pelo PK (id, nunca enviado)
-- → nenhum "upsert" fazia merge: cada evento inseria linha nova, e eventos com
-- o mesmo stripe_subscription_id (renovação, past_due, CANCELAMENTO) levavam
-- 409 pela UNIQUE(stripe_subscription_id) — silencioso, pois o código não
-- checava res.ok. Consequência: cancelamento nunca persistia.
--
-- Esta migração garante 1 linha por usuário e habilita on_conflict=user_id
-- no webhook (corrigido em api/webhook.js no mesmo commit).

-- Dedupe defensivo: mantém a linha mais recente por usuário
-- (na data desta migração não havia duplicatas em produção).
DELETE FROM public.subscriptions s
USING public.subscriptions newer
WHERE s.user_id = newer.user_id
  AND (s.created_at < newer.created_at
       OR (s.created_at = newer.created_at AND s.id < newer.id));

ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
