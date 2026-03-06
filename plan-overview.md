# R360 Flow — Multi-Tenant SaaS Plan (Workflow Builder UI + n8n Engine)

---

## CARDINAL RULE: n8n Packages Are UNMODIFIED Library Imports

> **Every developer must internalize this before writing a single line of code.**

R360 Flow uses n8n's **published npm packages** as unmodified dependencies. We `npm install` them. We never fork, patch, or vendor them. We stay updatable via `npm update`.

### npm Packages We Import

| Package | Purpose |
|---------|---------|
| `n8n-workflow` | Workflow data model, `INodeTypes`, `ICredentialsHelper`, expression evaluation |
| `n8n-core` | `WorkflowExecute` engine, `BinaryDataService`, node loaders |
| `n8n-nodes-base` | 400+ integration nodes (Slack, Google, Salesforce, HTTP, etc.) |
| `@n8n/di` | Dependency injection container (`Container.set()` / `Container.get()`) |
| `@n8n/config` | Configuration schema definitions |
| `@n8n/backend-common` | Shared backend utilities |
| `@n8n/errors` | Error types and handling |
| `@n8n/constants` | Shared constants |
| `@n8n/decorators` | TypeScript decorators for DI |

### What We NEVER Do

- **NEVER fork or modify n8n source code** — no patches, no monkey-patching, no vendored copies
- **NEVER run n8n server instances per tenant** — too expensive, doesn't scale, defeats the purpose
- **NEVER import from n8n source paths** — only from installed npm packages
- **NEVER add n8n's source tree as a build dependency** — the `n8n/` directory is a READ-ONLY reference copy for exploring APIs

### Why This Rule Exists

1. **Updatability** — When n8n ships new nodes or bug fixes, we run `npm update` and get them. Zero merge conflicts. Zero patching effort.
2. **Cost** — Running a separate n8n instance per tenant is prohibitively expensive. A single process importing n8n libraries can serve all tenants.
3. **Clean architecture** — n8n libraries handle workflow execution. Our code handles everything else: multi-tenancy, auth, billing, storage. Clear separation of concerns.

### About the `n8n/` Directory

The `n8n/` directory in this repo is a **read-only reference copy** of n8n's source. It exists solely for exploring n8n's internal APIs during development. It is:
- NOT a build dependency
- NOT imported by any of our packages
- NOT modified for any reason
- Useful for understanding `WorkflowExecute` constructor signatures, `INodeTypes` interfaces, DI container setup, etc.

---

## How Multi-Tenancy Works WITHOUT Modifying n8n

n8n's libraries are inherently tenant-unaware — they execute workflows, evaluate expressions, and run nodes without any concept of "which tenant." This is a feature, not a bug. We inject tenant context at the boundary.

### 1. Tenant-Scoped Credential Injection

Our `TenantCredentialsHelper` implements n8n's `ICredentialsHelper` interface. When WorkflowExecute asks for credentials:
- We query ONLY the current tenant's credentials from our DB
- We decrypt using the tenant's per-tenant encryption key
- n8n receives plain credential objects — it never knows which tenant they belong to

### 2. Tenant-Scoped Execution Data

Each `WorkflowExecute` call receives tenant-specific `IWorkflowExecuteAdditionalData`:
- **Credentials helper** — bound to current tenant
- **Webhook URLs** — prefixed with tenant ID
- **Lifecycle hooks** — write execution results to tenant-scoped DB rows
- **Variables** — tenant-specific environment variables

n8n's execution engine uses this data object throughout its run. By constructing it per-tenant, we get full isolation without modifying a single line of n8n code.

### 3. Tenant-Scoped Data Storage

All database tables carry a `tenant_id` column. n8n libraries never touch the database directly — our lifecycle hooks and execution service handle all persistence:
- Execution results -> `executions` table (filtered by `tenant_id`)
- Step-level data -> `execution_steps` table (filtered by `tenant_id`)
- Workflow definitions -> `workflows` table (filtered by `tenant_id`)

### 4. Tenant-Scoped Resource Limits

BullMQ queue enforces per-tenant concurrency and rate limits BEFORE handing off to n8n:
- Max concurrent executions per tenant (plan-based)
- Execution timeout enforcement
- Priority queuing by plan tier
- Rate limiting per minute/hour

n8n's `WorkflowExecute.run()` is the innermost call — it only fires after our tenant-aware queue has validated and authorized the execution.

---

## Bootstrapping the n8n DI Container

n8n-core uses `@n8n/di`'s `Container` for dependency injection. We must bootstrap it ONCE at server startup (NOT per-tenant) with our implementations:

```typescript
// packages/execution-engine/src/bootstrap.ts
import { Container } from '@n8n/di';
import { InstanceSettings } from 'n8n-core';
import { BinaryDataService } from 'n8n-core';

export function bootstrapN8nContainer() {
  // 1. Instance settings — our encryption key and paths
  Container.set(InstanceSettings, {
    encryptionKey: process.env.N8N_ENCRYPTION_KEY,
    n8nFolder: process.env.N8N_USER_FOLDER,
    instanceId: 'r360-flow',
    // ... other required settings
  });

  // 2. Logger — our logging implementation
  Container.set(Logger, ourLogger);

  // 3. Error reporter — our error tracking (Sentry, etc.)
  Container.set(ErrorReporter, ourErrorReporter);

  // 4. Binary data service — our storage paths
  const binaryDataService = Container.get(BinaryDataService);
  binaryDataService.init({ mode: 'filesystem', localStoragePath: '/data/binary' });
}
```

### DI Services WorkflowExecute Depends On

| Service | What We Provide |
|---------|----------------|
| `InstanceSettings` | Our encryption key, file paths, instance ID |
| `Logger` | Our structured logging implementation |
| `ErrorReporter` | Our error tracking (Sentry/Datadog) |
| `BinaryDataService` | Our storage config for binary node outputs |
| `NodeTypes` (via `INodeTypes`) | Our `R360NodeTypes` wrapping `LazyPackageDirectoryLoader` |
| `CredentialsHelper` (via `ICredentialsHelper`) | Our `TenantCredentialsHelper` — injected per-execution, not per-container |

**Key insight:** The DI container is bootstrapped once. Tenant-specific context is NOT in the container — it's passed via `IWorkflowExecuteAdditionalData` at execution time.

---

## Vision

Build a multi-tenant workflow automation SaaS using **Workflow Builder** (by Synergy Codes) as the frontend visual editor SDK, a **new tenant-aware API layer** as the backend, and **n8n's npm packages** (n8n-workflow, n8n-core, n8n-nodes-base) as the embedded, unmodified workflow execution engine. Multi-tenancy is designed in from day one — no retrofitting.

---

## What We Have Today

| Component | Location | Tech | Role |
|-----------|----------|------|------|
| **Workflow Builder** | `workflowbuilder/` | React 19, @xyflow/react, Zustand, TypeScript | Frontend-only SDK for visual workflow editing (canvas, nodes, edges, properties panels, layout, validation) |
| **n8n** | `n8n/` | TypeScript, Node.js | READ-ONLY reference copy for API exploration (NOT a build dependency) |

### Workflow Builder Packages (Our Frontend)

| Package | What It Gives Us |
|---------|-----------------|
| `apps/frontend` | Core visual editor — React app with canvas, node system, schema-driven config panels |
| `apps/types` | Shared TypeScript definitions for workflow data structures (including `DiagramModel`) |
| `apps/icons` | Lazy-loadable, extensible icon system for node palette |
| `apps/tools` | Build and development tooling |

**Key Workflow Builder Characteristics:**
- **Frontend-only** — outputs JSON workflow definitions (`DiagramModel`), no execution/orchestration
- **Backend-agnostic** — designed to pair with any execution engine (perfect for n8n)
- **Plugin-first architecture** — extensible node types via `registerFunctionDecorator`
- **Schema-driven property panels** — node config UI generated from schemas
- **Theming & white-label support** — full customization for our SaaS branding
- **Built on @xyflow/react** (React Flow) — mature, performant canvas library
- **Apache 2.0 licensed** (Community Edition)

### n8n npm Packages We Import (UNMODIFIED)

| Package | What It Gives Us |
|---------|-----------------|
| `n8n-workflow` | Workflow data model, node/connection types, expression evaluation, `INodeTypes` / `ICredentialsHelper` interfaces |
| `n8n-core` | `WorkflowExecute` engine — runs workflows node by node, handles branching/looping, `LazyPackageDirectoryLoader` for node loading |
| `n8n-nodes-base` | 400+ integration nodes (Slack, Google Sheets, Salesforce, HTTP, etc.) — loaded via `LazyPackageDirectoryLoader` |

---

## Architecture

```
+----------------------------------------------+
|           Workflow Builder SDK                |
|    (React + @xyflow/react + Zustand)         |
|  Visual editor, schema-driven panels,        |
|  plugin node system, tenant-scoped UI        |
+------------------+---------------------------+
                   | REST/WebSocket API
                   v
+======================================================+
|  ================== OUR CODE ====================    |
|                                                      |
|           R360 Flow API Server                       |
|         (Node.js / TypeScript)                       |
|                                                      |
|  +-------------+  +----------------------+           |
|  | Auth/Tenant  |  | Workflow CRUD        |           |
|  | Middleware   |  | (tenant-scoped)      |           |
|  +-------------+  +----------------------+           |
|  +-------------+  +----------------------+           |
|  | Credential  |  | Execution Manager    |           |
|  | Vault       |  | (BullMQ queue)       |           |
|  +-------------+  +----------------------+           |
|  +-------------+  +----------------------+           |
|  | Webhook     |  | Billing / Metering   |           |
|  | Router      |  |                      |           |
|  +-------------+  +----------------------+           |
|                                                      |
|  +------------------------------------------------+  |
|  |    n8n Execution Engine Wrapper                 |  |
|  |    (packages/execution-engine/)                 |  |
|  |                                                 |  |
|  |  - bootstrap.ts: DI container setup (once)      |  |
|  |  - node-types.ts: R360NodeTypes (INodeTypes)    |  |
|  |  - credentials-helper.ts: TenantCredentialsHelper|  |
|  |  - execution-service.ts: builds tenant-scoped   |  |
|  |    additionalData, calls WorkflowExecute.run()  |  |
|  |  - lifecycle-hooks.ts: execution result storage  |  |
|  +------------------------------------------------+  |
|                                                      |
|  ================== OUR CODE ====================    |
+========================|=============================+
                         | programmatic invocation
  - - - - - - - - - - - -|- - - - - - - - - - - - - -
  BOUNDARY: n8n Libraries (UNMODIFIED npm packages)
  - - - - - - - - - - - -|- - - - - - - - - - - - - -
                         v
+----------------------------------------------+
|    n8n npm Packages (UNMODIFIED)             |
|                                              |
|  n8n-core:     WorkflowExecute.run()         |
|  n8n-workflow:  Workflow model, expressions   |
|  n8n-nodes-base: 400+ integration nodes      |
|  @n8n/di:      DI container (we bootstrap)   |
+----------------------------------------------+
                   |
                   v
+----------------------------------------------+
|              Data Layer                      |
|                                              |
|  PostgreSQL (tenant-scoped tables)           |
|  Redis (execution queue, caching)            |
|  Object Storage (execution logs, artifacts)  |
+----------------------------------------------+
```

---

## Implementation Phases

### Phase 1: Foundation — API Server + Database (Weeks 1-3)

> **CARDINAL RULE checkpoint:** Zero n8n dependency in this phase. We are building the multi-tenant scaffolding that will WRAP AROUND n8n later. No n8n packages are installed yet.

**Goal:** Standalone API server with tenant-aware data layer, no n8n yet.

#### 1.1 Project Scaffolding
- [ ] Initialize `packages/api` in the monorepo (Node.js + TypeScript)
- [ ] Set up Express or Fastify server
- [ ] Add shared `packages/types` for workflow JSON schema (leverage Workflow Builder's `apps/types`)
- [ ] Configure pnpm workspace to include new packages alongside `workflowbuilder/`

#### 1.2 Database Schema (Multi-Tenant from Day One)
- [ ] PostgreSQL with the following core tables, all with `tenant_id`:

```sql
-- Tenants
tenants (id, name, slug, plan, settings, created_at)

-- Users belong to tenants
users (id, tenant_id, email, role, created_at)

-- Workflows scoped to tenant
workflows (id, tenant_id, name, definition_json, is_active, created_by, created_at, updated_at)

-- Credentials scoped to tenant, encrypted per-tenant
credentials (id, tenant_id, name, type, encrypted_data, created_by, created_at)

-- Execution history scoped to tenant
executions (id, tenant_id, workflow_id, status, started_at, finished_at, context_json, error)

-- Execution step log (for step-through debugging)
execution_steps (id, execution_id, node_id, status, input_json, output_json, started_at, finished_at)

-- Webhook registrations scoped to tenant
webhooks (id, tenant_id, workflow_id, path, method, is_active)
```

- [ ] Row-level security policies or application-level tenant filtering on every query
- [ ] Database migrations with a tool like Drizzle, Prisma, or Knex

#### 1.3 Auth & Tenant Context
- [ ] Integrate auth provider (Clerk, Auth0, or Supabase Auth)
- [ ] Middleware that extracts tenant context from JWT/session
- [ ] Every API route receives `tenantId` — no endpoint operates without it
- [ ] Role-based access: owner, admin, member, viewer

#### 1.4 Core API Endpoints
- [ ] `POST /api/workflows` — create workflow (tenant-scoped)
- [ ] `GET /api/workflows` — list workflows (tenant-scoped)
- [ ] `GET /api/workflows/:id` — get workflow (tenant-scoped)
- [ ] `PUT /api/workflows/:id` — update workflow (tenant-scoped)
- [ ] `DELETE /api/workflows/:id` — soft delete
- [ ] `POST /api/workflows/:id/execute` — trigger execution
- [ ] `GET /api/executions` — list executions (tenant-scoped)
- [ ] `GET /api/executions/:id` — get execution detail with step log
- [ ] CRUD for credentials (encrypted at rest)

---

### Phase 2: Connect Workflow Builder UI to API (Weeks 3-4)

> **CARDINAL RULE checkpoint:** Zero n8n execution in this phase. We are connecting the frontend to our API. Workflow Builder saves/loads workflow JSON — no n8n translation or execution yet.

**Goal:** Workflow Builder saves/loads workflows from the API instead of local JSON.

#### 2.1 API Client Layer
- [ ] Add API client module to the Workflow Builder frontend (fetch wrapper with auth headers)
- [ ] Tenant context injected from auth session

#### 2.2 Workflow Persistence
- [ ] Replace local JSON import/export with API-backed save/load
- [ ] Workflow list view (dashboard showing tenant's workflows)
- [ ] Auto-save or explicit save button
- [ ] Keep JSON export as a secondary feature for portability

#### 2.3 Auth UI
- [ ] Login/signup flow (using auth provider's components)
- [ ] Tenant switching (if user belongs to multiple tenants)
- [ ] Protected routes — must be authenticated to access editor

#### 2.4 Workflow JSON Translation Layer
- [ ] Map Workflow Builder's `DiagramModel` output to n8n's `IWorkflowBase` / `WorkflowParameters` format
- [ ] Bidirectional: `DiagramModel <-> n8n WorkflowParameters`
- [ ] Leverage Workflow Builder's schema-driven approach to define n8n-compatible node schemas
- [ ] This is the critical bridge — Workflow Builder nodes/edges need to map to n8n node types and connections

---

### Phase 3: Embed n8n Execution Engine (Weeks 4-7)

> **CARDINAL RULE checkpoint:** This is where we integrate n8n. Every integration point goes through our wrapper layer. We `npm install n8n-workflow n8n-core n8n-nodes-base @n8n/di` and we NEVER modify these packages. If n8n's API doesn't support something we need, we build around it in our wrapper — we do not patch n8n.

**Goal:** Execute workflows using n8n's engine with tenant isolation, using only published npm packages.

#### 3.1 DI Container Bootstrap
**File:** `packages/execution-engine/src/bootstrap.ts`
- [ ] `Container.set(InstanceSettings, ...)` — our encryption key, paths, instance ID
- [ ] `Container.set(Logger, ...)` — our structured logging implementation
- [ ] `Container.set(ErrorReporter, ...)` — our error tracking (Sentry/Datadog)
- [ ] Configure `BinaryDataService` with our storage paths
- [ ] Run ONCE at server startup, NOT per-tenant
- [ ] Integration tests that verify all required DI services are registered

#### 3.2 Node Registry
**File:** `packages/execution-engine/src/node-types.ts`
- [ ] Create `R360NodeTypes` class implementing `INodeTypes` from `n8n-workflow`
- [ ] Use `LazyPackageDirectoryLoader` from `n8n-core` to load nodes from the installed `n8n-nodes-base` npm package
- [ ] This works naturally because `n8n-nodes-base` is installed in `node_modules/` — `LazyPackageDirectoryLoader` reads from its `dist/` directory
- [ ] Register custom R360 nodes alongside n8n's built-in nodes
- [ ] Cache loaded node types for performance (load once, serve all tenants)

#### 3.3 Execution Service
**File:** `packages/execution-engine/src/execution-service.ts`
- [ ] Construct `Workflow` object from `n8n-workflow` using translated workflow JSON
- [ ] Build tenant-scoped `IWorkflowExecuteAdditionalData`:
  - `credentialsHelper` — `TenantCredentialsHelper` bound to current tenant
  - `hooks` — lifecycle hooks that write results to tenant-scoped DB rows
  - `webhookBaseUrl` — tenant-prefixed webhook URL
  - `variables` — tenant-specific variables
- [ ] Call `new WorkflowExecute(additionalData, mode).run(workflowInstance)` — the `WorkflowExecute` constructor takes `(additionalData: IWorkflowExecuteAdditionalData, mode: WorkflowExecuteMode)`
- [ ] Capture execution results, errors, and step-by-step data
- [ ] Write results to `executions` and `execution_steps` tables via lifecycle hooks

#### 3.4 Credential Management
**File:** `packages/execution-engine/src/credentials-helper.ts`
- [ ] `TenantCredentialsHelper` implements `ICredentialsHelper` from `n8n-workflow`
- [ ] Per-tenant encryption keys (derived from master key + tenant ID, or via a vault)
- [ ] Credential resolution queries ONLY current tenant's credentials
- [ ] Credential types registry (loads credential type definitions from `n8n-nodes-base`)
- [ ] Credential creation UI in Workflow Builder (OAuth flows, API key entry)

#### 3.5 Node Palette
- [ ] Convert n8n `INodeTypeDescription` objects to Workflow Builder `PaletteItem<NodeSchema>` format
- [ ] Expose available nodes via API: `GET /api/nodes` (filterable by category)
- [ ] Use Workflow Builder's `registerFunctionDecorator` to register n8n node types as visual editor plugins
- [ ] Use Workflow Builder's schema-driven properties panels to render n8n node configuration
- [ ] Populate Workflow Builder's icon system (`apps/icons`) with n8n node icons

#### 3.6 Lifecycle Hooks
**File:** `packages/execution-engine/src/lifecycle-hooks.ts`
- [ ] `workflowExecuteBefore` — record execution start in tenant-scoped DB
- [ ] `nodeExecuteBefore` / `nodeExecuteAfter` — record step-level data
- [ ] `workflowExecuteAfter` — record execution completion, errors, timing
- [ ] All hooks receive tenant context and write to tenant-scoped tables

#### 3.7 Custom R360 Nodes
- [ ] Port R360-specific actions (`assign_inspection`, `record_action`, `document_action`) as custom n8n nodes
- [ ] Register them in both n8n's node registry and Workflow Builder's plugin system

---

### Phase 4: Execution Infrastructure (Weeks 7-9)

> **CARDINAL RULE checkpoint:** All infrastructure wraps AROUND n8n execution. BullMQ queue, rate limiting, webhook routing, and scheduling are our responsibility. `WorkflowExecute.run()` is the innermost call — everything else is our scaffolding.

**Goal:** Production-grade execution with queuing, isolation, and observability.

#### 4.1 Job Queue
- [ ] Redis + BullMQ for execution queue
- [ ] Workflows are enqueued, workers pick them up
- [ ] Per-tenant rate limiting (e.g., max 10 concurrent executions per tenant)
- [ ] Priority queues for different plan tiers

#### 4.2 Execution Sandboxing
- [ ] n8n's Code node allows arbitrary JS — must be sandboxed
- [ ] Use `isolated-vm` or container-level isolation for user code execution
- [ ] Network policies: restrict outbound access from execution workers if needed
- [ ] Execution timeouts per node and per workflow

#### 4.3 Webhook Handling
- [ ] Tenant-scoped webhook paths: `POST /webhook/{tenantId}/{webhookPath}`
- [ ] Webhook registration when workflows with webhook triggers are activated
- [ ] Webhook deregistration on workflow deactivation
- [ ] Webhook signature verification where applicable

#### 4.4 Scheduled Workflows
- [ ] Cron-based triggers stored in DB per tenant
- [ ] Scheduler service checks for due workflows and enqueues them
- [ ] Timezone-aware scheduling

#### 4.5 Real-Time Execution Monitoring
- [ ] WebSocket connection for live execution status updates
- [ ] Step-by-step execution view in Workflow Builder UI
- [ ] Execution logs streamed to the UI

---

### Phase 5: Multi-Tenant Hardening (Weeks 9-11)

> **CARDINAL RULE checkpoint:** Tenant isolation is entirely our responsibility. n8n libraries are tenant-unaware by design. Every boundary — credentials, data storage, execution results, rate limits — is enforced in OUR wrapper code. If a cross-tenant leak exists, the bug is in our code, not n8n's.

**Goal:** Production-ready tenant isolation, billing, and operational controls.

#### 5.1 Data Isolation Verification
- [ ] Automated tests that verify no cross-tenant data leakage
- [ ] Ensure all DB queries include tenant_id filtering
- [ ] Audit logging: who accessed what, when

#### 5.2 Billing & Usage Metering
- [ ] Track per-tenant: workflow count, execution count, execution minutes
- [ ] Integrate with Stripe for subscription management
- [ ] Plan-based limits (free tier, pro, enterprise)
- [ ] Overage handling and usage alerts

#### 5.3 Admin & Onboarding
- [ ] Tenant provisioning flow (signup -> create org -> invite team)
- [ ] Tenant settings page (plan, members, API keys)
- [ ] Admin dashboard for platform operators

#### 5.4 Security
- [ ] Penetration testing for tenant isolation
- [ ] Credential encryption audit
- [ ] API rate limiting and abuse prevention
- [ ] SOC 2 / compliance groundwork if targeting enterprise

---

### Phase 6: Polish & Launch (Weeks 11-14)

- [ ] Workflow templates gallery (per-tenant or global)
- [ ] Error handling UX (retry failed executions, error notifications)
- [ ] Workflow versioning (save versions, rollback)
- [ ] Theming and white-label customization via Workflow Builder's built-in support
- [ ] Documentation and API reference
- [ ] Monitoring and alerting (Datadog, Sentry, etc.)
- [ ] Load testing multi-tenant execution at scale

---

## Key Technical Decisions

### 1. Workflow JSON Translation

Workflow Builder outputs `DiagramModel` JSON. n8n expects `WorkflowParameters` / `IWorkflowBase`. We build a bidirectional translator:

```
Workflow Builder Format             n8n Format
(DiagramModel)                      (WorkflowParameters)
───────────────────────             ──────────
nodes[] (xyflow nodes)              nodes[].type -> "n8n-nodes-base.manualTrigger"
node schema-driven config           nodes[].parameters
edges[] (source/target)             connections{} (node-name based adjacency map)
```

Workflow Builder's schema-driven property panels are a natural fit: we define JSON schemas that mirror n8n's `INodeTypeDescription` format, and the UI generates config forms automatically.

### 2. Custom Nodes for R360

R360-specific actions (`assign_inspection`, `record_action`, `document_action`) should be ported as **custom n8n nodes** and registered as **Workflow Builder plugins**:

```
packages/nodes-r360/
  nodes/
    AssignInspection/
    RecordAction/
    DocumentAction/
  credentials/
    Record360Api.credentials.ts
  workflow-builder-plugins/
    r360-node-definitions.ts    # Plugin registrations for Workflow Builder UI
```

### 3. What We Take from Each Component

| Capability | Source | Notes |
|-----------|--------|-------|
| Visual workflow editor | **Workflow Builder** (SDK) | Canvas, nodes, edges, layout, validation, schema-driven panels |
| Plugin node system | **Workflow Builder** | Extensible node types, custom icons, config schemas |
| Theming / white-label | **Workflow Builder** | Built-in theming and design system |
| Workflow execution engine | n8n `n8n-core` (npm) | **UNMODIFIED** — DAG traversal, branching, error handling |
| Expression evaluation | n8n `n8n-workflow` (npm) | **UNMODIFIED** — `{{ $json.field }}` syntax in node params |
| 400+ integration nodes | n8n `n8n-nodes-base` (npm) | **UNMODIFIED** — Slack, Google, Salesforce, HTTP, etc. |
| DI container | `@n8n/di` (npm) | **UNMODIFIED** — We bootstrap it with `Container.set()`; we do not modify it |
| JSON translation | **Build new** | `DiagramModel <-> n8n WorkflowParameters` bidirectional mapping |
| n8n DI bootstrap | **Build new** | `Container.set()` calls in `bootstrap.ts` |
| `INodeTypes` registry | **Build new** | `R360NodeTypes` wraps `LazyPackageDirectoryLoader` from n8n-core |
| `ICredentialsHelper` | **Build new** | `TenantCredentialsHelper` — tenant-scoped credential resolution |
| API server | **Build new** | Tenant-aware, our auth, our DB |
| Database & data model | **Build new** | Multi-tenant from scratch |
| Auth & user management | **Build new** | Clerk/Auth0 integration |
| Credential vault | **Build new** | Per-tenant encryption |
| Job queue & workers | **Build new** | BullMQ + Redis |
| Billing & metering | **Build new** | Stripe integration |
| Webhook routing | **Build new** | Tenant-scoped paths |

### 4. Monorepo Structure (Target)

```
R360-Flow/
  workflowbuilder/              # Workflow Builder SDK (cloned, our frontend base)
    apps/
      frontend/                 # Core visual editor (React + @xyflow/react + Zustand)
      types/                    # Shared TypeScript definitions (DiagramModel, etc.)
      icons/                    # Extensible icon system
      tools/                    # Build tooling
  packages/
    api/                        # API server (Express/Fastify + TypeScript)
    types/                      # Shared type definitions (extends workflowbuilder/apps/types)
    db/                         # Database schema, migrations, queries
    execution-engine/           # Wrapper around n8n npm packages + our tenant logic
      src/
        bootstrap.ts            # DI container setup (Container.set calls)
        execution-service.ts    # Builds additionalData, calls WorkflowExecute.run()
        node-types.ts           # R360NodeTypes implementing INodeTypes
        credentials-helper.ts   # TenantCredentialsHelper implementing ICredentialsHelper
        lifecycle-hooks.ts      # Execution result persistence hooks
    json-translator/            # DiagramModel <-> n8n WorkflowParameters translation
    nodes-r360/                 # Custom R360-specific n8n nodes + WB plugin defs
  n8n/                          # READ-ONLY reference copy (NOT a build dependency)
  infrastructure/
    docker-compose.yml          # Local dev: Postgres, Redis
    k8s/                        # Kubernetes manifests for production
```

---

## Why Workflow Builder + n8n

This architecture cleanly separates concerns:

- **Workflow Builder** owns the **visual editing experience** — it's purpose-built as an embeddable, frontend-only SDK. Its plugin-first architecture and schema-driven panels make it straightforward to expose n8n's 400+ node types as configurable UI elements.
- **n8n npm packages** own the **execution engine** — battle-tested DAG traversal, expression evaluation, and a massive library of pre-built integrations. Used as UNMODIFIED library imports.
- **We own the glue** — tenant-aware API, auth, credentials, billing, DI bootstrap, execution wrapper, and the JSON translation layer that bridges the two.

This avoids the complexity of forking a full workflow platform and instead composes best-in-class tools for each layer, all updatable independently.

---

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| **DI container coupling** — WorkflowExecute may call `Container.get()` for services we haven't registered | Runtime crash | Integration tests that exercise full workflow execution; catch new `Container.get()` calls on n8n version upgrades |
| **npm packages add new peer deps** | Install failures on upgrade | Pin n8n package versions; test upgrades in CI before merging |
| **Internal APIs change between versions** | Our wrapper breaks | Follow semver; pin to specific versions; integration test suite catches breakage |
| **`LazyPackageDirectoryLoader` filesystem assumptions** | Node loading fails | Works naturally with `npm install` — reads from `node_modules/n8n-nodes-base/dist/`; test in CI |
| **Temptation to "just patch one thing" in n8n** | Breaks the Cardinal Rule; creates merge debt | Cardinal Rule prominently in docs; code review enforcement; CI check that no files in `n8n/` are imported |
| Workflow JSON translation is lossy | Some n8n nodes unusable from Workflow Builder | Start with a subset of high-value nodes; expand incrementally |
| Credential leakage between tenants | Security incident | Per-tenant encryption + automated cross-tenant tests |
| Execution noisy neighbors | One tenant's heavy workflows degrade others | Per-tenant queue limits, worker isolation, plan-based throttling |
| Workflow Builder schema mismatch with n8n node descriptions | Node config panels don't map cleanly | Build an adapter layer that converts `INodeTypeDescription` to Workflow Builder JSON schemas |
| Workflow Builder upstream changes | Our customizations conflict with SDK updates | Maintain a clear separation between SDK core and our extensions; contribute upstream where possible |

---

## Key n8n Source References (Read-Only)

These files in the `n8n/` reference copy informed our architecture:

| File | What We Learned |
|------|----------------|
| `n8n/packages/core/src/execution-engine/workflow-execute.ts` (line ~99-110) | `WorkflowExecute` constructor: `(additionalData: IWorkflowExecuteAdditionalData, mode: WorkflowExecuteMode)` |
| `n8n/packages/workflow/src/interfaces.ts` | `INodeTypes`, `ICredentialsHelper`, `IWorkflowExecuteAdditionalData` interfaces |
| `n8n/packages/core/src/nodes-loader/lazy-package-directory-loader.ts` | How n8n loads nodes from npm packages — we use this directly |
| `n8n/packages/@n8n/di/src/di.ts` | DI Container (`Container.set()` / `Container.get()`) |
| `workflowbuilder/apps/types/src/common.ts` (line ~42-46) | `DiagramModel` — the output format from Workflow Builder |
| `workflowbuilder/apps/frontend/src/app/features/plugins-core/adapters/adapter-functions.ts` | Plugin registration via `registerFunctionDecorator` |

---

## Immediate Next Steps

1. **Scaffold the monorepo** — Configure pnpm workspace to encompass both `workflowbuilder/` and our new `packages/`.
2. **Scaffold the API server** — Basic Express/Fastify app with tenant middleware, PostgreSQL connection, and workflow CRUD.
3. **Build the JSON translation layer** — `DiagramModel <-> n8n WorkflowParameters` translator with round-trip fidelity tests.
4. **Prototype n8n DI bootstrap** — `npm install n8n-core n8n-workflow @n8n/di` and verify we can `Container.set()` all required services and construct a `WorkflowExecute` instance.
5. **Prototype node loading** — Use `LazyPackageDirectoryLoader` against installed `n8n-nodes-base` to enumerate available nodes.
6. **Build the execution service** — Wire up `WorkflowExecute.run()` with tenant-scoped `IWorkflowExecuteAdditionalData` and verify a simple workflow executes end-to-end.
