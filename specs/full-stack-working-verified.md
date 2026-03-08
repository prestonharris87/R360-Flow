# Plan: Get Full Stack Working and Verified via Browser

## Task Description
The API server at localhost:3100 returns a 404 on GET:/ because it only serves API routes — there is no frontend served. The goal is to get the complete R360 Flow solution running: the Workflow Builder UI where you can create automations, add nodes, and see all integrations, verified working through browser MCP.

## Objective
Get the full-stack application running with:
1. API server on port 3100 (already working)
2. Workflow Builder frontend accessible in the browser
3. Verified working: can see the canvas, palette with nodes, create automations, drag/drop nodes
4. All verified via browser MCP screenshots

## Problem Statement
The API server only has JSON API endpoints (`/api/*`, `/health`). The Workflow Builder frontend is a separate React/Vite app at `workflowbuilder/apps/frontend/` that has never been installed or built. The frontend runs on port 4200 in dev mode and proxies `/api` to port 3100. The workflowbuilder dependencies are not installed (`node_modules` is missing).

## Solution Approach

**Two-server dev setup** (standard for this architecture):
- API server continues running on port 3100
- Workflow Builder frontend runs via Vite dev server on port 4200
- Vite automatically proxies `/api/*` requests to localhost:3100
- User accesses the app at **localhost:4200**

This is the correct dev workflow because:
- The frontend uses `LOCAL_STORAGE` integration strategy by default (no DB needed)
- Vite provides HMR (hot module reload) for development
- The proxy is already configured in `vite.config.mts`
- The frontend has built-in node types: trigger, action, delay, conditional, decision, notification, AI agent
- Plugins provide: copy-paste, undo-redo, PDF export, ELK layout, flow runner, help, reshapable edges, widgets

**Key steps:**
1. Install workflowbuilder dependencies (`pnpm install` inside workflowbuilder/)
2. Build the icons package (required dependency for frontend)
3. Start the API server on port 3100
4. Start the frontend dev server on port 4200
5. Verify via browser MCP at localhost:4200

## Relevant Files

- `workflowbuilder/package.json` — Root workspace for frontend monorepo
- `workflowbuilder/pnpm-workspace.yaml` — Defines `apps/*` as workspace packages
- `workflowbuilder/apps/frontend/package.json` — Frontend app with Vite
- `workflowbuilder/apps/frontend/vite.config.mts` — Dev server config (port 4200, proxy to 3100)
- `workflowbuilder/apps/frontend/.env.development` — Sets `LOCAL_STORAGE` strategy
- `workflowbuilder/apps/frontend/src/app/app.tsx` — Main app component with palette, diagram, properties bar
- `workflowbuilder/apps/frontend/src/app/data/palette.ts` — Node palette: trigger, action, delay, conditional, decision, notification, AI agent
- `workflowbuilder/apps/icons/package.json` — Icon generation package (dependency of frontend)
- `workflowbuilder/apps/icons/src/generate-icons.ts` — Uses `@svgr/cli` to generate React icon components
- `workflowbuilder/apps/types/package.json` — Shared TypeScript types
- `packages/api/src/server.ts` — API server entry point

## Implementation Phases

### Phase 1: Foundation — Install Dependencies
Install workflowbuilder dependencies. The icons package build uses `npx @svgr/cli` which may need special handling on Node.js v25 (uses npm internally). May need to use Node.js v22 via nvm for the workflowbuilder.

### Phase 2: Core Implementation — Build and Start
Build the icons package, then start both servers (API on 3100, frontend on 4200).

### Phase 3: Integration & Polish — Browser Verification
Use browser MCP to navigate to localhost:4200, take screenshots, verify the canvas loads, palette shows nodes, and you can interact with the workflow builder.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.

### Team Members

- Builder
  - Name: frontend-setup
  - Role: Install workflowbuilder dependencies, build icons, and start both servers
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: browser-verifier
  - Role: Use browser MCP to navigate to the app and verify everything works
  - Agent Type: general-purpose
  - Resume: true

- Validator
  - Name: final-validator
  - Role: Validate all acceptance criteria are met via browser MCP
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Install Workflowbuilder Dependencies
- **Task ID**: install-deps
- **Depends On**: none
- **Assigned To**: frontend-setup
- **Agent Type**: builder
- **Parallel**: false
- Navigate to `workflowbuilder/` directory
- Run `pnpm install` to install all workspace dependencies
- If pnpm install fails due to Node.js version (workflowbuilder requires >=22.12.0), use `/Users/preston/.nvm/versions/node/v22.20.0/bin/node` and the corresponding pnpm
- Verify `workflowbuilder/node_modules` exists after install

### 2. Build Icons Package
- **Task ID**: build-icons
- **Depends On**: install-deps
- **Assigned To**: frontend-setup (resume)
- **Agent Type**: builder
- **Parallel**: false
- The icons package (`workflowbuilder/apps/icons`) uses `npx @svgr/cli` to generate React icon components from SVGs
- Run `pnpm --filter @workflow-builder/icons build` from inside `workflowbuilder/`
- If `npx @svgr/cli` fails, try running it directly: `cd workflowbuilder/apps/icons && node_modules/.bin/svgr ...` or install `@svgr/cli` if needed
- Verify `workflowbuilder/apps/icons/dist/` contains generated `.tsx` files

### 3. Start API Server
- **Task ID**: start-api
- **Depends On**: none (API is already built from previous work)
- **Assigned To**: frontend-setup (resume)
- **Agent Type**: builder
- **Parallel**: true (can run alongside install-deps)
- Kill any existing process on port 3100: `lsof -ti:3100 | xargs kill -9 2>/dev/null`
- Start the API server: `node /Users/preston/Documents/Claude/R360-Flow/packages/api/dist/server.js` (run in background)
- Verify with `curl -s http://localhost:3100/health`

### 4. Start Frontend Dev Server
- **Task ID**: start-frontend
- **Depends On**: build-icons, start-api
- **Assigned To**: frontend-setup (resume)
- **Agent Type**: builder
- **Parallel**: false
- From `workflowbuilder/`, run `pnpm dev` which starts the Vite dev server on port 4200
- If port 4200 is in use, kill existing processes first
- The Vite config already has proxy: `/api` -> `http://localhost:3100`
- Wait for the dev server to be ready (watch for "ready in" in output)
- Verify with `curl -s http://localhost:4200` returning HTML with "Workflow Builder"

### 5. Browser Verification — Load App
- **Task ID**: verify-app-loads
- **Depends On**: start-frontend
- **Assigned To**: browser-verifier
- **Agent Type**: general-purpose
- **Parallel**: false
- Use `mcp__browsermcp__browser_navigate` to go to `http://localhost:4200`
- Use `mcp__browsermcp__browser_screenshot` to capture the page
- Verify the workflow builder canvas loads with:
  - A palette/sidebar showing available node types (trigger, action, delay, conditional, decision, notification, AI agent)
  - A canvas area for building workflows
  - A toolbar/app bar at the top

### 6. Browser Verification — Create Automation
- **Task ID**: verify-create-automation
- **Depends On**: verify-app-loads
- **Assigned To**: browser-verifier (resume)
- **Agent Type**: general-purpose
- **Parallel**: false
- Use browser MCP to interact with the workflow builder:
  - Take a snapshot of the page to understand the DOM structure
  - Find and click on a node in the palette (e.g., "Trigger" node)
  - Drag or click to add it to the canvas
  - Add another node (e.g., "Action")
  - Verify nodes appear on the canvas
- Take screenshots showing:
  - The palette with available nodes
  - Nodes added to the canvas
  - The overall working state of the application

### 7. Final Validation
- **Task ID**: validate-all
- **Depends On**: verify-create-automation
- **Assigned To**: final-validator
- **Agent Type**: validator
- **Parallel**: false
- Verify API server responds at localhost:3100/health
- Verify frontend loads at localhost:4200
- Use browser MCP to take final screenshot showing the complete working application
- Confirm all node types are visible in the palette
- Confirm the canvas is interactive

## Acceptance Criteria
- API server running on port 3100 (responds to /health)
- Frontend dev server running on port 4200
- Browser shows the Workflow Builder UI at localhost:4200 with:
  - Canvas for building workflows
  - Palette showing node types: trigger, action, delay, conditional, decision, notification, AI agent
  - Toolbar with controls
- Can interact with the UI: add nodes to canvas
- Browser MCP screenshots confirm working state

## Validation Commands
```bash
# API health check
curl -s http://localhost:3100/health | head -1

# Frontend serves HTML
curl -s http://localhost:4200 | grep -o "Workflow Builder"

# Both ports listening
lsof -i:3100 | head -2
lsof -i:4200 | head -2
```

## Notes
- The workflowbuilder is a separate monorepo inside the project with its own pnpm workspace
- The frontend uses `LOCAL_STORAGE` integration strategy by default — no database or auth needed for the UI to work
- Node.js v22 may be required for the workflowbuilder (engine constraint: >=22.12.0), while the API runs on whatever Node is available
- The icons package uses `npx @svgr/cli` which invokes npm internally — this may conflict with pnpm. If so, use the installed `@svgr/core` directly or run the CLI from node_modules
- The browser MCP tools are: `mcp__browsermcp__browser_navigate`, `mcp__browsermcp__browser_screenshot`, `mcp__browsermcp__browser_snapshot`, `mcp__browsermcp__browser_click`, `mcp__browsermcp__browser_type`
- Vite dev server provides hot module replacement — any code changes will auto-refresh
