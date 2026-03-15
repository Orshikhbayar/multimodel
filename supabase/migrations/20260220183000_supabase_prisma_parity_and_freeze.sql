-- Supabase parity + billing freeze hardening + Prisma decommission support

-- -----------------------------------------------------------------------------
-- Prisma parity schema additions
-- -----------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'run_status') THEN
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'queued';
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'streaming';
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'done';
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'error';
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'running';
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'completed';
    ALTER TYPE public.run_status ADD VALUE IF NOT EXISTS 'failed';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT projects_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE INDEX IF NOT EXISTS projects_workspace_created_idx
  ON public.projects (workspace_id, created_at DESC);

DROP TRIGGER IF EXISTS projects_set_updated_at ON public.projects;
CREATE TRIGGER projects_set_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS project_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'conversations_project_id_fkey'
  ) THEN
    ALTER TABLE public.conversations
      ADD CONSTRAINT conversations_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS conversations_project_updated_idx
  ON public.conversations (project_id, updated_at DESC);

CREATE OR REPLACE FUNCTION public.validate_conversation_project_workspace()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_project_workspace uuid;
BEGIN
  IF NEW.project_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.workspace_id INTO v_project_workspace
  FROM public.projects p
  WHERE p.id = NEW.project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROJECT_NOT_FOUND';
  END IF;

  IF v_project_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'PROJECT_WORKSPACE_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS conversations_validate_project_workspace ON public.conversations;
CREATE TRIGGER conversations_validate_project_workspace
BEFORE INSERT OR UPDATE OF project_id, workspace_id
ON public.conversations
FOR EACH ROW
EXECUTE FUNCTION public.validate_conversation_project_workspace();

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS attachments jsonb,
  ADD COLUMN IF NOT EXISTS tool_calls jsonb;

ALTER TABLE public.model_runs
  ADD COLUMN IF NOT EXISTS slot_id integer,
  ADD COLUMN IF NOT EXISTS interrupted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sources jsonb,
  ADD COLUMN IF NOT EXISTS disagreements jsonb,
  ADD COLUMN IF NOT EXISTS total_tokens integer,
  ADD COLUMN IF NOT EXISTS error_code text;

UPDATE public.model_runs
SET total_tokens = COALESCE(input_tokens, 0) + COALESCE(output_tokens, 0)
WHERE total_tokens IS NULL
  AND (input_tokens IS NOT NULL OR output_tokens IS NOT NULL);

ALTER TABLE public.model_runs
  ALTER COLUMN status SET DEFAULT 'running';

-- -----------------------------------------------------------------------------
-- Billing lock fields
-- -----------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_lock_reason text;

-- -----------------------------------------------------------------------------
-- Ledger idempotency/reporting hardening
-- -----------------------------------------------------------------------------

ALTER TABLE public.credit_ledger_events
  ADD COLUMN IF NOT EXISTS subject_id uuid,
  ADD COLUMN IF NOT EXISTS provider_reference_id text,
  ADD COLUMN IF NOT EXISTS amount_int bigint NOT NULL DEFAULT 0;

UPDATE public.credit_ledger_events
SET subject_id = user_id
WHERE subject_id IS NULL;

ALTER TABLE public.credit_ledger_events
  ALTER COLUMN subject_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_ledger_events_subject_id_fkey'
  ) THEN
    ALTER TABLE public.credit_ledger_events
      ADD CONSTRAINT credit_ledger_events_subject_id_fkey
      FOREIGN KEY (subject_id)
      REFERENCES auth.users(id)
      ON DELETE CASCADE;
  END IF;
END $$;

UPDATE public.credit_ledger_events
SET amount_int = COALESCE(amount_int, amount_usd_int, 0)
WHERE amount_int = 0
  AND amount_usd_int <> 0;

ALTER TABLE public.credit_ledger_events
  ALTER COLUMN usage_value_usd_int TYPE bigint USING usage_value_usd_int::bigint;

ALTER TABLE public.credit_ledger_events
  ALTER COLUMN usage_value_usd_int DROP NOT NULL;

ALTER TABLE public.credit_ledger_events
  ALTER COLUMN billing_bucket TYPE text USING billing_bucket::text,
  ALTER COLUMN billing_bucket SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'credit_ledger_events_billing_bucket_check'
  ) THEN
    ALTER TABLE public.credit_ledger_events
      ADD CONSTRAINT credit_ledger_events_billing_bucket_check
      CHECK (billing_bucket IN ('included_plan', 'included_auto', 'bonus', 'overage', 'reversal'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS credit_ledger_events_provider_reference_id_key
  ON public.credit_ledger_events (provider_reference_id)
  WHERE provider_reference_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS credit_ledger_events_subject_created_idx
  ON public.credit_ledger_events (subject_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_ledger_events_created_idx
  ON public.credit_ledger_events (created_at DESC);

CREATE INDEX IF NOT EXISTS credit_ledger_events_stripe_event_idx
  ON public.credit_ledger_events (stripe_event_id);

-- Keep policy aligned with subject_id
DROP POLICY IF EXISTS credit_ledger_events_read_own ON public.credit_ledger_events;
CREATE POLICY credit_ledger_events_read_own
ON public.credit_ledger_events
FOR SELECT
TO authenticated
USING (subject_id = auth.uid());

-- -----------------------------------------------------------------------------
-- RLS and grants for projects
-- -----------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS projects_select_accessible ON public.projects;
CREATE POLICY projects_select_accessible
ON public.projects
FOR SELECT
TO authenticated
USING (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS projects_insert_accessible ON public.projects;
CREATE POLICY projects_insert_accessible
ON public.projects
FOR INSERT
TO authenticated
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS projects_update_accessible ON public.projects;
CREATE POLICY projects_update_accessible
ON public.projects
FOR UPDATE
TO authenticated
USING (public.user_has_workspace_access(workspace_id))
WITH CHECK (public.user_has_workspace_access(workspace_id));

DROP POLICY IF EXISTS projects_delete_accessible ON public.projects;
CREATE POLICY projects_delete_accessible
ON public.projects
FOR DELETE
TO authenticated
USING (public.user_has_workspace_access(workspace_id));

-- -----------------------------------------------------------------------------
-- Billing RPCs (advisory-lock serialized + lock-enforced)
-- -----------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.billing_start_run(uuid, text, text, text, text, text, integer, integer, boolean);
DROP FUNCTION IF EXISTS public.billing_finalize_run(uuid, text, text, integer, integer, integer, integer, text, text);

CREATE OR REPLACE FUNCTION public.billing_start_run(
  p_subject_id uuid,
  p_model_id text,
  p_est_tokens_in integer,
  p_est_tokens_out integer,
  p_is_auto boolean,
  p_run_id text,
  p_requested_model_id text DEFAULT NULL,
  p_plan_id text DEFAULT NULL,
  p_mode text DEFAULT NULL,
  p_provider_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_existing_hold public.usage_holds%ROWTYPE;
  v_hold_id uuid;
  v_run_id uuid;
  v_bucket text := 'included_plan';
  v_plan_id text;
  v_rate_in integer := 15;
  v_rate_out integer := 60;
  v_total_est_tokens integer := GREATEST(0, p_est_tokens_in) + GREATEST(0, p_est_tokens_out);
  v_estimated_amount_int bigint := 0;
  v_estimated_usage_value_int bigint := 0;
  v_hold_included integer := 0;
  v_hold_bonus integer := 0;
  v_hold_topup integer := 0;
  v_auto_reserved bigint := 0;
  v_auto_max_tokens integer := 0;
  v_auto_max_daily_value bigint := 0;
  v_auto_max_concurrent integer := 0;
  v_active_auto_holds integer := 0;
  v_today_auto_value bigint := 0;
  v_today_auto_reserved bigint := 0;
  v_auto_allowed boolean := false;
  v_day_start timestamptz := date_trunc('day', now());
  v_next_day timestamptz := date_trunc('day', now()) + interval '1 day';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing_hold
  FROM public.usage_holds
  WHERE run_reference_id = p_run_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'hold_id', v_existing_hold.id,
      'run_id', p_run_id,
      'bucket', COALESCE(v_existing_hold.metadata->>'bucket_hint', 'included_plan'),
      'held_credits_int', v_existing_hold.held_credits_int,
      'auto_reserved_value_usd_int', v_existing_hold.auto_reserved_value_usd_int
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_subject_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_profile.billing_locked_at IS NOT NULL THEN
    RAISE EXCEPTION 'BILLING_LOCKED'
      USING ERRCODE = 'P0001', DETAIL = COALESCE(v_profile.billing_lock_reason, 'billing locked');
  END IF;

  v_plan_id := COALESCE(NULLIF(p_plan_id, ''), NULLIF(v_profile.plan_id, ''), 'free');

  SELECT
    COALESCE(mr.input_usd_per_1m_tokens_int, 15),
    COALESCE(mr.output_usd_per_1m_tokens_int, 60)
  INTO v_rate_in, v_rate_out
  FROM public.model_rates mr
  WHERE mr.model_id = p_model_id;

  IF NOT FOUND THEN
    SELECT
      COALESCE(mr.input_usd_per_1m_tokens_int, 15),
      COALESCE(mr.output_usd_per_1m_tokens_int, 60)
    INTO v_rate_in, v_rate_out
    FROM public.model_rates mr
    WHERE mr.model_id = 'default';
  END IF;

  IF v_total_est_tokens > 0 THEN
    v_estimated_amount_int := GREATEST(
      1,
      CEIL(((GREATEST(0, p_est_tokens_in)::numeric * v_rate_in) + (GREATEST(0, p_est_tokens_out)::numeric * v_rate_out)) / 1000000.0)
    )::bigint;
    v_estimated_usage_value_int := v_estimated_amount_int;
  END IF;

  v_auto_max_tokens := CASE v_plan_id
    WHEN 'free' THEN 4000
    WHEN 'plus' THEN 8000
    WHEN 'pro' THEN 16000
    WHEN 'team' THEN 24000
    ELSE 4000
  END;

  v_auto_max_daily_value := CASE v_plan_id
    WHEN 'free' THEN 200
    WHEN 'plus' THEN 1200
    WHEN 'pro' THEN 3000
    WHEN 'team' THEN 8000
    ELSE 200
  END;

  v_auto_max_concurrent := CASE v_plan_id
    WHEN 'free' THEN 1
    WHEN 'plus' THEN 2
    WHEN 'pro' THEN 3
    WHEN 'team' THEN 6
    ELSE 1
  END;

  IF p_is_auto THEN
    SELECT COUNT(*)::integer INTO v_active_auto_holds
    FROM public.usage_holds
    WHERE user_id = p_subject_id
      AND status = 'active'
      AND COALESCE(auto_reserved_value_usd_int, 0) > 0;

    SELECT COALESCE(SUM(usage_value_usd_int), 0)::bigint INTO v_today_auto_value
    FROM public.usage_runs
    WHERE user_id = p_subject_id
      AND created_at >= v_day_start
      AND created_at < v_next_day
      AND billing_bucket = 'included_auto'
      AND status = 'completed';

    SELECT COALESCE(SUM(auto_reserved_value_usd_int), 0)::bigint INTO v_today_auto_reserved
    FROM public.usage_holds
    WHERE user_id = p_subject_id
      AND status = 'active'
      AND created_at >= v_day_start
      AND created_at < v_next_day;

    v_auto_allowed :=
      v_total_est_tokens <= v_auto_max_tokens
      AND v_active_auto_holds < v_auto_max_concurrent
      AND (v_today_auto_value + v_today_auto_reserved + v_estimated_usage_value_int) <= v_auto_max_daily_value;
  END IF;

  IF p_is_auto AND v_auto_allowed THEN
    v_bucket := 'included_auto';
    v_auto_reserved := v_estimated_usage_value_int;
  ELSE
    IF p_is_auto AND v_plan_id = 'free' AND NOT v_auto_allowed THEN
      RAISE EXCEPTION 'AUTO_GUARDRAIL_BLOCKED' USING ERRCODE = 'P0001';
    END IF;

    IF (v_profile.included_credits_cents + v_profile.bonus_credits_cents + v_profile.top_up_credits_cents) < v_estimated_amount_int THEN
      RAISE EXCEPTION 'INSUFFICIENT_CREDITS' USING ERRCODE = 'P0001';
    END IF;

    v_hold_included := LEAST(v_profile.included_credits_cents, v_estimated_amount_int::integer);
    v_hold_bonus := LEAST(
      v_profile.bonus_credits_cents,
      GREATEST(v_estimated_amount_int::integer - v_hold_included, 0)
    );
    v_hold_topup := LEAST(
      v_profile.top_up_credits_cents,
      GREATEST(v_estimated_amount_int::integer - v_hold_included - v_hold_bonus, 0)
    );

    UPDATE public.profiles
    SET
      included_credits_cents = included_credits_cents - v_hold_included,
      bonus_credits_cents = bonus_credits_cents - v_hold_bonus,
      top_up_credits_cents = top_up_credits_cents - v_hold_topup
    WHERE id = p_subject_id;

    v_bucket := CASE
      WHEN v_hold_topup > 0 THEN 'overage'
      WHEN v_hold_bonus > 0 THEN 'bonus'
      ELSE 'included_plan'
    END;
  END IF;

  INSERT INTO public.usage_holds (
    user_id,
    run_reference_id,
    model_id,
    plan_id,
    mode,
    held_credits_int,
    held_included_credits_int,
    held_bonus_credits_int,
    held_top_up_credits_int,
    held_value_usd_int,
    auto_reserved_value_usd_int,
    status,
    metadata
  )
  VALUES (
    p_subject_id,
    p_run_id,
    p_model_id,
    v_plan_id,
    COALESCE(p_mode, CASE WHEN p_is_auto THEN 'smart' ELSE NULL END),
    v_estimated_amount_int::integer,
    v_hold_included,
    v_hold_bonus,
    v_hold_topup,
    v_estimated_usage_value_int::integer,
    v_auto_reserved::integer,
    'active',
    jsonb_build_object(
      'bucket_hint', v_bucket,
      'requested_model_id', p_requested_model_id,
      'provider_reference_id', p_provider_reference_id,
      'is_auto', p_is_auto
    )
  )
  RETURNING id INTO v_hold_id;

  INSERT INTO public.usage_runs (
    run_reference_id,
    user_id,
    plan_id,
    model_id,
    mode,
    billing_bucket,
    status,
    hold_id,
    metadata
  )
  VALUES (
    p_run_id,
    p_subject_id,
    v_plan_id,
    p_model_id,
    COALESCE(p_mode, CASE WHEN p_is_auto THEN 'smart' ELSE NULL END),
    v_bucket::public.billing_bucket,
    'running',
    v_hold_id,
    jsonb_build_object('requested_model_id', p_requested_model_id)
  )
  RETURNING id INTO v_run_id;

  INSERT INTO public.credit_ledger_events (
    subject_id,
    user_id,
    usage_run_id,
    type,
    credit_delta_int,
    amount_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    provider_reference_id,
    reference_id,
    metadata
  )
  VALUES (
    p_subject_id,
    p_subject_id,
    v_run_id,
    'usage_hold',
    -v_estimated_amount_int::integer,
    -v_estimated_amount_int,
    0,
    v_estimated_usage_value_int,
    v_bucket,
    p_provider_reference_id,
    p_run_id,
    jsonb_build_object(
      'held_included_credits_int', v_hold_included,
      'held_bonus_credits_int', v_hold_bonus,
      'held_top_up_credits_int', v_hold_topup,
      'auto_reserved_value_usd_int', v_auto_reserved
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'run_id', p_run_id,
    'hold_id', v_hold_id,
    'usage_run_id', v_run_id,
    'bucket', v_bucket,
    'held_credits_int', v_estimated_amount_int,
    'auto_reserved_value_usd_int', v_auto_reserved
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_finalize_run(
  p_subject_id uuid,
  p_run_id text,
  p_actual_tokens_in integer,
  p_actual_tokens_out integer,
  p_model_id text,
  p_status text DEFAULT 'completed',
  p_reason text DEFAULT NULL,
  p_usage_value_usd_int bigint DEFAULT NULL,
  p_billed_amount_int bigint DEFAULT NULL,
  p_provider_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hold public.usage_holds%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_run public.usage_runs%ROWTYPE;
  v_rate_in integer := 15;
  v_rate_out integer := 60;
  v_actual_amount_int bigint := 0;
  v_usage_value_int bigint := 0;
  v_remaining bigint := 0;
  v_uncovered bigint := 0;
  v_hold_used_included integer := 0;
  v_hold_used_bonus integer := 0;
  v_hold_used_topup integer := 0;
  v_extra_included integer := 0;
  v_extra_bonus integer := 0;
  v_extra_topup integer := 0;
  v_refund_included integer := 0;
  v_refund_bonus integer := 0;
  v_refund_topup integer := 0;
  v_bucket text := 'included_plan';
  v_charged_total bigint := 0;
  v_charged_included bigint := 0;
  v_charged_bonus bigint := 0;
  v_charged_topup bigint := 0;
  v_net_credit_delta bigint := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_hold
  FROM public.usage_holds
  WHERE run_reference_id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'HOLD_NOT_FOUND');
  END IF;

  IF v_hold.status <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', v_hold.status);
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_subject_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_run
  FROM public.usage_runs
  WHERE run_reference_id = p_run_id
  FOR UPDATE;

  SELECT
    COALESCE(mr.input_usd_per_1m_tokens_int, 15),
    COALESCE(mr.output_usd_per_1m_tokens_int, 60)
  INTO v_rate_in, v_rate_out
  FROM public.model_rates mr
  WHERE mr.model_id = p_model_id;

  IF NOT FOUND THEN
    SELECT
      COALESCE(mr.input_usd_per_1m_tokens_int, 15),
      COALESCE(mr.output_usd_per_1m_tokens_int, 60)
    INTO v_rate_in, v_rate_out
    FROM public.model_rates mr
    WHERE mr.model_id = 'default';
  END IF;

  IF p_billed_amount_int IS NOT NULL THEN
    v_actual_amount_int := GREATEST(0, p_billed_amount_int);
  ELSIF (GREATEST(0, p_actual_tokens_in) + GREATEST(0, p_actual_tokens_out)) > 0 THEN
    v_actual_amount_int := GREATEST(
      1,
      CEIL(((GREATEST(0, p_actual_tokens_in)::numeric * v_rate_in) + (GREATEST(0, p_actual_tokens_out)::numeric * v_rate_out)) / 1000000.0)
    )::bigint;
  ELSE
    v_actual_amount_int := 0;
  END IF;

  IF p_usage_value_usd_int IS NOT NULL THEN
    v_usage_value_int := GREATEST(0, p_usage_value_usd_int);
  ELSE
    v_usage_value_int := v_actual_amount_int;
  END IF;

  IF p_status <> 'completed' THEN
    UPDATE public.profiles
    SET
      included_credits_cents = included_credits_cents + v_hold.held_included_credits_int,
      bonus_credits_cents = bonus_credits_cents + v_hold.held_bonus_credits_int,
      top_up_credits_cents = top_up_credits_cents + v_hold.held_top_up_credits_int
    WHERE id = p_subject_id;

    UPDATE public.usage_holds
    SET
      status = COALESCE(NULLIF(p_status, ''), 'failed'),
      resolved_at = now()
    WHERE id = v_hold.id;

    UPDATE public.usage_runs
    SET
      status = COALESCE(NULLIF(p_status, ''), 'failed'),
      finished_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
        'failure_reason', COALESCE(p_reason, p_status)
      )
    WHERE run_reference_id = p_run_id;

    INSERT INTO public.credit_ledger_events (
      subject_id,
      user_id,
      usage_run_id,
      type,
      credit_delta_int,
      amount_int,
      amount_usd_int,
      usage_value_usd_int,
      billing_bucket,
      provider_reference_id,
      reference_id,
      metadata
    )
    VALUES (
      p_subject_id,
      p_subject_id,
      v_run.id,
      'usage_release',
      v_hold.held_credits_int,
      0,
      0,
      NULL,
      'reversal',
      p_provider_reference_id,
      p_run_id,
      jsonb_build_object('reason', COALESCE(p_reason, p_status))
    );

    RETURN jsonb_build_object(
      'ok', true,
      'status', COALESCE(NULLIF(p_status, ''), 'failed'),
      'bucket', 'reversal'
    );
  END IF;

  IF COALESCE(v_hold.auto_reserved_value_usd_int, 0) > 0 THEN
    v_bucket := 'included_auto';
    v_actual_amount_int := 0;
    v_charged_total := 0;
  ELSE
    v_remaining := v_actual_amount_int;

    v_hold_used_included := LEAST(v_hold.held_included_credits_int, v_remaining::integer);
    v_remaining := v_remaining - v_hold_used_included;

    v_hold_used_bonus := LEAST(v_hold.held_bonus_credits_int, v_remaining::integer);
    v_remaining := v_remaining - v_hold_used_bonus;

    v_hold_used_topup := LEAST(v_hold.held_top_up_credits_int, v_remaining::integer);
    v_remaining := v_remaining - v_hold_used_topup;

    v_extra_included := LEAST(v_profile.included_credits_cents, v_remaining::integer);
    v_remaining := v_remaining - v_extra_included;

    v_extra_bonus := LEAST(v_profile.bonus_credits_cents, v_remaining::integer);
    v_remaining := v_remaining - v_extra_bonus;

    v_extra_topup := LEAST(v_profile.top_up_credits_cents, v_remaining::integer);
    v_remaining := v_remaining - v_extra_topup;

    v_uncovered := GREATEST(0, v_remaining);

    v_refund_included := v_hold.held_included_credits_int - v_hold_used_included;
    v_refund_bonus := v_hold.held_bonus_credits_int - v_hold_used_bonus;
    v_refund_topup := v_hold.held_top_up_credits_int - v_hold_used_topup;

    UPDATE public.profiles
    SET
      included_credits_cents = included_credits_cents + v_refund_included - v_extra_included,
      bonus_credits_cents = bonus_credits_cents + v_refund_bonus - v_extra_bonus,
      top_up_credits_cents = top_up_credits_cents + v_refund_topup - v_extra_topup
    WHERE id = p_subject_id;

    v_charged_included := v_hold_used_included + v_extra_included;
    v_charged_bonus := v_hold_used_bonus + v_extra_bonus;
    v_charged_topup := v_hold_used_topup + v_extra_topup;
    v_charged_total := v_charged_included + v_charged_bonus + v_charged_topup;

    v_bucket := CASE
      WHEN v_charged_topup > 0 THEN 'overage'
      WHEN v_charged_bonus > 0 AND v_charged_included = 0 THEN 'bonus'
      ELSE 'included_plan'
    END;
  END IF;

  UPDATE public.usage_holds
  SET
    status = 'settled',
    resolved_at = now()
  WHERE id = v_hold.id;

  UPDATE public.usage_runs
  SET
    model_id = p_model_id,
    tokens_in = GREATEST(0, p_actual_tokens_in),
    tokens_out = GREATEST(0, p_actual_tokens_out),
    tokens_total = GREATEST(0, p_actual_tokens_in) + GREATEST(0, p_actual_tokens_out),
    usage_value_usd_int = v_usage_value_int::integer,
    billed_amount_usd_int = GREATEST(0, v_charged_topup)::integer,
    billed_credits_int = GREATEST(0, v_charged_total)::integer,
    billing_bucket = v_bucket::public.billing_bucket,
    status = 'completed',
    finished_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'uncovered_credits_int', v_uncovered,
      'charged_included_credits_int', v_charged_included,
      'charged_bonus_credits_int', v_charged_bonus,
      'charged_top_up_credits_int', v_charged_topup
    )
  WHERE run_reference_id = p_run_id;

  IF v_bucket IN ('included_plan', 'included_auto') THEN
    UPDATE public.subscription_allowances
    SET included_used_value_usd_int = included_used_value_usd_int + v_usage_value_int::integer
    WHERE subject_type = 'user'
      AND subject_id = p_subject_id
      AND period_start <= now()
      AND period_end > now();
  END IF;

  v_net_credit_delta :=
    (v_refund_included + v_refund_bonus + v_refund_topup)::bigint -
    (v_extra_included + v_extra_bonus + v_extra_topup)::bigint;

  INSERT INTO public.credit_ledger_events (
    subject_id,
    user_id,
    usage_run_id,
    type,
    credit_delta_int,
    amount_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    provider_reference_id,
    reference_id,
    metadata
  )
  VALUES (
    p_subject_id,
    p_subject_id,
    v_run.id,
    'usage_finalize',
    v_net_credit_delta::integer,
    v_charged_total,
    GREATEST(0, v_charged_topup)::integer,
    v_usage_value_int,
    v_bucket,
    p_provider_reference_id,
    p_run_id,
    jsonb_build_object(
      'billed_credits_int', v_charged_total,
      'uncovered_credits_int', v_uncovered
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'status', 'completed',
    'bucket', v_bucket,
    'billed_credits_int', v_charged_total,
    'usage_value_usd_int', v_usage_value_int,
    'uncovered_credits_int', v_uncovered
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_release_hold(
  p_subject_id uuid,
  p_run_id text,
  p_reason text DEFAULT 'released',
  p_provider_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.billing_finalize_run(
    p_subject_id := p_subject_id,
    p_run_id := p_run_id,
    p_actual_tokens_in := 0,
    p_actual_tokens_out := 0,
    p_model_id := 'default',
    p_status := 'failed',
    p_reason := p_reason,
    p_usage_value_usd_int := 0,
    p_billed_amount_int := 0,
    p_provider_reference_id := p_provider_reference_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_lock_subject(
  p_subject_id uuid,
  p_reason text,
  p_locked_at timestamptz DEFAULT now()
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    billing_locked_at = COALESCE(p_locked_at, now()),
    billing_lock_reason = p_reason
  WHERE id = p_subject_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_unlock_subject(
  p_subject_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET
    billing_locked_at = NULL,
    billing_lock_reason = NULL
  WHERE id = p_subject_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.billing_start_run(
  uuid,
  text,
  integer,
  integer,
  boolean,
  text,
  text,
  text,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_finalize_run(
  uuid,
  text,
  integer,
  integer,
  text,
  text,
  text,
  bigint,
  bigint,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_release_hold(
  uuid,
  text,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_lock_subject(
  uuid,
  text,
  timestamptz
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_unlock_subject(
  uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.billing_ensure_profile(
  p_subject_id uuid,
  p_email text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.profiles (
    id,
    email,
    plan_id,
    billing_cadence,
    billing_currency,
    period_start_at,
    period_end_at,
    included_credits_cents,
    top_up_credits_cents,
    bonus_credits_cents
  )
  VALUES (
    p_subject_id,
    p_email,
    'free',
    'monthly',
    'USD',
    now(),
    now() + interval '1 month',
    100,
    0,
    0
  )
  ON CONFLICT (id)
  DO UPDATE SET
    email = COALESCE(EXCLUDED.email, public.profiles.email)
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_reset_period_if_needed(
  p_subject_id uuid
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile public.profiles%ROWTYPE;
  v_included_credits_int integer;
  v_period_start timestamptz := now();
  v_period_end timestamptz := now() + interval '1 month';
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_subject_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF now() < v_profile.period_end_at THEN
    RETURN v_profile;
  END IF;

  v_included_credits_int := CASE v_profile.plan_id
    WHEN 'plus' THEN 700
    WHEN 'pro' THEN 1800
    WHEN 'team' THEN 5000
    ELSE 100
  END;

  UPDATE public.profiles
  SET
    period_start_at = v_period_start,
    period_end_at = v_period_end,
    included_credits_cents = v_included_credits_int
  WHERE id = p_subject_id
  RETURNING * INTO v_profile;

  INSERT INTO public.subscription_allowances (
    subject_type,
    subject_id,
    period_start,
    period_end,
    included_value_usd_int,
    included_used_value_usd_int
  )
  VALUES (
    'user',
    p_subject_id,
    v_period_start,
    v_period_end,
    v_included_credits_int,
    0
  )
  ON CONFLICT (subject_type, subject_id, period_start, period_end)
  DO UPDATE SET
    included_value_usd_int = EXCLUDED.included_value_usd_int,
    included_used_value_usd_int = 0,
    updated_at = now();

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_change_plan_in_app(
  p_subject_id uuid,
  p_plan_id text,
  p_cadence text,
  p_reference_id text DEFAULT NULL,
  p_provider_reference_id text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current public.profiles%ROWTYPE;
  v_updated public.profiles%ROWTYPE;
  v_plan_id text;
  v_cadence text;
  v_included_credits_int integer;
  v_amount_int integer;
  v_period_start timestamptz := now();
  v_period_end timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_current
  FROM public.profiles
  WHERE id = p_subject_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  v_plan_id := CASE p_plan_id
    WHEN 'free' THEN 'free'
    WHEN 'plus' THEN 'plus'
    WHEN 'pro' THEN 'pro'
    WHEN 'team' THEN 'team'
    ELSE v_current.plan_id
  END;

  v_cadence := CASE p_cadence
    WHEN 'annual' THEN 'annual'
    ELSE 'monthly'
  END;

  v_included_credits_int := CASE v_plan_id
    WHEN 'free' THEN 100
    WHEN 'plus' THEN 700
    WHEN 'pro' THEN 1800
    WHEN 'team' THEN 5000
    ELSE 100
  END;

  v_amount_int := CASE
    WHEN v_plan_id = 'free' THEN 0
    WHEN v_plan_id = 'plus' AND v_cadence = 'annual' THEN 19000
    WHEN v_plan_id = 'plus' THEN 1900
    WHEN v_plan_id = 'pro' AND v_cadence = 'annual' THEN 49000
    WHEN v_plan_id = 'pro' THEN 4900
    WHEN v_plan_id = 'team' AND v_cadence = 'annual' THEN 129000
    WHEN v_plan_id = 'team' THEN 12900
    ELSE 0
  END;

  v_period_end := CASE
    WHEN v_cadence = 'annual' THEN v_period_start + interval '12 months'
    ELSE v_period_start + interval '1 month'
  END;

  UPDATE public.profiles
  SET
    plan_id = v_plan_id,
    billing_cadence = v_cadence,
    period_start_at = v_period_start,
    period_end_at = v_period_end,
    included_credits_cents = v_included_credits_int
  WHERE id = p_subject_id
  RETURNING * INTO v_updated;

  IF p_provider_reference_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE provider_reference_id = p_provider_reference_id
  ) THEN
    INSERT INTO public.credit_ledger_events (
      subject_id,
      user_id,
      type,
      credit_delta_int,
      amount_int,
      amount_usd_int,
      usage_value_usd_int,
      billing_bucket,
      provider_reference_id,
      reference_id,
      metadata
    )
    VALUES (
      p_subject_id,
      p_subject_id,
      'plan_change',
      v_included_credits_int - v_current.included_credits_cents,
      v_amount_int,
      v_amount_int,
      NULL,
      'included_plan',
      p_provider_reference_id,
      COALESCE(p_reference_id, CONCAT('plan:', v_plan_id, ':', now()::text)),
      jsonb_build_object(
        'previous_plan_id', v_current.plan_id,
        'next_plan_id', v_plan_id,
        'cadence', v_cadence
      )
    );
  END IF;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_set_currency(
  p_subject_id uuid,
  p_currency text,
  p_reference_id text DEFAULT NULL,
  p_provider_reference_id text DEFAULT NULL
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.profiles%ROWTYPE;
  v_currency text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_currency := CASE p_currency
    WHEN 'MNT' THEN 'MNT'
    ELSE 'USD'
  END;

  UPDATE public.profiles
  SET billing_currency = v_currency
  WHERE id = p_subject_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_provider_reference_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE provider_reference_id = p_provider_reference_id
  ) THEN
    INSERT INTO public.credit_ledger_events (
      subject_id,
      user_id,
      type,
      credit_delta_int,
      amount_int,
      amount_usd_int,
      usage_value_usd_int,
      billing_bucket,
      provider_reference_id,
      reference_id,
      metadata
    )
    VALUES (
      p_subject_id,
      p_subject_id,
      'currency_change',
      0,
      0,
      0,
      NULL,
      'included_plan',
      p_provider_reference_id,
      COALESCE(p_reference_id, CONCAT('currency:', v_currency, ':', now()::text)),
      jsonb_build_object('currency', v_currency)
    );
  END IF;

  RETURN v_updated;
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_purchase_topup_manual(
  p_subject_id uuid,
  p_credit_delta_int integer,
  p_amount_int integer,
  p_currency text,
  p_reference_id text DEFAULT NULL,
  p_provider_reference_id text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated public.profiles%ROWTYPE;
  v_currency text;
  v_credit_delta integer;
  v_amount_int integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_subject_id::text));

  IF auth.role() <> 'service_role' AND auth.uid() IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_currency := CASE p_currency
    WHEN 'MNT' THEN 'MNT'
    ELSE 'USD'
  END;
  v_credit_delta := GREATEST(0, p_credit_delta_int);
  v_amount_int := GREATEST(0, p_amount_int);

  UPDATE public.profiles
  SET
    top_up_credits_cents = top_up_credits_cents + v_credit_delta,
    billing_currency = v_currency
  WHERE id = p_subject_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF p_provider_reference_id IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE provider_reference_id = p_provider_reference_id
  ) THEN
    INSERT INTO public.credit_ledger_events (
      subject_id,
      user_id,
      type,
      credit_delta_int,
      amount_int,
      amount_usd_int,
      usage_value_usd_int,
      billing_bucket,
      provider_reference_id,
      reference_id,
      metadata
    )
    VALUES (
      p_subject_id,
      p_subject_id,
      'topup_purchase',
      v_credit_delta,
      v_amount_int,
      CASE WHEN v_currency = 'USD' THEN v_amount_int ELSE 0 END,
      NULL,
      'overage',
      p_provider_reference_id,
      COALESCE(p_reference_id, CONCAT('topup:', now()::text)),
      p_metadata || jsonb_build_object('currency', v_currency)
    );
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.billing_change_plan_in_app(
  uuid,
  text,
  text,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_ensure_profile(
  uuid,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_reset_period_if_needed(
  uuid
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_set_currency(
  uuid,
  text,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_purchase_topup_manual(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  jsonb
) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Webhook reversal behavior: allow negative balances + immediate billing lock
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_reversal_webhook(
  p_user_id uuid,
  p_credit_delta_int integer,
  p_amount_usd_int integer,
  p_stripe_event_id text,
  p_stripe_object_id text,
  p_reference_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lock_reason text;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE stripe_event_id = p_stripe_event_id
  ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_lock_reason := COALESCE(
    NULLIF(TRIM(p_metadata->>'lock_reason'), ''),
    CASE
      WHEN (p_metadata->>'event_type') = 'charge.dispute.created' THEN 'stripe_dispute'
      ELSE 'stripe_reversal'
    END
  );

  UPDATE public.profiles
  SET
    top_up_credits_cents = top_up_credits_cents - GREATEST(0, p_credit_delta_int),
    billing_locked_at = COALESCE(billing_locked_at, now()),
    billing_lock_reason = COALESCE(billing_lock_reason, v_lock_reason)
  WHERE id = p_user_id;

  INSERT INTO public.credit_ledger_events (
    subject_id,
    user_id,
    type,
    credit_delta_int,
    amount_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    stripe_event_id,
    stripe_object_id,
    provider_reference_id,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    p_user_id,
    'reversal',
    -GREATEST(0, p_credit_delta_int),
    -GREATEST(0, p_credit_delta_int),
    -GREATEST(0, p_amount_usd_int),
    NULL,
    'reversal',
    p_stripe_event_id,
    p_stripe_object_id,
    p_reference_id,
    p_reference_id,
    p_metadata || jsonb_build_object('lock_reason', v_lock_reason)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_topup_webhook(
  p_user_id uuid,
  p_credit_delta_int integer,
  p_amount_usd_int integer,
  p_stripe_event_id text,
  p_stripe_object_id text,
  p_reference_id text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE stripe_event_id = p_stripe_event_id
  ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  UPDATE public.profiles
  SET top_up_credits_cents = top_up_credits_cents + GREATEST(0, p_credit_delta_int)
  WHERE id = p_user_id;

  INSERT INTO public.credit_ledger_events (
    subject_id,
    user_id,
    type,
    credit_delta_int,
    amount_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    stripe_event_id,
    stripe_object_id,
    provider_reference_id,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    p_user_id,
    'topup_purchase',
    GREATEST(0, p_credit_delta_int),
    GREATEST(0, p_credit_delta_int),
    GREATEST(0, p_amount_usd_int),
    NULL,
    'overage',
    p_stripe_event_id,
    p_stripe_object_id,
    p_reference_id,
    p_reference_id,
    p_metadata
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_subscription_invoice_webhook(
  p_user_id uuid,
  p_plan_id text,
  p_cadence text,
  p_amount_usd_int integer,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_stripe_event_id text,
  p_stripe_object_id text,
  p_subscription_id text,
  p_subscription_status text DEFAULT 'active'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included_credits_int integer := 0;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE stripe_event_id = p_stripe_event_id
  ) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  v_included_credits_int := CASE p_plan_id
    WHEN 'plus' THEN 700
    WHEN 'pro' THEN 1800
    WHEN 'team' THEN 5000
    ELSE 100
  END;

  UPDATE public.profiles
  SET
    plan_id = p_plan_id,
    billing_cadence = p_cadence,
    stripe_subscription_id = p_subscription_id,
    stripe_subscription_status = p_subscription_status,
    period_start_at = p_period_start,
    period_end_at = p_period_end,
    included_credits_cents = v_included_credits_int
  WHERE id = p_user_id;

  INSERT INTO public.credit_ledger_events (
    subject_id,
    user_id,
    type,
    credit_delta_int,
    amount_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    stripe_event_id,
    stripe_object_id,
    provider_reference_id,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    p_user_id,
    'invoice_paid',
    v_included_credits_int,
    v_included_credits_int,
    GREATEST(0, p_amount_usd_int),
    NULL,
    'included_plan',
    p_stripe_event_id,
    p_stripe_object_id,
    CONCAT('invoice:', p_stripe_object_id),
    CONCAT('invoice:', p_stripe_object_id),
    jsonb_build_object('plan_id', p_plan_id, 'cadence', p_cadence)
  );

  INSERT INTO public.subscription_allowances (
    subject_type,
    subject_id,
    period_start,
    period_end,
    included_value_usd_int,
    included_used_value_usd_int
  )
  VALUES (
    'user',
    p_user_id,
    p_period_start,
    p_period_end,
    v_included_credits_int,
    0
  )
  ON CONFLICT (subject_type, subject_id, period_start, period_end)
  DO UPDATE SET
    included_value_usd_int = EXCLUDED.included_value_usd_int,
    included_used_value_usd_int = 0,
    updated_at = now();
END;
$$;
