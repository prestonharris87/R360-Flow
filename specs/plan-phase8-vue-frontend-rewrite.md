> **Note:** The editor-v2 experiment referenced in this document has been removed and replaced by frontend-v2.

# Plan: Phase 8 — Vue Frontend Rewrite (Meta-Plan)

## Task Description

Create a comprehensive `specs/Phase8.md` spec document that covers rebuilding the entire React frontend as a Vue 3 application. This is a meta-plan: it documents the research findings, architecture decisions, and authoring strategy for writing Phase8.md — it does NOT contain the phase spec itself.

## Objective

Produce a Phase8.md that:
1. Is comprehensive enough for the Ralph Wiggum loop to execute autonomously
2. Contains 30-50+ granular subtasks with clear dependencies, assignments, and acceptance criteria
3. Covers every page, component, store, API module, and feature in the current React frontend
4. Defines what n8n components to import vs build custom
5. Includes E2E tests via browser MCP for every feature
6. Updates Ralph Wiggum to support Phase 8

## Problem Statement

The current React frontend (workflowbuilder/apps/frontend) cannot directly import n8n's Vue-based editor components due to the Vue/React framework mismatch. Rebuilding as a Vue app enables:
- Direct import of n8n design system components (80+ pure Vue components)
- Potential import of n8n's node palette, NDV (properties panel), and canvas components
- Single-framework architecture (Vue 3 + Pinia + Vue Router)
- Elimination of the separate editor-v2 dev server workaround

## Research Findings

### Current React Frontend Inventory

**9 Pages:**
| Page | Route | Key Features |
|------|-------|-------------|
| LoginPage | `/login` | Email/password form, dev-mode session fallback |
| DashboardPage | `/` | 4 stat cards, recent workflows table, recent executions table |
| WorkflowListPage | `/workflows` | DataTable with search, status toggle, delete, v2 badge |
| WorkflowEditorPage | `/workflows/:id/edit` | Full Workflow Builder SDK integration (ReactFlow canvas) |
| WorkflowEditorV2Page | `/workflows/:id/edit-v2` | Redirect stub to Vue editor on port 4202 |
| ExecutionListPage | `/executions` | DataTable with status filter, cancel running |
| ExecutionDetailPage | `/executions/:id` | Metadata card, expandable step list with I/O JSON |
| CredentialsPage | `/credentials` | CRUD, type picker modal, dynamic form, test button |
| SettingsPage | `/settings` | Read-only workspace/account info, theme toggle, logout |

**4 Zustand Stores** (→ Pinia):
- `useDashboardStore` — stats + recent items
- `useWorkflowListStore` — paginated workflow list with search
- `useExecutionStore` — paginated executions with status filter
- `useCredentialStore` — credentials CRUD + type listing + test

**4 API Modules:**
- `api-client.ts` — Generic HTTP client with retry, tenant headers, error handling
- `workflow-api.ts` — Workflow CRUD (list, get, create, update, delete)
- `execution-api.ts` — Execution list, detail, cancel
- `credential-api.ts` — Credential CRUD, types, test

**5 Shared Components:**
- DataTable (columns, pagination, row click, custom renders)
- StatusBadge (success/running/failed/etc.)
- StatCard (label + value)
- EmptyState (title, description, CTA button)
- ConfirmDialog (modal with confirm/cancel)

**2 Layouts:**
- AppShell (sidebar + outlet)
- Sidebar (logo, nav links, user section, sign out)

**11+ Feature Modules** (in `src/app/features/`):
- diagram/ — ReactFlow canvas (nodes, edges, handles, listeners)
- json-form/ — JSON Forms parameter editing (controls, layouts)
- properties-bar/ — Right panel for node/edge properties
- palette/ — Left panel for dragging nodes
- app-bar/ — Top toolbar
- modals/ — Modal system (template selector, delete confirmation)
- i18n/ — Internationalization
- plugins-core/ — Plugin system with n8n node adapters
- snackbar/ — Toast notifications
- syntax-highlighter/ — Ace editor component
- credential-form-modal/ — Dynamic credential form
- changes-tracker/ — Dirty state tracking

**Auth System:**
- SessionStorage-based (key: `r360_auth`)
- `useAuth()` hook — login/logout/switchTenant
- `AuthGuard` component — redirects to `/login` if not authenticated
- Dev-mode: synthetic token + user if API unavailable

**Styling:**
- CSS Modules (71 .module.css files)
- No Tailwind — custom CSS with `@synergycodes/overflow-ui` tokens
- Global CSS layer system (`@layer reset, ext-lib, ui`)

### n8n Components — Import Feasibility Assessment

| Component | Difficulty | Dependencies | Strategy |
|-----------|-----------|-------------|----------|
| @n8n/design-system | **Easy** | None (pure Vue) | Import directly — 80+ components |
| Node Creator/Palette | **Easy** | nodeTypes store only | Import, feed our node type data |
| Individual Parameter Inputs | **Easy-Medium** | Design system + types | Import for node property editing |
| Credentials UI | **Medium** | REST client, i18n, Pinia | Import with API adapter |
| NDV (Node Detail View) | **Medium** | 3 stores, n8n-workflow | Import with mock/adapter stores |
| Canvas (Canvas.vue) | **Medium** | @vue-flow, 2 stores | Build custom, use @vue-flow directly |
| Full NodeView.vue | **Hard** | Everything | Do NOT import — too coupled |
| Execution/History | **Hard** | n8n backend | Build custom |

### Recommended Architecture

```
Vue Frontend V2 (port 4200, replaces React app)
├── @n8n/design-system — imported directly (buttons, inputs, dialogs, etc.)
├── @vue-flow/core — same library n8n uses, our own canvas wrapper
├── n8n Node Creator — imported for node palette (with adapter)
├── n8n Parameter Inputs — imported for node property editing (with adapter)
├── Custom pages — Dashboard, Workflows, Executions, Credentials, Settings
├── Custom stores (Pinia) — replacing Zustand stores
├── Custom API layer — same endpoints, fetch/axios client
└── R360 auth integration — sessionStorage + guards
```

**Key decision: Canvas approach**
- Do NOT import n8n's full Canvas.vue (too many store dependencies)
- Use `@vue-flow/core` directly (same underlying library n8n uses)
- Build our own canvas wrapper with n8n-style node rendering
- Import n8n's CanvasNode rendering components if feasible, otherwise build custom

**Key decision: Node parameter editing**
- Try importing n8n's ParameterInput components (they render node configuration forms)
- These depend on @n8n/design-system (which we're importing) and n8n-workflow types
- If too coupled, build custom using @n8n/design-system primitives + JSON schema

## Phase8.md Structure

The Phase8.md must follow the existing phase format (TDD-driven: Write Tests → Implement → Run → Fix → Refactor) and contain these major sections:

### Section 1: Overview
- Goal, prerequisites (phases 1-7 + editor-v2 experiment), Cardinal Rule, deliverables
- Key architecture: Vue 3 + Pinia + Vue Router + @vue-flow/core + @n8n/design-system
- Replaces: `workflowbuilder/apps/frontend/` (React) AND `workflowbuilder/apps/editor-v2/` (experiment)
- New location: `workflowbuilder/apps/frontend-v2/` (during development, rename to `frontend/` when complete)

### Section 2: Environment Setup
- Vue 3.5, Pinia 2.2, Vue Router 4.5, Vite 6
- @n8n/design-system via Vite aliases to n8n/packages/
- @vue-flow/core, element-plus, sass
- Dev server on port 4200 (replacing React app)

### Section 3: Steps (30-50+ subtasks)

Organized into sub-phases:

#### Sub-Phase A: Foundation (Steps 8.1-8.6)
- 8.1: Scaffold Vue app (package.json, vite.config, tsconfig, index.html, main.ts)
- 8.2: Configure Vite aliases for n8n design system imports
- 8.3: Set up Vue Router with all routes
- 8.4: Build auth system (useAuth composable, auth guard, login flow)
- 8.5: Build API client layer (generic client, workflow/execution/credential APIs)
- 8.6: Set up Pinia stores skeleton (dashboard, workflows, executions, credentials)

#### Sub-Phase B: Shared Components (Steps 8.7-8.13)
- 8.7: AppShell layout (sidebar + router-view)
- 8.8: Sidebar component (logo, nav, user section)
- 8.9: PageHeader component
- 8.10: DataTable component (columns, pagination, row click, custom renders)
- 8.11: StatusBadge component
- 8.12: StatCard, EmptyState, ConfirmDialog components
- 8.13: Toast notification system (replace notistack with element-plus or custom)

#### Sub-Phase C: Pages — Non-Editor (Steps 8.14-8.21)
- 8.14: LoginPage
- 8.15: DashboardPage (stat cards + recent tables)
- 8.16: WorkflowListPage (DataTable, search, CRUD actions)
- 8.17: ExecutionListPage (DataTable, status filter, cancel)
- 8.18: ExecutionDetailPage (metadata card, step list, JSON display)
- 8.19: CredentialsPage — Type picker
- 8.20: CredentialsPage — Dynamic form + test
- 8.21: SettingsPage

#### Sub-Phase D: Workflow Editor — Canvas (Steps 8.22-8.28)
- 8.22: Canvas foundation with @vue-flow/core (basic graph rendering)
- 8.23: Custom canvas node component (render n8n node types with icons, labels, handles)
- 8.24: Canvas edge component (animated connections with arrows)
- 8.25: Canvas controls (zoom, fit, minimap, background)
- 8.26: Node palette/creator — attempt n8n NodeCreator import, fallback to custom
- 8.27: Drag-and-drop from palette to canvas
- 8.28: Canvas context menu (delete node, duplicate, copy/paste)

#### Sub-Phase E: Workflow Editor — Node Configuration (Steps 8.29-8.34)
- 8.29: Properties panel (right sidebar, opens on node select)
- 8.30: Parameter input components — attempt n8n ParameterInput import, fallback to custom
- 8.31: Expression editor (CodeMirror or simplified)
- 8.32: Credential selector in node params (pick from tenant credentials)
- 8.33: Node settings (retry, timeout, notes)
- 8.34: Properties panel integration with canvas (select node → show properties → edit → update node)

#### Sub-Phase F: Workflow Persistence (Steps 8.35-8.39)
- 8.35: Workflow loading (GET /api/workflows/:id → parse → render on canvas)
- 8.36: Workflow saving (canvas state → serialize → PATCH /api/workflows/:id)
- 8.37: New workflow creation (POST /api/workflows)
- 8.38: Auto-save with dirty tracking
- 8.39: JSON export/import

#### Sub-Phase G: Integration & Polish (Steps 8.40-8.45)
- 8.40: Theme support (light/dark mode via n8n design system tokens)
- 8.41: Error boundaries and loading states on all pages
- 8.42: Responsive layout and sidebar collapse
- 8.43: Remove editor-v2 experiment (clean up port 4202 app)
- 8.44: Update API server CORS for new frontend
- 8.45: Update build-progress.json and Ralph Wiggum config

#### Sub-Phase H: E2E Testing (Steps 8.46-8.55)
- 8.46: E2E test framework setup (browser MCP or Playwright)
- 8.47: E2E: Login flow
- 8.48: E2E: Dashboard loads with data
- 8.49: E2E: Workflow list CRUD (create, view, toggle active, delete)
- 8.50: E2E: Workflow editor — open, add node from palette, connect nodes, save
- 8.51: E2E: Workflow editor — edit node properties, change parameters, save
- 8.52: E2E: Execution list and detail
- 8.53: E2E: Credentials CRUD and test
- 8.54: E2E: Settings page
- 8.55: E2E: Auth flow (login, guard redirect, logout)

### Section 4: Team Orchestration
Same builder/validator pattern as phases 1-7. Multiple builders can work in parallel on independent sub-phases.

### Section 5: Acceptance Criteria
Comprehensive checklist matching every feature in the current React frontend.

### Section 6: Validation Commands
Build checks, TypeScript checks, E2E test runs, visual verification.

## Ralph Wiggum Updates Required

### 1. Update `build-all-phases.md`
- Line 1: Change "all 7 phases" → "all 8 phases"
- Line 31: Add Phase 8 spec file path: `Phase 8: specs/Phase8.md`
- Line 104: Change `currentPhase > 7` → `currentPhase > 8`
- Line 111-119: Add Phase 8 to the Phase Overview list
- Phase overview entry: `- **Phase 8**: Vue frontend rewrite — replace React app with Vue 3 + n8n design system, workflow editor with @vue-flow/core, all pages and features`

### 2. Update `build-progress.json`
```json
{
  "currentPhase": 8,
  "phaseState": "planning",
  "completedPhases": [1, 2, 3, 4, 5, 6, 7],
  "lastCompletedStep": null,
  "notes": "",
  "status": "in_progress"
}
```

## Team Orchestration

### Team Members for Phase8.md Authoring

- Builder
  - Name: builder-phase8-spec
  - Role: Writes the Phase8.md spec document following exact phase format with 50+ subtasks
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-ralph-update
  - Role: Updates Ralph Wiggum config (build-all-phases.md, build-progress.json) for phase 8 support
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: validator-phase8-spec
  - Role: Verifies Phase8.md covers all React features, follows phase format, has proper task dependencies
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Write Phase8.md Spec Document
- **Task ID**: write-phase8-spec
- **Depends On**: none
- **Assigned To**: builder-phase8-spec
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 2)
- Write `specs/Phase8.md` following the exact phase format from existing phases
- Include all 55 subtasks organized into sub-phases A through H
- Each step must have: Objective, TDD Implementation (tests → implement → run → fix → refactor), Success Criteria
- Include code examples for key components (Vite config, main.ts, router, auth guard, API client)
- Include the n8n import strategy for each component (import vs build custom)
- Reference the migration checklist from this meta-plan

### 2. Update Ralph Wiggum Configuration
- **Task ID**: update-ralph-config
- **Depends On**: none
- **Assigned To**: builder-ralph-update
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 1)
- Update `.claude/ralph-prompts/build-all-phases.md` to support 8 phases
- Update `.claude/build-progress.json` to `status: "in_progress"`, `phaseState: "planning"`
- Verify Ralph loop logic will correctly pick up Phase 8

### 3. Validate Phase8.md Completeness
- **Task ID**: validate-phase8-spec
- **Depends On**: write-phase8-spec, update-ralph-config
- **Assigned To**: validator-phase8-spec
- **Agent Type**: validator
- **Parallel**: false
- Verify every React feature is covered by at least one task in Phase8.md
- Verify task dependencies form a valid DAG (no cycles, proper ordering)
- Verify each task has acceptance criteria and test commands
- Verify Ralph Wiggum config changes are correct
- Cross-reference against the React frontend inventory from this meta-plan

## Acceptance Criteria

1. `specs/Phase8.md` exists and follows the exact phase format from phases 1-7
2. Phase8.md contains 40-55+ subtasks organized into sub-phases
3. Every React frontend page has a corresponding Vue implementation task
4. Every React store has a corresponding Pinia store task
5. Every API module has a corresponding Vue API module task
6. Workflow editor tasks cover: canvas, palette, properties panel, persistence
7. E2E test tasks cover every page and feature
8. n8n import strategy is documented for each applicable component
9. Task dependencies form a valid, acyclic graph
10. `.claude/ralph-prompts/build-all-phases.md` supports 8 phases
11. `.claude/build-progress.json` is ready for Phase 8 planning
12. Running `/ralph-loop` would correctly start Phase 8 planning

## Validation Commands

```bash
# Phase8.md exists and has substantial content
test -f specs/Phase8.md && echo "PASS" || echo "FAIL"
wc -l specs/Phase8.md  # Should be 1000+ lines

# Ralph config updated
grep -q "Phase 8" .claude/ralph-prompts/build-all-phases.md && echo "PASS" || echo "FAIL"
grep -q "currentPhase.*8" .claude/build-progress.json && echo "PASS" || echo "FAIL"
grep -q "in_progress" .claude/build-progress.json && echo "PASS" || echo "FAIL"

# Phase8.md has all sub-phases
grep -c "### Step 8\." specs/Phase8.md  # Should be 40+

# Phase8.md covers all pages
for page in Login Dashboard WorkflowList WorkflowEditor ExecutionList ExecutionDetail Credentials Settings; do
  grep -q "$page" specs/Phase8.md && echo "PASS: $page" || echo "FAIL: $page"
done
```

## Notes

### Key Risks

| Risk | Mitigation |
|------|-----------|
| n8n design system import failures | Vite alias strategy proven in editor-v2 experiment; fallback to Element Plus |
| Node palette import too coupled | Build custom palette using nodeTypes store data (already proven in editor-v2) |
| NDV/parameter editing too complex to import | Build custom using @n8n/design-system primitives + JSON schema |
| Canvas complexity | Use @vue-flow/core directly (same lib n8n uses); custom node rendering (proven in editor-v2) |
| Auth session not shared | Same sessionStorage approach, same port (4200) |
| E2E test infrastructure | Browser MCP or Playwright — decide during implementation |

### What We Learned from the editor-v2 Experiment

1. **Vite aliases work** — pointing `@n8n/*` into `n8n/packages/` source tree compiles correctly
2. **@vue-flow/core works standalone** — canvas renders with custom nodes, no n8n stores needed
3. **Node types load from our API** — 483 node types served via n8n-compat facade
4. **n8n's full App.vue is too coupled** — requires 100+ transitive deps; build our own app shell
5. **Workflow serialization works** — VueFlow → n8n format → API → DB round-trip proven
6. **Port 4202 setup** — separate server works but adds friction; Vue frontend should replace React on port 4200

### Migration Strategy: Parallel Development

During development, the Vue app lives at `workflowbuilder/apps/frontend-v2/` alongside the existing React app at `workflowbuilder/apps/frontend/`. This allows:
- Side-by-side testing of equivalent features
- Gradual migration without breaking existing functionality
- Final switchover: rename `frontend/` → `frontend-react-archive/`, rename `frontend-v2/` → `frontend/`
