# Persona-Driven Technical Improvement Plan

> Based on 40 SME personas mapped to the Multi-Model AI Workspace codebase.
> Each section identifies the gap, the technical approach, affected files, and a coding-agent-ready prompt.

---

## Table of Contents

1. [Template Library Engine](#1-template-library-engine)
2. [Vertical Workflow Packs (Persona Onboarding)](#2-vertical-workflow-packs-persona-onboarding)
3. [Mini-CRM / Lightweight Tracker](#3-mini-crm--lightweight-tracker)
4. [Document Workspace with Versioning](#4-document-workspace-with-versioning)
5. [Content Calendar Generator](#5-content-calendar-generator)
6. [Weekly Autopilot Loop (Scheduled Reports)](#6-weekly-autopilot-loop-scheduled-reports)
7. [Calculator & Structured-Form Tools](#7-calculator--structured-form-tools)
8. [Approval & Signature Workflow](#8-approval--signature-workflow)
9. [Compliance Guardrails System](#9-compliance-guardrails-system)
10. [Offline / Low-Bandwidth Mode](#10-offline--low-bandwidth-mode)
11. [Mobile-First UX Overhaul](#11-mobile-first-ux-overhaul)
12. [Voice-to-Text Input](#12-voice-to-text-input)
13. [Multi-Language Template Packs](#13-multi-language-template-packs)
14. [Role-Based Access & Permissions](#14-role-based-access--permissions)
15. [A/B Testing UX for Generated Content](#15-ab-testing-ux-for-generated-content)
16. [Conversation Tagging & Analytics](#16-conversation-tagging--analytics)
17. [Bulk Operations Workflow](#17-bulk-operations-workflow)
18. [Integration Hooks (Calendar, Email, CRM)](#18-integration-hooks-calendar-email-crm)
19. [Secure Workspace with Redaction](#19-secure-workspace-with-redaction)
20. [Activation Hook Quick-Start Wizards](#20-activation-hook-quick-start-wizards)

---

## Persona-to-Feature Mapping Summary

| Feature | Personas Served | Priority |
|---------|----------------|----------|
| Template Library Engine | All 40 | P0 - Critical |
| Vertical Workflow Packs | All 40 | P0 - Critical |
| Mini-CRM / Lightweight Tracker | p02, p04, p11, p14, p15, p22, p28, p29 | P0 - Critical |
| Document Workspace + Versioning | p05, p06, p09, p10, p20, p21, p33, p36 | P0 - Critical |
| Content Calendar Generator | p02, p03, p08, p12, p17, p26, p31, p34 | P1 - High |
| Weekly Autopilot Loop | p01, p03, p07, p08, p11, p12, p22, p38 | P1 - High |
| Calculator & Structured Forms | p01, p05, p10, p13, p18, p37 | P1 - High |
| Approval & Signature Workflow | p05, p09, p20, p21, p32, p33 | P2 - Medium |
| Compliance Guardrails | p07, p09, p12, p21, p30, p33, p40 | P1 - High |
| Offline / Low-Bandwidth Mode | p19, p37 | P2 - Medium |
| Mobile-First UX Overhaul | p17, p19, p37 | P1 - High |
| Voice-to-Text Input | p19 | P3 - Low |
| Multi-Language Template Packs | p34, all Mongolian users | P1 - High |
| Role-Based Access & Permissions | p09, p21, p25, p32, p35, p40 | P2 - Medium |
| A/B Testing UX | p04, p08, p15, p17 | P2 - Medium |
| Conversation Tagging & Analytics | p24, p39 | P2 - Medium |
| Bulk Operations | p25 | P3 - Low |
| Integration Hooks | p23, p35 | P3 - Low |
| Secure Workspace + Redaction | p23, p40 | P2 - Medium |
| Activation Wizards | All 40 | P0 - Critical |

---

## 1. Template Library Engine

### Gap
Every persona needs reusable templates (contracts, proposals, scripts, SOPs, checklists, etc.), but the current system only has interaction mode presets (`settingsStore.ts` with 3 workflow presets: general, engineer, marketing). There is no template storage, browsing, categorization, or reuse system.

### Technical Approach

**Database**: New `templates` table in Supabase with RLS scoped to workspace.

```sql
CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  category TEXT NOT NULL,         -- 'contract', 'proposal', 'script', 'sop', 'checklist', etc.
  subcategory TEXT,               -- 'sales', 'support', 'onboarding', etc.
  persona_tags TEXT[] DEFAULT '{}', -- ['p01','p02'] for filtering
  title TEXT NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,  -- The actual prompt with {{variable}} placeholders
  variables JSONB DEFAULT '[]',   -- [{name: 'company', type: 'text', required: true}]
  output_format TEXT DEFAULT 'markdown', -- 'markdown', 'json', 'structured'
  locale TEXT DEFAULT 'en',
  is_system BOOLEAN DEFAULT FALSE,
  is_favorite BOOLEAN DEFAULT FALSE,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Frontend**: New `components/templates/` directory with `TemplateLibrary.tsx`, `TemplateCard.tsx`, `TemplateEditor.tsx`, `TemplateRunner.tsx`.

**Backend**: New server action in `lib/actions/templates.ts` for CRUD + a new tool definition `template_generate` in `lib/tools/definitions/index.ts`.

### Files to Create/Modify
- `supabase/migrations/YYYYMMDD_template_library.sql` (new)
- `lib/actions/templates.ts` (new)
- `components/templates/TemplateLibrary.tsx` (new)
- `components/templates/TemplateCard.tsx` (new)
- `components/templates/TemplateRunner.tsx` (new)
- `app/(shell)/templates/page.tsx` (new)
- `lib/tools/definitions/index.ts` (add template_generate tool)
- `components/Sidebar.tsx` (add Templates nav item)

### Coding Agent Prompt

```
TASK: Build a Template Library Engine for the Multi-Model AI Workspace.

CONTEXT: This is a Next.js 16 App Router project using Supabase (Postgres + RLS), Zustand for state, Tailwind CSS + shadcn/ui for styling. The existing tool framework is in lib/tools/ with definitions in lib/tools/definitions/index.ts. Server actions are in lib/actions/. The sidebar is in components/Sidebar.tsx.

REQUIREMENTS:
1. Create a Supabase migration at supabase/migrations/ that adds a `templates` table with columns: id (UUID PK), workspace_id (FK to workspaces), category (TEXT), subcategory (TEXT), persona_tags (TEXT[]), title (TEXT), description (TEXT), prompt_template (TEXT with {{variable}} placeholders), variables (JSONB array of {name, type, required, default}), output_format (TEXT), locale (TEXT default 'en'), is_system (BOOLEAN), is_favorite (BOOLEAN), usage_count (INTEGER), created_at, updated_at. Add RLS policies scoping all operations to workspace membership. Add an index on (workspace_id, category).

2. Create lib/actions/templates.ts with server actions: listTemplates (with category/search filter), getTemplate, createTemplate, updateTemplate, deleteTemplate, incrementUsageCount. Use the same Supabase server client pattern as lib/actions/conversations.ts.

3. Create a Zustand store at lib/stores/templateStore.ts for client-side template state (loaded templates, current category filter, search query).

4. Create the following React components using Tailwind + existing shadcn/ui primitives (see components/ui/):
   - components/templates/TemplateLibrary.tsx: Grid/list view of templates with category sidebar filter, search bar, and persona tag filter. Use existing ScrollArea from components/ui/.
   - components/templates/TemplateCard.tsx: Card showing template title, category badge, description preview, usage count, favorite toggle.
   - components/templates/TemplateRunner.tsx: Modal/drawer that shows the template, renders a form for each variable in the variables array, has a "Generate" button that fills in the prompt_template with variable values and sends it to the chat via the existing sendMessage from lib/hooks/useChatActions.ts.

5. Add a new route at app/(shell)/templates/page.tsx that renders TemplateLibrary.

6. Add a "Templates" navigation item in components/Sidebar.tsx, using the FileText icon from lucide-react.

7. Seed 20 system templates covering: contract drafts, proposal outlines, sales scripts, DM reply banks, promo calendars, SOP generators, quote templates, interview rubrics, onboarding checklists, review response scripts. Set is_system=true. Include both 'en' and 'mn' locale variants for at least 5 templates.

CONSTRAINTS:
- Follow the existing code patterns (see lib/actions/conversations.ts for server action patterns, lib/stores/conversationStore.ts for Zustand patterns)
- Use existing UI primitives from components/ui/ (Dialog, ScrollArea, Tabs, etc.)
- All database operations must go through RLS-scoped Supabase queries
- Match the existing dark/light theme support using Tailwind classes
```

---

## 2. Vertical Workflow Packs (Persona Onboarding)

### Gap
The current onboarding (`settingsStore.ts`) offers only 3 generic workflow presets (General, Engineer, Marketing). The 40 personas each have specific "jobs to be done" and activation hooks that demand persona-specific onboarding flows.

### Technical Approach

**Database**: New `workflow_packs` table linking a persona type to a bundle of templates, recommended mode, custom system instructions, and activation sequence.

**Frontend**: Extend the existing onboarding flow (referenced in `settingsStore.completeOnboarding`) to show a persona/industry picker with cards, then auto-configure mode + instructions + load relevant templates.

**State**: Extend `settingsStore.ts` to store `selectedPersonaId` and `personaInstructions`.

### Files to Create/Modify
- `supabase/migrations/YYYYMMDD_workflow_packs.sql` (new)
- `lib/stores/settingsStore.ts` (extend with persona selection)
- `components/onboarding/PersonaPicker.tsx` (new)
- `components/onboarding/ActivationWizard.tsx` (new)
- `lib/data/personaWorkflows.ts` (new - static persona definitions)
- `app/(shell)/page.tsx` or layout to show onboarding conditionally

### Coding Agent Prompt

```
TASK: Build Vertical Workflow Packs with persona-based onboarding for the Multi-Model AI Workspace.

CONTEXT: This is a Next.js 16 App Router project. The current onboarding is minimal - settingsStore.ts (lib/stores/settingsStore.ts) has 3 WorkflowPresets (general, engineer, marketing) with completeOnboarding/dismissOnboarding methods. The personas are defined in the uploaded multi-personas.json (40 SME personas each with primary_goals, jobs_to_be_done, what_the_product_does, activation_hook, and differentiation).

REQUIREMENTS:
1. Create lib/data/personaWorkflows.ts that exports a PERSONA_WORKFLOWS array. Each entry maps a persona_id to: industry category (e.g., 'import-export', 'beauty', 'real-estate', 'education', 'healthcare', 'food-service', 'hr', 'legal', 'finance', 'logistics', 'tech', 'agriculture', 'construction', 'retail', 'creative'), display title, icon (lucide-react icon name), recommended InteractionMode, custom system instructions string, activation_steps (array of {step_number, action, prompt_text} describing the activation hook), and template_ids (array of template IDs to preload). Group the 40 personas into ~12 industry categories.

2. Extend lib/stores/settingsStore.ts:
   - Add `selectedPersonaId: string | null` and `industryCategory: string | null` to state
   - Add `selectPersona(personaId: string)` action that sets the persona, applies the matching workflow's recommended mode and instructions
   - Keep backward compatibility with existing WorkflowPreset system

3. Create components/onboarding/PersonaPicker.tsx:
   - Full-page component showing industry categories as a grid of cards (icon + title + short description)
   - When user picks a category, show the specific personas within that category
   - Each persona card shows: title, primary goals (3 bullets), activation hook as a teaser
   - Selecting a persona calls selectPersona() and proceeds to ActivationWizard

4. Create components/onboarding/ActivationWizard.tsx:
   - Step-by-step guided flow based on the persona's activation_steps
   - Each step shows a prompt suggestion and a "Try it" button that sends the prompt to chat
   - Progress indicator showing steps completed
   - "Skip" and "Complete" buttons
   - On completion, marks onboarding as done and navigates to the main chat

5. Modify the shell layout (app/(shell)/layout.tsx) to show PersonaPicker when onboardingCompleted is false, instead of the current behavior.

CONSTRAINTS:
- Reuse existing shadcn/ui components (Dialog, Tabs, Progress from @radix-ui/react-progress)
- The PersonaPicker must work on mobile (responsive grid)
- System instructions set by persona selection should be clear, specific, and include the persona's context
- Match existing i18n pattern (lib/i18n/) - add both 'en' and 'mn' strings for all UI labels
```

---

## 3. Mini-CRM / Lightweight Tracker

### Gap
8+ personas (online reseller, real estate agent, logistics dispatcher, insurance agent, etc.) need lead/order/booking tracking. The current system has only conversations and projects -- no structured data tracking.

### Technical Approach

**Database**: New `tracker_items` table -- a generic, flexible tracker that can represent leads, orders, bookings, or tasks depending on persona context.

```sql
CREATE TABLE tracker_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  tracker_type TEXT NOT NULL,       -- 'lead', 'order', 'booking', 'task', 'shipment'
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'in_progress', 'won', 'lost', 'completed', 'cancelled'
  stage TEXT,                        -- custom pipeline stage
  contact_name TEXT,
  contact_info JSONB DEFAULT '{}',   -- {phone, email, social}
  notes TEXT,
  metadata JSONB DEFAULT '{}',       -- flexible fields per tracker_type
  due_date TIMESTAMPTZ,
  reminder_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT '{}',
  conversation_id UUID REFERENCES conversations(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Frontend**: New `components/tracker/` with Kanban-style board view and list view. Integrate with chat -- AI can create/update tracker items via a new tool.

**Tool**: New `tracker_upsert` tool in the tool framework so the AI can create leads/orders from conversation context.

### Files to Create/Modify
- `supabase/migrations/YYYYMMDD_tracker_items.sql` (new)
- `lib/actions/tracker.ts` (new)
- `lib/stores/trackerStore.ts` (new)
- `components/tracker/TrackerBoard.tsx` (new - Kanban view)
- `components/tracker/TrackerList.tsx` (new - list/table view)
- `components/tracker/TrackerItemCard.tsx` (new)
- `components/tracker/TrackerItemForm.tsx` (new)
- `app/(shell)/tracker/page.tsx` (new)
- `lib/tools/definitions/index.ts` (add tracker_upsert tool)
- `lib/tools/providers/trackerTools.ts` (new)
- `components/Sidebar.tsx` (add Tracker nav)

### Coding Agent Prompt

```
TASK: Build a Mini-CRM / Lightweight Tracker for the Multi-Model AI Workspace.

CONTEXT: This is a Next.js 16 App Router project with Supabase (Postgres + RLS), Zustand stores, and a tool framework (lib/tools/). The tool executor is at lib/tools/executor.ts. Tool definitions follow the ToolDefinition interface from lib/tools/types.ts. Server actions pattern is in lib/actions/. Users are SME operators who track leads, orders, bookings, shipments, and tasks.

REQUIREMENTS:
1. Create a Supabase migration adding a `tracker_items` table with: id (UUID PK), workspace_id (FK), tracker_type (TEXT: 'lead'|'order'|'booking'|'task'|'shipment'), title (TEXT), status (TEXT: 'open'|'in_progress'|'won'|'lost'|'completed'|'cancelled'), stage (TEXT nullable for custom pipeline stages), contact_name (TEXT), contact_info (JSONB for phone/email/social), notes (TEXT), metadata (JSONB for type-specific fields), due_date (TIMESTAMPTZ), reminder_at (TIMESTAMPTZ), tags (TEXT[]), conversation_id (UUID FK to conversations, nullable), created_at, updated_at. RLS: workspace members can CRUD their own items.

2. Create lib/actions/tracker.ts with server actions: listTrackerItems (filter by type, status, search), getTrackerItem, createTrackerItem, updateTrackerItem, deleteTrackerItem, moveItemToStage, getTrackerStats (counts by status/type).

3. Create lib/stores/trackerStore.ts (Zustand with persist) managing: items array, filters (type, status, search), view mode ('board'|'list'), selected item ID.

4. Create components/tracker/TrackerBoard.tsx: A Kanban-style board where columns represent statuses (Open, In Progress, Won/Completed, Lost/Cancelled). Each column shows TrackerItemCards. Support drag-and-drop between columns using HTML5 drag events (no external library). Include a header with tracker_type filter tabs and a search input.

5. Create components/tracker/TrackerList.tsx: Table/list view of items with sortable columns (title, status, contact, due_date, updated_at). Include inline status change dropdown.

6. Create components/tracker/TrackerItemCard.tsx: Compact card showing title, contact name, status badge, due date, tags. Click opens TrackerItemForm.

7. Create components/tracker/TrackerItemForm.tsx: Slide-over drawer (using existing Dialog or create a drawer) for creating/editing items. Dynamic fields based on tracker_type. Include a "Link to Conversation" field that shows recent conversations as options.

8. Create a new tool provider at lib/tools/providers/trackerTools.ts implementing a tracker_upsert tool. The AI model can call this tool during chat to create or update tracker items based on conversation context. Input schema: {action: 'create'|'update', tracker_type, title, status?, contact_name?, contact_info?, notes?, metadata?, due_date?}. Register it in lib/tools/definitions/index.ts following the existing pattern.

9. Add route at app/(shell)/tracker/page.tsx and a nav item in Sidebar.tsx using the Kanban icon from lucide-react.

CONSTRAINTS:
- No external drag-and-drop libraries -- use HTML5 DragEvent API
- Follow existing Zustand persist patterns from lib/stores/conversationStore.ts
- Match dark/light theme support
- The tracker tool must follow the ToolDefinition interface exactly (tool_name, tool_version, input_schema, output_schema, permissions, execute)
- Add 'tracker:write' to the ToolPermission type in lib/tools/types.ts
```

---

## 4. Document Workspace with Versioning

### Gap
Personas p05, p06, p09, p10, p20, p21, p33, p36 explicitly need document versioning, storage, and diff views. The current system only stores conversation messages -- generated documents are ephemeral in chat output.

### Technical Approach

**Database**: New `documents` and `document_versions` tables. Documents are first-class entities that can be created from chat outputs or manually.

**Frontend**: Document editor with version history sidebar, diff view between versions, and export capabilities (leveraging existing DOCX/PDF export tools).

### Files to Create/Modify
- `supabase/migrations/YYYYMMDD_document_workspace.sql` (new)
- `lib/actions/documents.ts` (new)
- `lib/stores/documentStore.ts` (new)
- `components/documents/DocumentList.tsx` (new)
- `components/documents/DocumentEditor.tsx` (new)
- `components/documents/VersionHistory.tsx` (new)
- `components/documents/DiffView.tsx` (new)
- `app/(shell)/documents/page.tsx` (new)
- `app/(shell)/documents/[id]/page.tsx` (new)
- `lib/tools/providers/exportTools.ts` (extend to save as document)

### Coding Agent Prompt

```
TASK: Build a Document Workspace with versioning for the Multi-Model AI Workspace.

CONTEXT: This is a Next.js 16 App Router project with Supabase Postgres, existing export tools (lib/tools/providers/exportTools.ts supports DOCX, PDF, PPTX generation), and a chat system where AI generates content. Users need to save AI outputs as persistent, versioned documents they can iterate on.

REQUIREMENTS:
1. Create a Supabase migration with two tables:
   - `documents`: id (UUID PK), workspace_id (FK), project_id (FK nullable), title (TEXT), content (TEXT - markdown), status (TEXT: 'draft'|'review'|'approved'|'archived'), category (TEXT), tags (TEXT[]), created_by (UUID FK to auth.users), created_at, updated_at.
   - `document_versions`: id (UUID PK), document_id (FK to documents ON DELETE CASCADE), version_number (INTEGER), content (TEXT), change_summary (TEXT), created_by (UUID FK), created_at. Add unique constraint on (document_id, version_number).
   RLS: workspace members can read/write. Add index on documents(workspace_id, status).

2. Create lib/actions/documents.ts with: listDocuments, getDocument, createDocument (auto-creates version 1), updateDocument (auto-creates new version), getDocumentVersions, getDocumentVersion, revertToVersion, deleteDocument.

3. Create lib/stores/documentStore.ts managing: documents list, current document ID, current version, view mode, filters.

4. Create components/documents/DocumentList.tsx: Filterable list/grid of documents with status badges, category filter, search. Include "New Document" button and "Save from Chat" action.

5. Create components/documents/DocumentEditor.tsx: Markdown editor (textarea with preview toggle using react-markdown which is already installed). Auto-save with debounce. Header shows document title (editable), status dropdown, and action buttons (Export DOCX, Export PDF, Share).

6. Create components/documents/VersionHistory.tsx: Sidebar panel listing all versions of current document with version number, timestamp, change summary, and author. Click on a version loads it into the editor. "Restore this version" button.

7. Create components/documents/DiffView.tsx: Side-by-side or inline diff view comparing two versions. Implement a simple line-by-line diff algorithm (split by newline, compare lines, highlight additions in green, deletions in red). No external diff library needed.

8. Add a "Save as Document" action in the chat MessageItem component (components/chat/MessageItem.tsx) that takes the assistant's response text and creates a new document from it.

9. Add routes at app/(shell)/documents/page.tsx (list) and app/(shell)/documents/[id]/page.tsx (editor). Add "Documents" nav item to Sidebar.tsx with the FileText icon.

CONSTRAINTS:
- Use react-markdown (already installed) for preview rendering
- Version creation is automatic on every save (debounced, not on every keystroke)
- Match existing theme/styling patterns
- Diff view should handle documents up to 10,000 lines efficiently
```

---

## 5. Content Calendar Generator

### Gap
12+ personas need content calendars (social media posts, promos, campaigns). The current system generates one-off chat responses but has no calendar visualization or scheduling.

### Technical Approach

**Database**: New `calendar_items` table for storing planned content with dates, channels, and status.

**Frontend**: Monthly/weekly calendar view component. AI generates a batch of calendar items from a single prompt.

**Tool**: New `calendar_generate` tool that takes a timeframe and topic and produces structured calendar items.

### Files to Create/Modify
- `supabase/migrations/YYYYMMDD_content_calendar.sql` (new)
- `lib/actions/calendar.ts` (new)
- `components/calendar/CalendarView.tsx` (new)
- `components/calendar/CalendarItem.tsx` (new)
- `components/calendar/CalendarGenerator.tsx` (new)
- `app/(shell)/calendar/page.tsx` (new)
- `lib/tools/providers/calendarTools.ts` (new)
- `lib/tools/definitions/index.ts` (register calendar tools)

### Coding Agent Prompt

```
TASK: Build a Content Calendar system for the Multi-Model AI Workspace.

CONTEXT: Next.js 16 App Router, Supabase, Zustand, Tailwind. The tool framework in lib/tools/ supports defining new tools. Users need to generate weekly/monthly content calendars (social posts, promos, campaigns) via AI and visualize them on a calendar.

REQUIREMENTS:
1. Supabase migration: `calendar_items` table with id (UUID PK), workspace_id (FK), title (TEXT), content (TEXT - the actual post/promo text), channel (TEXT: 'facebook'|'instagram'|'tiktok'|'email'|'sms'|'website'|'other'), scheduled_date (DATE), scheduled_time (TIME nullable), status (TEXT: 'draft'|'scheduled'|'published'|'skipped'), category (TEXT: 'promo'|'educational'|'engagement'|'announcement'|'review_request'), tags (TEXT[]), metadata (JSONB), created_at, updated_at. RLS scoped to workspace.

2. Server actions in lib/actions/calendar.ts: listCalendarItems (date range + channel filter), createCalendarItem, updateCalendarItem, deleteCalendarItem, bulkCreateCalendarItems.

3. Create components/calendar/CalendarView.tsx: Monthly calendar grid showing items on their scheduled dates. Each day cell shows up to 3 item previews with channel icon and title. Click a day to see all items. Toggle between month/week view. Color-code by channel or category.

4. Create components/calendar/CalendarGenerator.tsx: Form where user specifies: business type, timeframe (1 week / 2 weeks / 1 month), channels, themes/topics, posting frequency. Submit sends a structured prompt to the AI (via existing sendMessage pattern) requesting a JSON array of calendar items. Parse the AI's response and call bulkCreateCalendarItems.

5. Create a new tool `content_calendar_generate` in lib/tools/providers/calendarTools.ts that generates a structured calendar given a brief. Register in lib/tools/definitions/index.ts. The tool should output a JSON array of {title, content, channel, scheduled_date, category} objects.

6. Add route at app/(shell)/calendar/page.tsx and nav item in Sidebar.tsx.

CONSTRAINTS:
- No external calendar library -- build a simple CSS grid calendar
- Calendar must handle timezone correctly (use user's locale from lib/i18n/)
- Week starts on Monday for Mongolian locale, Sunday for English
- Support both light and dark themes
```

---

## 6. Weekly Autopilot Loop (Scheduled Reports)

### Gap
The notes in the personas JSON explicitly call out "Weekly autopilot report + next actions" as a cross-persona pattern. 15+ personas need recurring weekly summaries, reorder recommendations, performance reviews, or action lists. The current system has no scheduling or recurring job capability.

### Technical Approach

**Database**: New `autopilot_schedules` table defining what reports to generate and when. New `autopilot_runs` table logging each execution.

**Backend**: A Supabase Edge Function (or Next.js cron via Vercel) that runs daily, checks for due schedules, generates reports by calling the AI, and stores results.

### Files to Create/Modify
- `supabase/migrations/YYYYMMDD_autopilot_schedules.sql` (new)
- `lib/actions/autopilot.ts` (new)
- `app/api/cron/autopilot/route.ts` (new - Vercel cron handler)
- `components/autopilot/AutopilotSettings.tsx` (new)
- `components/autopilot/AutopilotHistory.tsx` (new)
- `app/(shell)/autopilot/page.tsx` (new)
- `vercel.json` (add cron config)

### Coding Agent Prompt

```
TASK: Build a Weekly Autopilot Loop system for recurring AI-generated reports and action items.

CONTEXT: Next.js 16 on Vercel, Supabase Postgres. The vercel.json already exists at the project root. The app supports multi-model AI chat via SSE streaming (app/api/chat/route.ts). Users across 40 personas need weekly automated reports: reorder recommendations, performance summaries, content suggestions, pipeline reviews, etc.

REQUIREMENTS:
1. Supabase migration with:
   - `autopilot_schedules`: id (UUID PK), workspace_id (FK), title (TEXT), description (TEXT), prompt_template (TEXT - the prompt to send to AI weekly), frequency (TEXT: 'daily'|'weekly'|'biweekly'|'monthly'), day_of_week (INTEGER 0-6 for weekly), time_of_day (TIME DEFAULT '09:00'), timezone (TEXT DEFAULT 'Asia/Ulaanbaatar'), model_id (TEXT DEFAULT 'openai/gpt-4o'), enabled (BOOLEAN DEFAULT true), last_run_at (TIMESTAMPTZ), next_run_at (TIMESTAMPTZ), created_at, updated_at.
   - `autopilot_runs`: id (UUID PK), schedule_id (FK), workspace_id (FK), status (TEXT: 'pending'|'running'|'completed'|'failed'), output (TEXT), tokens_used (INTEGER), cost_usd (NUMERIC), error (TEXT), started_at (TIMESTAMPTZ), completed_at (TIMESTAMPTZ).
   RLS: workspace-scoped access.

2. Create app/api/cron/autopilot/route.ts: A GET endpoint that Vercel Cron calls. It queries all enabled schedules where next_run_at <= now(), runs each one by calling the OpenAI API directly (similar to app/api/chat/route.ts but non-streaming), stores the result in autopilot_runs, updates last_run_at and computes next_run_at. Use the SUPABASE_SERVICE_ROLE_KEY for server-side access.

3. Add to vercel.json: a cron job that hits /api/cron/autopilot every hour.

4. Create lib/actions/autopilot.ts with: listSchedules, createSchedule, updateSchedule, deleteSchedule, toggleSchedule, listRuns, getRunOutput.

5. Create components/autopilot/AutopilotSettings.tsx: List of user's schedules with toggle switches, frequency selector, prompt editor, model picker. "New Schedule" form with preset templates per persona type (e.g., "Weekly Reorder Recommendations", "Weekly Performance Summary", "Content Ideas for Next Week").

6. Create components/autopilot/AutopilotHistory.tsx: List of past runs showing date, status badge, output preview. Click expands to full output. Option to "Send to Chat" to continue the conversation.

7. Add route at app/(shell)/autopilot/page.tsx and nav item in Sidebar.tsx with Timer icon.

CONSTRAINTS:
- The cron endpoint must be idempotent (check if schedule was already run)
- Use service role key only in the cron route (never expose to client)
- Limit to 10 schedules per workspace on free plan, unlimited on paid
- Output should be stored as markdown for consistent rendering
```

---

## 7. Calculator & Structured-Form Tools

### Gap
Personas p01 (landed cost calculator), p05 (materials estimation), p10 (logframe), p13 (close checklists), p18 (harvest forecasting) need structured calculation tools beyond free-text chat.

### Technical Approach

**New Tools**: Add calculator tools to the tool framework that accept structured input and produce formatted output (tables, totals, scenarios).

**Frontend**: Structured form UI that collects inputs before sending to the AI, rather than relying on free-text prompting.

### Files to Create/Modify
- `lib/tools/providers/calculatorTools.ts` (new)
- `lib/tools/definitions/index.ts` (register calculator tools)
- `components/tools/CalculatorForm.tsx` (new - structured input form)
- `components/tools/CalculatorResult.tsx` (new - formatted output)

### Coding Agent Prompt

```
TASK: Build structured Calculator & Form tools for the Multi-Model AI Workspace tool framework.

CONTEXT: The tool framework is at lib/tools/. Tool definitions follow ToolDefinition interface (lib/tools/types.ts). The tool executor is at lib/tools/executor.ts. The tool UI components are in components/tools/. The ToolRunForm.tsx renders dynamic forms based on tool input_schema.

REQUIREMENTS:
1. Create lib/tools/providers/calculatorTools.ts with these tools:

   a) `landed_cost_calculator`: Input: {items: [{name, quantity, unit_price_cny, weight_kg}], shipping_method: 'air'|'rail'|'truck', exchange_rate_cny_mnt, customs_duty_pct, vat_pct, freight_cost_usd}. Output: structured breakdown per item (FOB, freight allocation, duty, VAT, total landed cost) plus summary totals and 3 pricing scenarios (low/medium/premium margin).

   b) `quote_generator`: Input: {project_name, client_name, line_items: [{description, quantity, unit, unit_price}], tax_pct, currency, notes, validity_days}. Output: formatted quote document with subtotal, tax, total, terms.

   c) `pricing_scenario`: Input: {cost, target_margins: number[], competitor_prices: number[], market_position: 'budget'|'mid'|'premium'}. Output: table of scenarios with margin, selling price, comparison to competitors, recommendation.

   d) `budget_tracker`: Input: {budget_total, categories: [{name, allocated, spent}]}. Output: table with remaining, percentage used, burn rate, projected overshoot, alerts for categories over 80%.

2. Register all tools in lib/tools/definitions/index.ts following the existing pattern (see webSearchDefinition, webFetchDefinition as examples).

3. Create components/tools/CalculatorForm.tsx: A specialized form component that renders calculator-specific inputs with better UX than the generic ToolRunForm.tsx. For `landed_cost_calculator`, show an "Add Item" dynamic list. For `quote_generator`, show a line-item table with add/remove rows. Use existing shadcn/ui Input, Label, and Button components.

4. Create components/tools/CalculatorResult.tsx: Renders calculator output as formatted tables with totals highlighted, color-coded alerts (red for over-budget), and an "Export" button that triggers the existing exportDocxTool or exportPdfTool.

CONSTRAINTS:
- All calculations must happen server-side in the tool execute function (not client-side)
- Follow existing tool patterns exactly (ToolDefinition interface)
- Currency formatting should respect locale (lib/i18n/format.ts)
- No external calculation libraries needed -- pure arithmetic
```

---

## 8. Approval & Signature Workflow

### Gap
Personas p05, p09, p20, p21, p32, p33 need document approvals and, in some cases, signature flows. The current system has no approval states or multi-user document workflow.

### Technical Approach

**Database**: New `approval_requests` table tracking who requested approval, from whom, and the status.

**Frontend**: Approval badges on documents, approval request modal, and a pending approvals dashboard.

### Coding Agent Prompt

```
TASK: Build an Approval Workflow system for the document workspace.

CONTEXT: Next.js 16, Supabase with workspace-scoped RLS. This depends on the Document Workspace feature (documents table). Users need to request approval on documents (contracts, policies, proposals) from other workspace members.

REQUIREMENTS:
1. Supabase migration: `approval_requests` table with id (UUID PK), workspace_id (FK), document_id (FK to documents), requester_id (UUID FK to auth.users), approver_email (TEXT), status (TEXT: 'pending'|'approved'|'rejected'|'revision_requested'), comments (TEXT), requested_at (TIMESTAMPTZ DEFAULT now()), responded_at (TIMESTAMPTZ). Add a `workspace_members` table if not exists with workspace_id, user_id, role (TEXT: 'owner'|'editor'|'viewer'), email.

2. Server actions in lib/actions/approvals.ts: requestApproval, respondToApproval, listPendingApprovals, listMyRequests, getApprovalHistory.

3. Create components/documents/ApprovalBadge.tsx: Shows current approval status on document cards and editor header.

4. Create components/documents/ApprovalRequestModal.tsx: Form to select approver (from workspace members), add comments, submit request.

5. Create components/documents/PendingApprovals.tsx: Dashboard widget showing pending approval requests with approve/reject/request-revision actions.

6. Add approval status to document status flow: draft -> review -> pending_approval -> approved/revision_requested -> archived.

CONSTRAINTS:
- Email notifications are out of scope (just in-app status)
- Approver must be a workspace member
- One active approval request per document at a time
- Follow existing RLS patterns
```

---

## 9. Compliance Guardrails System

### Gap
Personas in healthcare (p07, p12, p30), legal (p21), procurement (p20, p33), and HR (p09) need guardrails preventing the AI from generating non-compliant content. The current system has no content safety layer beyond the AI models' built-in safety.

### Technical Approach

**Backend**: A guardrails middleware layer in the chat API that validates outputs against category-specific rules before sending to the client.

**Configuration**: Per-workspace guardrail profiles linked to persona selection.

### Files to Create/Modify
- `lib/guardrails/index.ts` (new)
- `lib/guardrails/rules.ts` (new - rule definitions)
- `lib/guardrails/validator.ts` (new - validation logic)
- `app/api/chat/route.ts` (integrate guardrails post-processing)
- `components/settings/GuardrailSettings.tsx` (new)

### Coding Agent Prompt

```
TASK: Build a Compliance Guardrails system for the AI chat output.

CONTEXT: The chat API is at app/api/chat/route.ts which streams AI responses via SSE. The AI response is streamed chunk-by-chunk. Users in healthcare, legal, procurement, and HR need output guardrails to prevent non-compliant content.

REQUIREMENTS:
1. Create lib/guardrails/rules.ts defining guardrail rule sets:
   - HEALTHCARE_RULES: Block medical diagnoses, drug dosage recommendations, treatment plans. Flag content with disclaimer: "This is for communication purposes only. Consult a healthcare professional."
   - LEGAL_RULES: Add "This is a draft template, not legal advice" disclaimer to all contract/legal outputs. Flag specific liability language.
   - PROCUREMENT_RULES: Ensure all outputs include placeholders for official reference numbers. Flag content missing required sections.
   - HR_RULES: Flag potentially discriminatory language in job descriptions. Add equal opportunity disclaimers.
   - Each rule has: id, category, type ('block'|'flag'|'disclaim'|'transform'), pattern (regex or keyword list), action (disclaimer text or block message).

2. Create lib/guardrails/validator.ts with:
   - validateOutput(content: string, ruleSet: GuardrailRule[]): {isValid: boolean, flags: Flag[], disclaimers: string[], blockedSections: string[]}
   - applyGuardrails(content: string, ruleSet: GuardrailRule[]): string -- returns content with disclaimers appended and blocked sections replaced

3. Create lib/guardrails/index.ts that exports a getGuardrailsForPersona(personaId: string) function mapping persona IDs to rule sets.

4. Modify app/api/chat/route.ts: After the full response is assembled (or at the end of streaming), apply guardrails based on the user's selected persona. Add disclaimers to the final output. If content is blocked, append a warning message. Do NOT block streaming mid-chunk -- apply post-stream validation and append results.

5. Create components/settings/GuardrailSettings.tsx: UI showing active guardrail rules for the user's persona, with toggles to enable/disable individual rules. Add this to the existing SettingsDrawer.tsx.

6. Store guardrail preferences in settingsStore (extend with guardrailOverrides: Record<string, boolean>).

CONSTRAINTS:
- Guardrails must not add significant latency (< 50ms for validation)
- Pattern matching should be simple keyword/regex (no ML-based classification)
- Disclaimers should be visually distinct (rendered in a callout box in the UI)
- Rules must be overridable per workspace (not hardcoded)
```

---

## 10. Offline / Low-Bandwidth Mode

### Gap
Persona p19 (herding household) explicitly needs offline/low-bandwidth UX. Persona p37 (factory supervisor) may have restricted device/internet. The current app is fully online with SSE streaming.

### Technical Approach

**Service Worker**: Add a Next.js PWA setup with service worker for caching templates and recent conversations.

**Sync Queue**: Offline actions queue that syncs when connectivity returns.

### Coding Agent Prompt

```
TASK: Add offline/low-bandwidth support to the Multi-Model AI Workspace as a Progressive Web App.

CONTEXT: Next.js 16 App Router on Vercel. The app uses Zustand with localStorage persistence (lib/stores/). Templates and conversations are stored in Supabase but also cached client-side.

REQUIREMENTS:
1. Add a service worker at public/sw.js that caches: the app shell (HTML, CSS, JS bundles), static assets, and recent API responses (templates, conversation list). Use a stale-while-revalidate strategy for API calls and cache-first for static assets.

2. Add a web app manifest at public/manifest.json with: app name "AI Workspace", short_name "AIWork", icons (use existing favicon), theme_color matching the app's primary color, display: "standalone", start_url: "/".

3. Modify app/layout.tsx to register the service worker and include the manifest link.

4. Create lib/offline/syncQueue.ts: A queue that stores pending actions (create template, update tracker item, send message) when offline. Each entry has: id, action type, payload, timestamp, retryCount. On connectivity restore (navigator.onLine event), process the queue sequentially.

5. Create lib/offline/connectivityMonitor.ts: A React hook useConnectivity() that returns {isOnline: boolean, isSlowConnection: boolean, connectionType: string}. Use navigator.onLine and navigator.connection API.

6. Create components/layout/OfflineBanner.tsx: A persistent banner at the top of the screen when offline showing "You're offline. Changes will sync when you reconnect." with a subtle animation. When slow connection detected, show "Slow connection detected. Using cached content."

7. Modify the Zustand stores to check connectivity before API calls. If offline, queue the action and show optimistic UI. The stores already persist to localStorage, so cached data is available offline.

CONSTRAINTS:
- Service worker must not break SSE streaming when online
- Keep the service worker simple (no Workbox -- vanilla service worker)
- The sync queue must handle conflicts (if server version changed while offline)
- Test that the app loads and shows cached content when network is disabled
```

---

## 11. Mobile-First UX Overhaul

### Gap
Personas p17 (phone shop), p19 (herding household), p37 (factory supervisor) need fast mobile UX. The current app has responsive design but is desktop-optimized with complex sidebars and drawers.

### Coding Agent Prompt

```
TASK: Improve mobile UX across the Multi-Model AI Workspace.

CONTEXT: Next.js 16 with Tailwind CSS. The sidebar is in components/Sidebar.tsx (complex, 34KB). The mobile sidebar is in components/MobileSidebar.tsx. The composer (message input) is in components/Composer.tsx. Chat messages are in components/chat/MessageItem.tsx.

REQUIREMENTS:
1. Redesign components/MobileSidebar.tsx: Convert from a slide-out panel to a bottom sheet on mobile (< 768px). Show recent conversations as horizontal scrollable chips at the top, followed by a compact menu for Templates, Tracker, Calendar, Documents sections. Use CSS transform for smooth slide-up animation.

2. Optimize components/Composer.tsx for mobile: Make the input area sticky at the bottom with safe-area-inset-bottom padding for iOS. Add a collapsible toolbar above the input for mode selection and model picker (currently in separate components). Ensure the input auto-grows but never exceeds 40% of viewport height.

3. Add touch gestures to components/chat/MessageItem.tsx: Swipe-left to reveal actions (copy, save as template, save as document). Use touch events (touchstart, touchmove, touchend) with a 50px threshold.

4. Create a components/layout/MobileNav.tsx: Bottom tab navigation (4 tabs: Chat, Templates, Tracker, More) visible only on mobile. Fixed to bottom, 56px height, with active tab indicator.

5. Optimize the SettingsDrawer.tsx for mobile: Use a full-screen modal on mobile instead of the side drawer. Reorganize settings into collapsible accordion sections.

6. Add viewport meta tags and touch-action CSS rules in app/layout.tsx and app/globals.css to prevent zoom on input focus and ensure smooth scrolling.

7. Test that all interactive elements have a minimum 44x44px touch target on mobile.

CONSTRAINTS:
- No breaking changes to desktop layout
- Use Tailwind responsive prefixes (md:, lg:) consistently
- No external gesture/animation libraries
- Maintain accessibility (screen reader support, focus management)
```

---

## 12. Voice-to-Text Input

### Gap
Persona p19 (herding household) explicitly needs voice-to-text. This benefits all mobile users.

### Coding Agent Prompt

```
TASK: Add voice-to-text input to the chat Composer component.

CONTEXT: The chat message input is in components/Composer.tsx. It uses a textarea for message input and has a send button.

REQUIREMENTS:
1. Add a microphone button next to the send button in components/Composer.tsx. Use the Mic icon from lucide-react.

2. Implement voice input using the Web Speech API (SpeechRecognition / webkitSpeechRecognition). Create a hook lib/hooks/useSpeechToText.ts that returns: {isListening, transcript, startListening, stopListening, isSupported, error}.

3. When the user clicks the mic button, start listening. Show a pulsing red indicator on the button while listening. Append the transcript to the current input text in real-time (interim results). When the user clicks stop (or after 30s timeout), finalize the transcript.

4. Support Mongolian language recognition by setting lang to 'mn-MN' when the app locale is 'mn' (check lib/i18n/locale.ts). Default to 'en-US'.

5. Add a fallback message for browsers that don't support SpeechRecognition: "Voice input is not supported in this browser."

6. On mobile, make the mic button more prominent (larger, with a tooltip "Hold to speak").

CONSTRAINTS:
- Use only the Web Speech API (no external speech services)
- Must work in Chrome and Safari (the two main browsers supporting this API)
- Respect the existing Composer layout and styling
- No audio recording/storage -- pure real-time transcription
```

---

## 13. Multi-Language Template Packs

### Gap
The app serves Mongolian users (MNT pricing in billing, 'mn' locale in i18n). Persona p34 (hotel manager) needs multi-language templates. All Mongolian personas need content in Mongolian.

### Coding Agent Prompt

```
TASK: Expand the i18n system and create multi-language template packs (English + Mongolian).

CONTEXT: The i18n system is at lib/i18n/ with messages.ts containing all UI strings. The locale system supports 'en' and 'mn'. The template library (to be built) stores templates with a locale field. The billing system already handles MNT currency.

REQUIREMENTS:
1. Extend lib/i18n/messages.ts with new keys for all template-related UI strings (template library, categories, form labels, action buttons) in both English and Mongolian.

2. Create lib/data/templatePacks/ directory with:
   - en/contracts.ts: 5 contract templates (service agreement, NDA, freelance contract, supply agreement, rental agreement)
   - en/proposals.ts: 5 proposal templates (business proposal, project proposal, grant proposal, sales proposal, partnership proposal)
   - en/scripts.ts: 5 communication script templates (sales pitch, objection handling, follow-up sequence, DM reply bank, review response)
   - mn/contracts.ts: Mongolian versions of the 5 contract templates
   - mn/proposals.ts: Mongolian versions of the 5 proposal templates
   - mn/scripts.ts: Mongolian versions of the 5 script templates
   - Each template has: title, description, prompt_template (with {{variables}}), variables array, category, subcategory.

3. Create lib/data/templatePacks/index.ts that exports all templates and a function getTemplatesForLocale(locale: 'en' | 'mn') that returns the appropriate pack.

4. The Mongolian templates should use proper Mongolian business language and formatting conventions (e.g., Mongolian date format, MNT currency, Mongolian legal terminology for contracts).

5. Add a language toggle in the template library UI that filters templates by locale.

CONSTRAINTS:
- Mongolian text must be actual proper Mongolian (not machine-translated placeholders). Use professional Mongolian business language.
- Templates should reference Mongolian-specific context where appropriate (e.g., Mongolian tax rates, local business customs)
- Follow the existing i18n pattern in lib/i18n/
```

---

## 14. Role-Based Access & Permissions

### Gap
Personas p09 (HR), p21 (lawyer), p25 (marketplace manager), p32 (university admin), p35 (SaaS founder), p40 (IT admin) need role-based access. The current system has workspace-level access but no granular roles.

### Coding Agent Prompt

```
TASK: Add role-based access control (RBAC) to the Multi-Model AI Workspace.

CONTEXT: Supabase Auth with workspace-scoped RLS. The workspaces table exists. Currently all workspace members have equal access. Billing plans are in lib/billing/plans.ts with a "team" tier.

REQUIREMENTS:
1. Supabase migration:
   - Create or extend `workspace_members` table: workspace_id (FK), user_id (FK), role (TEXT: 'owner'|'admin'|'editor'|'viewer'), invited_by (UUID), invited_at (TIMESTAMPTZ), accepted_at (TIMESTAMPTZ).
   - Add RLS policies: owners and admins can manage members. Editors can CRUD content. Viewers can only read.
   - Create a helper function check_workspace_role(workspace_id, user_id, required_roles TEXT[]) returning BOOLEAN.

2. Create lib/auth/permissions.ts with:
   - ROLE_HIERARCHY: owner > admin > editor > viewer
   - canManageMembers(role): boolean
   - canEditContent(role): boolean
   - canDeleteContent(role): boolean
   - canManageBilling(role): boolean
   - canApproveDocuments(role): boolean

3. Create lib/actions/members.ts: inviteMember, removeMember, updateMemberRole, listMembers, getMyRole.

4. Create components/settings/TeamMembers.tsx: Member list with role badges, invite form (email + role), role change dropdown (only for owners/admins), remove button. Show within the existing account settings area.

5. Modify server actions across the app to check roles before mutations (createDocument, deleteConversation, etc.). Use a middleware pattern: wrapWithRoleCheck(action, requiredRole).

6. Gate the "Team" features behind the team billing plan.

CONSTRAINTS:
- Backward compatible: existing single-user workspaces get 'owner' role
- Invitation flow: invite creates a pending member; on login, user is added
- Maximum 20 members per workspace on team plan
- Follow existing Supabase RLS patterns
```

---

## 15. A/B Testing UX for Generated Content

### Gap
Personas p04 (real estate agent), p08 (cafe owner), p15 (car dealer), p17 (phone shop) need to compare content variants (headlines, ad copy, listing descriptions).

### Coding Agent Prompt

```
TASK: Build an A/B content testing UX within the chat and template system.

CONTEXT: The multi-model chat already supports parallel responses from multiple models (interaction modes in settingsStore.ts: 'conversation' mode shows responses from all enabled models side-by-side). The chat UI shows runs from different models in ModelTabs (components/ModelTabs.tsx).

REQUIREMENTS:
1. Create components/content/VariantComparer.tsx: A side-by-side variant comparison view. Shows 2-4 generated variants with: title/headline at top, full content below, quick-rate buttons (thumbs up/down or 1-5 stars), "Use this" button, and "Generate more like this" button. Works for any content type (ad copy, listings, email subjects, etc.).

2. Create components/content/ABTestCard.tsx: Compact card for saving and tracking content variants. Shows variant letter (A/B/C/D), preview text, user rating, and selection status.

3. Add a "Compare Variants" action in the chat UI (components/chat/MessageItem.tsx or UnifiedAnswerFlow.tsx): When the AI generates content with multiple options (detected by numbered lists or "Option A/B/C" patterns), show a "Compare side-by-side" button that opens VariantComparer.

4. Store variant preferences in a simple Zustand store lib/stores/variantStore.ts: {variants: [{id, content, rating, selected, createdAt}], currentComparisonId}.

5. Add a prompt enhancement in the system instructions: when the user's persona involves content creation (p02, p03, p04, p08, p15, p17, p26), automatically append "Generate 3 distinct variants with different tones/angles" to content generation prompts.

CONSTRAINTS:
- Variant detection uses simple heuristics (regex for "Option A", "Variant 1", numbered alternatives)
- No external A/B testing service integration
- Keep the UI clean -- the comparer is a modal/overlay, not a permanent view
```

---

## 16. Conversation Tagging & Analytics

### Gap
Personas p24 (call center supervisor) and p39 (support team lead) need conversation tagging and ticket trend analytics.

### Coding Agent Prompt

```
TASK: Add conversation tagging and analytics to the Multi-Model AI Workspace.

CONTEXT: Conversations are stored in Supabase (conversations table) and in Zustand (lib/stores/conversationStore.ts). The sidebar (components/Sidebar.tsx) lists conversations with search. Usage analytics exist in components/UsageDashboard.tsx and app/(shell)/usage/.

REQUIREMENTS:
1. Supabase migration: Add `tags` (TEXT[]) and `category` (TEXT) columns to the conversations table. Create a `conversation_analytics` materialized view (or query function) that aggregates: conversations per tag per week, average messages per conversation, most used tags, tag trends over time.

2. Extend lib/stores/conversationStore.ts: Add tagConversation(id, tags), setCategoryConversation(id, category) actions.

3. Extend lib/actions/conversations.ts: Add updateConversationTags, getConversationAnalytics, getTagSuggestions (based on existing tags in workspace).

4. Modify components/Sidebar.tsx: Add tag chips below each conversation title. Add a tag filter dropdown at the top of the conversation list. Support multi-tag filtering (AND logic).

5. Create components/analytics/ConversationAnalytics.tsx: Dashboard showing: tag distribution (horizontal bar chart using pure CSS/SVG), conversations per week (simple line chart using SVG), top tags this week, and category breakdown (pie chart using CSS conic-gradient).

6. Add auto-tagging suggestion: When a conversation has 3+ messages, use the AI to suggest tags. Show "Suggested tags: [tag1] [tag2]" below the conversation in the sidebar with one-click apply.

7. Add route at app/(shell)/analytics/page.tsx and nav item in Sidebar.tsx.

CONSTRAINTS:
- Charts must be pure CSS/SVG (no charting library)
- Auto-tag suggestions should be non-blocking (fire-and-forget after message send)
- Maximum 10 tags per conversation
- Tags are workspace-scoped (users see tags from their workspace)
```

---

## 17. Bulk Operations Workflow

### Gap
Persona p25 (marketplace merchant manager) needs bulk operations -- generating content for many listings, sending batch communications.

### Coding Agent Prompt

```
TASK: Add bulk operations support to the Multi-Model AI Workspace.

CONTEXT: The tool framework supports individual tool executions (lib/tools/executor.ts). The export tools (lib/tools/providers/exportTools.ts) can generate documents. Users need to generate content for many items at once (e.g., 50 product listings, 20 merchant onboarding messages).

REQUIREMENTS:
1. Create lib/tools/providers/bulkTools.ts with a `bulk_generate` tool: Input: {template_prompt (string with {{item}} placeholder), items (array of objects), output_format: 'individual'|'combined', concurrency: number (1-5)}. For each item, substitute into template and call the AI. Return results as an array.

2. Create components/tools/BulkOperationForm.tsx: Form where user provides a template prompt, then uploads items via CSV paste or manual entry (dynamic row form). Shows a preview of the first item substituted into the template. "Generate All" button with progress bar.

3. Create components/tools/BulkResultsView.tsx: Shows all generated results in a scrollable list with: item identifier, generated content preview, status (success/error), and individual actions (copy, edit, export). Include "Export All as DOCX" and "Export All as CSV" buttons.

4. Register the bulk_generate tool in lib/tools/definitions/index.ts.

5. Add a "Bulk Generate" button in the Templates page that pre-fills the BulkOperationForm with the selected template's prompt.

CONSTRAINTS:
- Maximum 100 items per bulk operation
- Process items with controlled concurrency (default 3) to avoid rate limits
- Show real-time progress (items completed / total)
- Handle partial failures gracefully (continue with remaining items)
- Use the existing rate limit system from lib/rateLimit.ts
```

---

## 18. Integration Hooks (Calendar, Email, CRM)

### Gap
Personas p23 (bank RM) and p35 (SaaS founder) mention calendar/email integration. Multiple personas would benefit from webhook-based integrations.

### Coding Agent Prompt

```
TASK: Build an integration hooks system for external service connections.

CONTEXT: Next.js 16 API routes. The app has a tool framework (lib/tools/) and server actions (lib/actions/). Users want to connect their AI workspace outputs to external services.

REQUIREMENTS:
1. Supabase migration: `integrations` table with id (UUID PK), workspace_id (FK), type (TEXT: 'webhook'|'google_calendar'|'email_smtp'), name (TEXT), config (JSONB - encrypted sensitive fields), enabled (BOOLEAN), last_triggered_at (TIMESTAMPTZ), error_count (INTEGER DEFAULT 0), created_at.

2. Create lib/integrations/webhook.ts: A function sendWebhook(integrationId, payload) that POSTs JSON to a configured webhook URL. Include retry logic (3 attempts with exponential backoff), HMAC signature header for verification, and error logging.

3. Create lib/integrations/email.ts: A function sendEmail(integrationId, {to, subject, body}) using nodemailer with SMTP config from the integration's config JSONB. For now, this is opt-in and self-configured.

4. Create lib/actions/integrations.ts: listIntegrations, createIntegration, updateIntegration, deleteIntegration, testIntegration.

5. Create components/settings/IntegrationSettings.tsx: UI for managing integrations. Show available integration types as cards. Webhook setup form: URL, secret key, event triggers (on_document_approved, on_schedule_run, on_tracker_update). Email SMTP form: host, port, username, password, from_address. Test button for each integration.

6. Add integration triggers at key points: when an autopilot schedule completes, when a document is approved, when a tracker item changes status. These call sendWebhook for all enabled webhook integrations matching the event type.

CONSTRAINTS:
- Sensitive config fields (passwords, API keys) must be encrypted at rest in JSONB
- Webhook timeouts: 10 second max
- Rate limit: max 100 webhook calls per hour per workspace
- Do NOT store email content in the integrations table (privacy)
- Add integration management to the account settings page
```

---

## 19. Secure Workspace with Redaction

### Gap
Personas p23 (bank RM) and p40 (IT admin) need data redaction and secure workspaces for handling confidential information.

### Coding Agent Prompt

```
TASK: Build a data redaction and secure workspace system.

CONTEXT: The chat system stores messages in Supabase with RLS. The tool framework handles file operations. Users in banking, legal, and IT handle sensitive data and need automatic redaction of PII before it reaches the AI.

REQUIREMENTS:
1. Create lib/security/redaction.ts with:
   - redactPII(text: string): {redactedText: string, redactions: Redaction[]} - Detects and replaces: phone numbers (Mongolian +976 and international formats), email addresses, credit card numbers (partial mask), Mongolian national ID patterns (register numbers), bank account numbers. Replace with tokens like [PHONE_1], [EMAIL_1], etc.
   - restorePII(redactedText: string, redactions: Redaction[]): string - Restores original values from tokens.
   - Redaction type: {token: string, original: string, type: 'phone'|'email'|'card'|'id'|'account', position: {start: number, end: number}}.

2. Create lib/security/secureMode.ts: A configuration object for workspace secure mode: {enabled: boolean, autoRedactOutbound: boolean, autoRedactInbound: boolean, retentionDays: number | null, auditLog: boolean}.

3. Modify app/api/chat/route.ts: When secure mode is enabled for the workspace, apply redactPII to user messages before sending to the AI. Apply restorePII to the AI response before sending to the client. Log redaction events to an audit table.

4. Create components/settings/SecuritySettings.tsx: Toggle for secure mode, auto-redaction settings, data retention policy selector (30/60/90/365 days or unlimited), audit log viewer showing recent redaction events.

5. Supabase migration: `audit_log` table with id (UUID PK), workspace_id (FK), user_id (FK), event_type (TEXT: 'redaction'|'access'|'export'|'delete'), details (JSONB), created_at. `workspace_settings` table (or extend workspaces) with secure_mode (JSONB).

6. Visual indicator: When secure mode is active, show a green shield icon in the TopBar (components/TopBar.tsx) with tooltip "Secure mode active - PII is automatically redacted."

CONSTRAINTS:
- PII detection uses regex patterns only (no ML/NER)
- Redaction tokens must be deterministic (same input = same token for a session)
- Original PII values are NEVER sent to the AI API when redaction is enabled
- Audit log entries cannot be deleted by users (admin only)
- Performance: redaction must complete in < 20ms for typical messages
```

---

## 20. Activation Hook Quick-Start Wizards

### Gap
Every persona has a specific "activation_hook" that promises immediate value (e.g., "In the first 15 minutes, generate landed cost plus 3 pricing options"). The current onboarding doesn't deliver this immediate value experience.

### Coding Agent Prompt

```
TASK: Build persona-specific Activation Hook Quick-Start Wizards.

CONTEXT: Each of the 40 personas in the system has an activation_hook field describing a "first 15 minutes" experience that should immediately demonstrate value. The chat system (lib/hooks/useChatActions.ts) supports sendMessage. The tool framework supports structured tools. The onboarding system is in settingsStore.ts.

REQUIREMENTS:
1. Create lib/data/activationHooks.ts: Export ACTIVATION_HOOKS mapping each persona_id to: {title, description, steps: [{id, title, prompt, expectedOutput: 'text'|'document'|'calculator'|'calendar', successCriteria: string}], estimatedMinutes: number, requiredTools: string[]}.

   Include activation hooks for at least these high-priority personas:
   - p01: "Generate landed cost plus 3 pricing options for one shipment" (3 steps: enter items, calculate costs, generate pricing scenarios)
   - p02: "Build a reply bank from top 10 questions" (2 steps: list common questions, generate reply templates)
   - p03: "Generate 3 promos + 10 posts for next week" (2 steps: describe services, generate promo calendar)
   - p04: "Turn one listing into 3 copy variants plus buyer scripts" (2 steps: describe property, generate variants + scripts)
   - p05: "Generate one quote + contract draft" (2 steps: enter project details, generate documents)
   - p06: "Generate a 4-week lesson plan aligned to level" (2 steps: specify level/target, generate plan)
   - p09: "Generate JD + interview rubric + onboarding checklist" (3 steps)
   - p10: "Turn project idea into logframe + proposal outline" (2 steps)

2. Create components/onboarding/QuickStartWizard.tsx: A focused, step-by-step wizard that:
   - Shows the activation hook promise ("In the next 15 minutes, you'll...")
   - For each step: shows a pre-filled prompt suggestion with editable fields, a "Generate" button, and a result preview area
   - Tracks completion with a progress bar
   - On completion, celebrates with a success message and offers next steps
   - Has a timer showing elapsed time (gamification: "You did it in 8 minutes!")

3. Create components/onboarding/QuickStartPrompt.tsx: Reusable component for each wizard step. Shows the prompt template with highlighted {{variables}} that the user fills in. "Send to AI" button dispatches via sendMessage. Displays the AI response inline with a "Looks good!" confirmation button.

4. Integrate with persona onboarding: After PersonaPicker selection (from Feature #2), immediately launch the appropriate QuickStartWizard. Store completion status in settingsStore.

5. Add a "Quick Start" button on the main page (app/(shell)/page.tsx) that lets users re-run or try a different persona's activation flow.

CONSTRAINTS:
- The wizard must feel fast and lightweight (no heavy UI)
- Pre-filled prompts should be high quality and ready to send with minimal editing
- Each activation flow should genuinely complete in under 15 minutes
- Store wizard progress so users can resume if interrupted
- Match the existing UI theme (dark/light mode support)
```

---

## Implementation Roadmap

### Phase 1 - Foundation (Weeks 1-3)
| # | Feature | Effort | Dependencies |
|---|---------|--------|--------------|
| 1 | Template Library Engine | 5 days | None |
| 2 | Vertical Workflow Packs | 4 days | #1 |
| 20 | Activation Wizards | 4 days | #1, #2 |
| 13 | Multi-Language Templates | 3 days | #1 |

### Phase 2 - Core Features (Weeks 4-7)
| # | Feature | Effort | Dependencies |
|---|---------|--------|--------------|
| 3 | Mini-CRM / Tracker | 5 days | None |
| 4 | Document Workspace | 5 days | None |
| 5 | Content Calendar | 4 days | None |
| 7 | Calculator Tools | 3 days | None |

### Phase 3 - Automation & Intelligence (Weeks 8-10)
| # | Feature | Effort | Dependencies |
|---|---------|--------|--------------|
| 6 | Weekly Autopilot Loop | 4 days | None |
| 9 | Compliance Guardrails | 3 days | #2 |
| 16 | Conversation Analytics | 3 days | None |
| 15 | A/B Testing UX | 3 days | None |

### Phase 4 - Enterprise & Polish (Weeks 11-14)
| # | Feature | Effort | Dependencies |
|---|---------|--------|--------------|
| 14 | Role-Based Access | 4 days | None |
| 8 | Approval Workflow | 3 days | #4, #14 |
| 19 | Secure Workspace | 3 days | #14 |
| 18 | Integration Hooks | 3 days | #6 |

### Phase 5 - Mobile & Accessibility (Weeks 15-16)
| # | Feature | Effort | Dependencies |
|---|---------|--------|--------------|
| 11 | Mobile-First UX | 5 days | None |
| 10 | Offline Mode | 4 days | #11 |
| 12 | Voice-to-Text | 2 days | #11 |
| 17 | Bulk Operations | 3 days | #1 |

---

## Architecture Impact Summary

### New Database Tables (8)
1. `templates` - Template library
2. `workflow_packs` - Persona workflow bundles
3. `tracker_items` - Mini-CRM items
4. `documents` + `document_versions` - Document workspace
5. `calendar_items` - Content calendar
6. `autopilot_schedules` + `autopilot_runs` - Recurring automation
7. `approval_requests` - Document approvals
8. `integrations` - External service connections
9. `audit_log` - Security audit trail

### New App Routes (8)
- `/templates` - Template library
- `/tracker` - Mini-CRM
- `/documents` + `/documents/[id]` - Document workspace
- `/calendar` - Content calendar
- `/autopilot` - Recurring automation settings
- `/analytics` - Conversation analytics

### New Tool Definitions (6)
- `template_generate` - Generate from template
- `tracker_upsert` - Create/update CRM items
- `content_calendar_generate` - Generate calendar content
- `landed_cost_calculator` - Cost calculations
- `quote_generator` - Quote documents
- `bulk_generate` - Batch content generation

### Modified Core Files
- `components/Sidebar.tsx` - New nav items
- `app/api/chat/route.ts` - Guardrails + redaction integration
- `lib/stores/settingsStore.ts` - Persona selection
- `lib/tools/definitions/index.ts` - New tool registrations
- `lib/tools/types.ts` - New permission types
- `app/(shell)/layout.tsx` - Onboarding flow
