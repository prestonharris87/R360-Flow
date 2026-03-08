# R360 Flow

Multi-tenant workflow automation platform built on n8n's execution engine.

## Architecture

```
Frontend v1 (React, port 4200)  ─┐
                                  ├──→  R360 Flow API (Fastify, port 3100)  →  n8n npm packages (unmodified)
Frontend v2 (Vue, port 4201)   ─┘
```

- **Frontend v1** — React 19, React Router, Zustand, @xyflow/react visual editor (leverages workflowbuilder.io patterns)
- **Frontend v2** — Vue 3, Vue Router, Pinia, @vue-flow/core visual editor (experiment for importing n8n UI components)
- **API** — Tenant-aware REST API with auth, credentials, billing
- **Execution** — n8n-workflow + n8n-core used as library imports (never forked)
- **Database** — PostgreSQL with per-tenant isolation on every table
- **Queue** — Redis + BullMQ for async execution with per-tenant limits

> **Note:** Both frontend editors are rudimentary and do not support the full complexity of n8n workflows. For creating and testing complex workflows, the recommended approach is to build the workflow in n8n, export as JSON, and import via the R360 Flow API (`POST /api/workflows`).

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL and Redis)
- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9+

### Setup

```bash
# Clone and set up (starts Docker, installs deps, builds, seeds data)
git clone <repo-url> r360-flow
cd r360-flow
./scripts/dev-setup.sh
```

### Start All Servers

```bash
pnpm start
```

This starts the API server, Frontend v1, and Frontend v2 simultaneously:

```
┌──────────────────────────────────────────────────────┐
│              R360 Flow Dev Servers                   │
├──────────────┬───────────────────────────────────────┤
│ API Server   │ http://localhost:3100                 │
│ Frontend v1  │ http://localhost:4200  (React)        │
│ Frontend v2  │ http://localhost:4201  (Vue)          │
│ PostgreSQL   │ localhost:5432                        │
│ Redis        │ localhost:6379                        │
├──────────────┴───────────────────────────────────────┤
│ Login: admin@r360.dev / any password                 │
└──────────────────────────────────────────────────────┘
```

### Manual Start (individual terminals)

```bash
# Terminal 1: API server
pnpm dev

# Terminal 2: Frontend v1 (React)
cd workflowbuilder && pnpm --filter @workflow-builder/frontend dev

# Terminal 3: Frontend v2 (Vue)
cd workflowbuilder && pnpm --filter @r360/frontend-v2 dev
```

### Dev Login

Open http://localhost:4200 (v1) or http://localhost:4201 (v2) and sign in:

- **Email:** admin@r360.dev
- **Password:** any (dev mode accepts all passwords)

## Seed Workflows

The setup script seeds two real n8n workflow exports for testing:

| Workflow | Status | Description |
|----------|--------|-------------|
| Hello World Workflow | Active | Simple manual trigger → set message. Good for testing execution. |
| POR Demo AI Automation | Draft | Complex AI-powered browser automation using Airtop + OpenAI. Requires credentials configured via the API. |

> **Important:** Editing complex workflows like "POR Demo AI Automation" in either frontend editor will break them. Use the API directly for complex workflow management. Credentials for the POR Demo must be configured via the backend API.

## Project Structure

```
r360-flow/
  scripts/
    dev-setup.sh              # One-command setup
    dev-start.sh              # One-command start all servers
    seed.ts                   # Database seeding
    seed-data/                # Sample workflow JSON exports
      hello-world-workflow.json
      por-demo-ai-automation.json
  infrastructure/             # Docker Compose, init SQL
  packages/
    types/                    # Shared TypeScript types
    db/                       # PostgreSQL schema (Drizzle ORM)
    json-translator/          # DiagramModel <-> n8n WorkflowParameters
    execution-engine/         # n8n wrapper (DI bootstrap, node registry)
    api/                      # Fastify API server (port 3100)
    nodes-r360/               # Custom R360 n8n nodes
  workflowbuilder/            # Frontend monorepo
    apps/
      frontend/               # Frontend v1 — React 19, Vite (port 4200)
      frontend-v2/            # Frontend v2 — Vue 3, Vite (port 4201)
      icons/                  # SVG icon system
      types/                  # Frontend shared types
  n8n/                        # READ-ONLY n8n source reference
```

## Services

| Service | URL | Description |
|---------|-----|-------------|
| API Server | http://localhost:3100 | Fastify REST API |
| Frontend v1 | http://localhost:4200 | React application |
| Frontend v2 | http://localhost:4201 | Vue application |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Queue and cache |

## Scripts

| Command | Description |
|---------|-------------|
| `./scripts/dev-setup.sh` | Full dev environment setup |
| `pnpm start` | Start all servers (API + both frontends) |
| `pnpm dev` | Start API server only (with hot reload) |
| `pnpm build` | Build all packages |
| `pnpm test` | Run all tests |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm db:seed` | Seed database with dev data |
| `pnpm db:generate` | Generate Drizzle migrations |
| `pnpm db:migrate` | Apply database migrations |
| `pnpm db:studio` | Open Drizzle Studio |

## Tech Stack

- **Frontend v1:** React 19, React Router v7, Zustand, @xyflow/react, Vite, CSS Modules
- **Frontend v2:** Vue 3, Vue Router v4, Pinia, @vue-flow/core, Element Plus, Vite
- **Backend:** Node.js, TypeScript, Fastify
- **Database:** PostgreSQL 16, Drizzle ORM
- **Queue:** Redis 7, BullMQ
- **Execution:** n8n-workflow, n8n-core (unmodified npm packages)
- **Auth:** Session-based (Clerk/Auth0 integration ready)
- **Billing:** Stripe SDK

## Multi-Tenancy

All data is tenant-scoped. Every database table includes a `tenant_id` column with foreign key constraints. Tenant isolation is enforced at four layers:

1. **Credentials** — Per-tenant encryption keys via `TenantCredentialsHelper`
2. **Execution** — Tenant-scoped `IWorkflowExecuteAdditionalData` per run
3. **Storage** — All DB queries filter by `tenant_id`
4. **Limits** — BullMQ enforces per-tenant concurrency and rate limits
