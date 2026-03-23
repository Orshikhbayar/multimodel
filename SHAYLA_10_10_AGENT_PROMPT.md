# Coding Agent Prompt: Multi-Model AI — Reach Shayla's 10/10

## Context

You are fixing a Next.js 13+ app (App Router, TypeScript, Tailwind CSS, Supabase) deployed at `https://multimodel-ai.vercel.app`. The product is a multi-model AI chat workspace targeting Mongolian users.

A UX test was run against a persona named **Shayla** — a 24-year-old digital marketer at MobiCom (Mongolia's largest telecom). She scored the product **4.5/10**. Your job is to fix every issue she found to reach **10/10**.

The test report is at: `shayla-test-report.json`
The persona is at: `shayla-persona.json`

Read both files before starting. Every fix below is tied to a specific test scenario failure.

---

## P0 — SHIP BLOCKERS (Fix these first)

### Fix 1: Never expose raw API key errors to users

**Problem:** When models fail (missing API keys), users see raw error strings like `"ANTHROPIC_API_KEY is not configured"` and `"GOOGLE_API_KEY is not configured"` in the chat flow diagram. Shayla has no idea what an API key is.

**Files to modify:**

1. **`lib/api/anthropic.ts`** (line ~53)
   - Currently throws: `"ANTHROPIC_API_KEY is not configured"`
   - Change the error message to a user-friendly, localizable key: `"model_unavailable"`

2. **`lib/api/google.ts`** (line ~53)
   - Currently throws: `"GOOGLE_API_KEY is not configured"`
   - Same fix: throw `"model_unavailable"`

3. **`lib/api/openai.ts`** — check for same pattern and fix if present.

4. **`lib/api/providerRouter.ts`** — check the catch/error path for unknown providers. Ensure all provider errors are normalized to user-friendly messages.

5. **`components/chat/UnifiedAnswerFlow.tsx`** (lines 99-101)
   - This renders the flow diagram cards per model. When a model's status is `"error"`, it currently shows the raw error string.
   - **Option A (preferred):** When a perspective run has status `"error"`, DO NOT render that model's card at all. Only show models that successfully responded. The flow diagram should adapt: if 4 models were queried but only 1 responded, show 1 card, not 4 (with 3 showing errors).
   - **Option B (fallback):** If you must show errored models, replace the raw error text with a localized message. Add these keys to `lib/i18n/messages.ts`:
     ```
     "chat.modelUnavailable": {
       "en": "This model is temporarily unavailable",
       "mn": "Энэ загвар түр боломжгүй байна"
     }
     ```
   - **CRITICAL:** Never show strings containing "API_KEY", "configured", "ANTHROPIC", "GOOGLE" in the UI. Treat these as internal errors.

6. **`app/api/chat/route.ts`** (lines 577-637)
   - The error response handler streams JSON with `{error: message}`. Ensure the `message` field never contains raw technical errors. Map known error patterns:
     - `*API_KEY*` → `"model_unavailable"`
     - `*rate limit*` → `"rate_limited"`
     - `*timeout*` → `"request_timeout"`
   - Add a catch-all: any unrecognized error → `"unexpected_error"`

**Acceptance criteria:**
- Send a multi-model chat message. If any model's API key is missing, that model is silently excluded from the flow diagram (or shows a localized "temporarily unavailable" message).
- No raw error strings containing "API_KEY", "configured", stack traces, or technical jargon ever reach the UI.

---

### Fix 2: Fix Template seeding database error

**Problem:** Clicking "Seed System Templates" shows a raw PostgreSQL error: `"there is no unique or exclusion constraint matching the ON CONFLICT specification"`.

**Root cause:** The `upsert` call in the seed route specifies `onConflict: "workspace_id,system_key"` but the actual unique index `idx_templates_system_key` is a partial unique index with a `WHERE system_key IS NOT NULL` condition. Supabase/PostgREST upsert with `onConflict` requires an exact unique constraint match — partial indexes don't qualify.

**Files to modify:**

1. **`supabase/migrations/` — Create a new migration file** (e.g., `20260320_fix_templates_unique_constraint.sql`):
   ```sql
   -- Drop the partial unique index
   DROP INDEX IF EXISTS idx_templates_system_key;

   -- Create a proper unique constraint (not partial) that PostgREST can use for upsert
   ALTER TABLE templates
     ADD CONSTRAINT uq_templates_workspace_system_key
     UNIQUE (workspace_id, system_key);
   ```
   **NOTE:** Before creating this constraint, ensure no rows violate it. If `system_key` can be NULL for non-system templates, you may need to use a different approach:
   - Option A: Add a default value for `system_key` (e.g., the template `id`) so it's never NULL
   - Option B: Keep the partial index but change the seed route to use raw SQL `INSERT ... ON CONFLICT` instead of the Supabase client `upsert()`

2. **`app/api/templates/seed/route.ts`** (lines 67-72)
   - If you choose Option B above, replace:
     ```typescript
     db.from("templates").upsert(rows, { onConflict: "workspace_id,system_key" })
     ```
     with a raw SQL call using `db.rpc()` or Supabase's `sql` tag that explicitly handles the ON CONFLICT with the partial index condition.
   - **Also:** Wrap the entire seed operation in a try-catch and return a user-friendly error response:
     ```typescript
     catch (err) {
       return NextResponse.json(
         { error: t("templates.seedFailed") },
         { status: 500 }
       );
     }
     ```
   - **Never return raw database errors to the client.**

3. **`app/(shell)/templates/page.tsx`** (line 347-361)
   - The `seedSystemTemplates()` handler should show a localized toast on failure, not the raw error. Add:
     ```typescript
     } catch (err) {
       toast.error(t("templates.seedFailed"));
     }
     ```

**Acceptance criteria:**
- Click "Seed System Templates" → templates populate without errors.
- If the seed fails for any reason, user sees a localized error toast, never a raw database error.

---

## P1 — MUST FIX BEFORE MARKETING PUSH

### Fix 3: Consistent Mongolian localization across ALL pages

**Problem:** The chat UI is well-localized in Mongolian, but the Template Library page, 404 page, some Sidebar labels, and error messages are in English. This inconsistency breaks trust.

**Files to modify:**

1. **`lib/i18n/messages.ts`** — Add these missing translation keys (add both `en` and `mn` for each):

   **Template Library page keys:**
   ```
   "templates.title": { en: "Template Library", mn: "Загварын сан" }
   "templates.searchPlaceholder": { en: "Search title, description, or content...", mn: "Гарчиг, тайлбар, эсвэл агуулгаар хайх..." }
   "templates.allWorkflowPacks": { en: "All workflow packs", mn: "Бүх ажлын урсгал" }
   "templates.favorites": { en: "Favorites", mn: "Дуртай" }
   "templates.noTemplates": { en: "No templates yet. Create one or seed system templates to get started.", mn: "Загвар одоогоор байхгүй байна. Шинээр үүсгэх эсвэл системийн загвар нэмнэ үү." }
   "templates.seedSystem": { en: "Seed System Templates", mn: "Системийн загвар нэмэх" }
   "templates.newTemplate": { en: "New Template", mn: "Шинэ загвар" }
   "templates.seedFailed": { en: "Failed to load templates. Please try again.", mn: "Загвар ачаалахад алдаа гарлаа. Дахин оролдоно уу." }
   ```

   **404 page keys:**
   ```
   "errors.notFound.title": { en: "Page not found", mn: "Хуудас олдсонгүй" }
   "errors.notFound.description": { en: "The page you're looking for doesn't exist or has been moved.", mn: "Таны хайж буй хуудас байхгүй эсвэл шилжүүлсэн байна." }
   "errors.notFound.goHome": { en: "Go home", mn: "Нүүр хуудас руу буцах" }
   ```

   **Chat error keys:**
   ```
   "chat.modelUnavailable": { en: "This model is temporarily unavailable", mn: "Энэ загвар түр боломжгүй байна" }
   "chat.rateLimited": { en: "You're sending messages too fast. Please wait a moment.", mn: "Та хэт хурдан мессеж илгээж байна. Түр хүлээнэ үү." }
   "chat.requestTimeout": { en: "The request took too long. Please try again.", mn: "Хүсэлт хэт удсан. Дахин оролдоно уу." }
   "chat.unexpectedError": { en: "Something went wrong. Please try again.", mn: "Алдаа гарлаа. Дахин оролдоно уу." }
   ```

   **Pricing label fix:**
   ```
   "billing.perMonth": { en: "/mo", mn: "/сар" }
   ```

2. **`app/(shell)/templates/page.tsx`** — Replace every hardcoded English string with `t()` calls using the keys above. Key locations:
   - Line 368: `"Template Library"` → `t("templates.title")`
   - Line 371: `"Seed System Templates"` → `t("templates.seedSystem")`
   - Line 437: `"No templates yet..."` → `t("templates.noTemplates")`
   - Line ~196: `"Updated via Template Library"` → `t("templates.changeNoteUpdate")`
   - Line ~218: `"Created via Template Library"` → `t("templates.changeNoteCreate")`
   - Search bar placeholder → `t("templates.searchPlaceholder")`

3. **`app/not-found.tsx`** — Replace all hardcoded English text with `t()` calls:
   - `"404"` → keep as-is (number is universal)
   - `"Page not found"` → `t("errors.notFound.title")`
   - `"The page you're looking for..."` → `t("errors.notFound.description")`
   - `"Go home"` → `t("errors.notFound.goHome")`
   - **NOTE:** `not-found.tsx` is a server component in Next.js App Router. If `useI18n()` is client-only, you'll need to either: (a) make it a client component with `"use client"`, or (b) use the server-side translation function from `lib/i18n/translate.ts`.

4. **`components/Sidebar.tsx`** (lines 215-230) — Check if "Templates", "Autopilot", "Insights" are using i18n. If hardcoded, replace with:
   - `"Templates"` → `t("navigation.templates")`
   - `"Autopilot"` → `t("navigation.autopilot")`
   - `"Insights"` → `t("navigation.insights")`
   - Add corresponding keys to messages.ts.

5. **`components/billing/PricingTiers.tsx`** — Replace `/cap` with `t("billing.perMonth")`. Look for the label pattern near the price display and replace the hardcoded `/cap` string.

**Acceptance criteria:**
- Switch app locale to Mongolian → every visible string on every page (chat, templates, pricing, 404, sidebar) is in Mongolian.
- No English strings leak through except proper nouns (model names like "GPT-4.1", "Claude Sonnet 4").

---

### Fix 4: Mobile responsiveness — sidebar collapse and adaptive layout

**Problem:** The sidebar is fixed at `w-[18rem]` (288px) and doesn't collapse on mobile. At 375px viewport, the sidebar consumes 77% of the screen.

**Current state (already partially implemented):**
- `components/MobileSidebar.tsx` exists with a hamburger button (`md:hidden`)
- `app/(shell)/layout.tsx` already has `hidden md:block` on the desktop sidebar and `pt-16 md:pt-0` for mobile spacing
- The responsive framework IS there — it just may not be working correctly.

**Files to investigate and fix:**

1. **`app/(shell)/layout.tsx`** (lines 20-36)
   - Verify the desktop sidebar wrapper has `hidden md:block` (should hide below 768px)
   - Verify the mobile sidebar/header bar is rendering with `md:hidden` (should show below 768px)
   - Verify the main content area doesn't have a hardcoded `min-width` that prevents it from shrinking
   - The flex container `"flex h-full w-full gap-2 p-2 md:gap-3 md:p-3"` looks correct but check if any child has `shrink-0` that prevents content from fitting

2. **`components/MobileSidebar.tsx`**
   - Verify the hamburger trigger button renders correctly
   - Verify the drawer opens and closes
   - Verify all sidebar navigation items (Чат, Төслүүд, Templates, Autopilot, etc.) are accessible in the mobile drawer

3. **`components/chat/` — Chat input area responsiveness:**
   - Quick action chips row: at mobile width, chips should either wrap or be horizontally scrollable with `overflow-x-auto`
   - Model selector: should open as a bottom sheet or full-width modal on mobile, not a dropdown that overflows
   - The `UnifiedAnswerFlow.tsx` flow diagram: model cards should stack vertically on mobile, not side-by-side

4. **`components/billing/PricingTiers.tsx`**
   - The grid `lg:grid-cols-4` is fine for desktop but verify cards stack properly on mobile (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`)

**Test at these viewports:**
- 375x812 (iPhone SE / small phone)
- 768x1024 (iPad)
- 1440x900 (desktop)

**Acceptance criteria:**
- At 375px: sidebar is hidden, hamburger menu opens a drawer, chat is full-width, chips scroll horizontally, model cards in flow diagram stack vertically.
- At 768px: sidebar may show collapsed (`w-[4.5rem]`) or as drawer.
- At 1440px: full desktop layout, sidebar expanded.

---

## P2 — SHOULD FIX

### Fix 5: Branded, localized 404 page

**File:** `app/not-found.tsx`

**Current state:** Plain page with `FileQuestion` icon, "404", "Page not found", "Go home" button. No branding, no MultiModel logo, no brand colors.

**Fix:**
- Add the MultiModel logo or brand name at the top
- Use brand colors (teal accent `#2E8B8B` or whatever the primary color is from Tailwind config) for the "Go home" button
- Localize all strings (covered in Fix 3)
- Add the sidebar background color (`bg-background`) to match the rest of the app

---

### Fix 6: Improve onboarding for first-time users

**Current state:** `components/onboarding/WorkflowOnboardingGate.tsx` exists with a 2-stage workflow pack selection flow. This is already implemented but may be too complex for Shayla.

**Problem:** The onboarding shows "Importer, Online Seller, Procurement" packs — none of which match Shayla's marketing workflow.

**Files to modify:**

1. **Workflow packs data source** — Find where `WORKFLOW_PACKS` is defined (likely in `lib/` or a constants file). Add a marketing-focused pack:
   ```typescript
   {
     id: "digital-marketing",
     name: { en: "Digital Marketing", mn: "Дижитал маркетинг" },
     description: { en: "Campaign copy, A/B test ideas, landing page text, social media content", mn: "Кампанит ажлын текст, A/B тест санаа, лэндинг хуудасны текст, сошиал медиа контент" },
     icon: "megaphone",
     inputFields: [
       { name: "company", label: { en: "Company name", mn: "Компанийн нэр" }, type: "text", required: true },
       { name: "industry", label: { en: "Industry", mn: "Салбар" }, type: "text", required: true },
       { name: "audience", label: { en: "Target audience", mn: "Зорилтот бүлэг" }, type: "textarea", required: false }
     ]
   }
   ```

2. **Add a lightweight tooltip tour** as an alternative to the full onboarding gate. After onboarding completes (or is skipped), show 3 tooltips on first chat visit:
   - Tooltip 1: Points to the chat input → "Энд мессеж бичнэ" (Write your message here)
   - Tooltip 2: Points to model selector → "Загвар сонгох" (Choose an AI model)
   - Tooltip 3: Points to the "Нэгдсэн хариу" banner → "Олон загвар нэгэн зэрэг ажиллана" (Multiple models work simultaneously)

   Store tooltip completion in localStorage (`onboarding_tooltips_shown: true`). Use a lightweight approach — CSS tooltips or a simple `Popover` component, not a heavy library.

---

## P3 — NICE TO HAVE (but contributes to 10/10)

### Fix 7: Pre-populate template library with marketing templates

**File:** `app/api/templates/seed/route.ts`

**After fixing the database constraint (Fix 2)**, ensure the seed creates templates that are actually useful for Shayla. The seed function iterates `WORKFLOW_PACKS` and creates 2 templates per pack. Make sure the marketing pack (from Fix 6) generates templates like:

- "Campaign Brief Generator" / "Кампанит ажлын товч үүсгэгч"
- "A/B Test Hypothesis Builder" / "A/B тест таамаглал бүтээгч"
- "Landing Page Copy Writer" / "Лэндинг хуудасны текст бичигч"
- "Social Media Post Calendar" / "Сошиал медиа постын календарь"

Each template should have:
- Localized title and description (mn + en)
- A `body_md` with a structured prompt template using `{{variables}}`
- Relevant `input_schema` for the template variables

---

### Fix 8: Cost transparency and free tier messaging

**Problem (Option B finding):** Shayla's free tier (1 active model) gives her LESS than what she has for free with ChatGPT + Gemini. The product needs to communicate why multi-model is worth paying for.

**Files to modify:**

1. **`components/billing/PricingTiers.tsx`** — On the Free tier card, add a callout:
   ```
   { en: "Try multi-model AI — upgrade to compare responses from multiple AI models side by side", mn: "Олон загварт AI-г туршаарай — загваруудын хариуг зэрэгцүүлэн харахын тулд шинэчлэнэ үү" }
   ```

2. **Chat input area** — When on the Free plan and the user has used their credit, show a gentle upsell near the model selector:
   ```
   { en: "Unlock more models", mn: "Илүү олон загвар нээх" }
   ```
   Link to `/dashboard/plans`.

---

## Execution Order

1. **Fix 2** (Template DB constraint) — unblocks template seeding
2. **Fix 1** (API error handling) — unblocks the core multi-model feature
3. **Fix 3** (Localization) — comprehensive i18n pass
4. **Fix 4** (Mobile responsiveness) — verify and fix responsive layout
5. **Fix 5** (404 branding) — quick win
6. **Fix 6** (Onboarding + marketing pack) — feature addition
7. **Fix 7** (Pre-populate templates) — depends on Fix 2 + Fix 6
8. **Fix 8** (Free tier messaging) — depends on Fix 3

---

## Validation Checklist

After all fixes, run through these checks as Shayla:

- [ ] Open `https://multimodel-ai.vercel.app` → locale is Mongolian → no English strings visible on any page
- [ ] Start a new chat → type a marketing prompt → send with multi-model enabled
- [ ] All responding models show their output in the flow diagram. Failed models are hidden or show a localized "unavailable" message. No raw errors.
- [ ] Navigate to Templates → page loads with pre-populated templates in Mongolian
- [ ] Click a marketing template → it generates output
- [ ] Navigate to `/this-does-not-exist` → branded 404 page in Mongolian with "Go home" button
- [ ] Resize browser to 375px width → sidebar collapses, hamburger menu works, chat is full-width
- [ ] Navigate to `/dashboard/plans` → pricing shows `/сар` (not `/cap`), MNT toggle works
- [ ] First-time user flow: clear localStorage → reload → onboarding shows marketing pack option → tooltips guide the first chat

**If all checks pass, Shayla scores 10/10.**

---

## Files Reference (Quick Lookup)

| Area | Primary File | Secondary Files |
|------|-------------|----------------|
| API errors | `lib/api/anthropic.ts`, `lib/api/google.ts` | `lib/api/providerRouter.ts`, `app/api/chat/route.ts` |
| Flow diagram | `components/chat/UnifiedAnswerFlow.tsx` | `components/chat/MessageItem.tsx` |
| Template seed | `app/api/templates/seed/route.ts` | `supabase/migrations/` |
| Template page | `app/(shell)/templates/page.tsx` | — |
| i18n | `lib/i18n/messages.ts` | `lib/i18n/useI18n.ts`, `lib/i18n/translate.ts` |
| 404 page | `app/not-found.tsx` | — |
| Sidebar | `components/Sidebar.tsx` | `components/MobileSidebar.tsx` |
| Layout | `app/(shell)/layout.tsx` | `app/layout.tsx` |
| Onboarding | `components/onboarding/WorkflowOnboardingGate.tsx` | Settings store |
| Pricing | `components/billing/PricingTiers.tsx` | `lib/billing/plans.ts`, `components/billing/PlanCompareTable.tsx` |
