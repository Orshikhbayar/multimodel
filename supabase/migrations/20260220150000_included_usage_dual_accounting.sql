-- Cursor-style included usage billing schema (Supabase-native)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_bucket') THEN
    CREATE TYPE public.billing_bucket AS ENUM (
      'included_plan',
      'included_auto',
      'bonus',
      'overage',
      'reversal'
    );
  END IF;
END $$;

-- Extend profile with billing state (server authoritative)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS plan_id text NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_cadence text NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS billing_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS period_start_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS period_end_at timestamptz NOT NULL DEFAULT (now() + interval '1 month'),
  ADD COLUMN IF NOT EXISTS included_credits_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS top_up_credits_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bonus_credits_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_status text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_customer_id_key
  ON public.profiles(stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_stripe_subscription_id_key
  ON public.profiles(stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.model_rates (
  model_id text PRIMARY KEY,
  display_name text NOT NULL,
  input_usd_per_1m_tokens_int integer NOT NULL,
  output_usd_per_1m_tokens_int integer NOT NULL,
  cached_input_usd_per_1m_tokens_int integer,
  credit_multiplier_basis_points integer,
  plan_lock_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.usage_holds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_reference_id text NOT NULL UNIQUE,
  model_id text NOT NULL,
  plan_id text NOT NULL,
  mode text,
  held_credits_int integer NOT NULL DEFAULT 0,
  held_included_credits_int integer NOT NULL DEFAULT 0,
  held_bonus_credits_int integer NOT NULL DEFAULT 0,
  held_top_up_credits_int integer NOT NULL DEFAULT 0,
  held_value_usd_int integer NOT NULL DEFAULT 0,
  auto_reserved_value_usd_int integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS usage_holds_user_status_created_idx
  ON public.usage_holds (user_id, status, created_at);

CREATE TABLE IF NOT EXISTS public.usage_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_reference_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  plan_id text NOT NULL,
  model_id text NOT NULL,
  mode text,
  tokens_in integer NOT NULL DEFAULT 0,
  tokens_out integer NOT NULL DEFAULT 0,
  tokens_total integer NOT NULL DEFAULT 0,
  usage_value_usd_int integer NOT NULL DEFAULT 0,
  billed_amount_usd_int integer NOT NULL DEFAULT 0,
  billed_credits_int integer NOT NULL DEFAULT 0,
  billing_bucket public.billing_bucket NOT NULL DEFAULT 'included_plan',
  status text NOT NULL DEFAULT 'running',
  hold_id uuid REFERENCES public.usage_holds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  metadata jsonb
);

CREATE INDEX IF NOT EXISTS usage_runs_user_created_idx
  ON public.usage_runs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_runs_bucket_created_idx
  ON public.usage_runs (billing_bucket, created_at DESC);

CREATE INDEX IF NOT EXISTS usage_runs_model_created_idx
  ON public.usage_runs (model_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.credit_ledger_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_run_id uuid REFERENCES public.usage_runs(id) ON DELETE SET NULL,
  type text NOT NULL,
  credit_delta_int integer NOT NULL,
  amount_usd_int integer NOT NULL DEFAULT 0,
  usage_value_usd_int integer NOT NULL DEFAULT 0,
  billing_bucket public.billing_bucket NOT NULL DEFAULT 'included_plan',
  stripe_event_id text UNIQUE,
  stripe_object_id text,
  reference_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS credit_ledger_events_user_created_idx
  ON public.credit_ledger_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS credit_ledger_events_reference_idx
  ON public.credit_ledger_events (reference_id);

CREATE TABLE IF NOT EXISTS public.subscription_allowances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL,
  subject_id uuid NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  included_value_usd_int integer NOT NULL,
  included_used_value_usd_int integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS subscription_allowances_subject_period_idx
  ON public.subscription_allowances (subject_type, subject_id, period_start, period_end);

CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  type text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS stripe_webhook_events_type_created_idx
  ON public.stripe_webhook_events (type, created_at DESC);

-- Keep updated_at fields current
DROP TRIGGER IF EXISTS model_rates_set_updated_at ON public.model_rates;
CREATE TRIGGER model_rates_set_updated_at
BEFORE UPDATE ON public.model_rates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS subscription_allowances_set_updated_at ON public.subscription_allowances;
CREATE TRIGGER subscription_allowances_set_updated_at
BEFORE UPDATE ON public.subscription_allowances
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Access grants (read-only for authenticated clients; writes via service role)
GRANT SELECT ON public.model_rates TO authenticated;
GRANT SELECT ON public.usage_runs TO authenticated;
GRANT SELECT ON public.credit_ledger_events TO authenticated;
GRANT SELECT ON public.subscription_allowances TO authenticated;

-- RLS
ALTER TABLE public.model_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_rates_read_all ON public.model_rates;
CREATE POLICY model_rates_read_all
ON public.model_rates
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS usage_holds_read_own ON public.usage_holds;
CREATE POLICY usage_holds_read_own
ON public.usage_holds
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS usage_runs_read_own ON public.usage_runs;
CREATE POLICY usage_runs_read_own
ON public.usage_runs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS credit_ledger_events_read_own ON public.credit_ledger_events;
CREATE POLICY credit_ledger_events_read_own
ON public.credit_ledger_events
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS subscription_allowances_read_own ON public.subscription_allowances;
CREATE POLICY subscription_allowances_read_own
ON public.subscription_allowances
FOR SELECT
TO authenticated
USING (subject_type = 'user' AND subject_id = auth.uid());

DROP POLICY IF EXISTS stripe_webhook_events_deny_authenticated ON public.stripe_webhook_events;
CREATE POLICY stripe_webhook_events_deny_authenticated
ON public.stripe_webhook_events
FOR ALL
TO authenticated
USING (false)
WITH CHECK (false);

-- Seed model API-equivalent retail rates (cents per 1M tokens)
INSERT INTO public.model_rates (
  model_id,
  display_name,
  input_usd_per_1m_tokens_int,
  output_usd_per_1m_tokens_int
)
VALUES
  ('openai/gpt-4.1', 'GPT-4.1', 1000, 3000),
  ('openai/gpt-5-mini', 'GPT-5 mini', 1200, 3600),
  ('openai/gpt-5.2', 'GPT-5.2', 1800, 5400),
  ('openai/gpt-5.2-codex', 'GPT-5.2 Codex', 2000, 6000),
  ('openai/gpt-5.1', 'GPT-5.1', 1600, 4800),
  ('openai/gpt-4o', 'GPT-4o', 250, 1000),
  ('openai/gpt-4o-mini', 'GPT-4o mini', 15, 60),
  ('anthropic/claude-sonnet-4', 'Claude Sonnet 4', 1200, 3600),
  ('anthropic/claude-opus-4.1', 'Claude Opus 4.1', 1850, 5550),
  ('anthropic/claude-3.5', 'Claude 3.5', 1150, 3450),
  ('anthropic/claude-opus-4', 'Claude Opus 4', 1800, 5400),
  ('google/gemini-3-flash-preview', 'Gemini 3 Flash', 650, 1950),
  ('google/gemini-3-pro-preview', 'Gemini 3 Pro', 1400, 4200),
  ('google/gemini-3-pro-image-preview', 'Gemini 3 Pro Image', 2000, 6000),
  ('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 500, 1500),
  ('google/gemini-2.0', 'Gemini 2.0', 1250, 3750),
  ('xai/grok-4', 'Grok 4', 1350, 4050),
  ('xai/grok-3', 'Grok 3', 1100, 3300),
  ('deepseek/deepseek-reasoner', 'DeepSeek Reasoner', 900, 2700),
  ('deepseek/deepseek-chat', 'DeepSeek Chat', 600, 1800),
  ('default', 'Default', 15, 60)
ON CONFLICT (model_id)
DO UPDATE SET
  display_name = EXCLUDED.display_name,
  input_usd_per_1m_tokens_int = EXCLUDED.input_usd_per_1m_tokens_int,
  output_usd_per_1m_tokens_int = EXCLUDED.output_usd_per_1m_tokens_int,
  updated_at = now();

-- Atomic hold reservation used by API runtime to protect balances under concurrency
CREATE OR REPLACE FUNCTION public.billing_start_run(
  p_user_id uuid,
  p_run_reference_id text,
  p_requested_model_id text,
  p_effective_model_id text,
  p_plan_id text,
  p_mode text,
  p_estimated_held_credits_int integer,
  p_estimated_value_usd_int integer,
  p_use_auto boolean
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
  v_bucket public.billing_bucket;
  v_held_credits integer := 0;
  v_held_included integer := 0;
  v_held_bonus integer := 0;
  v_held_topup integer := 0;
  v_auto_reserved integer := 0;
BEGIN
  SELECT * INTO v_existing_hold
  FROM public.usage_holds
  WHERE run_reference_id = p_run_reference_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'idempotent', true,
      'hold_id', v_existing_hold.id,
      'bucket', v_existing_hold.metadata->>'bucket_hint',
      'model_id', p_effective_model_id
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  IF p_use_auto THEN
    v_bucket := 'included_auto';
    v_auto_reserved := GREATEST(0, p_estimated_value_usd_int);
  ELSE
    v_held_credits := GREATEST(0, p_estimated_held_credits_int);

    IF (v_profile.included_credits_cents + v_profile.bonus_credits_cents + v_profile.top_up_credits_cents) < v_held_credits THEN
      RAISE EXCEPTION 'INSUFFICIENT_CREDITS';
    END IF;

    v_held_included := LEAST(v_profile.included_credits_cents, v_held_credits);
    v_held_bonus := LEAST(
      v_profile.bonus_credits_cents,
      GREATEST(v_held_credits - v_held_included, 0)
    );
    v_held_topup := LEAST(
      v_profile.top_up_credits_cents,
      GREATEST(v_held_credits - v_held_included - v_held_bonus, 0)
    );

    UPDATE public.profiles
    SET
      included_credits_cents = included_credits_cents - v_held_included,
      bonus_credits_cents = bonus_credits_cents - v_held_bonus,
      top_up_credits_cents = top_up_credits_cents - v_held_topup
    WHERE id = p_user_id;

    v_bucket := CASE
      WHEN v_held_topup > 0 THEN 'overage'
      WHEN v_held_bonus > 0 THEN 'bonus'
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
    p_user_id,
    p_run_reference_id,
    p_effective_model_id,
    p_plan_id,
    p_mode,
    v_held_credits,
    v_held_included,
    v_held_bonus,
    v_held_topup,
    GREATEST(0, p_estimated_value_usd_int),
    v_auto_reserved,
    'active',
    jsonb_build_object(
      'requested_model_id', p_requested_model_id,
      'bucket_hint', v_bucket
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
    p_run_reference_id,
    p_user_id,
    p_plan_id,
    p_effective_model_id,
    p_mode,
    v_bucket,
    'running',
    v_hold_id,
    jsonb_build_object(
      'requested_model_id', p_requested_model_id
    )
  )
  RETURNING id INTO v_run_id;

  INSERT INTO public.credit_ledger_events (
    user_id,
    usage_run_id,
    type,
    credit_delta_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    v_run_id,
    'usage_hold',
    -v_held_credits,
    0,
    GREATEST(0, p_estimated_value_usd_int),
    v_bucket,
    p_run_reference_id,
    jsonb_build_object(
      'held_included_credits_int', v_held_included,
      'held_bonus_credits_int', v_held_bonus,
      'held_top_up_credits_int', v_held_topup,
      'auto_reserved_value_usd_int', v_auto_reserved
    )
  );

  RETURN jsonb_build_object(
    'idempotent', false,
    'hold_id', v_hold_id,
    'usage_run_id', v_run_id,
    'bucket', v_bucket,
    'held_credits_int', v_held_credits,
    'held_included_credits_int', v_held_included,
    'held_bonus_credits_int', v_held_bonus,
    'held_top_up_credits_int', v_held_topup,
    'auto_reserved_value_usd_int', v_auto_reserved,
    'model_id', p_effective_model_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_finalize_run(
  p_user_id uuid,
  p_run_reference_id text,
  p_model_id text,
  p_prompt_tokens integer,
  p_completion_tokens integer,
  p_usage_value_usd_int integer,
  p_billed_credits_int integer,
  p_status text,
  p_failure_reason text DEFAULT NULL
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
  v_refund_included integer := 0;
  v_refund_bonus integer := 0;
  v_refund_topup integer := 0;
  v_extra_included integer := 0;
  v_extra_bonus integer := 0;
  v_extra_topup integer := 0;
  v_used_held_included integer := 0;
  v_used_held_bonus integer := 0;
  v_used_held_topup integer := 0;
  v_remaining integer := 0;
  v_uncovered integer := 0;
  v_charged_included integer := 0;
  v_charged_bonus integer := 0;
  v_charged_topup integer := 0;
  v_charged_total integer := 0;
  v_billed_amount_usd_int integer := 0;
  v_bucket public.billing_bucket := 'included_plan';
  v_net_credit_delta integer := 0;
BEGIN
  SELECT * INTO v_hold
  FROM public.usage_holds
  WHERE run_reference_id = p_run_reference_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hold_not_found');
  END IF;

  IF v_hold.status <> 'active' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', v_hold.status);
  END IF;

  SELECT * INTO v_profile
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PROFILE_NOT_FOUND';
  END IF;

  SELECT * INTO v_run
  FROM public.usage_runs
  WHERE run_reference_id = p_run_reference_id
  FOR UPDATE;

  IF p_status <> 'completed' THEN
    UPDATE public.profiles
    SET
      included_credits_cents = included_credits_cents + v_hold.held_included_credits_int,
      bonus_credits_cents = bonus_credits_cents + v_hold.held_bonus_credits_int,
      top_up_credits_cents = top_up_credits_cents + v_hold.held_top_up_credits_int
    WHERE id = p_user_id;

    UPDATE public.usage_holds
    SET
      status = p_status,
      resolved_at = now()
    WHERE id = v_hold.id;

    UPDATE public.usage_runs
    SET
      status = p_status,
      finished_at = now(),
      metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('failure_reason', p_failure_reason)
    WHERE id = v_run.id;

    INSERT INTO public.credit_ledger_events (
      user_id,
      usage_run_id,
      type,
      credit_delta_int,
      amount_usd_int,
      usage_value_usd_int,
      billing_bucket,
      reference_id,
      metadata
    )
    VALUES (
      p_user_id,
      v_run.id,
      'usage_release',
      v_hold.held_credits_int,
      0,
      0,
      'reversal',
      p_run_reference_id,
      jsonb_build_object('reason', COALESCE(p_failure_reason, p_status))
    );

    RETURN jsonb_build_object(
      'ok', true,
      'status', p_status,
      'bucket', 'reversal'
    );
  END IF;

  IF v_hold.auto_reserved_value_usd_int > 0 THEN
    v_bucket := 'included_auto';
    v_charged_total := 0;
  ELSE
    v_remaining := GREATEST(0, p_billed_credits_int);

    v_used_held_included := LEAST(v_hold.held_included_credits_int, v_remaining);
    v_remaining := v_remaining - v_used_held_included;

    v_used_held_bonus := LEAST(v_hold.held_bonus_credits_int, v_remaining);
    v_remaining := v_remaining - v_used_held_bonus;

    v_used_held_topup := LEAST(v_hold.held_top_up_credits_int, v_remaining);
    v_remaining := v_remaining - v_used_held_topup;

    v_extra_included := LEAST(v_profile.included_credits_cents, v_remaining);
    v_remaining := v_remaining - v_extra_included;

    v_extra_bonus := LEAST(v_profile.bonus_credits_cents, v_remaining);
    v_remaining := v_remaining - v_extra_bonus;

    v_extra_topup := LEAST(v_profile.top_up_credits_cents, v_remaining);
    v_remaining := v_remaining - v_extra_topup;

    v_uncovered := GREATEST(0, v_remaining);
    v_charged_total := GREATEST(0, p_billed_credits_int - v_uncovered);

    v_refund_included := v_hold.held_included_credits_int - v_used_held_included;
    v_refund_bonus := v_hold.held_bonus_credits_int - v_used_held_bonus;
    v_refund_topup := v_hold.held_top_up_credits_int - v_used_held_topup;

    UPDATE public.profiles
    SET
      included_credits_cents = GREATEST(0, included_credits_cents + v_refund_included - v_extra_included),
      bonus_credits_cents = GREATEST(0, bonus_credits_cents + v_refund_bonus - v_extra_bonus),
      top_up_credits_cents = GREATEST(0, top_up_credits_cents + v_refund_topup - v_extra_topup)
    WHERE id = p_user_id;

    v_charged_included := v_used_held_included + v_extra_included;
    v_charged_bonus := v_used_held_bonus + v_extra_bonus;
    v_charged_topup := v_used_held_topup + v_extra_topup;
    v_billed_amount_usd_int := v_charged_topup;

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
    tokens_in = GREATEST(0, p_prompt_tokens),
    tokens_out = GREATEST(0, p_completion_tokens),
    tokens_total = GREATEST(0, p_prompt_tokens) + GREATEST(0, p_completion_tokens),
    usage_value_usd_int = GREATEST(0, p_usage_value_usd_int),
    billed_amount_usd_int = v_billed_amount_usd_int,
    billed_credits_int = v_charged_total,
    billing_bucket = v_bucket,
    status = 'completed',
    finished_at = now(),
    metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
      'uncovered_credits_int', v_uncovered,
      'charged_included_credits_int', v_charged_included,
      'charged_bonus_credits_int', v_charged_bonus,
      'charged_top_up_credits_int', v_charged_topup
    )
  WHERE id = v_run.id;

  IF v_bucket = 'included_plan' THEN
    UPDATE public.subscription_allowances
    SET included_used_value_usd_int = included_used_value_usd_int + GREATEST(0, p_usage_value_usd_int)
    WHERE subject_type = 'user'
      AND subject_id = p_user_id
      AND period_start <= now()
      AND period_end > now();
  END IF;

  v_net_credit_delta :=
    v_refund_included + v_refund_bonus + v_refund_topup -
    v_extra_included - v_extra_bonus - v_extra_topup;

  INSERT INTO public.credit_ledger_events (
    user_id,
    usage_run_id,
    type,
    credit_delta_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    v_run.id,
    'usage_finalize',
    v_net_credit_delta,
    v_billed_amount_usd_int,
    GREATEST(0, p_usage_value_usd_int),
    v_bucket,
    p_run_reference_id,
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
    'billed_amount_usd_int', v_billed_amount_usd_int,
    'usage_value_usd_int', GREATEST(0, p_usage_value_usd_int)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.billing_start_run(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  boolean
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.billing_finalize_run(
  uuid,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  text,
  text
) TO authenticated, service_role;

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

  UPDATE public.profiles
  SET top_up_credits_cents = top_up_credits_cents + GREATEST(0, p_credit_delta_int)
  WHERE id = p_user_id;

  INSERT INTO public.credit_ledger_events (
    user_id,
    type,
    credit_delta_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    stripe_event_id,
    stripe_object_id,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    'topup_purchase',
    GREATEST(0, p_credit_delta_int),
    GREATEST(0, p_amount_usd_int),
    0,
    'overage',
    p_stripe_event_id,
    p_stripe_object_id,
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
    user_id,
    type,
    credit_delta_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    stripe_event_id,
    stripe_object_id,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    'invoice_paid',
    v_included_credits_int,
    GREATEST(0, p_amount_usd_int),
    0,
    'included_plan',
    p_stripe_event_id,
    p_stripe_object_id,
    CONCAT('invoice:', p_stripe_object_id),
    jsonb_build_object(
      'plan_id', p_plan_id,
      'cadence', p_cadence
    )
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
  DO NOTHING;
END;
$$;

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
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.credit_ledger_events
    WHERE stripe_event_id = p_stripe_event_id
  ) THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET top_up_credits_cents = GREATEST(0, top_up_credits_cents - GREATEST(0, p_credit_delta_int))
  WHERE id = p_user_id;

  INSERT INTO public.credit_ledger_events (
    user_id,
    type,
    credit_delta_int,
    amount_usd_int,
    usage_value_usd_int,
    billing_bucket,
    stripe_event_id,
    stripe_object_id,
    reference_id,
    metadata
  )
  VALUES (
    p_user_id,
    'reversal',
    -GREATEST(0, p_credit_delta_int),
    -GREATEST(0, p_amount_usd_int),
    0,
    'reversal',
    p_stripe_event_id,
    p_stripe_object_id,
    p_reference_id,
    p_metadata
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_topup_webhook(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  jsonb
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.apply_subscription_invoice_webhook(
  uuid,
  text,
  text,
  integer,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  text
) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.apply_reversal_webhook(
  uuid,
  integer,
  integer,
  text,
  text,
  text,
  jsonb
) TO authenticated, service_role;
