# Phase 7 Execution Plan: Application Shell & Core Pages

## Summary

Phase 7 transforms the R360 Flow frontend from a single-page workflow editor into a full SaaS application with React Router, persistent sidebar navigation, and all core pages (Dashboard, Workflow List, Editor, Execution History, Execution Detail, Credentials, Settings, Login).

## Prerequisites

- Phases 1-6 complete (backend API, execution engine, DB, JSON translator all production-ready)
- Existing frontend: React 19, Zustand, Vite, CSS Modules, API client pattern, Auth hooks
- Backend API at `http://localhost:3100/api` with all CRUD endpoints

## Implementation Tasks

### Task 1: Install Dependencies
- **Description**: Add react-router-dom v7 to the frontend package
- **Files**: `workflowbuilder/apps/frontend/package.json`
- **Commands**: `cd workflowbuilder && pnpm add react-router-dom@7 --filter frontend`
- **Dependencies**: None
- **Size**: Small
- **Acceptance Criteria**:
  - react-router-dom v7 in package.json dependencies
  - pnpm install succeeds without errors

### Task 2: Create API Client Modules
- **Description**: Create typed API modules for executions, credentials, and health following the existing `workflow-api.ts` pattern
- **Files**:
  - `workflowbuilder/apps/frontend/src/api/execution-api.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/api/credential-api.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/api/health-api.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/api/index.ts` (MODIFY - add exports)
- **Dependencies**: None
- **Size**: Medium
- **Acceptance Criteria**:
  - execution-api.ts exports `createExecutionApi(client)` with: list(page, pageSize, filters?), get(id), cancel(id)
  - credential-api.ts exports `createCredentialApi(client)` with: list(), create(input), delete(id)
  - health-api.ts exports `createHealthApi(client)` with: check()
  - All follow ApiClient pattern from workflow-api.ts
  - All types defined inline (ExecutionSummary, ExecutionDetail, CredentialSummary, etc.)
  - index.ts re-exports all API modules

### Task 3: Create Zustand Stores
- **Description**: Create page-level Zustand stores for workflow list, executions, credentials, and dashboard data
- **Files**:
  - `workflowbuilder/apps/frontend/src/stores/use-workflow-list-store.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/stores/use-execution-store.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/stores/use-credential-store.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/stores/use-dashboard-store.ts` (NEW)
  - `workflowbuilder/apps/frontend/src/stores/index.ts` (NEW)
- **Dependencies**: Task 2 (uses API client types)
- **Size**: Medium
- **Acceptance Criteria**:
  - Each store uses `create` from zustand
  - Stores manage loading, error, and data states
  - Stores have fetch actions that call the API clients
  - use-workflow-list-store: workflows[], loading, error, fetchWorkflows(), deleteWorkflow(id)
  - use-execution-store: executions[], selectedExecution, loading, error, fetchExecutions(), fetchExecution(id), cancelExecution(id)
  - use-credential-store: credentials[], loading, error, fetchCredentials(), createCredential(input), deleteCredential(id)
  - use-dashboard-store: stats, recentWorkflows, recentExecutions, loading, fetchDashboard()

### Task 4: Create Shared UI Components
- **Description**: Build reusable UI components used across multiple pages
- **Files**:
  - `workflowbuilder/apps/frontend/src/components/status-badge.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/components/data-table.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/components/empty-state.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/components/confirm-dialog.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/components/stat-card.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/components/index.ts` (NEW)
- **Dependencies**: None
- **Size**: Medium
- **Acceptance Criteria**:
  - StatusBadge: renders colored badge based on status string (success/running/failed/waiting/cancelled)
  - DataTable: generic table component with columns config, row data, optional pagination, optional onRowClick
  - EmptyState: icon + title + description + optional action button
  - ConfirmDialog: modal overlay with title, message, confirm/cancel buttons, onConfirm callback
  - StatCard: label + value + optional trend indicator
  - All use CSS Modules pattern
  - All exported from index.ts

### Task 5: Create App Shell Layout
- **Description**: Build the persistent app shell with sidebar navigation and page header
- **Files**:
  - `workflowbuilder/apps/frontend/src/layouts/app-shell.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/layouts/sidebar.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/layouts/page-header.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/layouts/index.ts` (NEW)
- **Dependencies**: None
- **Size**: Medium
- **Acceptance Criteria**:
  - AppShell: renders Sidebar + PageHeader + `<Outlet />` from react-router-dom
  - Sidebar: vertical nav with links to Dashboard, Workflows, Executions, Credentials, Settings
  - Sidebar: highlights active route using useLocation()
  - Sidebar: includes app logo/name at top, user menu at bottom
  - PageHeader: accepts title and optional action buttons as props
  - All use CSS Modules
  - Responsive layout (sidebar collapsible on small screens)
  - Exported from index.ts

### Task 6: Build Login Page
- **Description**: Create a login page that uses the existing useAuth() hook
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/login/login-page.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/pages/login/index.ts` (NEW)
- **Dependencies**: None
- **Size**: Small
- **Acceptance Criteria**:
  - Renders login form with email/password fields (or SSO button placeholder)
  - Uses useAuth() hook for login() call
  - Shows loading state during authentication
  - Redirects to dashboard on successful login
  - Shows error message on failed login
  - Uses CSS Modules

### Task 7: Build Dashboard Page
- **Description**: Create the main dashboard with workflow stats and recent activity
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/dashboard/dashboard-page.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/pages/dashboard/index.ts` (NEW)
- **Dependencies**: Task 3 (dashboard store), Task 4 (StatCard, DataTable)
- **Size**: Medium
- **Acceptance Criteria**:
  - Shows stat cards: total workflows, active workflows, total executions, success rate
  - Shows recent workflows table (name, status, last updated)
  - Shows recent executions table (workflow name, status, started, duration)
  - Uses useDashboardStore for data fetching
  - Calls fetchDashboard() on mount
  - Shows loading skeleton while fetching
  - Uses StatCard and DataTable components
  - Navigate to workflow/execution on row click

### Task 8: Build Workflow List Page
- **Description**: Create the workflow list page with search, create, and delete capabilities
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/pages/workflows/index.ts` (NEW)
- **Dependencies**: Task 3 (workflow list store), Task 4 (DataTable, EmptyState, ConfirmDialog)
- **Size**: Medium
- **Acceptance Criteria**:
  - Lists workflows in a DataTable (name, active status, created, updated)
  - Search/filter input above table
  - "New Workflow" button in page header
  - Click row navigates to `/workflows/:id/edit`
  - Delete button per row with ConfirmDialog
  - Toggle active status per row
  - Empty state when no workflows
  - Pagination controls
  - Uses useWorkflowListStore

### Task 9: Build Workflow Editor Page
- **Description**: Wrap the existing App component in a route-aware page that loads workflow by ID
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.tsx` + `.module.css` (NEW)
- **Dependencies**: Task 5 (app shell provides context)
- **Size**: Small
- **Acceptance Criteria**:
  - Uses `useParams()` to get workflow ID from route
  - Loads workflow data and passes to existing App/editor
  - Shows loading state while fetching
  - Shows error state if workflow not found
  - Editor fills available space (no double sidebar)
  - Back button to return to workflow list

### Task 10: Build Execution List Page
- **Description**: Create the execution history page with status filters
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/executions/execution-list-page.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/pages/executions/index.ts` (NEW)
- **Dependencies**: Task 3 (execution store), Task 4 (DataTable, StatusBadge, EmptyState)
- **Size**: Medium
- **Acceptance Criteria**:
  - Lists executions in DataTable (workflow name, status, started, finished, duration)
  - Status filter dropdown (all, running, success, failed, cancelled)
  - StatusBadge for each execution status
  - Click row navigates to `/executions/:id`
  - Cancel button for running executions
  - Empty state when no executions
  - Pagination
  - Uses useExecutionStore

### Task 11: Build Execution Detail Page
- **Description**: Create the execution detail view with step-by-step progress
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/executions/execution-detail-page.tsx` + `.module.css` (NEW)
- **Dependencies**: Task 3 (execution store), Task 4 (StatusBadge)
- **Size**: Medium
- **Acceptance Criteria**:
  - Uses `useParams()` to get execution ID
  - Shows execution metadata (workflow name, status, started, finished, duration)
  - Shows step-by-step list with node name, status, input/output data
  - Expandable step details showing JSON input/output
  - StatusBadge for overall and per-step status
  - Cancel button if running
  - Back button to execution list
  - Error details section if failed

### Task 12: Build Credentials Page
- **Description**: Create the credentials management page
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/pages/credentials/index.ts` (NEW)
- **Dependencies**: Task 3 (credential store), Task 4 (DataTable, EmptyState, ConfirmDialog)
- **Size**: Medium
- **Acceptance Criteria**:
  - Lists credentials in DataTable (name, type, created, last used)
  - "Add Credential" button opens a create form/modal
  - Create form: name, type dropdown, JSON data field
  - Delete button per row with ConfirmDialog
  - Empty state when no credentials
  - Credential values are never displayed (show masked)
  - Uses useCredentialStore

### Task 13: Build Settings Page
- **Description**: Create the workspace settings page
- **Files**:
  - `workflowbuilder/apps/frontend/src/pages/settings/settings-page.tsx` + `.module.css` (NEW)
  - `workflowbuilder/apps/frontend/src/pages/settings/index.ts` (NEW)
- **Dependencies**: None
- **Size**: Small
- **Acceptance Criteria**:
  - Shows workspace name and tenant ID
  - API endpoint configuration display
  - Theme/appearance toggle placeholder
  - Account section with user info from useAuth()
  - Logout button
  - Billing section placeholder (link to billing portal)

### Task 14: Create Router and Update Entry Point
- **Description**: Create React Router configuration and update main.tsx to use it
- **Files**:
  - `workflowbuilder/apps/frontend/src/router.tsx` (NEW)
  - `workflowbuilder/apps/frontend/src/main.tsx` (MODIFY)
- **Dependencies**: Tasks 5-13 (all pages and layouts must exist)
- **Size**: Medium
- **Acceptance Criteria**:
  - router.tsx creates browser router with route tree:
    - `/login` -> LoginPage
    - AuthGuard wrapper:
      - AppShell layout:
        - `/` -> DashboardPage
        - `/workflows` -> WorkflowListPage
        - `/workflows/:id/edit` -> WorkflowEditorPage
        - `/executions` -> ExecutionListPage
        - `/executions/:id` -> ExecutionDetailPage
        - `/credentials` -> CredentialsPage
        - `/settings` -> SettingsPage
  - main.tsx renders `<RouterProvider router={router} />` instead of `<App />`
  - Lazy loading for all page components
  - 404 catch-all route

### Task 15: Build and Verify
- **Description**: Run the Vite build to verify everything compiles, fix any TypeScript/import errors
- **Files**: Any files needing fixes
- **Dependencies**: Task 14
- **Size**: Medium
- **Acceptance Criteria**:
  - `cd workflowbuilder && pnpm build` succeeds with zero errors
  - `cd workflowbuilder && pnpm typecheck` succeeds
  - No import resolution failures
  - No TypeScript type errors

## Risk Areas

1. **Editor Integration**: Wrapping the existing App component in a route may cause layout issues (double headers, sidebar conflicts). Mitigation: WorkflowEditorPage should hide the app shell sidebar and render the editor full-width.
2. **CSS Conflicts**: New global styles could conflict with editor styles. Mitigation: Use CSS Modules exclusively, avoid global selectors.
3. **Auth Flow**: The existing useAuth() hook uses sessionStorage. Routing to /login on token expiry needs careful handling. Mitigation: AuthGuard handles redirect.
4. **Bundle Size**: Adding 8 new pages will increase bundle. Mitigation: Use React.lazy() for all page components.

## Testing & Validation

- TypeScript compilation via `pnpm typecheck`
- Vite build via `pnpm build`
- Visual verification via `pnpm dev` and browser navigation
- Route navigation works for all 8 routes
- Sidebar highlights correct active route
- Auth guard redirects unauthenticated users to /login
