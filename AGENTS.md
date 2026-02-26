# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Multi-Model AI Workspace — a Next.js 16 (App Router) chat app that queries multiple AI models in parallel. Uses Supabase for auth/DB and Zustand for client state. See `README.md` for full architecture details and available scripts.

### Dev environment with auth bypass

The `.env.local` file must exist with at least these values for the dev server to start:

```
OPENAI_API_KEY=sk-test-key-for-dev-only
NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test
E2E_AUTH_BYPASS=true
NEXT_PUBLIC_E2E_BYPASS=true
NEXT_PUBLIC_DISABLE_SERVER_BILLING=true
AUTH_SECRET=dev-test-secret-not-for-production
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

With `E2E_AUTH_BYPASS=true`, the middleware skips Supabase auth entirely, so no real Supabase project is needed for local dev/testing. A "Demo User" session is provided automatically.

### Running the dev server

```bash
npm run dev
```

The server starts on `http://localhost:3000` and redirects to `/chat`. Use `--hostname 0.0.0.0` to expose on all interfaces.

### Running checks

Standard commands from `package.json` scripts (see `README.md` for full table):

- **Lint**: `npm run lint` — pre-existing lint errors exist in the codebase (6 errors, 12 warnings)
- **Typecheck**: `npx tsc --noEmit` — pre-existing type errors in some test files
- **Unit tests**: `npm run test:unit` — runs Vitest with `unit-dom` and `unit-node` projects (206/207 pass; 1 pre-existing failure in `MessageBubble.test.tsx`)
- **E2E tests**: `npm run test:e2e` — Playwright (chromium); auto-starts dev server with bypass env vars
- **Format**: `npm run format:check`

### Known issues

- `npm run build` fails during static page generation for `/dashboard` (missing Suspense boundary for `useSearchParams()`). This is a pre-existing codebase issue. The dev server (`npm run dev`) is unaffected.
- Model API calls fail with dummy keys — expected behavior. The UI gracefully shows "supabase.from(...).select is not a function" per model tab when no real Supabase DB is connected.
- Integration tests (`npm run test:integration`) require real Supabase credentials (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`).
