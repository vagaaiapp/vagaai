-- 035_abuse_prevention.sql
-- Defesa em camadas para gratuidade, automacao e compartilhamento de conta.
-- Persistimos somente HMACs de e-mail, dispositivo e IP. Nenhum valor bruto.

BEGIN;

CREATE TABLE IF NOT EXISTS public.abuse_claims (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resource          text NOT NULL CHECK (resource IN ('analysis', 'profile_cv', 'onboarding_cv')),
  email_hash        text NOT NULL CHECK (email_hash ~ '^[a-f0-9]{64}$'),
  device_hash       text NOT NULL CHECK (device_hash ~ '^[a-f0-9]{64}$'),
  ip_hash           text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  risk_score        smallint NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  challenge_passed  boolean NOT NULL DEFAULT false,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released')),
  created_at        timestamptz NOT NULL DEFAULT now(),
  released_at       timestamptz
);

CREATE INDEX IF NOT EXISTS abuse_claims_user_resource_created_idx
  ON public.abuse_claims(user_id, resource, created_at DESC);
CREATE INDEX IF NOT EXISTS abuse_claims_email_resource_created_idx
  ON public.abuse_claims(email_hash, resource, created_at DESC);
CREATE INDEX IF NOT EXISTS abuse_claims_device_resource_created_idx
  ON public.abuse_claims(device_hash, resource, created_at DESC);
CREATE INDEX IF NOT EXISTS abuse_claims_ip_created_idx
  ON public.abuse_claims(ip_hash, created_at DESC);

CREATE TABLE IF NOT EXISTS public.abuse_devices (
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_hash   text NOT NULL CHECK (device_hash ~ '^[a-f0-9]{64}$'),
  ip_hash       text NOT NULL CHECK (ip_hash ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (user_id, device_hash)
);

CREATE INDEX IF NOT EXISTS abuse_devices_user_last_seen_idx
  ON public.abuse_devices(user_id, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.abuse_events (
  id           bigserial PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  resource     text NOT NULL,
  decision     text NOT NULL CHECK (decision IN ('allow', 'challenge', 'deny', 'release')),
  reason       text,
  risk_score   smallint NOT NULL DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  device_hash  text CHECK (device_hash IS NULL OR device_hash ~ '^[a-f0-9]{64}$'),
  ip_hash      text CHECK (ip_hash IS NULL OR ip_hash ~ '^[a-f0-9]{64}$'),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS abuse_events_created_idx ON public.abuse_events(created_at DESC);
CREATE INDEX IF NOT EXISTS abuse_events_decision_created_idx ON public.abuse_events(decision, created_at DESC);
CREATE INDEX IF NOT EXISTS abuse_events_user_created_idx ON public.abuse_events(user_id, created_at DESC);

ALTER TABLE public.abuse_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.abuse_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.abuse_claims FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.abuse_devices FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.abuse_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abuse_claims TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abuse_devices TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.abuse_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.abuse_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.claim_free_entitlement(
  p_user_id uuid,
  p_resource text,
  p_email_hash text,
  p_device_hash text,
  p_ip_hash text,
  p_challenge_available boolean DEFAULT false,
  p_challenge_passed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_cutoff timestamptz := now() - interval '30 days';
  v_day_cutoff timestamptz := now() - interval '24 hours';
  v_user_count integer := 0;
  v_email_count integer := 0;
  v_device_count integer := 0;
  v_ip_day_count integer := 0;
  v_ip_month_count integer := 0;
  v_risk integer := 0;
  v_claim_id uuid;
  v_action text := 'allow';
  v_reason text := '';
BEGIN
  IF p_user_id IS NULL OR p_resource NOT IN ('analysis', 'profile_cv', 'onboarding_cv')
     OR p_email_hash !~ '^[a-f0-9]{64}$'
     OR p_device_hash !~ '^[a-f0-9]{64}$'
     OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'action', 'deny', 'reason', 'invalid_identity', 'risk_score', 100);
  END IF;

  -- Travas separadas fecham a corrida específica de contas diferentes tentando
  -- consumir a gratuidade no mesmo dispositivo/rede ao mesmo tempo. Uma trava
  -- combinada permitiria que cada e-mail enxergasse a contagem anterior a zero.
  PERFORM pg_advisory_xact_lock(hashtextextended('abuse-ip:' || p_ip_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('abuse-device:' || p_resource || ':' || p_device_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('abuse-email:' || p_resource || ':' || p_email_hash, 0));

  SELECT count(*) INTO v_user_count FROM public.abuse_claims
   WHERE user_id = p_user_id AND resource = p_resource AND status = 'active' AND created_at >= v_cutoff;
  SELECT count(*) INTO v_email_count FROM public.abuse_claims
   WHERE email_hash = p_email_hash AND resource = p_resource AND status = 'active' AND created_at >= v_cutoff;
  SELECT count(*) INTO v_device_count FROM public.abuse_claims
   WHERE device_hash = p_device_hash AND resource = p_resource AND status = 'active' AND created_at >= v_cutoff;
  SELECT count(*) INTO v_ip_day_count FROM public.abuse_claims
   WHERE ip_hash = p_ip_hash AND status = 'active' AND created_at >= v_day_cutoff;
  SELECT count(*) INTO v_ip_month_count FROM public.abuse_claims
   WHERE ip_hash = p_ip_hash AND status = 'active' AND created_at >= v_cutoff;

  IF v_user_count > 0 THEN v_action := 'deny'; v_reason := 'account_limit'; v_risk := 100;
  ELSIF v_email_count > 0 THEN v_action := 'deny'; v_reason := 'email_limit'; v_risk := 100;
  ELSIF v_device_count >= 2 THEN v_action := 'deny'; v_reason := 'device_limit'; v_risk := 100;
  ELSE
    IF v_device_count = 1 THEN v_risk := v_risk + 40; END IF;
    IF v_ip_day_count >= 5 THEN v_risk := v_risk + 40; END IF;
    IF v_ip_month_count >= 20 THEN v_risk := v_risk + 30; END IF;
    v_risk := LEAST(v_risk, 100);
    IF v_risk >= 80 THEN v_action := 'deny'; v_reason := 'risk_limit';
    ELSIF v_risk >= 40 AND p_challenge_available AND NOT p_challenge_passed THEN
      v_action := 'challenge'; v_reason := 'risk_challenge';
    END IF;
  END IF;

  IF v_action <> 'allow' THEN
    INSERT INTO public.abuse_events(user_id,event_type,resource,decision,reason,risk_score,device_hash,ip_hash)
    VALUES(p_user_id,'free_claim',p_resource,v_action,v_reason,v_risk,p_device_hash,p_ip_hash);
    RETURN jsonb_build_object('ok', false, 'action', v_action, 'reason', v_reason, 'risk_score', v_risk);
  END IF;

  INSERT INTO public.abuse_claims(user_id,resource,email_hash,device_hash,ip_hash,risk_score,challenge_passed)
  VALUES(p_user_id,p_resource,p_email_hash,p_device_hash,p_ip_hash,v_risk,p_challenge_passed)
  RETURNING id INTO v_claim_id;

  RETURN jsonb_build_object('ok', true, 'action', 'allow', 'claim_id', v_claim_id, 'risk_score', v_risk);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_free_entitlement(p_claim_id uuid, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE v_rows integer;
BEGIN
  UPDATE public.abuse_claims
     SET status = 'released', released_at = now()
   WHERE id = p_claim_id AND status = 'active' AND (p_user_id IS NULL OR user_id = p_user_id);
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_rows > 0, 'released', v_rows);
END;
$$;

CREATE OR REPLACE FUNCTION public.register_abuse_usage(
  p_user_id uuid,
  p_resource text,
  p_device_hash text,
  p_ip_hash text,
  p_challenge_available boolean DEFAULT false,
  p_challenge_passed boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_devices integer := 0;
  v_action text := 'allow';
  v_reason text := '';
  v_risk integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_device_hash !~ '^[a-f0-9]{64}$' OR p_ip_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'action', 'deny', 'reason', 'invalid_identity', 'risk_score', 100);
  END IF;

  -- Serializa novos dispositivos da mesma conta; sem isso, oito acessos
  -- simultâneos poderiam se contar isoladamente e todos passarem.
  PERFORM pg_advisory_xact_lock(hashtextextended('abuse-user:' || p_user_id::text, 0));

  INSERT INTO public.abuse_devices(user_id,device_hash,ip_hash)
  VALUES(p_user_id,p_device_hash,p_ip_hash)
  ON CONFLICT(user_id,device_hash) DO UPDATE
    SET ip_hash = excluded.ip_hash,
        last_seen_at = now(),
        request_count = public.abuse_devices.request_count + 1;

  SELECT count(*) INTO v_devices FROM public.abuse_devices
   WHERE user_id = p_user_id AND last_seen_at >= now() - interval '30 days';

  IF v_devices > 8 THEN v_action := 'deny'; v_reason := 'account_sharing'; v_risk := 100;
  ELSIF v_devices > 5 AND p_challenge_available AND NOT p_challenge_passed THEN
    v_action := 'challenge'; v_reason := 'account_sharing'; v_risk := 60;
  END IF;

  IF v_action <> 'allow' THEN
    INSERT INTO public.abuse_events(user_id,event_type,resource,decision,reason,risk_score,device_hash,ip_hash)
    VALUES(p_user_id,'resource_usage',left(coalesce(p_resource,'unknown'),80),v_action,v_reason,v_risk,p_device_hash,p_ip_hash);
  END IF;
  RETURN jsonb_build_object('ok', v_action = 'allow', 'action', v_action, 'reason', v_reason, 'risk_score', v_risk, 'devices_30d', v_devices);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_abuse_data(p_days integer DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_days integer := GREATEST(30, LEAST(coalesce(p_days, 90), 365));
  v_events integer := 0;
  v_claims integer := 0;
  v_devices integer := 0;
BEGIN
  DELETE FROM public.abuse_events WHERE created_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_events = ROW_COUNT;
  DELETE FROM public.abuse_claims
   WHERE created_at < now() - make_interval(days => v_days)
      OR (status = 'released' AND released_at < now() - interval '7 days');
  GET DIAGNOSTICS v_claims = ROW_COUNT;
  DELETE FROM public.abuse_devices WHERE last_seen_at < now() - make_interval(days => v_days);
  GET DIAGNOSTICS v_devices = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'events', v_events, 'claims', v_claims, 'devices', v_devices);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_free_entitlement(uuid,text,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_free_entitlement(uuid,uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_abuse_usage(uuid,text,text,text,boolean,boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_abuse_data(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_entitlement(uuid,text,text,text,text,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_free_entitlement(uuid,uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_abuse_usage(uuid,text,text,text,boolean,boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_abuse_data(integer) TO service_role;

COMMIT;
