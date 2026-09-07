-- 040_billing_interval.sql — a assinatura passa a saber a propria periodicidade
--
-- POR QUE
-- O webhook ja resolvia a periodicidade no PRICE_PLAN_MAP (mensal/trimestral/
-- anual, por price_id) e jogava fora: so plan e status eram gravados. Sem esse
-- dado, tudo que precisa dizer QUANTO a pessoa paga tem de chutar pelo plano, e
-- chutar pelo plano da errado em qualquer periodicidade que nao seja a mensal.
--
-- Era o caso do assinante trimestral, que paga R$29,90/mes e via "R$39,90/mes"
-- em dois lugares: no card do plano no painel (dashboard/index.html, que
-- hardcodava o preco) e no campo `preco` de api/subscription.js.
--
-- Coluna anulavel de proposito: as assinaturas que ja existem nao tem como
-- saber a propria periodicidade retroativamente (o dado esta no Stripe, nao
-- aqui), e um backfill chutando 'mensal' inventaria um fato. NULL significa
-- "nao sei", e quem le trata NULL como desconhecido em vez de exibir um numero
-- errado. As linhas se corrigem sozinhas no proximo evento de assinatura que o
-- Stripe mandar (renovacao, mudanca de plano, past_due).

BEGIN;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS billing_interval TEXT;

COMMENT ON COLUMN public.subscriptions.billing_interval IS
  'Periodicidade de cobranca resolvida pelo price_id no webhook: mensal, trimestral ou anual. NULL = desconhecida (assinatura anterior a esta coluna); quem le deve tratar NULL como desconhecido, nunca assumir mensal.';

-- Vale so o que o webhook sabe escrever. CHECK em vez de enum para nao exigir
-- migracao quando uma periodicidade nova entrar na tabela de precos.
ALTER TABLE public.subscriptions
  DROP CONSTRAINT IF EXISTS subscriptions_billing_interval_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_billing_interval_check
  CHECK (billing_interval IS NULL OR billing_interval IN ('mensal', 'trimestral', 'anual'));

COMMIT;
