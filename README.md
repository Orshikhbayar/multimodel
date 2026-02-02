# Multi-Model AI Workspace

A Next.js 14 (App Router) prototype for a multi-model chat experience with per-model tabs, streaming runs, sources, disagreements, and an AI team settings drawer. Everything is mocked on the client—no keys required.

## Running locally

```bash
npm install --legacy-peer-deps
npm run dev
# lint
npm run lint
```

Open `http://localhost:3000`.

## Features

- Sidebar with new chat, projects, plan/settings, and theme toggle.
- Model tabs with live status dots for GPT, Claude, Gemini, Grok, Unified, etc.
- Scrollable chat thread and sticky composer (optimize/enhance actions, file attach, apply & send).
- AI Team drawer: pick models, collaboration mode (Smart, Conversation, Ensemble, Expert, Debate, Simulation, Web-Aided), shared instructions with Save/Reset.
- Sources and Disagreements dialogs with mocked citations and stance lists.
- Mock SSE streaming (`/lib/mockStream.ts`) and persisted local state via Zustand (`/lib/store.ts`).
- Extra pages: `/projects` (list + create modal) and `/account` placeholder.

## Structure

- `app/`: pages for chat, projects, account.
- `components/`: UI pieces (Sidebar, ChatWorkspace, ModelTabs, ChatThread, MessageBubble, Composer, AITeamDrawer, dialogs) plus shadcn/ui primitives.
- `lib/store.ts`: state model + actions, persisted to `localStorage`.
- `lib/mockStream.ts`: streaming simulator, mock sources/disagreements.

Swap `startMockStream` for a real `/api/stream` later to plug in your gateway.
