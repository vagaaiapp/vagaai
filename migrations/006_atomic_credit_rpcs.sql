-- Migration 006: Atomic credit RPCs with proper security
-- Fixes:
--   decrement_analyses_used: now targets subscriptions table (not user_credits)
--   increment_user_credits:  atomic GET+1 to avoid race condition in refunds

-- ─── RPC 1: decrement_analyses_used ────────────────────────────────────────────
-- Called by api/analyze.js refundAnalysisCredit() when a Starter analysis fails.
-- Must decrement subscriptions.analyses_used_this_month (not user_credits).

DROP FUNCTION IF EXISTS decrement_analyses_used(UUID);

CREATE OR REPLACE FUNCTION decrement_analyses_used(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_rows_updated INTEGER;
BEGIN
  -- Validate input
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_user_id');
  END IF;

  UPDATE subscriptions
  SET analyses_used_this_month = GREATEST(0, analyses_used_this_month - 1)
  WHERE user_id = p_user_id
    AND plan = 'starter'
    AND status IN ('active', 'trialing')
    AND analyses_used_this_month > 0;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;

  IF v_rows_updated > 0 THEN
    RETURN jsonb_build_object('ok', true, 'rows', v_rows_updated);
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'no_eligible_subscription');
  END IF;
END;
$$;

-- Remove EXECUTE from PUBLIC and anon
REVOKE EXECUTE ON FUNCTION decrement_analyses_used(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION decrement_analyses_used(UUID) FROM anon;
-- Grant only to service_role
GRANT EXECUTE ON FUNCTION decrement_analyses_used(UUID) TO service_role;


-- ─── RPC 2: increment_user_credits ─────────────────────────────────────────────
-- Called by api/analyze.js refundAnalysisCredit() when credit-based analysis fails.
-- Atomic: credits = credits + 1 without a prior GET, avoiding race conditions.

CREATE OR REPLACE FUNCTION increment_user_credits(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_new_credits INTEGER;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'null_user_id');
  END IF;

  UPDATE user_credits
  SET credits    = credits + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING credits INTO v_new_credits;

  IF v_new_credits IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'credits', v_new_credits);
  END IF;

  -- Row doesn't exist yet — insert with 1 credit
  INSERT INTO user_credits (user_id, credits, updated_at)
  VALUES (p_user_id, 1, NOW())
  ON CONFLICT (user_id) DO UPDATE
    SET credits    = user_credits.credits + 1,
        updated_at = NOW()
  RETURNING credits INTO v_new_credits;

  RETURN jsonb_build_object('ok', true, 'credits', v_new_credits);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', SQLERRM);
END;
$$;

REVOKE EXECUTE ON FUNCTION increment_user_credits(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION increment_user_credits(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION increment_user_credits(UUID) TO service_role;
