# Persona-Driven MVP Execution Plan (Revised)

Date: 2026-02-26
Owner: Product + Engineering
Target: Build a retention-driving MVP in 6-8 weeks with a small team

## A) Revised `persona-driven-tech-plan.md`

### 1) MVP Objective And Scope Guardrails

Build one tight product loop:

1. User selects a job workflow pack during onboarding.
2. User fills guided inputs and generates useful outputs from templates.
3. User saves outputs/templates as reusable assets.
4. Weekly autopilot sends "what happened + what to do next".
5. User returns and reuses saved assets.

MVP principles:

- Retention first, not breadth.
- One source of truth for workflow packs.
- No P0 feature without instrumentation and acceptance criteria.
- If reliability is weak, cut features before adding new ones.

MVP success targets by end of week 8:

- Activation rate (new workspace to first saved asset in 24h): >= 35%.
- D7 workspace retention (activated workspaces): >= 20%.
- Weekly autopilot run success rate: >= 95%.
- Template reuse rate (workspaces using same template >=2 times/week): >= 30%.

### 2) Workflow Packs For MVP (P0)

Selected packs (3) based on recurring weekly pain + monetization + low input complexity:

| Pack                   | Why It Makes Money / Retains                                                           | Inputs (Simple)                                            | Weekly Loop                                         |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| Importer / Solo Seller | Direct margin impact (pricing, reorder, supplier follow-up). Clear willingness to pay. | Unit cost, shipping, duty/tax, current stock, weekly sales | Margin + reorder + supplier email draft             |
| Online Seller          | Repetitive DM/FAQ work every week; saved replies create immediate stickiness.          | Top FAQs, policy rules, product snippets                   | FAQ trend summary + reply-bank refresh              |
| Procurement / Tender   | High-value document workflows with deadlines and repeatable structure.                 | Tender text, deadline, mandatory requirements              | Bid checklist status + next actions + updated draft |

Why these 3 now:

- Shared platform primitives: onboarding, templates, versions, weekly reports.
- No deep external integrations required for useful first value.
- Each has clear weekly recurrence and measurable output quality.

### 3) P0 Inclusions (Build Now)

#### P0.1 Job-Based Onboarding And Guided Generation

- Workflow pack picker (3 packs only).
- Guided input forms per pack.
- "Generate first output" CTA from onboarding.
- Source of truth for packs in code only (`lib/workflows/packs.ts`, `lib/workflows/inputs.ts`, `lib/workflows/safeTemplates.ts`).

P0 acceptance criteria:

- New user can go from onboarding start to first generated output in <= 3 minutes (median).
- At least 90% of onboarding completions have `workflow_pack_selected` and `first_output_generated` events.

#### P0.2 Template Library With Versioning (Chosen Over Tracker)

- Create, save, duplicate, edit, search templates.
- Save output as template asset.
- Lightweight version history with restore.
- User-specific favorites via join table.

P0 acceptance criteria:

- User can restore any template to prior version in <= 2 clicks.
- Search returns relevant templates by keyword (title/body) with p95 query < 200ms at 50k templates/workspace.

#### P0.3 Weekly Autopilot (Basic But Reliable)

- Up to 3 active schedules per workspace.
- Weekly schedules only (no hourly/daily for MVP).
- Generates summary: "what happened" + "what to do next" + links to saved assets.
- Run engine is idempotent and concurrency-safe.

P0 acceptance criteria:

- No duplicate run for same schedule/period (`idempotency_key` unique).
- 95%+ successful runs across 7-day window.
- Failed runs are retryable up to max attempts and produce visible error state.

#### P0.4 Guardrails For MVP: Flagging + Safe Templates

- No hard blocking on streamed model output.
- Apply post-generation flags (policy warnings) and suggest safe template rewrite.
- Pack-specific safe templates for high-risk prompts.

P0 acceptance criteria:

- Flagged outputs are clearly labeled and tracked.
- Safe-template fallback offered for 100% of flagged outputs in supported packs.

#### P0.5 Instrumentation And Metrics Foundation

- Event taxonomy and required properties implemented before beta.
- Activation funnel, retention cohorts, and autopilot reliability dashboard live.

P0 acceptance criteria:

- > = 98% event delivery for required product events.
- Dashboard coverage exists for activation, retention, and autopilot reliability.

### 4) Explicit P0 Exclusions

Excluded from MVP (intentionally):

- Offline/PWA.
- Full RBAC and approvals.
- Deep integrations (email/calendar/CRM APIs). Optional CSV import/export only.
- Marketplace/template store.
- Streaming hard-block guardrails.
- Advanced BI dashboards beyond core product/ops views.

### 5) Source Of Truth Decision

MVP decision: workflow packs are static config in code only.

- Pack metadata, guided fields, and safe templates live in versioned code.
- No `workflow_packs` table in P0.

Migration to DB + admin UI (P1 trigger conditions):

- Trigger when either condition is met: >10 active packs or >2 non-engineering pack edits/week.
- Then add DB-backed pack definitions and admin editor; keep code fallback until parity is proven.

### 6) 8-Week MVP Timeline With Acceptance Criteria

| Week | Build                                                                   | Exit / Acceptance Criteria                                                                                                          |
| ---- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1    | Freeze scope, define pack configs, finalize schema, event contract      | Signed P0 scope doc. `packs.ts` contains exactly 3 packs. Schema RFC approved. Event dictionary reviewed by eng+product.            |
| 2    | Onboarding flow: pack selection + guided inputs + first generation path | User can select pack and generate first output end-to-end in staging. Activation events emitted for each step.                      |
| 3    | Template Library CRUD + full-text search + favorites join table         | Create/edit/save/search/favorite works with RLS. Search p95 < 200ms at seeded load test target.                                     |
| 4    | Template versioning + restore + save output as asset/template           | Version history visible; restore creates a new head version. Regression tests for version restore pass.                             |
| 5    | Autopilot schedules UI/API (weekly only, max 3 schedules)               | Create/pause/resume/delete schedule works. Validation prevents unsupported frequencies.                                             |
| 6    | Autopilot runner with idempotency + retries + locking + run logs        | Duplicate run prevented in concurrency test. Retry policy behaves as expected. Run status visible in UI.                            |
| 7    | Guardrail flagging + safe template fallback + core dashboards           | Flag events tracked. Safe template suggestion shown for flagged outputs. Activation + retention + autopilot dashboards operational. |
| 8    | Beta hardening, reliability fixes, docs, launch checklist               | 95%+ autopilot success in staging soak test, no P0 Sev-1 bugs, instrumentation QA sign-off, go/no-go review complete.               |

### 7) P1/P2 Roadmap (Intentionally Deferred)

#### P1 (After MVP proves retention)

- DB-backed workflow packs + admin pack editor.
- Simple tracker module (if template stickiness is insufficient).
- CSV import/export for pack inputs and reports.
- Buffered streaming mode for stricter guardrail enforcement.
- Basic role tiers (owner/member) if collaboration demand appears.

Why P1:

- Needed only after validating core loop and operator burden.
- Adds flexibility without destabilizing MVP reliability.

#### P2 (Scale / enterprise)

- Full RBAC and approvals/signature flows.
- Deep integrations (email/calendar/ERP/CRM APIs).
- Offline/PWA and low-bandwidth sync.
- Marketplace/community template sharing.
- Advanced analytics suite and experimentation platform.

Why P2:

- High implementation and support complexity.
- Not required to prove retention loop in first release.

## B) Database/Schema Section (Supabase/Postgres)

### 1) MVP Tables (New/Changed)

#### `templates` (new)

Purpose: Workspace-owned reusable templates.

Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `created_by UUID NOT NULL`
- `workflow_pack_id TEXT NOT NULL` (maps to static config id)
- `title TEXT NOT NULL`
- `description TEXT NULL`
- `body_md TEXT NOT NULL`
- `input_schema JSONB NOT NULL DEFAULT '[]'::jsonb`
- `is_system BOOLEAN NOT NULL DEFAULT false`
- `system_key TEXT NULL` (for seeded system templates)
- `workspace_use_count BIGINT NOT NULL DEFAULT 0`  
  MVP decision: usage count is workspace-level only.
- `last_used_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `search_tsv tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'') || ' ' || coalesce(body_md,''))) STORED`

Indexes:

- `idx_templates_workspace_pack_updated` on `(workspace_id, workflow_pack_id, updated_at DESC)`
- `idx_templates_workspace_updated` on `(workspace_id, updated_at DESC)`
- `idx_templates_search_tsv_gin` using `GIN(search_tsv)`
- `idx_templates_system_key` unique on `(workspace_id, system_key)` where `system_key is not null`

#### `template_versions` (new)

Purpose: Immutable version history.

Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `version_number INT NOT NULL`
- `title TEXT NOT NULL`
- `description TEXT NULL`
- `body_md TEXT NOT NULL`
- `input_schema JSONB NOT NULL DEFAULT '[]'::jsonb`
- `change_note TEXT NULL`
- `created_by UUID NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints/Indexes:

- `uq_template_versions_template_version` unique `(template_id, version_number)`
- `idx_template_versions_template_created` on `(template_id, created_at DESC)`
- `idx_template_versions_workspace_created` on `(workspace_id, created_at DESC)`

#### `template_favorites` (new)

Purpose: User-scoped favorites (fixes wrong template-level favorite model).

Columns:

- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `user_id UUID NOT NULL`
- `template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints/Indexes:

- Primary key `(workspace_id, user_id, template_id)`
- `idx_template_favorites_user_recent` on `(workspace_id, user_id, created_at DESC)`

#### `autopilot_schedules` (new)

Purpose: Store weekly autopilot schedule config.

Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `created_by UUID NOT NULL`
- `workflow_pack_id TEXT NOT NULL`
- `name TEXT NOT NULL`
- `template_id UUID NULL REFERENCES templates(id)`
- `prompt_override TEXT NULL`
- `input_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb`
- `timezone TEXT NOT NULL`
- `weekday SMALLINT NOT NULL CHECK (weekday between 0 and 6)`
- `hour SMALLINT NOT NULL CHECK (hour between 0 and 23)`
- `minute SMALLINT NOT NULL CHECK (minute between 0 and 59)`
- `status TEXT NOT NULL CHECK (status in ('active','paused','disabled')) DEFAULT 'active'`
- `next_run_at TIMESTAMPTZ NOT NULL`
- `last_run_at TIMESTAMPTZ NULL`
- `max_retries SMALLINT NOT NULL DEFAULT 2`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

- `idx_autopilot_schedules_due` on `(status, next_run_at)`
- `idx_autopilot_schedules_workspace_status` on `(workspace_id, status)`

#### `autopilot_runs` (new)

Purpose: Idempotent run ledger and retry state.

Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `schedule_id UUID NOT NULL REFERENCES autopilot_schedules(id) ON DELETE CASCADE`
- `workspace_id UUID NOT NULL REFERENCES workspaces(id)`
- `idempotency_key TEXT NOT NULL` (format: `schedule_id:YYYY-WW`)
- `scheduled_for TIMESTAMPTZ NOT NULL`
- `status TEXT NOT NULL CHECK (status in ('queued','running','succeeded','failed','skipped'))`
- `attempt_count SMALLINT NOT NULL DEFAULT 0`
- `started_at TIMESTAMPTZ NULL`
- `finished_at TIMESTAMPTZ NULL`
- `asset_template_id UUID NULL REFERENCES templates(id)`
- `summary_md TEXT NULL`
- `error_code TEXT NULL`
- `error_message TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Constraints/Indexes:

- `uq_autopilot_runs_idempotency` unique `(idempotency_key)`
- `idx_autopilot_runs_schedule_time` on `(schedule_id, scheduled_for DESC)`
- `idx_autopilot_runs_workspace_status` on `(workspace_id, status, created_at DESC)`

#### `product_events` (new, minimal instrumentation sink)

Purpose: Durable event log for funnels/cohorts and QA.

Columns:

- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`
- `workspace_id UUID NULL`
- `user_id UUID NULL`
- `session_id TEXT NULL`
- `event_name TEXT NOT NULL`
- `event_version SMALLINT NOT NULL DEFAULT 1`
- `properties JSONB NOT NULL DEFAULT '{}'::jsonb`
- `occurred_at TIMESTAMPTZ NOT NULL`
- `ingested_at TIMESTAMPTZ NOT NULL DEFAULT now()`

Indexes:

- `idx_product_events_name_time` on `(event_name, occurred_at DESC)`
- `idx_product_events_workspace_time` on `(workspace_id, occurred_at DESC)`
- `idx_product_events_user_time` on `(user_id, occurred_at DESC)`

### 2) Data Model Decisions Required By Critique

- Favorites fix: `templates.is_favorite` removed; replaced by `template_favorites`.
- Usage count decision: MVP stores `workspace_use_count` only.  
  Deferred extension: add per-user usage table in P1.
- System templates seeding: done via seed script/admin endpoint, never via schema migration.

Seeding flow (MVP):

- `scripts/seed-system-templates.ts` reads static pack templates.
- Admin endpoint `POST /api/admin/templates/seed` triggers idempotent upsert by `(workspace_id, system_key)`.
- Seed can run safely multiple times.

### 3) Autopilot Idempotency + Concurrency Model

Execution rules:

1. Scheduler scans due active schedules.
2. For each schedule and scheduled period, compute `idempotency_key`.
3. Insert run with `ON CONFLICT (idempotency_key) DO NOTHING`.
4. Only inserted row proceeds to execution.
5. Runner claims queued runs using transactional `FOR UPDATE SKIP LOCKED`.

Failure handling:

- Retry up to `max_retries` (default 2) with backoff (15m, 60m).
- If all retries fail, mark `failed` and keep error details.
- Stuck `running` run older than 30 minutes is marked `failed_stale` by recovery job.
- No catch-up flood: max one backfill run per schedule on restart.

Scheduling constraints (MVP):

- Weekly schedules only.
- Maximum 3 active schedules per workspace.
- User timezone stored per schedule; next run is computed timezone-aware.

### 4) Deferred Tables/Columns (Explicit)

Deferred to P1/P2:

- `workflow_packs` table and admin CRUD tables.
- `tracker_items`, `tracker_status_history` (if tracker is added later).
- Approval and signature tables (`approval_requests`, `signatures`, `approval_steps`).
- RBAC granularity tables (`roles`, `role_permissions`, `resource_acl`).
- Integration sync tables (`integration_connections`, `sync_jobs`, `webhook_deliveries`).
- `template_usage_by_user` table (per-user counters; P1 if needed).
- Hard-block guardrail policy tables for buffered output enforcement.

## C) Instrumentation Section

### 1) Event Spec (Name, Trigger, Required Properties)

Common required properties for all events:

- `workspace_id` (nullable for pre-workspace)
- `user_id` (nullable for anonymous)
- `session_id`
- `event_version`
- `source` (`web`, `api`, `worker`)
- `occurred_at`

| Event                        | When Fired                                  | Key Properties                                                   |
| ---------------------------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `onboarding_started`         | User sees onboarding entry screen           | `entry_point`, `is_new_user`                                     |
| `workflow_pack_selected`     | User selects one of 3 packs                 | `pack_id`, `pack_name`                                           |
| `guided_input_completed`     | User completes pack input form              | `pack_id`, `field_count`, `completion_time_sec`                  |
| `first_output_generated`     | First successful generation from onboarding | `pack_id`, `template_id`, `latency_ms`, `model_id`               |
| `asset_saved`                | User saves output as template/asset         | `asset_type` (`template`), `template_id`, `is_first_asset`       |
| `template_created`           | New template is created                     | `template_id`, `pack_id`, `is_system`                            |
| `template_updated`           | Template edited and saved                   | `template_id`, `version_number`                                  |
| `template_version_restored`  | User restores old version                   | `template_id`, `restored_from_version`, `new_version`            |
| `template_favorited`         | Favorite created                            | `template_id`                                                    |
| `template_unfavorited`       | Favorite removed                            | `template_id`                                                    |
| `template_search_performed`  | Search submitted in library                 | `query_length`, `result_count`, `latency_ms`                     |
| `template_applied`           | Template used to generate output            | `template_id`, `pack_id`                                         |
| `autopilot_schedule_created` | Schedule saved                              | `schedule_id`, `pack_id`, `weekday`, `hour`, `timezone`          |
| `autopilot_schedule_updated` | Schedule edited                             | `schedule_id`, `changed_fields`                                  |
| `autopilot_schedule_paused`  | Schedule paused                             | `schedule_id`                                                    |
| `autopilot_run_queued`       | Run inserted for time slot                  | `run_id`, `schedule_id`, `idempotency_key`                       |
| `autopilot_run_started`      | Worker starts run                           | `run_id`, `schedule_id`, `attempt_count`                         |
| `autopilot_run_succeeded`    | Run finishes success                        | `run_id`, `schedule_id`, `duration_ms`, `generated_assets_count` |
| `autopilot_run_failed`       | Run fails attempt                           | `run_id`, `schedule_id`, `attempt_count`, `error_code`           |
| `autopilot_run_deduplicated` | Duplicate prevented by idempotency          | `schedule_id`, `idempotency_key`                                 |
| `guardrail_flagged`          | Output flagged by guardrail policy          | `pack_id`, `policy_id`, `severity`                               |
| `safe_template_suggested`    | Safe template offered                       | `pack_id`, `safe_template_id`                                    |
| `weekly_active_workspace`    | Derived event (batch) for retention         | `week_start`, `active_definition_version`                        |

### 2) Activation Funnel Definition

Primary funnel (workspace-level):

1. `onboarding_started`
2. `workflow_pack_selected`
3. `guided_input_completed`
4. `first_output_generated`
5. `asset_saved` (template)
6. `autopilot_schedule_created` (optional but tracked as step-6 lift)

Metrics:

- Step conversion rates.
- Median time between steps.
- Drop-off by pack.

Primary activation KPI:

- Activated workspace = reached step 5 within 24 hours of step 1.

### 3) Retention And Cohort Definition

Cohort unit: workspace (not user) to match billing and team behavior.

Cohorts:

- Weekly cohort by first activation week (`activated_at` week).
- Pack-based cohort (`first_selected_pack_id`).

Active workspace definition (MVP):

- Workspace emits at least one of:
  - `template_applied`
  - `asset_saved`
  - `autopilot_run_succeeded`
    within a 7-day window.

Retention metrics:

- D7 retention: active on day 7 +/- 1 day after activation.
- W4 retention: active in week 4 after activation.
- Autopilot-assisted retention uplift: compare cohorts with >=1 active schedule vs none.

### 4) Dashboards (MVP Required)

Dashboard 1: Activation

- Funnel conversion by step and pack.
- Time-to-first-output and time-to-first-asset.
- Activation rate trend (daily/weekly).

Dashboard 2: Template Stickiness

- Templates created per activated workspace.
- Reuse rate (`template_applied` count >=2/template/week).
- Top templates by reuse and pack.

Dashboard 3: Autopilot Reliability

- Run success/failure/deduplicated counts.
- p50/p95 run duration.
- Retry distribution and terminal failure rate.

Dashboard 4: Retention

- D7/W4 retention by pack.
- Retention split by autopilot adoption.

### 5) Weekly Autopilot Success Metrics

Core SLO/KPIs:

- Run success rate >= 95% (7-day rolling).
- Duplicate run rate <= 0.5% (deduped events / queued events).
- On-time completion >= 90% (completed within 15 minutes of scheduled slot).
- Retry recovery >= 60% (failed first attempt, then succeeded on retry).
- Autopilot adoption >= 25% of activated workspaces by week 8.

## D) Risk & Mitigations (Top 10 With Kill Criteria)

| #   | Risk                                                  | Mitigation                                                                         | Kill Criteria (Cut Scope If Triggered)                                                                    |
| --- | ----------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Scope creep reintroduces feature zoo                  | Strict P0 change control; any new feature must replace, not add                    | If >2 new P0 features proposed after week 2, freeze and reject all non-bug additions                      |
| 2   | Weak activation despite onboarding build              | Run weekly funnel review; simplify pack inputs aggressively                        | If step 3->4 conversion < 40% by week 5, cut one pack and simplify remaining two                          |
| 3   | Template library over-engineering                     | Keep template model minimal; no marketplace/sharing in P0                          | If template epic slips >1 week, drop non-critical metadata and keep CRUD+search+versions only             |
| 4   | Search latency/regression on real data                | GIN + workspace indexes; load test with seeded data in week 3                      | If p95 search > 300ms after optimization, cut advanced ranking and ship keyword-only search               |
| 5   | Autopilot duplicate or race conditions                | Unique idempotency key + SKIP LOCKED claiming + dedupe event monitor               | If duplicate rate > 1% in soak tests, disable multi-worker execution and run single worker mode           |
| 6   | Autopilot reliability below target                    | Retries/backoff/stale-run recovery; detailed run logs                              | If success rate < 90% by week 7, cut schedule editing complexity and support one schedule/workspace       |
| 7   | Guardrail expectations mismatch with streaming        | Explicitly position as flagging, not hard blocking; safe templates for risky tasks | If policy stakeholders require hard blocking before launch, move launch or cut guardrails to warning-only |
| 8   | Instrumentation gaps make decisions impossible        | Event contract tests + ingestion QA + dashboard sign-off gate                      | If required event coverage < 95% by week 6, stop feature work and fix telemetry before beta               |
| 9   | Team bandwidth (small team, parallel work contention) | Weekly critical-path review; assign one owner per epic                             | If any critical path epic slips 2 consecutive weeks, cut lowest-value pack (Procurement first)            |
| 10  | User confusion from too many options                  | Limit to 3 packs, max 3 schedules, weekly-only cadence                             | If onboarding completion < 50%, remove optional fields and hide advanced settings behind "Advanced"       |
