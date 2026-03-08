# Plan: Phase 7 — Application Shell & Core Pages

## Task Description
Build the full SaaS application shell around the existing Workflow Builder editor canvas. Currently, R360 Flow has a complete backend API (6 phases done) but the frontend is a single-page workflow editor with no routing, no navigation, and no pages beyond the canvas. This phase adds React Router, a sidebar navigation shell, and all core pages: Dashboard, Workflow List, Execution History, Execution Detail, Credential Manager, Settings, and Login.

## Objective
When Phase 7 is complete, R360 Flow is a navigable multi-page SaaS application where users can:
- Log in and see a dashboard with workflow stats and recent activity
- Browse, search, create, and delete workflows from a list view
- Open any workflow in the full visual editor (existing canvas)
- View execution history with status filters and drill into step-by-step detail
- Manage credentials (create, list, delete integration secrets)
- Access a settings page with workspace configuration
- Navigate between all pages via a persistent sidebar

## Problem Statement
The backend API supports workflows, executions, credentials, templates, admin, webhooks, billing, health monitoring, and real-time WebSocket events. But the frontend is a monolithic single-page editor component with:
- No React Router (no URL-based navigation)
- No pages or views directory
- No sidebar or top-level navigation
- No workflow list, execution history, credential management, or settings UI
- No login page (auth hooks exist but no visual login flow)

This means 90% of the backend's capabilities have zero user-facing UI.

## Solution Approach

### Architecture

```
main.tsx
  └─ RouterProvider(router)
       ├─ /login          → LoginPage
       └─ AuthGuard
            └─ AppShell (sidebar + header + outlet)
                 ├─ /                    → DashboardPage
                 ├─ /workflows           → WorkflowListPage
                 ├─ /workflows/:id/edit  → WorkflowEditorPage (existing App component)
                 ├─ /executions          → ExecutionListPage
                 ├─ /executions/:id      → ExecutionDetailPage
                 ├─ /credentials         → CredentialsPage
                 └─ /settings            → SettingsPage
```

### Key Design Decisions

1. **React Router v7** — standard routing library, already well-supported in React 19
2. **App Shell pattern** — persistent sidebar + header wrapping a `<Route>` outlet for content
3. **Editor as a route** — the existing `App` component (editor) becomes a child of `/workflows/:id/edit`, mounted/unmounted on navigation
4. **Zustand stores per domain** — new stores for workflow list, executions, credentials (separate from editor store)
5. **Extend existing API client** — new typed API modules following the `workflow-api.ts` pattern
6. **CSS Modules** — follow existing styling pattern (`.module.css` files)
7. **@synergycodes/overflow-ui** — use existing UI components (Input, Button, etc.) where available
8. **notistack** — already installed, use for toast notifications on all pages
9. **Keep editor backward-compatible** — `withIntegration` HOC still works, just mounted within a route now
10. **Route params over query params** — `/workflows/:id/edit` instead of `?workflowId=123`

### New File Structure

```
workflowbuilder/apps/frontend/src/
  main.tsx                              ← MODIFY: RouterProvider
  router.tsx                            ← NEW: route definitions
  pages/                                ← NEW: all page components
    login/
      login-page.tsx
      login-page.module.css
    dashboard/
      dashboard-page.tsx
      dashboard-page.module.css
    workflows/
      workflow-list-page.tsx
      workflow-list-page.module.css
      workflow-editor-page.tsx           ← wraps existing App component
    executions/
      execution-list-page.tsx
      execution-list-page.module.css
      execution-detail-page.tsx
      execution-detail-page.module.css
    credentials/
      credentials-page.tsx
      credentials-page.module.css
    settings/
      settings-page.tsx
      settings-page.module.css
  layouts/                               ← NEW: shared layout components
    app-shell.tsx
    app-shell.module.css
    sidebar.tsx
    sidebar.module.css
    page-header.tsx
    page-header.module.css
  api/                                   ← EXTEND
    api-client.ts                        ← KEEP (no changes)
    workflow-api.ts                      ← KEEP (no changes)
    execution-api.ts                     ← NEW
    credential-api.ts                    ← NEW
    health-api.ts                        ← NEW
  stores/                                ← NEW: page-level Zustand stores
    use-workflow-list-store.ts
    use-execution-store.ts
    use-credential-store.ts
    use-dashboard-store.ts
  components/                            ← NEW: shared page components
    status-badge.tsx
    data-table.tsx
    data-table.module.css
    empty-state.tsx
    empty-state.module.css
    confirm-dialog.tsx
    stat-card.tsx
    stat-card.module.css
  app/                                   ← KEEP (editor — no structural changes)
    app.tsx
    features/
    store/
    data/
```

## Relevant Files

### Frontend — Modify
- `workflowbuilder/apps/frontend/src/main.tsx` — Replace direct App render with RouterProvider
- `workflowbuilder/apps/frontend/package.json` — Add react-router-dom dependency
- `workflowbuilder/apps/frontend/src/app/features/integration/components/integration-variants/with-integration-through-r360-api.tsx` — Read workflowId from route params instead of query params

### Frontend — Read Only (reference patterns)
- `workflowbuilder/apps/frontend/src/app/app.tsx` — Existing editor app component (wrap as route)
- `workflowbuilder/apps/frontend/src/api/api-client.ts` — API client factory pattern to follow
- `workflowbuilder/apps/frontend/src/api/workflow-api.ts` — Typed API module pattern to follow
- `workflowbuilder/apps/frontend/src/auth/use-auth.ts` — Auth hook (useAuth) for login page and guards
- `workflowbuilder/apps/frontend/src/auth/auth-guard.tsx` — Existing AuthGuard component
- `workflowbuilder/apps/frontend/src/app/store/store.ts` — Zustand store pattern
- `workflowbuilder/apps/frontend/src/app/store/slices/palette/palette-slice.ts` — Store slice with API fetch pattern
- `workflowbuilder/apps/frontend/src/app/features/integration/components/with-integration.tsx` — Integration strategy selector
- `workflowbuilder/apps/frontend/src/app/features/modals/stores/use-modal-store.ts` — Modal store pattern
- `workflowbuilder/apps/frontend/vite.config.mts` — Build config and proxy setup

### Backend — Read Only (API contracts)
- `packages/api/src/routes/workflows.ts` — Workflow CRUD endpoints and response shapes
- `packages/api/src/routes/executions.ts` — Execution endpoints and response shapes
- `packages/api/src/routes/credentials.ts` — Credential endpoints (encrypted data never exposed)
- `packages/api/src/routes/template-routes.ts` — Template endpoints
- `packages/api/src/routes/health-routes.ts` — Health check endpoints
- `packages/api/src/realtime/ws-server.ts` — WebSocket event types for real-time execution status
- `packages/api/src/server.ts` — All registered routes and auth configuration

### New Files
- `workflowbuilder/apps/frontend/src/router.tsx`
- `workflowbuilder/apps/frontend/src/layouts/app-shell.tsx`
- `workflowbuilder/apps/frontend/src/layouts/app-shell.module.css`
- `workflowbuilder/apps/frontend/src/layouts/sidebar.tsx`
- `workflowbuilder/apps/frontend/src/layouts/sidebar.module.css`
- `workflowbuilder/apps/frontend/src/layouts/page-header.tsx`
- `workflowbuilder/apps/frontend/src/layouts/page-header.module.css`
- `workflowbuilder/apps/frontend/src/pages/login/login-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/login/login-page.module.css`
- `workflowbuilder/apps/frontend/src/pages/dashboard/dashboard-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/dashboard/dashboard-page.module.css`
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.module.css`
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/executions/execution-list-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/executions/execution-list-page.module.css`
- `workflowbuilder/apps/frontend/src/pages/executions/execution-detail-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/executions/execution-detail-page.module.css`
- `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.module.css`
- `workflowbuilder/apps/frontend/src/pages/settings/settings-page.tsx`
- `workflowbuilder/apps/frontend/src/pages/settings/settings-page.module.css`
- `workflowbuilder/apps/frontend/src/api/execution-api.ts`
- `workflowbuilder/apps/frontend/src/api/credential-api.ts`
- `workflowbuilder/apps/frontend/src/api/health-api.ts`
- `workflowbuilder/apps/frontend/src/stores/use-workflow-list-store.ts`
- `workflowbuilder/apps/frontend/src/stores/use-execution-store.ts`
- `workflowbuilder/apps/frontend/src/stores/use-credential-store.ts`
- `workflowbuilder/apps/frontend/src/stores/use-dashboard-store.ts`
- `workflowbuilder/apps/frontend/src/components/status-badge.tsx`
- `workflowbuilder/apps/frontend/src/components/data-table.tsx`
- `workflowbuilder/apps/frontend/src/components/data-table.module.css`
- `workflowbuilder/apps/frontend/src/components/empty-state.tsx`
- `workflowbuilder/apps/frontend/src/components/empty-state.module.css`
- `workflowbuilder/apps/frontend/src/components/confirm-dialog.tsx`
- `workflowbuilder/apps/frontend/src/components/stat-card.tsx`
- `workflowbuilder/apps/frontend/src/components/stat-card.module.css`

## Implementation Phases

### Phase 1: Foundation (Tasks 1-3)
Install react-router-dom, create API client modules and Zustand stores for all data domains, build the app shell layout with sidebar navigation.

### Phase 2: Core Pages (Tasks 4-9)
Build each page: Login, Dashboard, Workflow List, Editor Route Wrapper, Execution History + Detail, Credentials, Settings.

### Phase 3: Integration & Polish (Tasks 10-11)
Rebuild frontend, browser-test all pages and navigation flows, validate acceptance criteria.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members.

### Team Members

- Builder
  - Name: foundation-builder
  - Role: Install dependencies, create API client modules, Zustand stores, app shell layout, sidebar, router config, and login page
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: pages-builder
  - Role: Build all page components (dashboard, workflow list, editor wrapper, executions, credentials, settings) and shared components (data-table, status-badge, stat-card, empty-state, confirm-dialog)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: browser-verifier
  - Role: Rebuild frontend, start servers, navigate every page in browser, take screenshots, verify no errors
  - Agent Type: general-purpose
  - Resume: true

- Validator
  - Name: final-validator
  - Role: Validate all acceptance criteria via browser inspection and console checks
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Install dependencies and create API clients
- **Task ID**: install-deps-and-apis
- **Depends On**: none
- **Assigned To**: foundation-builder
- **Agent Type**: builder
- **Parallel**: false
- Install `react-router-dom` in the frontend package:
  ```bash
  cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm add -F @workflow-builder/frontend react-router-dom
  ```
- Read `workflowbuilder/apps/frontend/src/api/workflow-api.ts` to understand the typed API client pattern
- Read backend route files to understand response shapes:
  - `packages/api/src/routes/executions.ts`
  - `packages/api/src/routes/credentials.ts`
  - `packages/api/src/routes/health-routes.ts`
- Create `workflowbuilder/apps/frontend/src/api/execution-api.ts`:
  ```typescript
  // Follow the createWorkflowApi() pattern from workflow-api.ts
  // Methods:
  //   list(params: { page?, pageSize?, workflowId?, status? }) → ExecutionListResponse
  //   get(id: string) → ExecutionDetail
  //   trigger(workflowId: string) → { executionId: string }
  //
  // Types:
  //   ExecutionSummary { id, workflowId, workflowName, status, startedAt, finishedAt, duration }
  //   ExecutionStep { id, nodeName, nodeType, status, startedAt, finishedAt, inputData?, outputData?, error? }
  //   ExecutionDetail extends ExecutionSummary { steps: ExecutionStep[], triggerType, error? }
  //   ExecutionListResponse { data: ExecutionSummary[], total, page, pageSize }
  //   ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled' | 'timeout'
  ```
- Create `workflowbuilder/apps/frontend/src/api/credential-api.ts`:
  ```typescript
  // Methods:
  //   list(params: { page?, pageSize? }) → CredentialListResponse
  //   get(id: string) → CredentialSummary
  //   create(input: { name, type, data: Record<string,string> }) → CredentialSummary
  //   update(id: string, input: { name?, data? }) → CredentialSummary
  //   delete(id: string) → void
  //
  // Types:
  //   CredentialSummary { id, name, type, createdBy, createdAt, updatedAt }
  //   CredentialListResponse { data: CredentialSummary[], total, page, pageSize }
  //   NOTE: encrypted data is NEVER returned by the API — only metadata
  ```
- Create `workflowbuilder/apps/frontend/src/api/health-api.ts`:
  ```typescript
  // Methods:
  //   check() → HealthStatus
  //
  // Types:
  //   HealthStatus { status: 'ok' | 'degraded' | 'down', version?: string, uptime?: number }
  ```
- Update `workflowbuilder/apps/frontend/src/api/index.ts` to export all new API modules
- Verify TypeScript compiles: `cd workflowbuilder && npx tsc -p apps/frontend/tsconfig.json --noEmit 2>&1 | head -20`

### 2. Create Zustand stores for all page domains
- **Task ID**: create-stores
- **Depends On**: install-deps-and-apis
- **Assigned To**: foundation-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Read `workflowbuilder/apps/frontend/src/app/store/slices/palette/palette-slice.ts` for the Zustand store + API fetch pattern
- Read `workflowbuilder/apps/frontend/src/auth/use-auth.ts` for auth token access pattern
- Create `workflowbuilder/apps/frontend/src/stores/use-workflow-list-store.ts`:
  ```typescript
  // State:
  //   workflows: WorkflowSummary[]
  //   total: number
  //   page: number
  //   pageSize: number (default 20)
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   searchQuery: string
  //   sortBy: 'name' | 'updatedAt' (default 'updatedAt')
  //   sortOrder: 'asc' | 'desc' (default 'desc')
  //
  // Actions:
  //   fetchWorkflows() — calls workflowApi.list() with current page/sort/search
  //   setPage(page: number)
  //   setSearchQuery(query: string)
  //   setSortBy(field, order)
  //   deleteWorkflow(id: string) — calls workflowApi.delete(), then refreshes
  //   createWorkflow(name: string) — calls workflowApi.create(), returns new workflow
  //
  // WorkflowSummary type: { id, name, description, status, isActive, createdAt, updatedAt }
  ```
- Create `workflowbuilder/apps/frontend/src/stores/use-execution-store.ts`:
  ```typescript
  // State:
  //   executions: ExecutionSummary[]
  //   total: number
  //   page: number
  //   pageSize: number (default 20)
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   filterWorkflowId: string | null
  //   filterStatus: ExecutionStatus | null
  //   selectedExecution: ExecutionDetail | null
  //   selectedStatus: 'idle' | 'loading' | 'success' | 'error'
  //
  // Actions:
  //   fetchExecutions() — calls executionApi.list() with filters
  //   setPage(page)
  //   setFilterWorkflowId(id)
  //   setFilterStatus(status)
  //   fetchExecutionDetail(id) — calls executionApi.get()
  //   clearSelectedExecution()
  ```
- Create `workflowbuilder/apps/frontend/src/stores/use-credential-store.ts`:
  ```typescript
  // State:
  //   credentials: CredentialSummary[]
  //   total: number
  //   page: number
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //   isCreateModalOpen: boolean
  //
  // Actions:
  //   fetchCredentials()
  //   createCredential(input) — calls credentialApi.create()
  //   deleteCredential(id) — calls credentialApi.delete()
  //   setCreateModalOpen(open)
  ```
- Create `workflowbuilder/apps/frontend/src/stores/use-dashboard-store.ts`:
  ```typescript
  // State:
  //   recentWorkflows: WorkflowSummary[] (last 5)
  //   recentExecutions: ExecutionSummary[] (last 5)
  //   stats: { totalWorkflows, totalExecutions, activeCredentials, successRate }
  //   status: 'idle' | 'loading' | 'success' | 'error'
  //
  // Actions:
  //   fetchDashboardData() — parallel calls to workflows.list(page=1,pageSize=5)
  //                          + executions.list(page=1,pageSize=5) + credentials.list(page=1,pageSize=1)
  //                          then compute stats from totals/data
  ```
- Verify TypeScript compiles

### 3. Create app shell layout, sidebar, and shared components
- **Task ID**: create-shell-and-components
- **Depends On**: create-stores
- **Assigned To**: foundation-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Read `workflowbuilder/apps/frontend/src/app/app.tsx` for styling patterns (CSS modules, class naming)
- Read `workflowbuilder/apps/frontend/src/auth/use-auth.ts` for user info (name, role, tenantId)
- Read `workflowbuilder/apps/frontend/src/auth/auth-guard.tsx` for the existing guard pattern
- Create shared components first (used by multiple pages):
  - `workflowbuilder/apps/frontend/src/components/status-badge.tsx`:
    - Props: `status: string, variant?: 'success' | 'error' | 'warning' | 'info' | 'neutral'`
    - Renders a small pill/badge with colored background
    - Auto-map common statuses: 'success'/'completed' → green, 'error'/'failed' → red, 'running'/'pending' → blue, 'cancelled' → gray
  - `workflowbuilder/apps/frontend/src/components/data-table.tsx` + `.module.css`:
    - Generic table component: `DataTable<T>` with props:
      - `columns: { key: string, label: string, render?: (row: T) => ReactNode }[]`
      - `data: T[]`
      - `onRowClick?: (row: T) => void`
      - `loading?: boolean`
      - `emptyMessage?: string`
    - Renders a styled HTML table with hover rows, loading skeleton, and empty state
  - `workflowbuilder/apps/frontend/src/components/empty-state.tsx` + `.module.css`:
    - Props: `title: string, description?: string, action?: { label: string, onClick: () => void }`
    - Centered message with optional action button
  - `workflowbuilder/apps/frontend/src/components/confirm-dialog.tsx`:
    - Props: `open: boolean, title: string, message: string, onConfirm: () => void, onCancel: () => void, variant?: 'danger' | 'default'`
    - Modal with confirm/cancel buttons, red styling for danger variant
  - `workflowbuilder/apps/frontend/src/components/stat-card.tsx` + `.module.css`:
    - Props: `label: string, value: string | number, icon?: ReactNode, trend?: 'up' | 'down' | 'neutral'`
    - Card with large number, label, optional icon
- Create sidebar layout:
  - `workflowbuilder/apps/frontend/src/layouts/sidebar.tsx` + `.module.css`:
    - Fixed left sidebar, ~240px wide, collapsible to icon-only (~60px)
    - Logo at top (Workflow Builder or R360 logo)
    - Navigation links using `NavLink` from react-router-dom (active state styling):
      - Dashboard (icon: grid/home)
      - Workflows (icon: workflow/gitBranch)
      - Executions (icon: play/activity)
      - Credentials (icon: key/lock)
      - Settings (icon: gear/settings)
    - User info at bottom: name, role, logout button
    - Collapse/expand toggle button
    - Use CSS variables for colors to respect existing theme system
  - `workflowbuilder/apps/frontend/src/layouts/page-header.tsx` + `.module.css`:
    - Props: `title: string, description?: string, actions?: ReactNode`
    - Horizontal header bar with title on left, action buttons on right
    - Consistent across all pages
  - `workflowbuilder/apps/frontend/src/layouts/app-shell.tsx` + `.module.css`:
    - Layout: `<Sidebar /> + <main><Outlet /></main>`
    - Sidebar on left, content area fills remaining width
    - Content area has max-width for readability (e.g., 1400px) with auto margins
    - Padding on content area
    - Uses React Router's `<Outlet />` for child route content
- Verify TypeScript compiles

### 4. Create router configuration and modify main.tsx
- **Task ID**: create-router
- **Depends On**: create-shell-and-components
- **Assigned To**: foundation-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Create `workflowbuilder/apps/frontend/src/router.tsx`:
  ```typescript
  import { createBrowserRouter } from 'react-router-dom';
  import { AppShell } from './layouts/app-shell';
  // Import all pages (can use lazy loading)

  export const router = createBrowserRouter([
    {
      path: '/login',
      element: <LoginPage />,
    },
    {
      element: <AuthGuardLayout />,  // Wraps AuthGuard + AppShell
      children: [
        {
          element: <AppShell />,
          children: [
            { index: true, element: <DashboardPage /> },
            { path: 'workflows', element: <WorkflowListPage /> },
            { path: 'executions', element: <ExecutionListPage /> },
            { path: 'executions/:id', element: <ExecutionDetailPage /> },
            { path: 'credentials', element: <CredentialsPage /> },
            { path: 'settings', element: <SettingsPage /> },
          ],
        },
        {
          path: 'workflows/:id/edit',
          element: <WorkflowEditorPage />,  // Full-screen editor, no sidebar
        },
      ],
    },
  ]);
  ```
  - NOTE: The editor page (`/workflows/:id/edit`) is OUTSIDE the AppShell children — it renders full-screen without the sidebar (the editor has its own chrome)
  - `AuthGuardLayout` is a wrapper component that checks `useAuth().isAuthenticated` and redirects to `/login` if not
- Create placeholder page components (minimal — just a div with the page title) so the router compiles:
  - `workflowbuilder/apps/frontend/src/pages/login/login-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/dashboard/dashboard-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/executions/execution-list-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/executions/execution-detail-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.tsx` — placeholder
  - `workflowbuilder/apps/frontend/src/pages/settings/settings-page.tsx` — placeholder
- Modify `workflowbuilder/apps/frontend/src/main.tsx`:
  - Replace `<App />` rendering with `<RouterProvider router={router} />`
  - Keep StrictMode wrapper
  - Keep GTM initialization
  ```typescript
  import { RouterProvider } from 'react-router-dom';
  import { router } from './router';

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
  ```
- Verify the app builds and the router works: `cd workflowbuilder && pnpm build`

### 5. Build the login page
- **Task ID**: build-login-page
- **Depends On**: create-router
- **Assigned To**: pages-builder
- **Agent Type**: builder
- **Parallel**: false
- Read `workflowbuilder/apps/frontend/src/auth/use-auth.ts` — understand the `login()` function signature and session storage
- Build `workflowbuilder/apps/frontend/src/pages/login/login-page.tsx` + `.module.css`:
  - Centered card on a light background
  - Logo at top
  - Title: "Sign in to R360 Flow"
  - Form fields: Email (text input), Password (password input)
  - "Sign In" button (calls `useAuth().login(email, password)`)
  - Error message display below button
  - On successful login, navigate to `/` (dashboard)
  - NOTE: Current auth is a session-storage stub. The login page should work with whatever `useAuth().login()` provides. If login() doesn't exist or is a no-op, provide a "Continue as Demo User" button that sets a demo session
  - Redirect to `/` if already authenticated (check on mount)
  ```typescript
  // Pseudo-structure:
  const LoginPage = () => {
    const { isAuthenticated, login } = useAuth();
    const navigate = useNavigate();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
      if (isAuthenticated) navigate('/', { replace: true });
    }, [isAuthenticated]);

    const handleSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
        await login(email, password);
        navigate('/');
      } catch (err) {
        setError('Invalid credentials');
      } finally {
        setLoading(false);
      }
    };

    // Also provide demo login button for development:
    const handleDemoLogin = () => {
      // Set demo session directly in sessionStorage
      sessionStorage.setItem('r360_auth', JSON.stringify({
        token: 'demo-token',
        user: { id: 'demo', email: 'demo@r360.dev', name: 'Demo User', role: 'admin', tenantId: 'demo-tenant' }
      }));
      window.location.href = '/';
    };

    return (/* form JSX */);
  };
  ```

### 6. Build the dashboard page
- **Task ID**: build-dashboard
- **Depends On**: build-login-page
- **Assigned To**: pages-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Build `workflowbuilder/apps/frontend/src/pages/dashboard/dashboard-page.tsx` + `.module.css`:
  - **Page header**: "Dashboard" with subtitle "Welcome back, {userName}"
  - **Stats row** (4 StatCard components in a grid):
    - Total Workflows (from store)
    - Total Executions (from store)
    - Active Credentials (from store)
    - Success Rate (computed: successful executions / total executions * 100, show as %)
  - **Recent Workflows section**:
    - Title: "Recent Workflows" with "View All" link → `/workflows`
    - DataTable with columns: Name, Status (badge), Last Modified (relative time like "2 hours ago")
    - Row click → navigate to `/workflows/{id}/edit`
    - If empty: EmptyState with "No workflows yet" and "Create Workflow" button
  - **Recent Executions section**:
    - Title: "Recent Executions" with "View All" link → `/executions`
    - DataTable with columns: Workflow, Status (StatusBadge), Started (relative time), Duration
    - Row click → navigate to `/executions/{id}`
    - If empty: EmptyState with "No executions yet"
  - On mount: call `useDashboardStore().fetchDashboardData()`
  - Show loading skeletons while data loads
  - Handle API errors gracefully (show error state or use notistack)
  - NOTE: If API is not running (common in dev), catch errors and show a "Backend not available" message rather than crashing

### 7. Build the workflow list page
- **Task ID**: build-workflow-list
- **Depends On**: build-dashboard
- **Assigned To**: pages-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Build `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx` + `.module.css`:
  - **Page header**: "Workflows" with "New Workflow" button (primary action)
  - **Search bar**: Text input that filters by name (debounced, updates store searchQuery)
  - **Sort controls**: Dropdown or buttons for sort by Name/Last Modified, asc/desc
  - **DataTable** with columns:
    - Name (bold, clickable)
    - Description (truncated to ~60 chars)
    - Status (StatusBadge: active/archived)
    - Last Modified (formatted date)
    - Actions (Edit button → `/workflows/{id}/edit`, Delete button → confirm dialog)
  - **Pagination**: Page numbers or Previous/Next buttons, showing "Showing X-Y of Z"
  - **Row click**: Navigate to `/workflows/{id}/edit`
  - **New Workflow flow**:
    1. Click "New Workflow" → call `createWorkflow('Untitled Workflow')`
    2. On success → navigate to `/workflows/{newId}/edit`
  - **Delete flow**:
    1. Click delete icon → open ConfirmDialog ("Delete workflow '{name}'?")
    2. On confirm → call `deleteWorkflow(id)`, show success toast
  - On mount: call `useWorkflowListStore().fetchWorkflows()`
  - Handle loading and empty states

### 8. Build the workflow editor page wrapper
- **Task ID**: build-editor-wrapper
- **Depends On**: build-workflow-list
- **Assigned To**: pages-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Read these files first:
  - `workflowbuilder/apps/frontend/src/app/app.tsx` — the existing editor component
  - `workflowbuilder/apps/frontend/src/app/features/integration/components/with-integration.tsx` — integration strategy selector
  - `workflowbuilder/apps/frontend/src/app/features/integration/components/integration-variants/with-integration-through-r360-api.tsx` — current R360 API integration
- Build `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.tsx`:
  - This page renders the existing editor `App` component full-screen (no sidebar)
  - Gets `id` from `useParams()` (react-router)
  - Provides the workflow ID to the integration layer
  - Has a "Back to Workflows" link/button in the top-left corner (or uses the existing app bar)
  - **Integration approach** — two options (choose the simpler one):
    - **Option A (minimal changes)**: Set a URL query param `?workflowId={id}` before rendering App, since the R360_API integration already reads from query params. Then render the existing `App` component.
    - **Option B (cleaner)**: Modify `with-integration-through-r360-api.tsx` to accept workflowId from a React context or prop, falling back to query params. Create a context provider in the editor page.
  - **Recommended: Option A** — minimal changes to existing editor code:
    ```typescript
    const WorkflowEditorPage = () => {
      const { id } = useParams<{ id: string }>();
      const navigate = useNavigate();

      // Set query param for backward compat with integration layer
      useEffect(() => {
        const url = new URL(window.location.href);
        if (id) url.searchParams.set('workflowId', id);
        window.history.replaceState({}, '', url.toString());
      }, [id]);

      return (
        <div style={{ width: '100vw', height: '100vh' }}>
          <App />
        </div>
      );
    };
    ```
  - Also add a floating "Back" button or modify the existing app-bar to include a back navigation to `/workflows`
  - Ensure the `VITE_INTEGRATION_STRATEGY` is set to `R360_API` (or that the editor page forces this strategy)
  - **IMPORTANT**: The App component currently uses `withIntegration()` which reads `VITE_INTEGRATION_STRATEGY`. For the editor route to work with the API, ensure `.env.development` has `VITE_INTEGRATION_STRATEGY=R360_API`. If it's `LOCAL_STORAGE`, the editor will still work but won't connect to the API.
- Test by navigating to `/workflows/test-id/edit` — editor should load

### 9. Build execution list and detail pages
- **Task ID**: build-execution-pages
- **Depends On**: build-editor-wrapper
- **Assigned To**: pages-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Build `workflowbuilder/apps/frontend/src/pages/executions/execution-list-page.tsx` + `.module.css`:
  - **Page header**: "Executions" with optional "Run Workflow" dropdown
  - **Filter bar**:
    - Status filter: Select dropdown with options: All, Pending, Running, Success, Error, Cancelled, Timeout
    - Workflow filter: Select dropdown populated from workflow list (or text search)
  - **DataTable** with columns:
    - Execution ID (truncated, monospace font)
    - Workflow Name (linked to editor)
    - Status (StatusBadge with color coding)
    - Started At (formatted datetime)
    - Duration (human-readable: "2.3s", "1m 45s", "—" if still running)
    - Trigger Type (manual, webhook, schedule — if available)
  - **Pagination**: Same pattern as workflow list
  - **Row click**: Navigate to `/executions/{id}`
  - **Auto-refresh toggle**: Optional checkbox "Auto-refresh every 5s" — when enabled, re-fetches execution list on interval (useful for monitoring running executions)
  - On mount: call `useExecutionStore().fetchExecutions()`
- Build `workflowbuilder/apps/frontend/src/pages/executions/execution-detail-page.tsx` + `.module.css`:
  - **Page header**: "Execution {id}" with StatusBadge, "Back to Executions" link
  - **Summary section**:
    - Workflow name (linked to editor)
    - Status badge (large)
    - Started at / Finished at / Duration
    - Trigger type
    - Error message (if status === 'error', show in a red banner)
  - **Steps section**:
    - Title: "Execution Steps"
    - Ordered list of steps, each showing:
      - Step number
      - Node name + node type
      - Status badge
      - Duration
      - Expandable section showing input/output data as formatted JSON (use `<pre>` or the existing syntax-highlighter)
      - If step has error, show error message in red
    - Visual timeline: each step as a horizontal bar showing relative timing
  - **Re-run button**: "Re-run Workflow" → calls `executionApi.trigger(workflowId)`, navigates to new execution detail
  - On mount: call `useExecutionStore().fetchExecutionDetail(id)` using `id` from `useParams()`
  - Handle loading state with skeleton
  - Handle "not found" case (invalid execution ID)

### 10. Build credentials and settings pages
- **Task ID**: build-credentials-settings
- **Depends On**: build-execution-pages
- **Assigned To**: pages-builder (resume)
- **Agent Type**: builder
- **Parallel**: false
- Build `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.tsx` + `.module.css`:
  - **Page header**: "Credentials" with "Add Credential" button
  - **DataTable** with columns:
    - Name
    - Type (e.g., "slack", "github", "httpBasicAuth")
    - Created By
    - Created At (formatted date)
    - Actions: Delete button
  - **Add Credential modal/dialog** (uses ConfirmDialog pattern or a custom form modal):
    - Fields: Name (text), Type (select or text), Credential Data (key-value pairs)
    - For Type: provide common options (API Key, OAuth2, Basic Auth, Custom) or free-text
    - For Credential Data: dynamic key-value pair inputs (add/remove rows)
      - Each row: Key (text input) + Value (password input) + Remove button
      - "Add Field" button to add new row
    - Submit → calls `credentialStore.createCredential()`
    - Show success toast on creation
  - **Delete flow**: ConfirmDialog → "Are you sure? This credential may be used by active workflows."
  - On mount: call `useCredentialStore().fetchCredentials()`
  - Empty state: "No credentials configured. Add credentials to connect your workflows to external services."
- Build `workflowbuilder/apps/frontend/src/pages/settings/settings-page.tsx` + `.module.css`:
  - **Page header**: "Settings"
  - **Sections** (each in a card/panel):
    - **General**:
      - Workspace name (read-only for now)
      - Tenant ID (read-only, shown as monospace)
      - User role (read-only)
    - **API**:
      - API Base URL (read-only, shows the configured API URL)
      - Integration Strategy (read-only, shows current VITE_INTEGRATION_STRATEGY)
    - **System**:
      - API Health status (calls healthApi.check() on mount, shows green/red indicator)
      - Frontend version (from package.json or build env)
    - **Danger Zone** (red border):
      - "Log Out" button → calls `useAuth().logout()`, navigates to `/login`
  - This is a v1 settings page — minimal but functional

### 11. Rebuild and browser-verify all pages
- **Task ID**: rebuild-and-verify
- **Depends On**: build-credentials-settings
- **Assigned To**: browser-verifier
- **Agent Type**: general-purpose
- **Parallel**: false
- Kill existing processes on ports 3100 and 4200
- Build backend: `cd /Users/preston/Documents/Claude/R360-Flow && pnpm --filter @r360/types build && pnpm --filter @r360/db build && pnpm --filter @r360/json-translator build && pnpm --filter @r360/execution-engine build && pnpm --filter @r360/api build`
- Build frontend: `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm build`
  - If build fails, report exact errors and fix
- Start API server: `cd /Users/preston/Documents/Claude/R360-Flow && node packages/api/dist/server.js &`
- Start frontend dev server: `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm dev &`
- Wait for both servers to be ready
- **Browser Verification Checklist** (use browsermcp tools — navigate, screenshot, snapshot, click):
  1. Navigate to `http://localhost:4200/` — should redirect to login (or show dashboard if demo session)
  2. Login page: verify form renders, click "Demo Login", verify redirect to dashboard
  3. Dashboard: verify stats cards render, recent workflows table, recent executions table
  4. Sidebar: verify all nav links present (Dashboard, Workflows, Executions, Credentials, Settings)
  5. Click "Workflows" in sidebar → workflow list page loads, table renders
  6. Click "New Workflow" → creates workflow, navigates to editor
  7. Editor: verify canvas loads, palette works, properties panel works (no regression from Phase 6)
  8. Navigate back to workflows list (back button or sidebar)
  9. Click "Executions" in sidebar → execution list page loads
  10. Click "Credentials" in sidebar → credentials page loads
  11. Click "Settings" in sidebar → settings page loads, health status shown
  12. Check browser console for errors — no critical errors, no React key warnings, no routing errors
  13. Take screenshots of each page for documentation
- Fix any issues found during verification

### 12. Final validation
- **Task ID**: validate-all
- **Depends On**: rebuild-and-verify
- **Assigned To**: final-validator
- **Agent Type**: validator
- **Parallel**: false
- Run all validation commands
- Browser verification of all acceptance criteria:
  - Navigate to each page and verify rendering
  - Verify sidebar navigation active states
  - Verify data loads from API (or shows graceful error if API unavailable)
  - Verify no "white screen of death" on any route
  - Verify login/logout flow works
  - Verify editor still functions correctly as a route
  - Check console for errors
- Confirm: all 7 pages render, navigation works, no regressions

## Acceptance Criteria

### Routing & Navigation
- [ ] React Router v7 installed and configured with all routes
- [ ] Browser URL changes when navigating between pages
- [ ] Direct URL access works (e.g., navigating directly to `/workflows` loads the page)
- [ ] Sidebar navigation shows active state for current page
- [ ] Back/forward browser buttons work correctly

### App Shell
- [ ] Sidebar renders on all pages except login and editor
- [ ] Sidebar shows navigation links: Dashboard, Workflows, Executions, Credentials, Settings
- [ ] Sidebar shows user info (name/email) and logout button
- [ ] Sidebar collapse/expand toggle works
- [ ] Content area uses available width

### Login
- [ ] Login page renders at `/login`
- [ ] Demo login button sets session and redirects to dashboard
- [ ] Unauthenticated users are redirected to `/login`
- [ ] Authenticated users are redirected away from `/login`

### Dashboard (`/`)
- [ ] Shows stat cards: Total Workflows, Total Executions, Active Credentials, Success Rate
- [ ] Shows recent workflows table (last 5) with links
- [ ] Shows recent executions table (last 5) with status badges
- [ ] Gracefully handles API errors (shows message, doesn't crash)

### Workflow List (`/workflows`)
- [ ] Table shows all workflows with name, description, status, last modified
- [ ] Search filters workflows by name
- [ ] "New Workflow" button creates a workflow and navigates to editor
- [ ] Row click navigates to editor (`/workflows/{id}/edit`)
- [ ] Delete button shows confirmation dialog, then deletes
- [ ] Pagination works

### Workflow Editor (`/workflows/:id/edit`)
- [ ] Existing editor canvas loads correctly (no regression)
- [ ] Node palette loads from API
- [ ] Properties panel works for n8n nodes
- [ ] Saving works
- [ ] Navigation back to workflow list is available

### Execution List (`/executions`)
- [ ] Table shows executions with workflow name, status, started at, duration
- [ ] Status filter dropdown works
- [ ] Row click navigates to execution detail
- [ ] Pagination works

### Execution Detail (`/executions/:id`)
- [ ] Shows execution summary (status, timing, workflow name)
- [ ] Shows step-by-step list with expandable input/output
- [ ] Error messages displayed for failed executions/steps
- [ ] Back link returns to execution list

### Credentials (`/credentials`)
- [ ] Table shows credentials with name, type, created date
- [ ] "Add Credential" opens form dialog
- [ ] Can create a new credential with name, type, and key-value data
- [ ] Delete button with confirmation dialog works
- [ ] Encrypted data is never displayed

### Settings (`/settings`)
- [ ] Shows workspace information (tenant ID, user role)
- [ ] Shows API configuration
- [ ] Shows health status indicator
- [ ] Logout button works

### General
- [ ] No white screens or unhandled errors on any page
- [ ] Console has no critical errors
- [ ] Frontend builds without new TypeScript errors
- [ ] All pages show loading states while data fetches
- [ ] All pages show empty states when no data

## Validation Commands
```bash
# Frontend builds
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm build

# Both servers running
lsof -i:3100 | head -2
lsof -i:4200 | head -2

# API returns nodes (confirms API is healthy)
curl -s http://localhost:3100/api/nodes | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Nodes: {d[\"total\"]}')"

# API returns workflows list
curl -s http://localhost:3100/api/workflows | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2)[:500])"

# API returns executions list
curl -s http://localhost:3100/api/executions | python3 -c "import sys,json; print(json.dumps(json.load(sys.stdin), indent=2)[:500])"

# React Router installed
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && cat apps/frontend/package.json | python3 -c "import sys,json; d=json.load(sys.stdin); print('react-router-dom:', d.get('dependencies',{}).get('react-router-dom', 'NOT FOUND'))"

# TypeScript check (no new errors)
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && npx tsc -p apps/frontend/tsconfig.json --noEmit 2>&1 | tail -5

# Browser: navigate to each route and verify rendering
# http://localhost:4200/login
# http://localhost:4200/
# http://localhost:4200/workflows
# http://localhost:4200/workflows/{id}/edit
# http://localhost:4200/executions
# http://localhost:4200/executions/{id}
# http://localhost:4200/credentials
# http://localhost:4200/settings
```

## Notes

### What We're NOT Doing in Phase 7
- **Not building real authentication** — using session-storage stub + demo login for now. Real auth (Clerk/Auth0) is a separate phase.
- **Not building a template marketplace** — the existing template selector modal is sufficient for now.
- **Not building real-time WebSocket UI** — the execution detail page uses polling, not WebSocket subscriptions. Real-time updates are a future enhancement.
- **Not building admin pages** — admin/tenant management requires a separate admin portal or admin role gating.
- **Not building billing UI** — Stripe integration is backend-only for now.
- **Not building audit log viewer** — audit logging is backend-only for now.
- **Not adding Tailwind or a new UI framework** — using existing CSS modules and @synergycodes/overflow-ui components.
- **Not building mobile responsive layout** — desktop-first for this phase.

### Key Technical Risks
1. **Editor as a route** — The existing App component was designed as the entire application, not a child route. It may have global side effects (e.g., `setAutoFreeze(false)`, GTM init) that conflict with routing. Watch for issues when mounting/unmounting the editor.
2. **Store conflicts** — The existing editor store is global. When navigating away from the editor and back, ensure store state is properly reset or preserved.
3. **Vite proxy** — The dev server proxy for `/api` must continue working with the router. React Router's `BrowserRouter` may need the Vite config to add `historyApiFallback` (Vite does this by default for SPA).
4. **Integration strategy** — The `VITE_INTEGRATION_STRATEGY` env var controls editor behavior. For the new multi-page app, `R360_API` is the right strategy. But `LOCAL_STORAGE` (current default) will also work for the editor — it just won't persist to the API.

### Environment Configuration
For the new multi-page app to work with the API, update `.env.development`:
```
VITE_API_BASE_URL=http://localhost:3100/api
VITE_AUTH_PROVIDER=session
VITE_INTEGRATION_STRATEGY=R360_API
```

### CSS Architecture
All new pages and components use CSS Modules (`.module.css`) following the existing codebase pattern. Colors should use CSS custom properties defined in the theme system to support light/dark mode. Reference existing CSS files in `workflowbuilder/apps/frontend/src/` for naming conventions and variable usage.
