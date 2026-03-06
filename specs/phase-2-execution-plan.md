# Phase 2 Execution Plan: Connect Workflow Builder UI to API + JSON Translation

## Summary

Phase 2 connects the Workflow Builder frontend to the R360 Flow API and builds the bidirectional JSON translation layer (DiagramModel <-> n8n WorkflowParameters). It delivers: @r360/json-translator package, API client module, auth infrastructure, workflow persistence, R360 API integration variant, and workflow list dashboard.

**Cardinal Rule:** Zero n8n package imports in Phase 2. The JSON translator defines n8n-compatible types locally. Actual n8n package imports happen in Phase 3.

**Prerequisites:** Phase 1 complete -- API server running with tenant middleware, PostgreSQL schema (tenants, users, workflows, credentials, executions, execution_steps, webhooks tables), auth provider integrated, workflow CRUD endpoints functional.

**Duration Estimate:** 1-2 weeks (Weeks 3-4)

**Key Deliverables:**
- Bidirectional JSON translator (`packages/json-translator/`): `DiagramModel <-> WorkflowParameters`
- API client module with auth headers, retry logic, and tenant context
- Auth UI integration: login/signup, protected routes, tenant switching
- API-backed workflow persistence replacing local JSON import/export
- Workflow list dashboard with create, open, rename, delete
- Round-trip fidelity test suite with snapshot fixtures
- Phase 2 integration tests covering save/load/translate end-to-end

---

## Task Dependency Graph

```
Group A (translator): Tasks 1 -> (2, 3, 4 parallel) -> 5 -> 6
Group B (frontend foundation): Tasks 7, 8, 13 (parallel)
Group C (frontend features): Tasks 9, 10, 12 (after B)
Group D (wiring): Task 11 (after B + C)
Group E (validation): Task 14 (after all)
```

```
Task 1 (JSON Translator Scaffold) ──────────────────────────────────────────────┐
         │                                                                       │
         ├──────────────────┬──────────────────┐                                 │
         ▼                  ▼                  ▼                                 │
    Task 2              Task 3            Task 4                                │
 (Node Mapping)   (Connection Mapping) (Parameter Mapping)                      │
         │                  │                  │                                 │
         └──────────────────┼──────────────────┘                                │
                            ▼                                                   │
                       Task 5                                                   │
                  (Reverse Mapping)                                             │
                            │                                                   │
                            ▼                                                   │
                       Task 6                                                   │
               (Entry Point + Round-Trip Tests)                                 │
                                                                                │
Task 7 (API Client) ─────────────────────────┐                                 │
                                              │                                 │
Task 8 (Auth Types & Hook) ──────────────────┤                                 │
         │                                    │                                 │
         ▼                                    │                                 │
    Task 9 (Auth Guard)                       │                                 │
                                              │                                 │
Task 13 (Env Config) ────────────────────────┤                                 │
                                              │                                 │
         ┌────────────────────────────────────┘                                 │
         │                                                                       │
         ├──────────────────┐                                                   │
         ▼                  ▼                                                   │
    Task 10            Task 12                                                  │
(Workflow Persistence) (Workflow List Dashboard)                                │
         │                  │                                                   │
         └────────┬─────────┘                                                   │
                  ▼                                                             │
             Task 11                                                            │
   (R360 API Integration Variant)                                               │
                  │                                                             │
                  └──────────────────────────────────────────────────────────────┘
                                              │
                                              ▼
                                         Task 14
                                  (Phase 2 Integration Tests)
```

---

## Tasks

### Task 1: JSON Translator Package Scaffold

**Description:** Initialize the `packages/json-translator` package with project configuration, TypeScript types mirroring n8n's `INodeParameters`, `IConnections`, `INode`, and `WorkflowParameters` interfaces (defined locally -- zero n8n imports), and Workflow Builder's `DiagramModel` types re-exported for convenience.

**Files to create:**
- `packages/json-translator/package.json`
- `packages/json-translator/tsconfig.json`
- `packages/json-translator/vitest.config.ts`
- `packages/json-translator/src/types.ts` -- local mirrors of n8n interfaces (`INode`, `INodeParameters`, `IConnections`, `IConnectionDetails`, `WorkflowParameters`)
- `packages/json-translator/src/wb-types.ts` -- Workflow Builder diagram types (`DiagramModel`, `WBNode`, `WBEdge`, `WBNodeData`)

**Dependencies:** None
**Size:** Small

**Acceptance Criteria:**
- `pnpm --filter @r360/json-translator build` succeeds
- `pnpm --filter @r360/json-translator typecheck` passes
- All n8n-compatible types are defined locally with no n8n package imports
- WB types match the Workflow Builder SDK's `DiagramModel` structure
- Package exports both type modules from `src/index.ts`

---

### Task 2: Node Mapping (WB -> n8n)

**Description:** Implement the forward mapping from Workflow Builder node objects (`WBNode`) to n8n node objects (`INode`). Handles node type resolution (WB palette type name -> n8n node type identifier), position mapping (React Flow coordinates -> n8n canvas coordinates), parameter extraction, and node metadata (name, disabled state, notes, retry settings).

**Files to create:**
- `packages/json-translator/src/node-mapping.ts`
- `packages/json-translator/src/__tests__/node-mapping.test.ts`

**Dependencies:** Task 1
**Size:** Medium

**Acceptance Criteria:**
- `mapWBNodeToN8nNode(wbNode)` returns a valid n8n `INode` object
- `mapWBNodesToN8nNodes(wbNodes)` returns an array of n8n nodes
- Node type mapping covers: Manual Trigger, Webhook, HTTP Request, Code, IF, Switch, Set, Merge, Function, NoOp
- Position coordinates are correctly translated
- Parameters are passed through with proper structure
- Disabled/notes/retry metadata is preserved
- All tests pass with `pnpm --filter @r360/json-translator test`

---

### Task 3: Connection Mapping (WB Edges -> n8n IConnections)

**Description:** Implement the forward mapping from Workflow Builder edges (`WBEdge[]`) to n8n's `IConnections` object. n8n's connection format is a nested dictionary: `{ [sourceNodeName]: { [connectionType]: [Array<Array<IConnectionDetails>>] } }`. This task handles the structural transformation, including multi-output nodes (IF/Switch branches), connection types (main, auxiliary), and edge ordering.

**Files to create:**
- `packages/json-translator/src/connection-mapping.ts`
- `packages/json-translator/src/__tests__/connection-mapping.test.ts`

**Dependencies:** Task 1
**Size:** Medium

**Acceptance Criteria:**
- `mapWBEdgesToN8nConnections(edges, nodeNameMap)` returns a valid n8n `IConnections` object
- Linear chains (A -> B -> C) produce correct nested structure
- Branching nodes (IF with true/false outputs) map to correct output indices
- Multi-input nodes receive connections at correct input indices
- Parallel branches converging to a Merge node are handled
- Empty edge arrays produce empty connections object
- All tests pass

---

### Task 4: Parameter Mapping

**Description:** Implement parameter extraction and transformation between Workflow Builder node configuration panels and n8n's `INodeParameters` format. Handles type coercion (string to number for numeric fields), expression detection (values containing `{{ }}` wrapped in n8n expression syntax `={{ }}`), credential references, and nested parameter structures (e.g., HTTP Request's `options.headers`).

**Files to create:**
- `packages/json-translator/src/parameter-mapping.ts`
- `packages/json-translator/src/__tests__/parameter-mapping.test.ts`

**Dependencies:** Task 1
**Size:** Small

**Acceptance Criteria:**
- `mapWBParamsToN8nParams(wbParams, nodeType)` returns valid `INodeParameters`
- String-to-number coercion works for known numeric fields
- Expression syntax is correctly wrapped (`{{ variable }}` -> `={{ variable }}`)
- Credential references are extracted and structured
- Nested parameter objects (options, headers, query params) are flattened/structured correctly
- Undefined/null parameters are omitted from output
- All tests pass

---

### Task 5: Reverse Mapping (n8n -> WB)

**Description:** Implement the reverse direction: converting n8n's `WorkflowParameters` (nodes, connections, settings) back into Workflow Builder's `DiagramModel` (nodes and edges for React Flow). This enables loading saved workflows from the API (which stores n8n format) back into the visual editor.

**Files to create:**
- `packages/json-translator/src/reverse-mapping.ts`
- `packages/json-translator/src/__tests__/reverse-mapping.test.ts`

**Dependencies:** Tasks 1, 4
**Size:** Medium

**Acceptance Criteria:**
- `mapN8nNodeToWBNode(n8nNode)` returns a valid `WBNode` with React Flow positioning
- `mapN8nConnectionsToWBEdges(connections, nodeIdMap)` returns `WBEdge[]`
- `mapN8nParamsToWBParams(n8nParams, nodeType)` reverses parameter mapping
- Expression unwrapping works (`={{ variable }}` -> `{{ variable }}`)
- Node type reverse lookup resolves n8n type identifiers to WB palette names
- Disabled state, notes, and metadata are preserved in reverse
- All tests pass

---

### Task 6: Translator Entry Point + Round-Trip Tests

**Description:** Create the main translator entry point that composes all mapping functions into two top-level APIs: `diagramToWorkflow(diagram: DiagramModel): WorkflowParameters` and `workflowToDiagram(workflow: WorkflowParameters): DiagramModel`. Build comprehensive round-trip tests with JSON fixture files covering realistic workflow topologies.

**Files to create:**
- `packages/json-translator/src/index.ts` -- re-exports types + top-level `diagramToWorkflow` and `workflowToDiagram`
- `packages/json-translator/src/__tests__/round-trip.test.ts`
- `packages/json-translator/src/__tests__/integration.test.ts`
- `packages/json-translator/src/__tests__/fixtures/simple-linear.json`
- `packages/json-translator/src/__tests__/fixtures/branching-if.json`
- `packages/json-translator/src/__tests__/fixtures/complex-merge.json`
- `packages/json-translator/src/__tests__/fixtures/webhook-to-response.json`

**Dependencies:** Tasks 2, 3, 4, 5
**Size:** Large

**Acceptance Criteria:**
- `diagramToWorkflow(diagram)` produces valid n8n `WorkflowParameters`
- `workflowToDiagram(workflow)` produces valid `DiagramModel`
- Round-trip: `workflowToDiagram(diagramToWorkflow(diagram))` preserves all functional properties
- Round-trip: `diagramToWorkflow(workflowToDiagram(workflow))` preserves all functional properties
- At least 4 fixture files covering: linear chain, IF branching, merge convergence, webhook trigger
- Position round-trip is stable (no floating point drift)
- Node names and IDs are preserved through round-trip
- All tests pass, including snapshot assertions against fixtures

---

### Task 7: API Client Module

**Description:** Create a typed HTTP client for the Workflow Builder frontend that handles authentication headers, tenant context injection, automatic retry with exponential backoff, and structured error handling. This is the single point of contact between the frontend and the R360 Flow API.

**Files to create:**
- `workflowbuilder/apps/frontend/src/api/api-client.ts` -- `createApiClient()` factory, `ApiClient` class with `get/post/put/patch/delete` methods
- `workflowbuilder/apps/frontend/src/api/workflow-api.ts` -- typed workflow CRUD operations wrapping `ApiClient`
- `workflowbuilder/apps/frontend/src/api/index.ts` -- barrel exports
- `workflowbuilder/apps/frontend/src/api/__tests__/api-client.test.ts`

**Dependencies:** None
**Size:** Medium

**Acceptance Criteria:**
- `createApiClient({ baseUrl, getAuthToken, tenantId })` returns an `ApiClient` instance
- All requests include `Authorization: Bearer <token>` header
- All requests include `X-Tenant-Id: <tenantId>` header
- `Content-Type: application/json` is set for all requests
- HTTP methods: `get<T>`, `post<T>`, `put<T>`, `patch<T>`, `delete<T>` with typed responses
- Non-2xx responses throw `ApiError` with status, message, and parsed body
- Retry logic: 3 attempts with exponential backoff for 5xx and network errors
- No retry for 4xx errors (client errors)
- `WorkflowApi` provides typed methods: `list()`, `get(id)`, `create(data)`, `update(id, data)`, `delete(id)`
- All tests pass

---

### Task 8: Auth Types and Hook

**Description:** Define the authentication abstraction layer for the frontend. Create auth provider interfaces, a `useAuth()` hook that wraps the concrete provider (Clerk/Auth0/Supabase), and exposes user info, tenant context, token retrieval, and sign-in/sign-out functions.

**Files to create:**
- `workflowbuilder/apps/frontend/src/auth/types.ts` -- `AuthUser`, `AuthContext`, `AuthProvider` interfaces
- `workflowbuilder/apps/frontend/src/auth/use-auth.ts` -- `useAuth()` hook implementation
- `workflowbuilder/apps/frontend/src/auth/index.ts` -- barrel exports

**Dependencies:** None
**Size:** Small

**Acceptance Criteria:**
- `AuthUser` interface: `id`, `email`, `name`, `avatarUrl`, `tenantId`, `role`
- `AuthContext` interface: `user`, `isAuthenticated`, `isLoading`, `getToken()`, `signIn()`, `signOut()`, `switchTenant()`
- `useAuth()` hook returns `AuthContext`
- Provider-agnostic: concrete provider injected via React context, not hardcoded
- Exported from barrel index

---

### Task 9: Auth Guard Component

**Description:** Create a React component that protects routes requiring authentication. Redirects unauthenticated users to login, shows a loading state during auth resolution, and passes auth context to child components.

**Files to create:**
- `workflowbuilder/apps/frontend/src/auth/auth-guard.tsx`
- `workflowbuilder/apps/frontend/src/auth/__tests__/auth-guard.test.tsx`

**Dependencies:** Task 8
**Size:** Small

**Acceptance Criteria:**
- `<AuthGuard>` renders children when authenticated
- `<AuthGuard>` shows loading spinner during auth resolution (`isLoading === true`)
- `<AuthGuard>` redirects to `/login` when unauthenticated
- Redirect preserves the intended URL for post-login navigation
- Optional `requiredRole` prop for role-based access control
- All tests pass with mocked auth context

---

### Task 10: Workflow Persistence Hook

**Description:** Create a `useWorkflowPersistence()` hook that replaces the Workflow Builder's local JSON import/export with API-backed persistence. Handles save (create/update), load, delete, auto-save with debounce, conflict detection via `updated_at` timestamps, and optimistic UI updates.

**Files to create:**
- `workflowbuilder/apps/frontend/src/workflows/use-workflow-persistence.ts`
- `workflowbuilder/apps/frontend/src/workflows/__tests__/use-workflow-persistence.test.ts`
- `workflowbuilder/apps/frontend/src/workflows/index.ts`

**Dependencies:** Task 7
**Size:** Medium

**Acceptance Criteria:**
- `useWorkflowPersistence()` returns: `save(diagram)`, `load(id)`, `deleteWorkflow(id)`, `isSaving`, `lastSavedAt`, `hasUnsavedChanges`, `conflictState`
- `save()` calls `POST /workflows` for new workflows, `PUT /workflows/:id` for existing
- `load()` calls `GET /workflows/:id` and returns `DiagramModel`
- Auto-save triggers after 2 seconds of inactivity (debounced)
- Conflict detection: if `updated_at` from server is newer than local, surface conflict
- Optimistic updates: UI reflects changes immediately, rolls back on API failure
- All tests pass

---

### Task 11: Wire Integration -- R360 API Integration Strategy

**Description:** Create a new Workflow Builder integration variant `with-integration-through-r360-api` that wires up the API client, auth, and persistence hooks into the Workflow Builder's plugin system. This variant replaces the existing `with-integration` (which uses direct n8n server) with our tenant-aware API layer. Modify the existing `with-integration.tsx` to re-export the R360 variant as default.

**Files to create:**
- `workflowbuilder/apps/frontend/src/integration-variants/with-integration-through-r360-api.tsx`

**Files to modify:**
- `workflowbuilder/apps/frontend/src/integration-variants/with-integration.tsx` -- re-export R360 variant

**Dependencies:** Tasks 7, 8, 10
**Size:** Large

**Acceptance Criteria:**
- `WithR360ApiIntegration` component wraps Workflow Builder with auth + API context
- Workflow save/load uses `useWorkflowPersistence` instead of direct n8n calls
- Auth token is injected into API client from `useAuth().getToken()`
- Tenant ID is sourced from `useAuth().user.tenantId`
- Existing `with-integration` re-exports the R360 variant
- No n8n server connection required (all through R360 API)
- Component renders without errors in dev mode

---

### Task 12: Workflow List Dashboard

**Description:** Create a workflow list/dashboard page that displays all workflows for the current tenant, with create, open, rename, and delete capabilities. This is the landing page after authentication.

**Files to create:**
- `workflowbuilder/apps/frontend/src/workflows/components/workflow-list.tsx`
- `workflowbuilder/apps/frontend/src/workflows/components/workflow-card.tsx`
- `workflowbuilder/apps/frontend/src/workflows/components/create-workflow-dialog.tsx`

**Dependencies:** Tasks 7, 8
**Size:** Medium

**Acceptance Criteria:**
- `WorkflowList` fetches and displays workflows from `GET /workflows`
- Each workflow shown as a `WorkflowCard` with: name, last modified date, status badge, node count
- "Create Workflow" button opens `CreateWorkflowDialog` with name input
- Click on card navigates to workflow editor with workflow ID
- Delete action with confirmation dialog
- Rename inline or via dialog
- Empty state shown when no workflows exist
- Loading skeleton shown while fetching
- Error state with retry button on API failure

---

### Task 13: Environment Configuration

**Description:** Set up frontend environment configuration for API connectivity, auth provider settings, and feature flags. Configure Vite's environment variable handling and proxy settings for local development.

**Files to create:**
- `workflowbuilder/apps/frontend/.env.development`

**Files to modify:**
- `workflowbuilder/apps/frontend/vite.config.mts` -- add API proxy configuration
- `workflowbuilder/apps/frontend/package.json` -- add `@r360/json-translator` dependency

**Dependencies:** None
**Size:** Small

**Acceptance Criteria:**
- `.env.development` defines: `VITE_API_BASE_URL`, `VITE_AUTH_PROVIDER`, `VITE_CLERK_PUBLISHABLE_KEY`
- Vite dev server proxies `/api` requests to `http://localhost:3000`
- `import.meta.env.VITE_API_BASE_URL` is accessible in frontend code
- TypeScript `env.d.ts` declares Vite environment variable types
- `@r360/json-translator` is listed as workspace dependency

---

### Task 14: Phase 2 Integration Tests

**Description:** End-to-end integration tests verifying that the JSON translator, API client, and persistence layer work together. Tests cover: diagram -> save to API -> load from API -> diagram round-trip, auth header injection, tenant isolation, and error handling flows.

**Files to create:**
- `packages/json-translator/src/__tests__/integration.test.ts` (extended from Task 6)
- `workflowbuilder/apps/frontend/src/__tests__/phase2-smoke.test.ts`

**Dependencies:** All previous tasks
**Size:** Medium

**Acceptance Criteria:**
- JSON translator round-trip tests pass with all fixture files
- API client correctly injects auth and tenant headers (unit test with mocked fetch)
- Workflow persistence hook save/load cycle works (unit test with mocked API)
- Smoke test: render `WorkflowList` component with mocked API responses
- Smoke test: render `AuthGuard` with mocked auth context
- All Phase 2 tests pass: `pnpm --filter @r360/json-translator test && pnpm --filter frontend test`
- No TypeScript errors: `pnpm -r typecheck`

---

## Execution Order

### Wave 1 (Parallel -- No Dependencies)
- **Task 1:** JSON Translator Package Scaffold
- **Task 7:** API Client Module
- **Task 8:** Auth Types and Hook
- **Task 13:** Environment Configuration

### Wave 2 (After Wave 1)
- **Task 2:** Node Mapping (after Task 1)
- **Task 3:** Connection Mapping (after Task 1)
- **Task 4:** Parameter Mapping (after Task 1)
- **Task 9:** Auth Guard Component (after Task 8)
- **Task 10:** Workflow Persistence Hook (after Task 7)
- **Task 12:** Workflow List Dashboard (after Tasks 7, 8)

### Wave 3 (After Wave 2)
- **Task 5:** Reverse Mapping (after Tasks 1, 4)
- **Task 11:** Wire Integration (after Tasks 7, 8, 10)

### Wave 4 (After Wave 3)
- **Task 6:** Translator Entry Point + Round-Trip Tests (after Tasks 2, 3, 4, 5)

### Wave 5 (Final)
- **Task 14:** Phase 2 Integration Tests (after all)

---

## Validation Checklist

- [ ] `pnpm --filter @r360/json-translator build` succeeds
- [ ] `pnpm --filter @r360/json-translator test` passes (all translator tests)
- [ ] `pnpm --filter frontend build` succeeds
- [ ] `pnpm --filter frontend test` passes (all frontend tests)
- [ ] `pnpm -r typecheck` passes (no TypeScript errors across monorepo)
- [ ] Zero n8n package imports anywhere in Phase 2 code
- [ ] Round-trip fidelity: `workflowToDiagram(diagramToWorkflow(diagram))` matches original
- [ ] API client injects auth + tenant headers on every request
- [ ] Workflow list dashboard renders with mocked data
- [ ] Auth guard redirects unauthenticated users
