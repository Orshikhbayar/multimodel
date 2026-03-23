# MultiModel AI — Full Product Rebuild Prompt

You are a senior full-stack engineer tasked with rebuilding the MultiModel AI product. This is a Next.js 16 (App Router) application using Supabase, TypeScript, Tailwind CSS, and shadcn/ui. The app connects to multiple AI providers (OpenAI, Anthropic, Google, xAI, DeepSeek) through the developer's API keys.

## The Core Problem

This product was vibe-coded and accumulated massive feature bloat that buries the actual value proposition. The product currently has: Projects, Templates with versioning, Insights analytics dashboard, Autopilot scheduled runs, a complex Tools permission system, 7 interaction modes (most unimplemented), fake social proof on the landing page, and inconsistent pricing across the UI and codebase.

**The core value proposition — comparing multiple AI models side by side on the same prompt — is buried under all of this.**

This rebuild strips the product down to its core and makes the multi-model comparison experience the hero.

---

## PHASE 1: REMOVE (Delete these features entirely)

### 1.1 Remove Insights/Analytics Dashboard
- Delete `/app/(shell)/insights/` directory and all its contents
- Remove the "Insights" link from the sidebar navigation in `components/Sidebar.tsx`
- Remove the "Insights" link from `components/MobileSidebar.tsx`
- Remove any insights-related API routes in `/app/api/metrics/` and `/app/api/events/`
- Remove insights-related imports and references across the app
- Do NOT remove the underlying usage tracking in `lib/billing/` — that's needed for billing. Only remove the user-facing dashboard.

### 1.2 Remove Templates System
- Delete `/app/(shell)/templates/` directory
- Remove template-related API routes in `/app/api/templates/`
- Remove "Templates" link from sidebar navigation
- Remove template-related components in `components/` (search for template-related files)
- Remove `lib/workflows/packs.ts` and the workflow pack system
- Remove the `WorkflowOnboardingGate` component and the workflow pack selection onboarding flow
- Remove template-related Zustand stores if any exist
- Clean up any template references in the chat flow

### 1.3 Remove Projects System
- Delete `/app/(shell)/projects/` directory
- Remove "Projects" link from sidebar navigation
- Remove project-scoped conversation grouping from the sidebar
- Conversations should now be a flat list (no project grouping), sorted by most recent
- Remove project-related database queries and server actions
- Keep conversation persistence — just remove the project wrapper

### 1.4 Remove Autopilot/Scheduled Runs
- Delete `/app/(shell)/autopilot/` directory
- Remove autopilot-related API routes in `/app/api/autopilot/`
- Remove "Autopilot" link from sidebar navigation
- Remove any autopilot-related stores, hooks, or utilities

### 1.5 Remove MVP Badges/Labels
- Search the entire codebase for "MVP" text labels, badges, or markers displayed in the UI
- Remove all instances. This was internal dev terminology that should never have been user-facing.

### 1.6 Remove Unused Interaction Modes
- The current codebase defines 7 interaction modes: `smart`, `conversation`, `ensemble`, `expert`, `debate`, `simulation`, `web`
- **Keep only TWO modes:**
  - `single` — User picks one model, gets one response (default for free tier)
  - `compare` — User's prompt goes to multiple models, responses shown side by side (this is the hero feature)
- Remove all references to `expert`, `debate`, `simulation`, `ensemble` modes
- The `smart` mode (auto-routing to cheapest model) should be absorbed into the billing logic, not exposed as a user-facing mode
- The `web` mode should become a simple toggle (see Phase 2: Tools Simplification)

---

## PHASE 2: SIMPLIFY

### 2.1 Sidebar — Minimal Like Claude/Cursor
The current sidebar has too many sections: nav links, project-grouped chat history, billing info, theme toggle, user menu.

**New sidebar structure (reference Claude's sidebar for feel):**

```
┌─────────────────────┐
│  [Logo]   [New Chat] │  ← Top bar: logo left, new chat button right
├─────────────────────┤
│  [Search chats...]   │  ← Simple search/filter input
├─────────────────────┤
│  Today               │
│    Chat title...     │  ← Flat list, grouped by time (Today, Yesterday, Previous 7 days, etc.)
│    Chat title...     │
│  Yesterday           │
│    Chat title...     │
│    Chat title...     │
│  Previous 7 days     │
│    Chat title...     │
├─────────────────────┤
│  [Theme] [Settings]  │  ← Bottom: minimal footer with theme toggle + settings gear
│  [User avatar] Name  │  ← User info + logout in dropdown
└─────────────────────┘
```

**Rules:**
- NO nav links to other pages (no Templates, Projects, Insights, Autopilot links)
- Chat history is a flat list grouped by recency (Today, Yesterday, Previous 7 Days, Previous 30 Days, Older)
- Each chat item shows: title (truncated), and a hover menu with rename/delete
- Sidebar should be collapsible on desktop (icon-only mode)
- Mobile: hamburger menu opens drawer (keep existing `MobileSidebar.tsx` pattern but simplified)
- Remove billing/credit display from sidebar entirely — move to settings/account page only

### 2.2 Tools — Simple Toggles Near Input
The current tool system has permissions, cost estimation, result artifacts, and source attribution. Replace with simple capability toggles.

**New tools UX:**
- Small icon buttons displayed in a row above or below the chat input box
- Available toggles:
  - 🔍 **Web Search** — enables real-time web search augmentation
  - 🖼️ **Image Generation** — enables image creation in responses
  - 📎 **File Upload** — attach files for analysis (keep existing upload logic)
- Each toggle is a simple on/off — click to activate, click again to deactivate
- Active toggles should be visually highlighted (filled icon, subtle background color)
- When a toggle is active, it's sent as a parameter with the chat request
- NO permission dialogs, NO cost estimation popups, NO artifact download system
- Free tier: only File Upload available. Pro tier: all toggles available.
- Remove the entire `lib/tools/` complex permission/execution system
- Remove tool-related API routes in `/app/api/tools/`

### 2.3 Pricing — Simplify to Two Tiers
Current state: 4 tiers (Free/Plus/Pro/Team) in code, different pricing on landing page ($29/$99). This is a mess.

**New pricing (2 tiers only):**

| | Free | Pro |
|---|---|---|
| **Price** | $0 | $12/month |
| **Models** | DeepSeek, Gemini Flash, GPT-4o-mini | All models (GPT-4o, Claude Sonnet, Claude Opus, Grok, + free tier models) |
| **Comparisons** | 20/day | Unlimited |
| **Single chat** | Unlimited | Unlimited |
| **Tools** | File upload only | Web search, image gen, file upload |
| **History** | 30 days | Unlimited |

**Implementation:**
- Update `lib/billing/plans.ts` to define only `free` and `pro` plans
- Update `lib/billing/cost.ts` and `lib/billing/supabaseService.ts` accordingly
- Update or simplify the pricing page at `/app/(shell)/pricing/` or `/app/dashboard/plans/`
- Remove Plus and Team tier references everywhere
- Remove top-up credit packs for now (simplify to subscription only)
- Keep Stripe integration scaffolding but update it to reflect 2 tiers
- Support both USD and MNT (Mongolian Tugrik) display — keep existing i18n currency support

---

## PHASE 3: ENHANCE

### 3.1 Multi-Model Comparison as the Hero Experience
The `UnifiedAnswerFlow.tsx` component already shows multi-model responses with flow visualization. This needs to be THE thing users see and interact with.

**Changes:**
- When a user sends their FIRST message ever, default to compare mode with 3 models (e.g., GPT-4o-mini + Gemini Flash + DeepSeek) so they immediately see the comparison magic
- The model selector should prominently show a "Compare" toggle/button that's visually distinct
- In compare mode, the response area should show models side by side (on desktop) or stacked with tabs (on mobile)
- Each model card should show: model name/icon, streaming response, response time, token count
- Add a "Best Answer" indicator — a simple thumbs up button on each response so the user can pick their favorite
- After comparison, offer a "Use this model for this chat" quick action so the user can continue the conversation with their preferred model
- Remove cost display from individual model cards (users don't care about your costs)

### 3.2 Interactive In-Chat Visualizations
This is the killer differentiator. When AI responds with data, code, or structured content, render it interactively inline in the chat.

**How Claude.ai does this (our reference implementation):**
Claude.ai uses an "artifacts" system: the model outputs structured React/HTML code, and the frontend renders it in a sandboxed iframe inline in the chat. The result is clickable tabs, styled cards, interactive buttons, charts — all embedded in the conversation. We are building the same capability, model-agnostic.

**Implementation — 3 layers:**

**Layer 1: System Prompt Injection**
In `app/api/chat/route.ts`, append the following to the system prompt for EVERY model request:

```
When the user asks for something visual, interactive, structured, or says "visualize/visualized", output an interactive HTML artifact. Wrap it in a fenced code block with the language tag `interactive-html`. The HTML must be fully self-contained — inline CSS, inline JS, no external dependencies except CDN links to Chart.js, Mermaid, or KaTeX if needed. Make it interactive: use tabs, accordions, clickable sections, hover effects, charts, progress bars, color coding. Style it professionally with a dark theme (background: #1a1a2e or similar). Never output plain text when visualization is requested.
```

This instruction works with ANY model — GPT-4o-mini, Claude, Gemini, DeepSeek. Quality will vary by model capability, but ALL of them can generate HTML.

**Layer 2: Frontend Renderer — `components/chat/InteractiveBlock.tsx`**
Create a React component that:
1. Parses the AI response markdown looking for ````interactive-html` fenced code blocks
2. Extracts the HTML content from those blocks
3. Renders each block in a sandboxed `<iframe>` with `srcdoc` attribute
4. The iframe should have: `sandbox="allow-scripts allow-popups"` (NO allow-same-origin for security)
5. Auto-resize the iframe height to fit content (use `postMessage` from inside the iframe to communicate content height to parent)
6. Add a toolbar above each interactive block with:
   - "Expand" button → opens the visualization in a fullscreen modal
   - "Code" button → toggles showing the raw HTML source
   - "Copy" button → copies the HTML to clipboard
7. If the HTML fails to render or is malformed, show a graceful fallback: the raw code in a syntax-highlighted block with a message "Visualization couldn't render — showing code instead"
8. Style the iframe container with rounded corners, subtle border, and a small "Interactive" badge in the corner

**Layer 3: Integration into MessageItem**
In `components/chat/MessageItem.tsx` (or wherever message content is rendered):
1. Before rendering markdown, scan the message content for ````interactive-html` blocks
2. Split the message into segments: regular markdown text and interactive blocks
3. Render text segments with the existing markdown renderer
4. Render interactive segments with `InteractiveBlock`
5. This way, a model response can mix text and interactive elements naturally (e.g., some explanation text, then an interactive chart, then more text)

**Additional visualizations to detect and auto-render:**
- **Mermaid diagrams:** Detect ````mermaid` code blocks → render as interactive SVG using Mermaid.js loaded in the iframe
- **Charts/Graphs:** Detect ````chart` or data-heavy responses → render with Chart.js in the iframe
- **Math:** Detect LaTeX expressions (`$...$` or `$$...$$`) → render with KaTeX
- **Tables:** Detect markdown tables → render as sortable/filterable HTML tables with hover highlights
- **Code blocks:** Keep syntax highlighting, add a "Copy" button (already common)

**Compare mode + visualization:**
When in compare mode, if multiple models output interactive blocks, display them side by side so the user can visually compare which model produced the better visualization. This is the "wow" moment — seeing GPT-4o's chart vs Claude's interactive tabbed interface vs Gemini's diagram for the same prompt.

**Performance note:** Iframes are heavier than plain text. Lazy-load interactive blocks that are off-screen. Only render the iframe when the block scrolls into view (use IntersectionObserver).

### 3.3 Login — Remember User Accounts
When a user logs out, remember their account for easy re-login (like Google, Discord, etc.).

**Implementation:**
- On successful login, save the user's email and avatar URL to `localStorage` under a key like `remembered_accounts`
- Store as an array of `{ email, avatarUrl, lastLogin }` objects (max 5 accounts)
- On the login page (`/app/auth/login/page.tsx`), if remembered accounts exist, show them as clickable account cards ABOVE the login form
- Each card shows: avatar (or initial), email, "Last used: X days ago"
- Clicking a card pre-fills the email field (user still needs to enter password or use OAuth)
- Add a small "x" button on each card to remove a remembered account
- Add a "Use another account" link that shows the standard login form
- On logout, do NOT remove the account from remembered list — just clear the session

---

## PHASE 4: LANDING PAGE REWRITE

The current landing page (`/intro/index.html` or `/app/intro/`) needs a complete rewrite.

**Problems with current landing page:**
- Claims "50K+ users" and "1M+ queries" — these are fabricated numbers. Remove immediately.
- Pricing shows $29/$99 which doesn't match the codebase
- Too many sections, too much text, tries to sell everything at once
- Mentions features that don't exist (Vote Mode, Debate Mode are not implemented)

**New landing page requirements:**

**Hero section:**
- Headline: "One Prompt. Multiple AI Models. Compare Instantly." (or similar — focused on comparison)
- Subheadline: "See how GPT-4, Claude, Gemini, and more answer the same question. Pick the best. Stop guessing which AI to use."
- CTA button: "Try Free — No Credit Card"
- Hero visual: An animated or static mockup showing a prompt being sent and 3 model responses appearing side by side

**How it works section (3 steps):**
1. "Type your question" — simple input
2. "AI models respond simultaneously" — side by side responses streaming
3. "Pick the best answer" — user selects their favorite

**Model showcase:**
- Show logos/icons of supported models: OpenAI, Anthropic, Google, xAI, DeepSeek
- One line per model about what it's best at (e.g., "Claude — Best for writing and analysis")

**Interactive visualization callout:**
- Highlight that responses include interactive charts, diagrams, and code execution
- Show a visual example

**Pricing section:**
- Display the 2 tiers (Free and Pro at $12/month)
- Must match the actual pricing in the codebase
- Show MNT equivalent for Mongolian users

**Footer:**
- Simple: links to login, privacy, terms
- No fake testimonials, no fake user counts
- Can include "Built in Mongolia 🇲🇳" as a subtle branding element

**Technical implementation:**
- Convert from static HTML to a proper Next.js page if not already
- Should be the default route for unauthenticated users (`/`)
- Authenticated users should be redirected to `/chat`
- Mobile responsive
- Support dark/light theme
- Keep it fast — minimal JavaScript, mostly static content

---

## PHASE 5: CLEANUP & CONSISTENCY

### 5.1 Remove Dead Code
After all the above removals, there will be orphaned imports, unused components, dead routes, and stale references. Do a thorough cleanup:
- Run TypeScript compiler to find type errors from removed features
- Check all imports in remaining files
- Remove any components that are no longer referenced
- Clean up the navigation/routing to only include existing pages
- Update `middleware.ts` if it references removed routes

### 5.2 Fix Pricing Consistency
Ensure the pricing is identical everywhere it appears:
- Landing page
- Pricing page (if kept as a separate page)
- Billing/account settings
- Any upgrade prompts or modals
- Plan gate checks in the billing service

### 5.3 Update the Shayla Persona Test
The `shayla-persona.json` test scenarios reference removed features. Update the persona test to reflect the new product:
- Remove test scenarios for templates, projects, autopilot
- Add test scenario for multi-model comparison first experience
- Add test scenario for interactive visualization interaction
- Update success criteria

### 5.4 Localization Updates
The i18n messages in `lib/i18n/messages.ts` will have dead keys from removed features. Clean up:
- Remove translation keys for Templates, Projects, Insights, Autopilot, MVP
- Add translation keys for any new UI text (comparison mode labels, tool toggles, landing page content)
- Ensure both English and Mongolian translations are complete for remaining features

---

## IMPORTANT CONSTRAINTS

1. **Do NOT delete the Supabase database schema or migrations.** Unused tables can stay — they don't cost anything and removing them risks data loss.
2. **Do NOT remove the billing/cost tracking infrastructure** in `lib/billing/`. Simplify the plans, but keep the usage metering, credit system, and Stripe scaffolding.
3. **Do NOT remove authentication.** Keep Supabase Auth with Google OAuth, GitHub OAuth, and email/password.
4. **Do NOT remove the AI provider adapters** in `lib/api/`. Keep all provider integrations (OpenAI, Anthropic, Google, xAI, DeepSeek).
5. **Do NOT remove conversation persistence.** Chat history must still save to Supabase.
6. **Do NOT change the existing streaming SSE architecture.** It works — keep it.
7. **Keep dark/light theme support.**
8. **Keep the existing responsive design patterns** (mobile drawer sidebar, etc.) but simplify what's in them.
9. **Preserve the `shayla-persona.json` file** — update it, don't delete it.
10. **Test after each phase.** Run `npm run build` (or the project's build command) after each phase to catch errors before moving on.

---

## FILE REFERENCE

Key files you'll be working with:

| Area | File Path |
|---|---|
| Sidebar | `components/Sidebar.tsx`, `components/MobileSidebar.tsx` |
| Chat UI | `components/ChatWorkspace.tsx`, `components/chat/UnifiedAnswerFlow.tsx`, `components/chat/MessageItem.tsx`, `components/chat/MessageList.tsx` |
| Chat API | `app/api/chat/route.ts` |
| Provider adapters | `lib/api/openai.ts`, `lib/api/anthropic.ts`, `lib/api/google.ts`, `lib/api/providerRouter.ts` |
| Billing/Plans | `lib/billing/plans.ts`, `lib/billing/cost.ts`, `lib/billing/supabaseService.ts`, `lib/billing/stripe.ts` |
| Auth | `app/auth/login/page.tsx`, `app/auth/logout/route.ts`, `app/auth/callback/` |
| Landing page | `intro/index.html` or `app/intro/page.tsx` |
| Model catalog | `lib/modelCatalog.ts` |
| i18n | `lib/i18n/messages.ts`, `lib/i18n/translate.ts` |
| Localization hook | `lib/hooks/` (look for `useI18n`) |
| Middleware | `middleware.ts` |
| Persona | `shayla-persona.json`, `SHAYLA_10_10_AGENT_PROMPT.md` |
| Shell layout | `app/(shell)/layout.tsx` |
| Onboarding | `components/onboarding/` |
| Stores | `lib/stores/modelStore.ts` |

---

## EXECUTION ORDER

1. **Phase 1 first** — Remove all dead features. Build should still compile after this.
2. **Phase 2 second** — Simplify remaining features. Build should compile.
3. **Phase 3 third** — Enhance the core experience. Build should compile.
4. **Phase 4 fourth** — Rewrite landing page. Build should compile.
5. **Phase 5 last** — Cleanup pass. Final build and verify.

After each phase, run the build command and fix any compilation errors before proceeding to the next phase.
