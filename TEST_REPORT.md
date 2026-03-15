# Multimodel AI — Full Project Test Report

**Date:** March 7, 2026
**Project:** multimodel-ai v0.1.0 (Next.js + Supabase + Vitest + Playwright)
**Environment:** Node 22.22.0, npm 10.9.4

---

## Executive Summary

The project was tested across all available static analysis dimensions. Runtime tests (Vitest unit/integration, Playwright e2e, Next.js build) could not execute in this environment due to missing platform-specific native binaries (rollup, SWC). A thorough static analysis was performed instead, covering linting, type checking, formatting, test coverage mapping, and code quality review.

**Overall Health: C+** — The codebase has a solid architecture and good test coverage in some areas, but has significant gaps in critical business logic testing, 10 TypeScript errors, 5 ESLint errors, and 159 unformatted files.

---

## 1. ESLint Results

**Result:** 5 errors, 11 warnings

### Errors (all `@typescript-eslint/no-explicit-any`)

All 5 errors are in test files using `Record<string, any>` for Supabase mock table objects:

- `app/api/stripe/webhook/route.test.ts:4`
- `lib/actions/billing.test.ts:6`
- `lib/actions/conversations.test.ts:6`
- `lib/actions/projects.test.ts:6`
- `lib/api/usage.test.ts:6`

**Fix:** Create a properly typed `MockTable` interface and use it instead of `Record<string, any>`.

### Warnings

- **VirtualizedChatThread.tsx:72** — TanStack Virtual library incompatibility with React Compiler memoization
- **intro/script.js:164** + **public/intro/script.js:164** — Unused `validateEmail` function (duplicated file)
- **lib/billing/service.ts** — 8 unused parameters (`_sessionUser`, `_userId`, `_planId`, `_params`) — intentional deprecation stubs, safe to ignore

---

## 2. TypeScript Type Check Results

**Result:** 10 type errors across 5 files

### Core Schema Mismatch (4 errors)

The database schema defines `project_id` as a **required, non-nullable string** in the conversations table `Insert` type, but code frequently treats it as optional/nullable:

- `lib/actions/conversations.ts:330` — Assigns `projectId ?? null` to required `project_id`
- `lib/supabase/chatPersistence.ts:222` — Missing `project_id` in insert object
- `lib/supabase/chatPersistence.ts:229` — `string | null` assigned to `string` field
- `test/integration/supabase.int.test.ts:58` — Missing `project_id` in test insert

**Fix:** Either update the database types to make `project_id` optional, or ensure all insert paths provide a valid string value.

### Test Type Mismatches (4 errors)

- `lib/supabase/chatPersistence.test.ts:25,39` — Mock `getUser` return type doesn't match Supabase's union type
- `lib/supabase/oauthProfile.test.ts:45,66` — Unsafe cast to `UserIdentity[]` missing required fields (`id`, `user_id`, `identity_id`)

**Fix:** Use `as unknown as Type` double-cast or provide complete mock objects.

### Component Type Error (2 errors)

- `components/__tests__/ErrorBoundary.test.tsx:16,28` — `ProblemChild` function returns `void` instead of valid JSX

**Fix:** Add explicit return type annotation: `function ProblemChild(): never { throw new Error("boom"); }`

---

## 3. Prettier Format Check

**Result:** 159 files have formatting issues

Run `npm run format` to auto-fix all formatting issues. Key affected areas include lib/supabase/, lib/tools/, config files, and documentation.

---

## 4. Test Coverage Analysis

### File Statistics

- **Total source files (.ts/.tsx):** 299
- **Total test files:** 65 (60 unit + 1 integration + 6 e2e = ~22% test-to-source ratio)

### Coverage by Module

| Module         | Source Files | Test Files | Coverage | Grade  |
| -------------- | ------------ | ---------- | -------- | ------ |
| lib/stores     | 6            | 6          | 100%     | A      |
| lib/state      | 4            | 4          | 100%     | A      |
| lib/i18n       | 4            | 4          | 100%     | A      |
| components     | 33           | 7          | 21%      | B      |
| lib/api        | 3            | 3          | 100%     | A-     |
| lib/billing    | 10           | 7          | 70%      | C+     |
| lib/supabase   | 8            | 6          | 75%      | B      |
| lib/actions    | 4            | 4          | 100%\*   | B+     |
| lib/tools      | 17           | 2          | 12%      | **D+** |
| app/api routes | ~20          | 4          | 20%      | **D**  |
| Integration    | -            | 1          | Minimal  | **D**  |
| E2E            | -            | 6          | Basic    | C      |

\*Actions have test files but source actions themselves are thin wrappers.

### Critical Untested Code

**Severity: HIGH — Security/Business Logic:**

1. `lib/billing/supabaseService.ts` — Core billing engine (untested)
2. `lib/billing/stripe.ts` — Stripe payment integration (untested)
3. `lib/tools/providers/githubTools.ts` (25KB) — GitHub integration (untested)
4. `lib/tools/providers/fileTools.ts` (19KB) — File operations (untested)
5. `lib/tools/providers/deepResearch.ts` (16KB) — Research tool (untested)
6. `lib/tools/providers/exportTools.ts` (11KB) — Export tools (untested)
7. `lib/tools/providers/imageTools.ts` — Image tools (untested)
8. `lib/tools/providers/webTools.ts` — Web tools (only SSRF hardening tested)
9. `lib/guardrails/flagging.ts` — Content moderation (untested)

**Severity: MEDIUM:** 10. `lib/tools/executor.ts` (528 lines) — Only 5 hardening tests, no behavioral tests 11. `lib/tools/schema.ts` — Schema validation (untested) 12. `lib/tools/registry.ts` — Tool registry (untested) 13. Most API routes under `app/api/` lack tests

---

## 5. Test Quality Assessment

### Strong Tests (Grade A)

- **app/api/chat/route.test.ts** (424 lines) — Comprehensive: auth, rate limiting, billing, streaming, cancellation
- **lib/rateLimit.test.ts** (200 lines) — Thorough: consumption, concurrency, bypass, cleanup, fake timers
- **lib/stores/conversationStore.test.ts** (263 lines) — Complete: CRUD, edge cases, state management

### Adequate Tests (Grade B)

- **components/**tests**/MessageBubble.test.tsx** — Good UI coverage, missing markdown/accessibility tests
- **lib/actions/billing.test.ts** — Good happy paths, weak error paths
- **lib/api/openai.test.ts** — Basic coverage, missing edge cases

### Weak Tests (Grade C-F)

- **lib/billing/service.critical.test.ts** (54 lines) — Only tests deprecation warnings, no actual billing logic
- **lib/tools/executor.hardening.test.ts** — Only 5 tests for 528 lines; missing execution pipeline, timeouts, retries
- **lib/tools/webFetch.hardening.test.ts** — Only 3 tests; SSRF-focused but no happy path or caching tests

---

## 6. Runtime Tests (Blocked)

The following tests could not be executed due to missing platform binaries:

| Test Suite             | Command                    | Blocker                                  |
| ---------------------- | -------------------------- | ---------------------------------------- |
| Unit Tests (Vitest)    | `npm run test:unit`        | Missing `@rollup/rollup-linux-arm64-gnu` |
| Integration Tests      | `npm run test:integration` | Same as above                            |
| Coverage Report        | `npm run test:coverage`    | Same as above                            |
| E2E Tests (Playwright) | `npm run test:e2e`         | Missing Playwright browsers + rollup     |
| Next.js Build          | `npm run build`            | Missing `@next/swc-linux-arm64-gnu`      |

**Root Cause:** The `node_modules` were installed on macOS (darwin-arm64). Platform-specific native binaries are empty stubs for Linux. The sandbox blocks npm registry access, preventing reinstallation.

**To run these locally:** Execute `npm install` on your machine, then run `npm run test:all`.

---

## 7. Priority Recommendations

### P0 — Fix Immediately

1. Fix the 4 `project_id` schema mismatch errors (affects runtime behavior)
2. Add tests for `lib/billing/supabaseService.ts` (core billing — untested)
3. Add tests for `lib/tools/executor.ts` full execution pipeline

### P1 — Fix Soon

4. Add tests for all 6 tool providers (76KB of untested code)
5. Fix the 5 ESLint `any` type errors in test files
6. Fix `ErrorBoundary.test.tsx` component type errors
7. Test `lib/guardrails/flagging.ts` content moderation
8. Run `npm run format` to fix 159 formatting issues

### P2 — Improve

9. Fix mock type mismatches in `chatPersistence.test.ts` and `oauthProfile.test.ts`
10. Add error path testing to billing actions
11. Expand API route test coverage beyond the 4 currently tested routes
12. Add integration tests (currently only 1 file)
13. Remove or document unused `validateEmail` in intro scripts
14. Consolidate duplicate `intro/script.js` and `public/intro/script.js`

---

## 8. Architecture Observations

**Positive patterns:** Proper use of `vi.hoisted()` for mocks, Zustand store testing with persist middleware, SSE/streaming response testing, timezone-aware fake timers, proper event listener cleanup.

**Anti-patterns:** Hard-to-mock tool providers (no dependency injection), minimal integration testing, some tests that only verify "doesn't throw" rather than correct output, `console.log` debugging in `rateLimit.ts` instead of using the project's logger utility.
