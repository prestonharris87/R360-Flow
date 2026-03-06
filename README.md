# R360 Flow

Multi-tenant workflow automation platform built on n8n's execution engine.

## Architecture

```
Frontend (React 19)  →  R360 Flow API (Fastify)  →  n8n npm packages (unmodified)
```

- **Frontend** — React Router, Zustand, @xyflow/react visual editor
- **API** — Tenant-aware REST API with auth, credentials, billing
- **Execution** — n8n-workflow + n8n-core used as library imports (never forked)
- **Database** — PostgreSQL with per-tenant isolation on every table
- **Queue** — Redis + BullMQ for async execution with per-tenant limits

## Quick Start

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL and Redis)
- [Node.js](https://nodejs.org/) v22+
- [pnpm](https://pnpm.io/) v9+

### Setup

```bash
# Clone the repo
git clone <repo-url> r360-flow
cd r360-flow

# Run the setup script (starts Docker, installs deps, creates tables, seeds data)
./scripts/dev-setup.sh
```

Or do it manually:

```bash
# 1. Copy environment variables
cp .env.example .env

# 2. Start PostgreSQL and Redis
docker compose -f infrastructure/docker-compose.yml up -d

# 3. Install dependencies
pnpm install

# 4. Build all packages
pnpm build

# 5. Create tables and seed dev data
npx tsx scripts/seed.ts

# 6. Start the API server
pnpm dev

# 7. Start the frontend (separate terminal)
cd workflowbuilder && pnpm dev
```

### Dev Login

After setup, open http://localhost:4200 and sign in:

- **Email:** admin@r360.dev
- **Password:** any (dev mode accepts all passwords)

## Project Structure

```
r360-flow/
  scripts/                    # Setup and seed scripts
  infrastructure/             # Docker Compose, init SQL
  packages/
    types/                    # Shared TypeScript types
    db/                       # PostgreSQL schema (Drizzle ORM)
    json-translator/          # DiagramModel <-> n8n WorkflowParameters
    execution-engine/         # n8n wrapper (DI bootstrap, node registry)
    api/                      # Fastify API server (port 3100)
    nodes-r360/               # Custom R360 n8n nodes
  workflowbuilder/            # Frontend (React 19, Vite, port 4200)
    apps/frontend/src/
      pages/                  # Route pages (dashboard, workflows, etc.)
      layouts/                # App shell, sidebar, page header
      components/             # Shared UI components
      stores/                 # Zustand stores
      api/                    # Typed API client modules
      auth/                   # Auth hooks and guards
      app/                    # Workflow editor (canvas, palette, panels)
```

## Services

| Service    | URL                    | Description            |
|------------|------------------------|------------------------|
| Frontend   | http://localhost:4200  | React application      |
| API Server | http://localhost:3100  | Fastify REST API       |
| PostgreSQL | localhost:5432         | Database               |
| Redis      | localhost:6379         | Queue and cache        |

## Scripts

| Command                    | Description                          |
|----------------------------|--------------------------------------|
| `./scripts/dev-setup.sh`  | Full dev environment setup           |
| `npx tsx scripts/seed.ts` | Seed database with dev data          |
| `pnpm dev`                | Start API server (with hot reload)   |
| `pnpm build`              | Build all packages                   |
| `pnpm test`               | Run all tests                        |
| `pnpm typecheck`          | TypeScript type checking             |
| `pnpm db:generate`        | Generate Drizzle migrations          |
| `pnpm db:migrate`         | Apply database migrations            |
| `pnpm db:studio`          | Open Drizzle Studio                  |

## Tech Stack

- **Frontend:** React 19, React Router v7, Zustand, @xyflow/react, Vite, CSS Modules
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
