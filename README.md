# Multi-Model AI Workspace

A Next.js 16 (App Router) multi-model chat application with per-model tabs, SSE streaming, NextAuth authentication, and Zustand state management.

**Live Demo:** https://multimodel-ai.vercel.app

## Features

- **Multi-model chat**: Query multiple AI models in parallel (GPT-4o, Claude, Gemini, Grok)
- **Real-time streaming**: Server-Sent Events (SSE) via Edge runtime
- **Authentication**: NextAuth v5 with Google/GitHub OAuth (demo credentials in development)
- **Collaboration modes**: Smart, Conversation, Ensemble, Expert, Debate, Simulation, Web-Aided
- **Billing UI**: Plan management, usage tracking, credit system (scaffolding)
- **Dark/Light theme**: System-aware with manual toggle
- **Responsive design**: Mobile-friendly sidebar and chat interface

## Running Locally

### Prerequisites

- Node.js 18+ (20+ recommended)
- npm 9+
- OpenAI API key
- PostgreSQL database (for production)

### Setup

1. Clone the repository and install dependencies:

```bash
npm install
```

2. Copy the environment example and configure:

```bash
cp .env.example .env.local
```

3. Edit `.env.local` with your values:

```bash
# Required
OPENAI_API_KEY=sk-your-openai-key
AUTH_SECRET=your-generated-secret  # Generate with: openssl rand -base64 32

# Database (required for production, optional for development)
DATABASE_URL=postgresql://user:password@localhost:5432/multimodel_ai

# For OAuth (optional in development, required in production)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

4. Set up the database (if using DATABASE_URL):

```bash
# Start PostgreSQL (using Docker)
docker run --name multimodel-postgres -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres

# Create database
docker exec -it multimodel-postgres psql -U postgres -c "CREATE DATABASE multimodel_ai;"

# Run migrations
npx prisma migrate dev
```

5. Start the development server:

```bash
npm run dev
```

6. Open [http://localhost:3000](http://localhost:3000)

### Development Login

In development mode, use demo credentials:
- **Email**: `demo@example.com`
- **Password**: `demo123`

> **Note**: Demo credentials are disabled in production. Configure OAuth providers for production use.

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run test` | Run unit tests (Vitest) |
| `npm run e2e` | Run E2E tests (Playwright) |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting without changes |
| `npm run db:migrate` | Run database migrations (dev) |
| `npm run db:studio` | Open Prisma Studio |

## Deploying to Production

### Vercel (Recommended)

#### Quick Deploy via CLI

```bash
# 1. Install and login to Vercel CLI
npm i -g vercel
vercel login

# 2. Link to a new project
vercel link --yes --project your-project-name

# 3. Set required environment variables
echo "$(openssl rand -base64 32)" | vercel env add AUTH_SECRET production
grep "^OPENAI_API_KEY=" .env.local | cut -d= -f2 | vercel env add OPENAI_API_KEY production

# 4. Deploy to production
vercel deploy --prod --yes
```

#### Via Vercel Dashboard

1. Push your code to GitHub/GitLab/Bitbucket
2. Import the project in [Vercel](https://vercel.com)
3. Configure environment variables in Vercel dashboard:

| Variable | Required | Description |
|----------|----------|-------------|
| `AUTH_SECRET` | Yes | NextAuth secret (generate with `openssl rand -base64 32`) |
| `OPENAI_API_KEY` | Yes | Your OpenAI API key |
| `DATABASE_URL` | For OAuth | PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | For OAuth | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | For OAuth | Google OAuth client secret |

4. Deploy (Prisma migrations run automatically via build command)

> **Note**: The app works without a database using demo credentials (`demo@example.com` / `demo123`). For production OAuth, configure `DATABASE_URL`.

### Self-Hosted

1. Build the application:

```bash
npm run build
```

2. Set environment variables (see `.env.example`)

3. Start the server:

```bash
npm run start
```

### Important Production Notes

- **OAuth Required**: Demo credentials are disabled in production. Configure at least one OAuth provider.
- **AUTH_SECRET**: Must be a strong, random secret (32+ characters)
- **HTTPS**: Required for secure cookies and OAuth callbacks
- **Database Required**: Configure `DATABASE_URL` with a PostgreSQL connection string
- **Run Migrations**: Execute `npx prisma migrate deploy` before starting the app

## Project Structure

```
├── app/                    # Next.js App Router pages
│   ├── (shell)/           # Authenticated shell layout
│   │   ├── page.tsx       # Main chat page
│   │   ├── account/       # Account settings
│   │   └── projects/      # Projects page
│   ├── api/               # API routes
│   │   ├── auth/          # NextAuth handlers
│   │   └── chat/          # Chat streaming endpoint
│   └── auth/              # Auth pages (login)
├── components/            # React components
│   ├── chat/              # Chat-specific components
│   ├── billing/           # Billing UI components
│   ├── layout/            # Layout components
│   └── ui/                # shadcn/ui primitives
├── lib/                   # Utilities and state
│   ├── actions/           # Server actions (DB operations)
│   ├── api/               # API client (OpenAI)
│   ├── auth.ts            # NextAuth configuration
│   ├── billing/           # Billing logic
│   ├── db.ts              # Prisma client singleton
│   ├── hooks/             # Custom React hooks
│   └── stores/            # Zustand stores (local cache)
├── prisma/                # Database schema and migrations
│   └── schema.prisma      # Prisma schema
└── middleware.ts          # Auth middleware
```

## Security

- API keys are server-side only (never exposed to browser)
- All API routes require authentication
- Security headers (CSP, X-Frame-Options, etc.) configured
- Markdown rendering uses `skipHtml` to prevent XSS

## Tech Stack

- **Framework**: Next.js 16 (App Router, Edge Runtime)
- **Auth**: NextAuth v5 (beta) with Prisma adapter
- **Database**: PostgreSQL with Prisma ORM
- **State**: Zustand (local cache) + DB sync
- **Styling**: Tailwind CSS + shadcn/ui
- **Testing**: Vitest + Playwright
- **AI**: OpenAI API (streaming)
- **Observability**: Sentry (errors), structured logging, metrics

## API Limits

The `/api/chat` endpoint enforces the following limits:

| Limit | Value | Description |
|-------|-------|-------------|
| Daily Token Quota | 100k tokens | Per-user daily limit (free tier) |
| Rate Limit | 20 req/min | Per-user request limit |
| Concurrency | 2 streams | Maximum simultaneous streams per user |
| Connect Timeout | 30s | Max time to establish connection |
| Inactivity Timeout | 60s | Max time between chunks |
| Max Duration | 5 min | Maximum total stream duration |

### Quota Tiers

| Plan | Daily Token Limit |
|------|-------------------|
| Free | 100,000 tokens |
| Plus | 500,000 tokens |
| Pro | 2,000,000 tokens |
| Team | 10,000,000 tokens |

### Error Responses

| Status | Reason | Response |
|--------|--------|----------|
| 401 | Not authenticated | `{"error": "Authentication required"}` |
| 402 | Quota exceeded | `{"error": "Quota exceeded", "used": N, "limit": N, "resetAt": "..."}` |
| 429 | Rate/concurrency limit | `{"error": "Rate limit exceeded"}` or `{"error": "Too many concurrent requests"}` |

## Usage Tracking

Token usage is tracked in real-time using OpenAI's `stream_options: { include_usage: true }`. The system:

1. **Records actual tokens** - Uses real token counts from OpenAI response (not estimates)
2. **Calculates cost** - Model-specific pricing applied per request
3. **Enforces quotas** - Checks daily quota before processing requests
4. **Persists to DB** - All usage stored in `UsageRecord` table for billing/analytics

View usage in the billing dashboard at `/account/billing`.

## Observability

### Structured Logging

All server-side code uses structured logging with consistent context:

```typescript
import { createRequestLogger } from "@/lib/logger";

const log = createRequestLogger(requestId, userId);
log.info("Stream completed", { model, durationMs, tokens });
log.error("Request failed", error, { endpoint });
```

**Log format:**
- **Development**: Human-readable with timestamps
- **Production**: JSON format for log aggregators (Datadog, CloudWatch, etc.)

### Sentry Error Tracking

To enable Sentry:

1. Create a project at [sentry.io](https://sentry.io)
2. Add environment variables:
   ```bash
   SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
   NEXT_PUBLIC_SENTRY_DSN=https://xxx@o123.ingest.sentry.io/456
   ```
3. (Optional) For source maps in production:
   ```bash
   SENTRY_ORG=your-org
   SENTRY_PROJECT=your-project
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

**Features:**
- Automatic error capture (client + server)
- Request context (requestId, userId, model)
- Session replay for debugging user issues
- Performance monitoring

### Metrics

The app tracks key metrics using `lib/metrics.ts`:

| Metric | Type | Tags |
|--------|------|------|
| `api.request.duration` | Timing | endpoint, status, model |
| `api.request.count` | Counter | endpoint, status |
| `api.error.count` | Counter | endpoint, errorType |
| `stream.duration` | Timing | model, status |
| `stream.tokens` | Counter | model, type (prompt/completion) |
| `ratelimit.hit` | Counter | userId, type |

Metrics are logged periodically (every 60s in production) and can be parsed by log aggregators.

## CI/CD Pipeline

### GitHub Actions Workflows

The project includes several automated workflows:

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | All pushes, PRs | Lint, typecheck, unit tests, build |
| `e2e.yml` | Main branch, PRs | Playwright E2E tests |
| `deploy.yml` | Main branch, manual | Deploy to Vercel |
| `format.yml` | All pushes | Check code formatting |

### Running CI Locally

Before pushing, run the same checks as CI:

```bash
# Lint and typecheck
npm run lint
npx tsc --noEmit

# Format check
npm run format:check

# Unit tests
npm test

# E2E tests (requires build)
npm run build
npm run e2e
```

### Setting Up GitHub Actions

For full CI/CD functionality, configure these repository secrets:

| Secret | Required | Description |
|--------|----------|-------------|
| `VERCEL_TOKEN` | For deploy | Vercel API token |
| `VERCEL_ORG_ID` | For deploy | Vercel organization ID |
| `VERCEL_PROJECT_ID` | For deploy | Vercel project ID |
| `DATABASE_URL` | For migrations | Production database URL |
| `AUTH_SECRET` | For build | NextAuth secret |
| `SENTRY_AUTH_TOKEN` | Optional | For source map uploads |

### Deployment

**Automatic (recommended):**
- Push to `main` branch triggers preview deployment
- Use GitHub Actions workflow dispatch for production deploys

**Manual:**
```bash
# Build locally
npm run build

# Deploy to Vercel
vercel --prod
```

### SSE Streaming Compatibility

The app uses Server-Sent Events (SSE) for real-time streaming. Verified compatible with:

- **Vercel**: Works with Node.js runtime (default)
- **AWS/Lambda**: Works with response streaming enabled
- **Cloudflare Workers**: Requires configuration for streaming
- **Self-hosted**: Works with any Node.js server

> **Note**: If you encounter streaming issues, ensure your hosting platform supports long-running connections and doesn't buffer responses.

## Roadmap

- [x] **Phase 1**: Authentication, route protection, security headers
- [x] **Phase 2**: PostgreSQL + Prisma for data persistence
- [x] **Phase 3**: Rate limiting, timeouts, concurrency limits
- [x] **Phase 4**: Real token metering and quota enforcement
- [x] **Phase 5**: Structured logging, Sentry error tracking, metrics
- [x] **Phase 6**: CI/CD pipeline, deployment workflows
- [x] **Phase 7**: Production deployment on Vercel

## License

Private - All rights reserved
