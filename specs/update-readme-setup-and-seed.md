# Plan: Update README, Setup, Seed Data, and Slash Commands

## Task Description
Comprehensive update to the developer experience: rewrite the README to reflect both frontend-v1 (React) and frontend-v2 (Vue), update seed data to include real n8n workflow exports (Hello World + POR Demo AI Automation), create Claude Code slash commands for `/setup` and `/start`, ensure one-command setup and one-command server start (running API + both frontends simultaneously), and print port information on startup.

## Objective
When complete, a developer can:
1. Read the README and understand the full project
2. Run one command (`./scripts/dev-setup.sh` or `/setup` in Claude Code) to set up everything
3. Run one command (`./scripts/dev-start.sh` or `/start` in Claude Code) to start ALL servers (API + frontend-v1 + frontend-v2) simultaneously
4. See a clear printout of which ports each server is running on
5. Have two real n8n workflows pre-seeded for testing

## Problem Statement
The README only references frontend-v1 (React). Frontend-v2 (Vue) exists but isn't documented. Both frontends currently claim port 4200, causing conflicts. The seed data contains dummy workflow metadata but no actual executable n8n workflows. There are no Claude Code slash commands for setup/start. Starting development requires multiple manual terminal commands.

## Solution Approach
1. **Fix port conflict**: Change frontend-v2 to port 4201 (frontend-v1 stays on 4200)
2. **Rewrite README**: Document both frontends, updated architecture, seed workflows, recommended API-first workflow
3. **Update seed script**: Copy the two workflow JSON files into the project and seed them into the database
4. **Create dev-start.sh**: Single script that starts API + both frontends using `concurrently`, printing all ports
5. **Create slash commands**: `/setup` and `/start` Claude Code commands that run the respective scripts
6. **Update .env.example**: Add frontend-v2 URL

## Relevant Files
Use these files to complete the task:

**Edit:**
- `README.md` — Full rewrite to document v1+v2 frontends, seed workflows, API-first approach
- `scripts/seed.ts` — Add seeding of real n8n workflow JSON (Hello World + POR Demo AI Automation)
- `scripts/dev-setup.sh` — Update success output to show both frontends and ports
- `.env.example` — Add `VITE_API_URL_V2` or frontend-v2 port reference
- `workflowbuilder/apps/frontend-v2/vite.config.mts` — Change port from 4200 to 4201
- `workflowbuilder/apps/frontend-v2/package.json` — Update dev script port from 4200 to 4201
- `workflowbuilder/apps/frontend-v2/playwright.config.ts` — Update baseURL port from 4200 to 4201
- `package.json` (root) — Add `start` script that runs all servers, add `concurrently` dev dependency

### New Files
- `scripts/dev-start.sh` — Single script to start API + both frontends, prints port table
- `scripts/seed-data/hello-world-workflow.json` — Copy of Hello World Workflow export from n8n
- `scripts/seed-data/por-demo-ai-automation.json` — Copy of POR Demo AI Automation export from n8n
- `.claude/commands/setup.md` — Slash command for `/setup`
- `.claude/commands/start.md` — Slash command for `/start`

## Implementation Phases
### Phase 1: Foundation
- Fix port conflict (frontend-v2 → 4201)
- Copy workflow JSON files into `scripts/seed-data/`
- Update seed script to load and insert real workflows

### Phase 2: Core Implementation
- Create `dev-start.sh` script that starts all servers and prints ports
- Add root `pnpm start` script
- Create `/setup` and `/start` slash commands
- Rewrite README

### Phase 3: Integration & Polish
- Update `dev-setup.sh` output to reflect new ports and both frontends
- Validate end-to-end: setup from scratch, start all servers, verify seed data

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to to the building, validating, testing, deploying, and other tasks.
  - This is critical. You're job is to act as a high level director of the team, not a builder.
  - You're role is to validate all work is going well and make sure the team is on track to complete the plan.
  - You'll orchestrate this by using the Task* Tools to manage coordination between the team members.
  - Communication is paramount. You'll use the Task* Tools to communicate with the team members and ensure they're on track to complete the plan.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

- Builder
  - Name: builder-ports-and-seed
  - Role: Fix port conflicts, copy workflow JSONs, update seed script
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-scripts-and-commands
  - Role: Create dev-start.sh, slash commands, update dev-setup.sh and root package.json
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-readme
  - Role: Rewrite the README with complete documentation
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: validator-devex
  - Role: Verify all changes work together, ports correct, seed data loads, scripts run
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Fix Frontend-v2 Port Conflict
- **Task ID**: fix-port-conflict
- **Depends On**: none
- **Assigned To**: builder-ports-and-seed
- **Agent Type**: builder
- **Parallel**: true
- Read `workflowbuilder/apps/frontend-v2/vite.config.mts` and change `port: 4200` to `port: 4201`
- Read `workflowbuilder/apps/frontend-v2/package.json` and change `"dev": "vite --port 4200"` to `"dev": "vite --port 4201"`
- Read `workflowbuilder/apps/frontend-v2/playwright.config.ts` and change all `4200` references to `4201`

### 2. Copy Workflow JSON Files and Update Seed Script
- **Task ID**: update-seed-data
- **Depends On**: none
- **Assigned To**: builder-ports-and-seed
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 1, same builder so sequential)
- Create directory `scripts/seed-data/` if it doesn't exist
- Copy `/Users/preston/Library/Mobile Documents/com~apple~CloudDocs/Downloads/Hello World Workflow.json` to `scripts/seed-data/hello-world-workflow.json`
- Copy `/Users/preston/Downloads/POR Demo AI Automation.json` to `scripts/seed-data/por-demo-ai-automation.json`
- Read `scripts/seed.ts` and update it to:
  - Import the two JSON files from `./seed-data/`
  - After seeding sample workflows, also insert these two real n8n workflows into the `workflows` table
  - Use the workflow JSON as the `definition` column (JSONB) — store the full n8n export
  - Set `name` from the JSON's `name` field
  - Set `status` to `active` for Hello World, `draft` for POR Demo (since it needs credentials)
  - Use fixed UUIDs for idempotency (e.g., `10000000-0000-0000-0000-000000000010` for Hello World, `10000000-0000-0000-0000-000000000011` for POR Demo)
  - Add a comment on the POR Demo workflow noting it requires Airtop and OpenAI credentials configured via the API

### 3. Create dev-start.sh Script
- **Task ID**: create-start-script
- **Depends On**: fix-port-conflict
- **Assigned To**: builder-scripts-and-commands
- **Agent Type**: builder
- **Parallel**: true
- Create `scripts/dev-start.sh` (make it executable with `chmod +x`):

```bash
#!/usr/bin/env bash
set -euo pipefail

# R360 Flow — Start All Development Servers
# Starts API server, Frontend v1 (React), and Frontend v2 (Vue) simultaneously

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo ""
echo "Starting R360 Flow development servers..."
echo ""

# Check if Docker services are running
if ! docker compose -f infrastructure/docker-compose.yml ps --status running 2>/dev/null | grep -q "r360-postgres"; then
  echo "Starting Docker services (PostgreSQL + Redis)..."
  docker compose -f infrastructure/docker-compose.yml up -d
  sleep 3
fi

echo "┌─────────────────────────────────────────────────────┐"
echo "│              R360 Flow Dev Servers                  │"
echo "├──────────────┬──────────────────────────────────────┤"
echo "│ API Server   │ http://localhost:3100                │"
echo "│ Frontend v1  │ http://localhost:4200  (React)       │"
echo "│ Frontend v2  │ http://localhost:4201  (Vue)         │"
echo "│ PostgreSQL   │ localhost:5432                       │"
echo "│ Redis        │ localhost:6379                       │"
echo "├──────────────┴──────────────────────────────────────┤"
echo "│ Login: admin@r360.dev / any password                │"
echo "└────────────────────────────────────────────────────-┘"
echo ""
echo "Press Ctrl+C to stop all servers"
echo ""

# Start all three servers using concurrently
npx concurrently \
  --names "api,fe-v1,fe-v2" \
  --prefix-colors "blue,green,magenta" \
  --kill-others \
  "pnpm dev" \
  "cd workflowbuilder && pnpm --filter @workflow-builder/frontend dev" \
  "cd workflowbuilder && pnpm --filter @r360/frontend-v2 dev"
```

- Add `concurrently` as a root devDependency in root `package.json`: `"concurrently": "^9.1.0"`
- Add root `package.json` script: `"start": "./scripts/dev-start.sh"`
- Run `pnpm install` at root to install concurrently

### 4. Update dev-setup.sh Output
- **Task ID**: update-setup-output
- **Depends On**: fix-port-conflict
- **Assigned To**: builder-scripts-and-commands
- **Agent Type**: builder
- **Parallel**: false (same builder, after task 3)
- Read `scripts/dev-setup.sh` and update the success output section at the end to show:
  - Both frontends with their ports
  - The new `pnpm start` command for starting all servers at once
  - Updated service table matching the dev-start.sh format
- The output should look like:

```
Setup complete!

To start all servers:           pnpm start
  (or individually)
  API server:                   pnpm dev
  Frontend v1 (React):          cd workflowbuilder && pnpm --filter @workflow-builder/frontend dev
  Frontend v2 (Vue):            cd workflowbuilder && pnpm --filter @r360/frontend-v2 dev

To open Drizzle Studio:         pnpm db:studio

Dev login credentials:
  Email:    admin@r360.dev
  Password: (any — dev mode accepts all)

Services:
  API server:    http://localhost:3100
  Frontend v1:   http://localhost:4200  (React)
  Frontend v2:   http://localhost:4201  (Vue)
  PostgreSQL:    localhost:5432
  Redis:         localhost:6379

Seed workflows:
  Hello World Workflow          — ready to execute
  POR Demo AI Automation        — requires Airtop + OpenAI credentials (configure via API)
```

### 5. Create Slash Commands
- **Task ID**: create-slash-commands
- **Depends On**: create-start-script
- **Assigned To**: builder-scripts-and-commands
- **Agent Type**: builder
- **Parallel**: false (same builder, after task 3-4)
- Create `.claude/commands/setup.md`:

```md
---
description: Set up the R360 Flow development environment (Docker, deps, build, seed)
---

# Setup

Run the full development environment setup for R360 Flow.

This will:
1. Validate prerequisites (Docker, pnpm, Node.js)
2. Start PostgreSQL and Redis via Docker
3. Install all dependencies
4. Build all packages
5. Create database tables and seed dev data (including sample workflows)

## Run

Execute the setup script:

\`\`\`bash
./scripts/dev-setup.sh
\`\`\`

Report what happened — whether setup succeeded or if there were errors to fix.
```

- Create `.claude/commands/start.md`:

```md
---
description: Start all R360 Flow development servers (API + Frontend v1 + Frontend v2)
---

# Start

Start all R360 Flow development servers simultaneously.

This launches:
- **API Server** on http://localhost:3100 (Fastify)
- **Frontend v1** on http://localhost:4200 (React)
- **Frontend v2** on http://localhost:4201 (Vue)

## Run

Execute the start script:

\`\`\`bash
./scripts/dev-start.sh
\`\`\`

Report the ports each server is running on once they're up.
```

### 6. Rewrite README
- **Task ID**: rewrite-readme
- **Depends On**: fix-port-conflict, update-seed-data, create-start-script
- **Assigned To**: builder-readme
- **Agent Type**: builder
- **Parallel**: false (needs other tasks done first for accurate info)
- Read the current `README.md` and rewrite it with this structure:

**Title and description**: Keep "R360 Flow" — multi-tenant workflow automation platform built on n8n's execution engine.

**Architecture diagram**: Update to show both frontends:
```
Frontend v1 (React, port 4200)  ─┐
                                  ├──→  R360 Flow API (Fastify, port 3100)  →  n8n npm packages (unmodified)
Frontend v2 (Vue, port 4201)   ─┘
```

**Architecture bullets**:
- **Frontend v1** — React 19, React Router, Zustand, @xyflow/react visual editor (leverages workflowbuilder.io patterns)
- **Frontend v2** — Vue 3, Vue Router, Pinia, @vue-flow/core (experiment for importing n8n UI components)
- Note: Both editor UIs are rudimentary. For complex workflows, it is recommended to use the API directly with workflows exported from n8n as JSON.
- **API** — Tenant-aware REST API with auth, credentials, billing
- **Execution** — n8n-workflow + n8n-core used as library imports (never forked)
- **Database** — PostgreSQL with per-tenant isolation on every table
- **Queue** — Redis + BullMQ for async execution with per-tenant limits

**Quick Start — Prerequisites**: Docker, Node.js v22+, pnpm v9+ (unchanged)

**Quick Start — Setup**:
```bash
git clone <repo-url> r360-flow
cd r360-flow
./scripts/dev-setup.sh
```

**Quick Start — Start All Servers**:
```bash
pnpm start
```
This starts the API server, Frontend v1, and Frontend v2 simultaneously and prints:
(include the port table from dev-start.sh)

**Quick Start — Manual Start** (if you prefer individual terminals):
```bash
# Terminal 1: API
pnpm dev
# Terminal 2: Frontend v1
cd workflowbuilder && pnpm --filter @workflow-builder/frontend dev
# Terminal 3: Frontend v2
cd workflowbuilder && pnpm --filter @r360/frontend-v2 dev
```

**Dev Login**: unchanged (admin@r360.dev / any password)

**Seed Workflows** section (NEW):
| Workflow | Status | Description |
|----------|--------|-------------|
| Hello World Workflow | Active | Simple manual trigger → set message. Good for testing execution. |
| POR Demo AI Automation | Draft | Complex AI-powered browser automation using Airtop + OpenAI. Requires credentials configured via the API. Cannot be edited in the UI without breaking it. |

Note about workflows:
> Both frontend editors (v1 and v2) are rudimentary and do not support the full complexity of n8n workflows. For creating and testing complex workflows, the recommended approach is:
> 1. Build the workflow in n8n
> 2. Export as JSON
> 3. Import via the R360 Flow API (`POST /api/workflows`)
> Editing complex workflows like "POR Demo AI Automation" in either UI editor will break them.

**Project Structure**: Update to show both frontends:
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

**Services table**: Update with both frontends:
| Service | URL | Description |
|---------|-----|-------------|
| API Server | http://localhost:3100 | Fastify REST API |
| Frontend v1 | http://localhost:4200 | React application |
| Frontend v2 | http://localhost:4201 | Vue application |
| PostgreSQL | localhost:5432 | Database |
| Redis | localhost:6379 | Queue and cache |

**Scripts table**: Update with new commands:
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

**Tech Stack**: Update to show both frontends:
- **Frontend v1:** React 19, React Router v7, Zustand, @xyflow/react, Vite, CSS Modules
- **Frontend v2:** Vue 3, Vue Router v4, Pinia, @vue-flow/core, Element Plus, Vite
- (rest unchanged)

**Multi-Tenancy**: Keep as-is

### 7. Validate Everything
- **Task ID**: validate-all
- **Depends On**: fix-port-conflict, update-seed-data, create-start-script, update-setup-output, create-slash-commands, rewrite-readme
- **Assigned To**: validator-devex
- **Agent Type**: validator
- **Parallel**: false
- Verify frontend-v2 config files all reference port 4201 (not 4200)
- Verify `scripts/seed-data/hello-world-workflow.json` and `scripts/seed-data/por-demo-ai-automation.json` exist and contain valid JSON
- Verify `scripts/seed.ts` references the seed-data files
- Verify `scripts/dev-start.sh` exists and is executable
- Verify root `package.json` has `"start"` script and `concurrently` devDependency
- Verify `.claude/commands/setup.md` and `.claude/commands/start.md` exist
- Verify `README.md` references both frontends, both ports, seed workflows, and the `pnpm start` command
- Verify `dev-setup.sh` output mentions both frontends
- Grep for any remaining `4200` references in frontend-v2 (should be zero)
- Run `pnpm install` to confirm concurrently installs

## Acceptance Criteria
- Frontend v1 runs on port 4200, Frontend v2 runs on port 4201 — no port conflict
- `scripts/seed-data/` contains both workflow JSON files copied from the user's filesystem
- `scripts/seed.ts` seeds both real n8n workflows into the database
- `scripts/dev-start.sh` starts API + both frontends simultaneously and prints a port table
- Root `pnpm start` runs `dev-start.sh`
- `.claude/commands/setup.md` and `.claude/commands/start.md` slash commands exist
- `README.md` documents both frontends, both ports, seed workflows, API-first workflow recommendation, and the one-command setup/start experience
- `dev-setup.sh` success output shows both frontends and updated commands
- No port conflicts between frontend-v1 and frontend-v2

## Validation Commands
Execute these commands to validate the task is complete:

```bash
# Verify port conflict is fixed
grep -n "4201" /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2/vite.config.mts
grep -n "4201" /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2/package.json

# Verify seed data files exist
test -f /Users/preston/Documents/Claude/R360-Flow/scripts/seed-data/hello-world-workflow.json && echo "PASS" || echo "FAIL"
test -f /Users/preston/Documents/Claude/R360-Flow/scripts/seed-data/por-demo-ai-automation.json && echo "PASS" || echo "FAIL"

# Verify dev-start.sh exists and is executable
test -x /Users/preston/Documents/Claude/R360-Flow/scripts/dev-start.sh && echo "PASS" || echo "FAIL"

# Verify slash commands exist
test -f /Users/preston/Documents/Claude/R360-Flow/.claude/commands/setup.md && echo "PASS" || echo "FAIL"
test -f /Users/preston/Documents/Claude/R360-Flow/.claude/commands/start.md && echo "PASS" || echo "FAIL"

# Verify root package.json has start script
grep '"start"' /Users/preston/Documents/Claude/R360-Flow/package.json

# Verify README mentions both frontends
grep -c "Frontend v2" /Users/preston/Documents/Claude/R360-Flow/README.md

# Verify no port 4200 in frontend-v2 config
grep "4200" /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2/vite.config.mts /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2/package.json && echo "FAIL: still has 4200" || echo "PASS: no 4200 refs"

# Install deps to verify concurrently works
cd /Users/preston/Documents/Claude/R360-Flow && pnpm install
```

## Notes
- **Port assignment**: Frontend v1 keeps 4200 (no disruption), Frontend v2 moves to 4201.
- **Seed workflow JSON**: The files are copied as-is from n8n exports. The `definition` column in the workflows table stores the full JSON. The seed script should extract `name` and `nodes` from the JSON for the workflow record metadata.
- **POR Demo credentials**: The POR Demo AI Automation workflow references Airtop and OpenAI credentials by n8n credential IDs. These won't resolve in R360 Flow unless a user creates matching credentials via the API. The seed script should NOT attempt to create these credentials (they contain secrets). Instead, the workflow is seeded as `draft` status with a note.
- **concurrently**: Using `npx concurrently` in dev-start.sh means it works even if not installed globally. Adding it as a devDependency ensures it's available after `pnpm install`.
- **Slash commands**: These are simple wrappers that run the shell scripts. They exist so developers using Claude Code can type `/setup` or `/start` instead of remembering script paths.
