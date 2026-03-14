import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const migrationPath = path.resolve(
  process.cwd(),
  "supabase/migrations/20260220183000_supabase_prisma_parity_and_freeze.sql",
);

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

describe("supabase parity + freeze migration", () => {
  it("adds prisma parity schema columns", () => {
    const sql = readMigration();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.projects");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS project_id uuid");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS edited_at timestamptz");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS attachments jsonb");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS tool_calls jsonb");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS slot_id integer");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS interrupted boolean NOT NULL DEFAULT false",
    );
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS sources jsonb");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS disagreements jsonb");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS total_tokens integer");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS error_code text");
  });

  it("hardens ledger idempotency columns and indexes", () => {
    const sql = readMigration();

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS subject_id uuid");
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS provider_reference_id text",
    );
    expect(sql).toContain(
      "ADD COLUMN IF NOT EXISTS amount_int bigint NOT NULL DEFAULT 0",
    );
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS credit_ledger_events_subject_created_idx",
    );
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS credit_ledger_events_created_idx",
    );
    expect(sql).toContain(
      "CREATE INDEX IF NOT EXISTS credit_ledger_events_stripe_event_idx",
    );
  });

  it("serializes billing start/finalize with advisory locks", () => {
    const sql = readMigration();
    const lockRegex =
      /pg_advisory_xact_lock\(hashtext\(p_subject_id::text\)\)/g;
    const matches = sql.match(lockRegex);

    expect(matches?.length ?? 0).toBeGreaterThanOrEqual(4);
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_start_run(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_finalize_run(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_change_plan_in_app(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_set_currency(",
    );
    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.billing_purchase_topup_manual(",
    );
    expect(sql).toContain("RAISE EXCEPTION 'BILLING_LOCKED'");
  });

  it("implements dispute reversal lock behavior", () => {
    const sql = readMigration();

    expect(sql).toContain(
      "CREATE OR REPLACE FUNCTION public.apply_reversal_webhook(",
    );
    expect(sql).toContain(
      "top_up_credits_cents = top_up_credits_cents - GREATEST(0, p_credit_delta_int)",
    );
    expect(sql).toContain(
      "billing_locked_at = COALESCE(billing_locked_at, now())",
    );
    expect(sql).toContain(
      "billing_lock_reason = COALESCE(billing_lock_reason, v_lock_reason)",
    );
    expect(sql).toContain("'reversal'");
  });
});
