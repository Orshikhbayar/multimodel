# Test Failure Diagnostic & Fix Guide

## Root Cause Analysis

After examining the codebase, there are **3 primary root causes** that explain virtually all 64+ unit test failures and the E2E crash. They are ordered by blast radius.

---

## Root Cause 1: The E2E Bypass Mock in `server.ts` Is Missing `.insert()`, `.select()`, `.delete()`

**File:** `lib/supabase/server.ts`, lines 46-53

This is the single biggest issue. When `E2E_AUTH_BYPASS=true` (which Playwright sets by default), `createSupabaseServerClient()` returns a hand-rolled stub instead of a real Supabase client. That stub's `from()` only provides `upsert` and `update`:

```typescript
from: () => ({
  upsert: async () => ({ data: null, error: null }),
  update: () => ({
    eq: () => ({
      eq: async () => ({ data: null, error: null }),
    }),
  }),
}),
```

But production code calls `.from("messages").insert(...)`, `.from("model_runs").insert(...)`, `.from("conversations").select(...)`, `.from("conversations").delete(...)`, etc. Since `insert` is not on this stub object, you get:

```
TypeError: r.from(...).insert is not a function
```

This crashes the Next.js server mid-request, which causes every Playwright test to time out waiting for UI that never renders.

### Fix

Replace the bypass stub's `from()` with a proper chainable no-op builder:

```typescript
// lib/supabase/server.ts — replace the `from:` block (lines 46-53)

from: () => {
  const noopChain: Record<string, unknown> = {};
  const self = () => noopChain;
  const asyncSelf = async () => ({ data: null, error: null });

  // Every query-builder method returns the chain
  for (const method of [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
    "is", "in", "order", "limit", "range", "filter",
    "not", "or", "contains", "containedBy", "overlaps",
    "textSearch", "match", "csv",
  ]) {
    noopChain[method] = vi.fn ? vi.fn(self) : self;
  }

  // Terminal methods resolve the promise
  noopChain.single = async () => ({ data: null, error: null });
  noopChain.maybeSingle = async () => ({ data: null, error: null });
  noopChain.then = (resolve: (v: unknown) => void) =>
    resolve({ data: null, error: null });

  return noopChain;
},
```

Or, more cleanly, extract the shared logic into `test/utils/mockSupabase.ts` and import it. But since `server.ts` is production code and shouldn't import test utils, use a `Proxy` instead:

```typescript
from: () => {
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop) {
      if (prop === "then") return undefined; // not a thenable
      if (prop === "single" || prop === "maybeSingle") {
        return async () => ({ data: null, error: null });
      }
      // Every other property returns a function that returns the proxy
      return (..._args: unknown[]) => new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
},
```

This is zero-dependency, handles any chain depth, and won't crash on any query pattern. **This single fix will likely resolve all E2E failures.**

---

## Root Cause 2: Vitest Mocks for `@/lib/rateLimit` Are Missing `checkStreamPermissionAsync`

**File:** `app/api/chat/route.test.ts`, line 82-86

The route code imports and calls `checkStreamPermissionAsync`:

```typescript
// app/api/chat/route.ts:14
import { checkStreamPermissionAsync, ... } from "@/lib/rateLimit";

// app/api/chat/route.ts:92
const permission = await checkStreamPermissionAsync(sessionUserId, ...);
```

But the test mock only provides the **synchronous** variant:

```typescript
vi.mock("@/lib/rateLimit", () => ({
  checkStreamPermission: mockCheckStreamPermission,     // ← sync
  releaseConcurrencySlot: mockReleaseConcurrencySlot,
  getRateLimitHeaders: mockGetRateLimitHeaders,
}));
```

`checkStreamPermissionAsync` is `undefined`, so calling it throws `TypeError: checkStreamPermissionAsync is not a function`. Every test that hits the chat route will fail.

### Fix

Add the missing export to the mock:

```typescript
vi.mock("@/lib/rateLimit", () => ({
  checkStreamPermission: mockCheckStreamPermission,
  checkStreamPermissionAsync: mockCheckStreamPermission,  // ← ADD THIS
  releaseConcurrencySlot: mockReleaseConcurrencySlot,
  getRateLimitHeaders: mockGetRateLimitHeaders,
}));
```

Both `checkStreamPermission` and `checkStreamPermissionAsync` return the same shape, so the same mock function works.

---

## Root Cause 3: Unit Tests Hit BILLING_DISABLED Because No `SUPABASE_SERVICE_ROLE_KEY`

**File:** `lib/billing/supabaseService.ts`, lines 84-86

```typescript
const BILLING_DISABLED =
  process.env.NEXT_PUBLIC_DISABLE_SERVER_BILLING === "true" ||
  !process.env.SUPABASE_SERVICE_ROLE_KEY;
```

In CI (and in local `vitest run`), `SUPABASE_SERVICE_ROLE_KEY` is not set, so `BILLING_DISABLED = true`. Every metering function returns `null` early. Tests expecting actual billing data (usage values, plan details) get `null` instead.

### Fix

In test files that test billing logic, stub the env before the module loads:

```typescript
// At the top of billing test files, BEFORE any imports:
vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_test_key");
```

Or create a `.env.test` and configure Vitest to load it:

```env
# .env.test
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_test_publishable
SUPABASE_SERVICE_ROLE_KEY=sb_test_service_role
NEXT_PUBLIC_DISABLE_SERVER_BILLING=false
OPENAI_API_KEY=sk-test-key
```

Then in `vitest.config.ts`:

```typescript
import { loadEnv } from "vite";

export default defineConfig({
  // ...existing config
  test: {
    env: loadEnv("test", process.cwd(), ""),
    // or:
    // envFile: ".env.test",
  },
});
```

---

## Secondary Issues (lower blast radius)

### 4. `calculateUsageValueUsdInt` Returns NaN

**Location:** `lib/billing/supabaseService.ts:403-417`

`getModelRetailRate()` calls `createSupabaseAdminClient()` which throws if `SUPABASE_SERVICE_ROLE_KEY` is missing. In tests that mock the admin client but not this specific function, or tests where the mock returns `null` for `data`, the math becomes `null * number = NaN`.

**Fix — add a defensive guard:**

```typescript
export async function calculateUsageValueUsdInt(params: {
  modelId: string;
  tokensIn: number;
  tokensOut: number;
}) {
  if (params.tokensIn + params.tokensOut <= 0) return 0;

  const rate = await getModelRetailRate(params.modelId);

  // Defensive: if rate lookup fails, use hardcoded default
  const inputRate = rate?.inputCentsPer1m ?? MODEL_RETAIL_CENTS_PER_1M.default.inputCentsPer1m;
  const outputRate = rate?.outputCentsPer1m ?? MODEL_RETAIL_CENTS_PER_1M.default.outputCentsPer1m;

  const raw = params.tokensIn * inputRate + params.tokensOut * outputRate;
  if (!Number.isFinite(raw)) return 1; // safety net
  return Math.max(1, Math.ceil(raw / 1_000_000));
}
```

### 5. External APIs Called During Tests (GitHub, OpenAI, DuckDuckGo)

**Root cause:** `test/setup.node.ts` does NOT mock `fetch`. It only clears mocks after each test. Individual test files use `vi.stubGlobal("fetch", mockFetch)` but this is opt-in per file. Any test file that forgets to mock fetch will hit real APIs.

**Fix — add a global fetch safety net in `test/setup.node.ts`:**

```typescript
import { afterEach, beforeEach, vi } from "vitest";

const unmockedFetch = globalThis.fetch;

beforeEach(() => {
  // Block all outbound HTTP by default. Tests that need
  // specific responses should vi.stubGlobal("fetch", ...) themselves.
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    throw new Error(
      `[TEST GUARD] Unmocked fetch call to: ${url}\n` +
      `Add vi.stubGlobal("fetch", yourMock) in this test file.`
    );
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = unmockedFetch;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
```

This makes failing tests scream with a clear message instead of silently hitting real APIs or getting SSL errors.

### 6. `mockSupabase.ts` Missing `.gte()`, `.lt()`, `.neq()`, `.rpc()`

**File:** `test/utils/mockSupabase.ts`

The existing `createSupabaseTableMock()` only chains: `select, insert, update, upsert, delete, eq, in, order, limit, single, maybeSingle`. But production code uses `.gte()`, `.lt()`, `.neq()`, `.rpc()`, `.not()`, `.is()`, etc.

**Fix — extend the mock:**

```typescript
export function createSupabaseTableMock(): SupabaseTableMock {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};

  const chainMethods = [
    "select", "insert", "update", "upsert", "delete",
    "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
    "is", "in", "not", "or", "filter", "match",
    "contains", "containedBy", "overlaps", "textSearch",
    "order", "limit", "range", "csv",
  ];

  for (const method of chainMethods) {
    chain[method] = vi.fn(() => chain);
  }

  // Terminal methods
  chain.single = vi.fn(async () => ({ data: null, error: null }));
  chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));

  // Make the chain itself thenable (for bare awaits like `await from("x").insert({...})`)
  chain.then = vi.fn((resolve) => resolve({ data: null, error: null }));

  return chain as unknown as SupabaseTableMock;
}

export function createSupabaseClientMock() {
  const tableMap = new Map<string, ReturnType<typeof createSupabaseTableMock>>();

  const from = vi.fn((table: string) => {
    const existing = tableMap.get(table);
    if (existing) return existing;
    const mock = createSupabaseTableMock();
    tableMap.set(table, mock);
    return mock;
  });

  const rpc = vi.fn(async () => ({ data: null, error: null }));

  const auth = {
    getUser: vi.fn(async () => ({ data: { user: null }, error: null })),
    getClaims: vi.fn(async () => ({ data: { claims: null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    exchangeCodeForSession: vi.fn(async () => ({ error: null })),
    onAuthStateChange: vi.fn(() => ({
      data: { subscription: { unsubscribe: vi.fn() } },
    })),
  };

  return { from, rpc, auth, tables: tableMap };
}
```

---

## Verification: How to Confirm `.from()` Returns a Proper Query Builder

If you're unsure whether a Supabase client is real or stubbed, add this temporary debug code:

```typescript
const client = await createSupabaseServerClient();
const builder = client.from("test_table");

console.log("from() returned:", typeof builder);
console.log("has .insert:", typeof builder.insert);
console.log("has .select:", typeof builder.select);
console.log("prototype chain:", Object.getPrototypeOf(builder)?.constructor?.name);
```

A real Supabase query builder's prototype is `PostgrestQueryBuilder`. If you see a plain `Object`, you're hitting a stub.

In CI, add this to the top of your API route temporarily:

```typescript
const supabase = await createSupabaseServerClient();
const test = supabase.from("_debug");
if (typeof test.insert !== "function") {
  console.error("SUPABASE CLIENT IS STUBBED — .insert is missing");
  console.error("E2E_AUTH_BYPASS:", process.env.E2E_AUTH_BYPASS);
}
```

---

## Recommended .env.test

```env
# .env.test — loaded by Vitest for all unit/integration tests
NEXT_PUBLIC_SUPABASE_URL=https://test-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service-test
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=sk-test-vitest
NEXT_PUBLIC_DISABLE_SERVER_BILLING=false
NODE_ENV=test
```

---

## Why CI Behaves Differently Than Local

1. **Missing `.env.local`**: CI doesn't have your `.env.local`. Without `SUPABASE_SERVICE_ROLE_KEY`, billing is disabled. Without Supabase URL/key, client creation throws.
2. **`E2E_AUTH_BYPASS=true`**: Playwright config sets this, activating the broken stub in `server.ts`. Locally you might run `npm run dev` with a real Supabase, so you never hit the stub.
3. **Built vs Dev server**: CI runs `npm run build && npm run start` (production build). Turbopack minifies code, so stack traces show `r.from(...)` instead of readable names. Locally you run `npm run dev` which skips the build step and may not trigger the same code path.
4. **No real Supabase in CI**: There's no local Supabase container or remote project. Every database call must be mocked or stubbed. If any mock is incomplete, it fails.

---

## Priority Order for Fixes

| Priority | Fix | Tests Unblocked |
|----------|-----|-----------------|
| 1 | Fix `server.ts` bypass stub (add full query chain) | All E2E tests |
| 2 | Add `checkStreamPermissionAsync` to rateLimit mock | Chat route tests |
| 3 | Stub billing env vars in billing tests | Billing unit tests |
| 4 | Extend `mockSupabase.ts` with missing chain methods | Supabase-dependent tests |
| 5 | Add global fetch guard in `setup.node.ts` | Stops external API leaks |
| 6 | Add NaN guard in `calculateUsageValueUsdInt` | Pricing edge cases |

Fixes 1-3 will likely resolve 50+ of the 64 failures.

---

## Structural Improvements to Prevent Recurrence

1. **Centralized Supabase mock factory**: Every test file that mocks Supabase should import from `test/utils/mockSupabase.ts` instead of hand-rolling inline mocks. The current codebase has at least 3 different hand-rolled Supabase mocks that diverge from each other.

2. **Type-safe mock validation**: Add a type assertion in `mockSupabase.ts`:

   ```typescript
   import type { SupabaseClient } from "@supabase/supabase-js";
   // This will fail to compile if mock shape diverges from real client:
   const _typeCheck: Pick<SupabaseClient, "from" | "auth"> = createSupabaseClientMock();
   ```

3. **Proxy-based bypass in server.ts**: Use a `Proxy` object instead of a hand-rolled stub. A Proxy automatically handles any method call without needing to enumerate every possible query builder method. New Supabase SDK features won't break it.

4. **CI environment parity**: Add a CI setup step that creates `.env.test` with all required vars. Document every env var that tests depend on.

5. **Module mock lint rule**: Consider a custom ESLint rule or code review checklist that flags `vi.mock("@/lib/rateLimit")` blocks and checks whether all imported symbols from that module are present in the mock factory.
