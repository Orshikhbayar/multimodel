# CLAUDE.md — Multimodel AI

## What is this project?

A Next.js 16 multi-model AI chat application deployed at `multimodel-ai.vercel.app`. Users can compare responses from OpenAI, Anthropic, Google, xAI, and DeepSeek models side-by-side in a single conversation. Includes billing, usage tracking, interactive visualizations, and PPTX generation.

## Tech Stack

- **Framework**: Next.js 16 (App Router), TypeScript, React 19
- **Styling**: Tailwind CSS, shadcn/ui (Radix primitives)
- **Database**: Supabase (Postgres + Auth + RLS)
- **State**: Zustand (client), React Server Components (server)
- **Streaming**: SSE from `app/api/chat/route.ts` (Node.js runtime — no `runtime` export; the `clarify` and `chat/collab` routes declare `edge`)
- **Billing**: Custom credit-based system with holds, ledger events, and plan tiers
- **Rate Limiting**: In-memory + optional Upstash Redis sliding window
- **Error Tracking**: Sentry
- **Deployment**: Vercel (auto-deploy from `main`)
- **Testing**: Vitest (unit), Playwright (e2e)

## Project Structure

```
app/
  api/
    chat/route.ts          # Main streaming chat endpoint (SSE)
    usage/limits/route.ts  # Usage limits API for dashboard
    auth/                  # Auth callbacks
    billing/               # Stripe/billing webhooks
  dashboard/               # Protected dashboard (usage, billing, limits, plans)
  (shell)/                 # Public routes (about, pricing, terms, chat)
  auth/                    # Login, logout, password reset

components/
  chat/                    # MessageItem, InteractiveBlock, PptxBlock, UsageLimitBanner
  billing/                 # UpgradeModal, TopUpModal, OutOfCreditsModal
  dashboard/               # DashboardUsage, DashboardLimits, DashboardSubnav
  ui/                      # shadcn/ui primitives (Button, Card, Progress, etc.)

lib/
  api/                     # Provider adapters (OpenAI, Anthropic, Google, xAI, DeepSeek)
  billing/
    plans.ts               # Plan definitions (Free, Pro)
    types.ts               # PlanId, Currency, BillingState types
    supabaseService.ts     # Metering, holds, quotas, auto-routing
    cost.ts                # Token cost calculation
    estimator.ts           # Client-side cost estimation
  hooks/
    useChatActions.ts      # Main chat hook — message sending, system prompts
  utils/
    interactiveBlocks.ts   # Splits AI responses into text/interactive/pptx segments
    markdownToHtml.ts      # Client-side markdown → interactive HTML transform
    markdownToPptx.ts      # Client-side markdown → PPTX slide data
    generatePptx.ts        # pptxgenjs wrapper for .pptx blob creation
  rateLimit.ts             # Rate + concurrency limiting
  rateLimitUpstash.ts      # Upstash Redis sliding window
  supabase/
    server.ts              # Server-side Supabase client (cookie-based auth)
    client.ts              # Browser-side Supabase client
    admin.ts               # Service-role admin client
    database.types.ts      # Generated DB types
  actions/
    usage.ts               # Server actions: getUsageRecords, getUsageSummary, checkQuota

supabase/
  migrations/              # SQL migration files
```

## Key Architecture Decisions

### Streaming

All chat completions stream via SSE from `app/api/chat/route.ts`. The endpoint handles auth, rate limiting, billing holds, provider routing, token counting, and metering in a single request lifecycle. Concurrency slots are released in a `finally` block.

### Billing

Dual-accounting credit system: included credits (from plan) + top-up credits. A "hold" is created before streaming starts, then finalized with actual token usage when the stream completes. Plan-specific auto-policies limit tokens per request, requests per minute, and daily spend.

### Visualizations (Client-Side)

Models are NOT asked to produce special code blocks. Instead, the client detects user intent via regex triggers (e.g., "dashboard", "chart", "presentation") and transforms plain markdown into interactive HTML or PPTX data. This avoids model-cooperation problems (GPT-4o-mini ignoring system prompts).

Key regex patterns live in `lib/utils/contentTriggers.ts` (single source of truth, imported by `interactiveBlocks.ts` and `useChatActions.ts`):

```typescript
const VIZ_TRIGGERS =
  /\b(visualiz\w*|interactive|diagram|chart|dashboard|...)\b/i;
const PPTX_TRIGGERS = /\b(presentation|slides?|pptx|powerpoint|deck|...)\b/i;
```

### Rate Limiting

Two layers: (1) in-memory fixed-window (20 req/60s, 2 concurrent) for local dev, (2) Upstash Redis sliding window for production. Tester bypass via `UNLIMITED_TESTER_EMAILS` env var.

## Environment Variables

Required:

- `OPENAI_API_KEY` — OpenAI API key
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — For admin/billing operations

Optional provider keys:

- `ANTHROPIC_API_KEY` — Anthropic (Claude)
- `GOOGLE_AI_API_KEY` — Google (Gemini)
- `XAI_API_KEY` — xAI (Grok)
- `DEEPSEEK_API_KEY` — DeepSeek

Optional infrastructure:

- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — Distributed rate limiting
- `SENTRY_DSN` — Error tracking
- `NEXT_PUBLIC_DISABLE_SERVER_BILLING` — Disable billing (for testing)
- `E2E_AUTH_BYPASS` — Skip auth in e2e tests
- `UNLIMITED_TESTER_EMAILS` — Comma-separated emails that bypass limits

## Plans

| Feature           | Free   | Pro ($12/mo) |
| ----------------- | ------ | ------------ |
| Daily token cap   | 2,000  | Unlimited    |
| Monthly token cap | 30,000 | Unlimited    |
| Max models        | 3      | 6            |
| Monthly credits   | $1     | $18          |
| Web search        | No     | Yes          |
| Image generation  | No     | Yes          |

## Common Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest unit tests
npm run test:e2e     # Playwright e2e tests
```

## Database

Supabase Postgres with RLS. Key tables:

- `profiles` — User plan, credits, billing period
- `conversations` — Chat threads
- `messages` — Individual messages
- `model_runs` — Per-request usage tracking (tokens, cost, latency)
- `usage_runs` / `usage_holds` — Billing metering with credit holds
- `credit_ledger_events` — Transaction log for all credit movements
- `subscription_allowances` — Period-based usage allowances

Migrations live in `supabase/migrations/`. Run with Supabase CLI.

## Conventions

- All API routes return JSON with `requestId` for tracing
- Error responses include machine-readable `code` fields
- Billing errors use HTTP 402 (insufficient credits), 403 (upgrade required), 429 (quota exceeded)
- Components use `useI18n()` hook for translations
- File paths use `@/` alias pointing to project root
- Server actions in `lib/actions/` use `"use server"` directive
- Client components use `"use client"` directive

## Gotchas

1. **Regex word boundaries**: `\b(visualiz)\b` does NOT match "visualization" — use `\b(visualiz\w*)` instead
2. **In-memory rate limiting on Vercel**: Each cold start gets its own Map, so it provides zero protection without Upstash Redis configured
3. **GPT-4o-mini system prompt compliance**: This model ignores complex system prompts. Don't rely on model cooperation for structured output formats — use client-side transforms instead
4. **Billing holds**: If a stream fails after `startUsageRunMetering()` but before `finalizeUsageRunMetering()`, the held credits stay locked. The outer catch in `route.ts` handles this cleanup
5. **HEAD.lock**: Git operations sometimes leave stale lock files. Delete `.git/HEAD.lock` if git commands fail with "File exists"
