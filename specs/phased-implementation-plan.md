# Plan: R360 Flow Phased Implementation Documents

## Task Description

Create a complete set of phased implementation documents (Phase1.md through Phase6.md) for the R360 Flow multi-tenant SaaS platform. Each phase document must be a self-contained, executable build plan with TDD methodology baked into every step. The documents must be so detailed and self-correcting that executing all six phases in sequence produces a production-ready system.

The phases map to the plan defined in `plan-overview.md`:
- **Phase 1**: Foundation — API Server + Database (no n8n)
- **Phase 2**: Connect Workflow Builder UI to API (no n8n execution)
- **Phase 3**: Embed n8n Execution Engine (n8n integration)
- **Phase 4**: Execution Infrastructure (queuing, webhooks, scheduling)
- **Phase 5**: Multi-Tenant Hardening (security, billing, admin)
- **Phase 6**: Polish & Launch (templates, versioning, monitoring)

## Objective

When this plan is fully executed, the `specs/` directory will contain Phase1.md through Phase6.md. Each document will be detailed enough that a development team can execute it end-to-end with zero ambiguity, producing tested, production-grade code at every step.

## Problem Statement

The `plan-overview.md` provides excellent architectural guidance but lacks the granular, step-by-step execution detail needed for builders to implement with confidence. Without detailed phase documents:
- Developers must make assumptions about testing requirements
- There's no self-correcting feedback loop when things go wrong
- Success criteria are vague, making "done" subjective
- Integration points between phases are undefined

## Solution Approach

Create six detailed phase documents that follow a strict template emphasizing:
1. **TDD at every step** — write failing tests first, implement, verify, iterate
2. **Self-correcting instructions** — every step includes "if X fails, do Y" recovery paths
3. **Explicit success criteria** — measurable, verifiable conditions at every checkpoint
4. **Integration verification** — each phase validates compatibility with prior phases
5. **Cardinal Rule enforcement** — n8n packages remain unmodified throughout

Each phase document will follow a consistent internal structure (defined below) that makes them independently executable while maintaining cross-phase coherence.

## Relevant Files

Use these files to complete the task:

- `plan-overview.md` — The master implementation plan with architecture, phases, and technical decisions. This is the **primary source of truth** for all phase content.
- `CLAUDE.md` — Project-level instructions including the Cardinal Rule, architecture overview, multi-tenancy boundaries, key integration points, and project structure.
- `workflowbuilder/apps/types/src/common.ts` — `DiagramModel` type definition (lines 42-46) — critical for Phase 2's JSON translation layer.
- `workflowbuilder/apps/types/src/node-data.ts` — `WorkflowBuilderNode`, `WorkflowBuilderEdge`, `NodeDefinition` types — critical for Phase 2-3 node mapping.
- `workflowbuilder/apps/types/src/node-schema.ts` — `NodeSchema` type — critical for Phase 3's schema-driven property panels.
- `workflowbuilder/apps/types/src/node-types.ts` — `NodeType` enum — critical for Phase 3's node palette.
- `workflowbuilder/apps/frontend/src/app/features/plugins-core/adapters/adapter-functions.ts` — Plugin registration via `registerFunctionDecorator` — critical for Phase 3's node registration.
- `workflowbuilder/apps/frontend/src/app/data/palette.ts` — Current palette configuration — reference for Phase 3.
- `workflowbuilder/apps/frontend/src/app/data/nodes/` — Existing node definitions (action, trigger, conditional, etc.) — patterns to follow for Phase 3.
- `n8n/packages/core/src/execution-engine/workflow-execute.ts` — READ-ONLY reference for `WorkflowExecute` constructor signature — Phase 3.
- `n8n/packages/workflow/src/interfaces.ts` — READ-ONLY reference for `INodeTypes`, `ICredentialsHelper`, `IWorkflowExecuteAdditionalData` — Phase 3.
- `n8n/packages/core/src/nodes-loader/lazy-package-directory-loader.ts` — READ-ONLY reference for node loading — Phase 3.

### New Files

- `specs/Phase1.md` — Foundation: API Server + Database
- `specs/Phase2.md` — Connect Workflow Builder UI to API
- `specs/Phase3.md` — Embed n8n Execution Engine
- `specs/Phase4.md` — Execution Infrastructure
- `specs/Phase5.md` — Multi-Tenant Hardening
- `specs/Phase6.md` — Polish & Launch

## Implementation Phases

### Phase 1: Template & Standards Definition
Define the exact template structure every PhaseX.md must follow, including TDD patterns, success criteria format, self-correcting instruction patterns, and cross-phase verification checkpoints.

### Phase 2: Core Phase Document Creation
Create Phase1.md through Phase6.md following the template. Each document pulls its content from the corresponding section of `plan-overview.md` but expands it with granular steps, test specifications, and recovery procedures.

### Phase 3: Cross-Phase Validation
Validate that all six documents form a coherent whole — outputs of each phase match inputs expected by the next, no gaps in coverage, and the full set covers every requirement in `plan-overview.md`.

---

## PhaseX.md Template Standard

Every phase document MUST follow this internal structure. Builders creating phase documents MUST adhere to this template exactly.

```markdown
# Phase X: [Phase Title]

## Overview
- **Goal**: One-sentence description of what this phase achieves
- **Prerequisites**: What must exist before this phase starts (outputs of prior phases)
- **Cardinal Rule Checkpoint**: Specific guidance on n8n package usage for this phase
- **Duration Estimate**: Approximate time range
- **Key Deliverables**: Bulleted list of concrete outputs

## Environment Setup
- Required tools and versions
- Environment variables needed
- Infrastructure prerequisites (DB, Redis, etc.)
- Setup verification commands with expected output

## Step X.Y: [Step Title]

### Objective
What this step accomplishes.

### TDD Implementation
1. **Write failing tests first**
   - Exact test file path: `packages/[pkg]/src/__tests__/[file].test.ts`
   - Test descriptions with expected behavior
   - Code block with test skeleton
2. **Implement the feature**
   - Exact file path: `packages/[pkg]/src/[file].ts`
   - Implementation guidance with code examples
   - Key interfaces/types to implement
3. **Run tests and verify**
   ```bash
   cd packages/[pkg] && pnpm test -- --testPathPattern=[file]
   ```
4. **If tests fail:**
   - Common failure: [description] -> Fix: [solution]
   - Common failure: [description] -> Fix: [solution]
   - If neither applies: check error output, compare with test expectations, debug iteratively
5. **Refactor if needed**
   - Check for duplication
   - Ensure naming follows project conventions
   - Verify no unnecessary complexity
6. **Repeat until all green**

### Success Criteria
- [ ] All tests in `[file].test.ts` passing
- [ ] TypeScript compilation: `pnpm tsc --noEmit` exits 0
- [ ] Linting: `pnpm lint` exits 0
- [ ] [Specific measurable criterion]
- [ ] [Specific measurable criterion]

### Verification Commands
```bash
# Run step-specific tests
pnpm test -- --testPathPattern=[pattern]

# Type check
pnpm tsc --noEmit

# Specific verification
curl -X GET http://localhost:3000/api/[endpoint] | jq .
# Expected: { "status": "ok", ... }
```

---

## Phase Completion Checklist
- [ ] All steps completed and verified
- [ ] All tests passing: `pnpm test`
- [ ] Full type check: `pnpm tsc --noEmit`
- [ ] Lint clean: `pnpm lint`
- [ ] Integration with prior phases verified
- [ ] No n8n packages modified (Cardinal Rule)
- [ ] Code coverage > 80%: `pnpm test -- --coverage`
- [ ] [Phase-specific criteria]

## Rollback Procedure
If this phase fails and must be reverted:
1. [Specific rollback steps]
2. [How to return to prior phase's stable state]
```

---

## Phase Content Specifications

### Phase1.md Content Requirements

**Source**: `plan-overview.md` sections 1.1-1.4

**Steps to include (each following TDD template above):**

1. **Step 1.1: Monorepo Scaffolding**
   - Initialize pnpm workspace config encompassing `workflowbuilder/` and `packages/`
   - Create `packages/api/`, `packages/types/`, `packages/db/` directories
   - Set up TypeScript config (base tsconfig + per-package extends)
   - Set up Vitest as test runner
   - Set up ESLint + Prettier
   - **Tests**: Verify workspace resolves all packages, TypeScript compiles, lint passes
   - **Success**: `pnpm install` succeeds, `pnpm -r exec echo OK` prints OK for each package

2. **Step 1.2: Infrastructure Setup**
   - Docker Compose for PostgreSQL and Redis (local dev)
   - Database connection module with connection pooling (pg or postgres.js)
   - Health check endpoint
   - **Tests**: DB connection test, Redis connection test, health check responds 200
   - **Success**: `docker compose up -d` starts services, health check returns OK

3. **Step 1.3: Database Schema & Migrations**
   - Choose migration tool (Drizzle ORM recommended — type-safe, lightweight)
   - Create all tables from plan-overview.md section 1.2: tenants, users, workflows, credentials, executions, execution_steps, webhooks
   - ALL tables MUST have `tenant_id` column (except `tenants` itself)
   - Add indexes on tenant_id + common query patterns
   - **Tests**: Migration up/down round-trip, schema validation, tenant_id existence check on every table
   - **Success**: `pnpm db:migrate` creates all tables, `pnpm db:rollback` removes them cleanly

4. **Step 1.4: Shared Types Package**
   - Create `packages/types/` with workflow JSON schema types
   - Import and re-export relevant types from `workflowbuilder/apps/types`
   - Define API request/response types
   - **Tests**: TypeScript compilation, type compatibility checks
   - **Success**: Types importable from `@r360/types` in other packages

5. **Step 1.5: Auth & Tenant Middleware**
   - Integrate Clerk/Auth0/Supabase Auth
   - JWT verification middleware
   - Tenant context extraction from JWT claims
   - `tenantId` available on every authenticated request
   - Role-based access control: owner, admin, member, viewer
   - **Tests**: Mock JWT verification, tenant extraction from valid/invalid tokens, role checks
   - **Success**: Authenticated requests carry tenantId, unauthenticated requests get 401

6. **Step 1.6: Workflow CRUD API**
   - POST /api/workflows — create (tenant-scoped)
   - GET /api/workflows — list (tenant-scoped, paginated)
   - GET /api/workflows/:id — get single (tenant-scoped)
   - PUT /api/workflows/:id — update (tenant-scoped)
   - DELETE /api/workflows/:id — soft delete (tenant-scoped)
   - Input validation on all endpoints
   - **Tests**: Full CRUD cycle, tenant isolation (tenant A can't see tenant B's workflows), validation errors, pagination
   - **Success**: All endpoints working, cross-tenant access returns 404, input validation rejects bad data

7. **Step 1.7: Credential CRUD API**
   - CRUD endpoints for credentials (tenant-scoped)
   - Encryption at rest (per-tenant encryption key derivation)
   - Credential type validation
   - **Tests**: CRUD cycle, encryption/decryption round-trip, cross-tenant isolation, type validation
   - **Success**: Credentials stored encrypted, retrievable only by owning tenant

8. **Step 1.8: Execution History API**
   - POST /api/workflows/:id/execute — trigger execution (stub — returns "queued" for now)
   - GET /api/executions — list executions (tenant-scoped)
   - GET /api/executions/:id — execution detail with step log
   - **Tests**: Execution creation, listing, detail retrieval, tenant isolation
   - **Success**: Execution records created and queryable, tenant-isolated

9. **Step 1.9: Phase 1 Integration Test Suite**
   - End-to-end tests covering full API surface
   - Multi-tenant isolation stress tests
   - Database migration round-trip
   - **Success**: All integration tests pass, coverage > 80%

### Phase2.md Content Requirements

**Source**: `plan-overview.md` sections 2.1-2.4

**Steps to include:**

1. **Step 2.1: API Client Module**
   - Create fetch wrapper with auth headers in Workflow Builder frontend
   - Tenant context injection from auth session
   - Error handling and retry logic
   - **Tests**: Mock API calls, auth header injection, error handling paths

2. **Step 2.2: Auth UI Integration**
   - Login/signup flow using auth provider components
   - Protected route wrapper
   - Tenant switching UI (if multi-tenant user)
   - **Tests**: Auth flow renders, redirects unauthenticated users, tenant context available after login

3. **Step 2.3: Workflow Persistence**
   - Replace local JSON import/export with API-backed save/load
   - Workflow list dashboard
   - Auto-save with debounce
   - Keep JSON export as secondary feature
   - **Tests**: Save workflow -> reload -> compare, list view renders correctly, auto-save triggers

4. **Step 2.4: JSON Translation Layer (packages/json-translator/)**
   - Bidirectional: `DiagramModel <-> n8n WorkflowParameters`
   - Map Workflow Builder nodes[] to n8n nodes[] with correct type mapping
   - Map Workflow Builder edges[] to n8n connections{} (adjacency map)
   - Map node properties/schemas to n8n parameters
   - Handle layout metadata (positions, viewport)
   - **Tests**: Round-trip fidelity (WB -> n8n -> WB == original), edge cases (empty workflow, single node, complex branching), snapshot tests for known workflows
   - **Critical**: This is the hardest step in Phase 2. Include multiple sub-steps with incremental testing.

5. **Step 2.5: Phase 2 Integration Tests**
   - Frontend <-> API integration tests
   - JSON translator round-trip with real workflow data
   - Auth flow end-to-end
   - **Success**: Full save/load cycle works, JSON round-trips with zero data loss

### Phase3.md Content Requirements

**Source**: `plan-overview.md` sections 3.1-3.7

**IMPORTANT**: This phase introduces n8n npm packages. Every step MUST reference the Cardinal Rule. Include a CI check that verifies no files in `n8n/` are imported.

**Steps to include:**

1. **Step 3.1: Install n8n Packages**
   - `pnpm add n8n-workflow n8n-core n8n-nodes-base @n8n/di @n8n/config @n8n/backend-common @n8n/errors @n8n/constants @n8n/decorators` in `packages/execution-engine/`
   - Pin exact versions
   - **Tests**: Import test — can import from each package, no runtime errors
   - **Cardinal Rule Test**: Automated check that no source file imports from `n8n/` directory

2. **Step 3.2: DI Container Bootstrap**
   - `packages/execution-engine/src/bootstrap.ts`
   - Container.set for InstanceSettings, Logger, ErrorReporter, BinaryDataService
   - Run ONCE at startup
   - **Tests**: Bootstrap succeeds, all required services resolvable via Container.get, double-bootstrap is idempotent

3. **Step 3.3: Node Registry (R360NodeTypes)**
   - `packages/execution-engine/src/node-types.ts`
   - Implement INodeTypes using LazyPackageDirectoryLoader
   - Load from installed n8n-nodes-base
   - Cache loaded types
   - **Tests**: Can enumerate available node types, specific known nodes loadable (ManualTrigger, HttpRequest, Set), type descriptions match expected schema

4. **Step 3.4: Tenant Credentials Helper**
   - `packages/execution-engine/src/credentials-helper.ts`
   - TenantCredentialsHelper implements ICredentialsHelper
   - Per-tenant encryption key derivation
   - Queries only current tenant's credentials
   - **Tests**: Credential resolution for correct tenant, rejection for wrong tenant, encryption/decryption round-trip, credential type loading

5. **Step 3.5: Execution Service**
   - `packages/execution-engine/src/execution-service.ts`
   - Construct Workflow object from translated JSON
   - Build tenant-scoped IWorkflowExecuteAdditionalData
   - Call WorkflowExecute.run()
   - Capture results via lifecycle hooks
   - **Tests**: Execute simple ManualTrigger -> Set -> end workflow, verify output data correct, verify execution recorded in DB

6. **Step 3.6: Lifecycle Hooks**
   - `packages/execution-engine/src/lifecycle-hooks.ts`
   - workflowExecuteBefore, nodeExecuteBefore, nodeExecuteAfter, workflowExecuteAfter
   - All hooks write to tenant-scoped DB rows
   - **Tests**: Hook fires at correct lifecycle point, data written to correct tenant's execution records

7. **Step 3.7: Node Palette API**
   - GET /api/nodes — returns available nodes converted to Workflow Builder PaletteItem format
   - INodeTypeDescription -> PaletteItem<NodeSchema> conversion
   - Category filtering
   - **Tests**: API returns node list, known node types present, schema matches PaletteItem format

8. **Step 3.8: Custom R360 Nodes**
   - packages/nodes-r360/ — AssignInspection, RecordAction, DocumentAction
   - Register in both n8n registry and Workflow Builder plugin system
   - **Tests**: Custom nodes loadable, executable, registered in palette

9. **Step 3.9: End-to-End Execution Test**
   - Create workflow via API -> translate -> execute via n8n -> verify results
   - Full pipeline from UI JSON to execution output
   - **Success**: A workflow created in Workflow Builder format executes successfully via n8n engine

### Phase4.md Content Requirements

**Source**: `plan-overview.md` sections 4.1-4.5

**Steps to include:**

1. **Step 4.1: BullMQ Job Queue Setup**
   - Redis connection, BullMQ queue and worker configuration
   - Per-tenant rate limiting (concurrency limits, rate limits)
   - Priority queues by plan tier
   - **Tests**: Jobs enqueue and process, rate limits enforced, priority ordering correct

2. **Step 4.2: Execution Sandboxing**
   - isolated-vm or container-level isolation for Code nodes
   - Network policies for execution workers
   - Per-node and per-workflow timeouts
   - **Tests**: Malicious code contained, timeout enforcement, network restrictions work

3. **Step 4.3: Webhook Handling**
   - Tenant-scoped webhook routes: POST /webhook/{tenantId}/{webhookPath}
   - Registration/deregistration on workflow activate/deactivate
   - Signature verification
   - **Tests**: Webhook triggers workflow execution, tenant isolation, deregistration stops delivery

4. **Step 4.4: Scheduled Workflows**
   - Cron-based trigger system
   - Timezone-aware scheduling
   - Scheduler service that checks and enqueues due workflows
   - **Tests**: Cron expression evaluation, scheduled workflow fires at correct time, timezone handling

5. **Step 4.5: Real-Time Execution Monitoring**
   - WebSocket connection for live execution status
   - Step-by-step execution view in UI
   - Execution log streaming
   - **Tests**: WebSocket connects, receives execution updates in real-time, UI renders step progress

6. **Step 4.6: Phase 4 Load Testing**
   - Multi-tenant concurrent execution load test
   - Queue saturation behavior
   - Rate limiting under load
   - **Success**: System handles 100+ concurrent executions across 10+ tenants without degradation

### Phase5.md Content Requirements

**Source**: `plan-overview.md` sections 5.1-5.4

**Steps to include:**

1. **Step 5.1: Data Isolation Audit**
   - Automated cross-tenant data leakage tests
   - Query audit — verify ALL DB queries include tenant_id
   - Audit logging for data access
   - **Tests**: Cross-tenant access attempts fail, audit logs capture access patterns

2. **Step 5.2: Billing & Usage Metering**
   - Stripe integration for subscription management
   - Per-tenant usage tracking (workflow count, execution count, execution minutes)
   - Plan-based limits (free, pro, enterprise)
   - Overage handling and usage alerts
   - **Tests**: Usage tracked accurately, plan limits enforced, Stripe webhook processing, overage notifications

3. **Step 5.3: Admin & Onboarding**
   - Tenant provisioning flow (signup -> create org -> invite team)
   - Tenant settings page
   - Admin dashboard for platform operators
   - **Tests**: Provisioning flow creates tenant, settings update correctly, admin dashboard shows correct data

4. **Step 5.4: Security Hardening**
   - Penetration testing for tenant isolation
   - Credential encryption audit
   - API rate limiting and abuse prevention
   - Security headers and CORS configuration
   - **Tests**: Pen test report with zero critical findings, rate limiting enforced, CORS correctly configured

5. **Step 5.5: Phase 5 Security Test Suite**
   - Comprehensive security tests
   - Cross-tenant attack scenarios
   - **Success**: All security tests pass, no cross-tenant leakage possible

### Phase6.md Content Requirements

**Source**: `plan-overview.md` Phase 6

**Steps to include:**

1. **Step 6.1: Workflow Templates Gallery**
   - Template CRUD (global and per-tenant)
   - Template import into workspace
   - **Tests**: Template creation, listing, import produces valid workflow

2. **Step 6.2: Error Handling UX**
   - Retry failed executions
   - Error notifications (in-app, email)
   - Execution error detail view
   - **Tests**: Retry mechanism works, notifications delivered, error details render correctly

3. **Step 6.3: Workflow Versioning**
   - Version history for workflows
   - Rollback to previous versions
   - Diff view between versions
   - **Tests**: Version created on save, rollback restores previous state, diff accurate

4. **Step 6.4: Theming & White-Label**
   - Custom branding configuration via Workflow Builder's theming system
   - Per-tenant theme settings
   - **Tests**: Theme changes apply, per-tenant themes isolated

5. **Step 6.5: Documentation & API Reference**
   - API documentation (OpenAPI/Swagger)
   - User guide
   - Developer documentation
   - **Tests**: OpenAPI spec validates, all endpoints documented

6. **Step 6.6: Monitoring & Alerting**
   - Datadog/Sentry integration
   - Health check dashboard
   - Alerting rules for critical metrics
   - **Tests**: Errors reported to Sentry, metrics flowing to Datadog, alerts fire on thresholds

7. **Step 6.7: Production Load Testing**
   - Full system load test
   - Multi-tenant scale test
   - Performance benchmarks documented
   - **Success**: System handles production-level load, all SLAs met

8. **Step 6.8: Production Readiness Checklist**
   - All phases verified
   - All tests passing
   - Security audit complete
   - Monitoring in place
   - Documentation complete
   - **Success**: System is production-ready

---

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to do the building, validating, testing, deploying, and other tasks.
  - This is critical. Your job is to act as a high level director of the team, not a builder.
  - Your role is to validate all work is going well and make sure the team is on track to complete the plan.
  - You'll orchestrate this by using the Task* Tools to manage coordination between the team members.
  - Communication is paramount. You'll use the Task* Tools to communicate with the team members and ensure they're on track to complete the plan.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

- Builder
  - Name: phase-doc-writer-1
  - Role: Write Phase1.md and Phase2.md (foundation and UI connection phases)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: phase-doc-writer-2
  - Role: Write Phase3.md (n8n execution engine integration — the most complex phase)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: phase-doc-writer-3
  - Role: Write Phase4.md and Phase5.md (infrastructure and hardening phases)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: phase-doc-writer-4
  - Role: Write Phase6.md (polish and launch phase)
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: codebase-researcher
  - Role: Research the existing codebase (Workflow Builder types, n8n interfaces, project structure) and provide reference material to other builders
  - Agent Type: general-purpose
  - Resume: true

- Builder
  - Name: cross-phase-validator
  - Role: Validate all six phase documents for completeness, coherence, and cross-phase compatibility
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Research Existing Codebase
- **Task ID**: research-codebase
- **Depends On**: none
- **Assigned To**: codebase-researcher
- **Agent Type**: general-purpose
- **Parallel**: true (can run alongside task 2)
- Read and summarize key type definitions from `workflowbuilder/apps/types/src/` (DiagramModel, NodeSchema, NodeDefinition, NodeType, WorkflowBuilderNode, WorkflowBuilderEdge)
- Read and summarize key n8n interfaces from `n8n/packages/workflow/src/interfaces.ts` (INodeTypes, ICredentialsHelper, IWorkflowExecuteAdditionalData, IWorkflowBase, INode, IConnections)
- Read and summarize `n8n/packages/core/src/execution-engine/workflow-execute.ts` constructor signature and run() method
- Read and summarize `n8n/packages/core/src/nodes-loader/lazy-package-directory-loader.ts`
- Read and summarize the plugin registration pattern from `workflowbuilder/apps/frontend/src/app/features/plugins-core/adapters/adapter-functions.ts`
- Read existing node definitions in `workflowbuilder/apps/frontend/src/app/data/nodes/` to understand patterns
- **Output**: A structured summary document with exact type signatures, interface requirements, and code patterns that phase document writers will reference

### 2. Write Phase1.md — Foundation
- **Task ID**: write-phase1
- **Depends On**: research-codebase
- **Assigned To**: phase-doc-writer-1
- **Agent Type**: builder
- **Parallel**: false (needs research results)
- Read `plan-overview.md` sections 1.1-1.4 for source content
- Follow the PhaseX.md Template Standard defined above EXACTLY
- Include all 9 steps defined in "Phase1.md Content Requirements" above
- For each step, write complete TDD instructions with:
  - Exact file paths for tests and implementation
  - Test code skeletons (actual test structure, not pseudocode)
  - Implementation guidance with code examples
  - Self-correcting "if fails" recovery instructions
  - Explicit success criteria (measurable, verifiable)
  - Verification commands with expected output
- Include Docker Compose config for PostgreSQL and Redis
- Include Drizzle schema definitions as code examples
- Include API route handler skeletons
- Phase Completion Checklist must include: all CRUD endpoints working, tenant isolation verified, >80% test coverage, DB migrations reversible
- Save to `specs/Phase1.md`

### 3. Write Phase2.md — UI Connection
- **Task ID**: write-phase2
- **Depends On**: write-phase1
- **Assigned To**: phase-doc-writer-1
- **Agent Type**: builder
- **Parallel**: false (must follow Phase 1 context)
- Read `plan-overview.md` sections 2.1-2.4
- Reference DiagramModel type from codebase research
- Follow PhaseX.md Template Standard exactly
- Include all 5 steps from "Phase2.md Content Requirements"
- The JSON Translation Layer (Step 2.4) is the most complex — break it into sub-steps:
  - Sub-step 2.4a: Node mapping (WB node types -> n8n node types)
  - Sub-step 2.4b: Connection mapping (WB edges -> n8n connections adjacency map)
  - Sub-step 2.4c: Parameter mapping (WB schema properties -> n8n node parameters)
  - Sub-step 2.4d: Reverse mapping (n8n -> WB for loading existing workflows)
  - Sub-step 2.4e: Round-trip fidelity tests
- Include snapshot test fixtures for known workflow patterns
- Prerequisites section must reference Phase 1 outputs
- Save to `specs/Phase2.md`

### 4. Write Phase3.md — n8n Execution Engine
- **Task ID**: write-phase3
- **Depends On**: research-codebase
- **Assigned To**: phase-doc-writer-2
- **Agent Type**: builder
- **Parallel**: true (can start once research complete, parallel with Phase 1/2 writing)
- Read `plan-overview.md` sections 3.1-3.7
- This is the MOST CRITICAL phase document — it must be extremely detailed
- Reference exact n8n interface signatures from codebase research
- Follow PhaseX.md Template Standard exactly
- Include all 9 steps from "Phase3.md Content Requirements"
- Every step MUST include Cardinal Rule verification:
  - No imports from `n8n/` source directory
  - Only imports from `n8n-workflow`, `n8n-core`, `n8n-nodes-base`, `@n8n/*` npm packages
  - CI check script included
- DI Bootstrap step must include exact Container.set() calls with type annotations
- Execution Service step must include complete IWorkflowExecuteAdditionalData construction
- Include a "Debugging n8n Integration" section with common errors and solutions:
  - Missing DI service registration
  - Credential resolution failures
  - Node type not found
  - Expression evaluation errors
- End-to-end test: Create workflow via API -> translate JSON -> execute via n8n -> verify results in DB
- Save to `specs/Phase3.md`

### 5. Write Phase4.md — Execution Infrastructure
- **Task ID**: write-phase4
- **Depends On**: research-codebase
- **Assigned To**: phase-doc-writer-3
- **Agent Type**: builder
- **Parallel**: true (can start once research complete)
- Read `plan-overview.md` sections 4.1-4.5
- Follow PhaseX.md Template Standard exactly
- Include all 6 steps from "Phase4.md Content Requirements"
- BullMQ configuration must include exact queue options, rate limiter config, and worker setup
- Webhook handling must detail the full lifecycle: registration, routing, execution trigger, deregistration
- Scheduled workflow section must include cron expression parsing and timezone handling
- WebSocket section must detail the protocol for real-time execution updates
- Load testing step must define specific performance benchmarks:
  - Max concurrent executions per tenant
  - P95 execution start latency
  - Queue throughput under saturation
- Save to `specs/Phase4.md`

### 6. Write Phase5.md — Multi-Tenant Hardening
- **Task ID**: write-phase5
- **Depends On**: write-phase4
- **Assigned To**: phase-doc-writer-3
- **Agent Type**: builder
- **Parallel**: false (follows Phase 4 for context continuity)
- Read `plan-overview.md` sections 5.1-5.4
- Follow PhaseX.md Template Standard exactly
- Include all 5 steps from "Phase5.md Content Requirements"
- Data isolation audit must include specific SQL query patterns to check
- Billing integration must include Stripe webhook handler code skeletons
- Security section must include specific attack scenarios to test:
  - Tenant A accessing Tenant B's workflows via API
  - Tenant A accessing Tenant B's credentials
  - Tenant A accessing Tenant B's execution results
  - Tenant A manipulating webhook paths to trigger Tenant B's workflows
  - IDOR (Insecure Direct Object Reference) attacks
- Include OWASP Top 10 checklist specific to this application
- Save to `specs/Phase5.md`

### 7. Write Phase6.md — Polish & Launch
- **Task ID**: write-phase6
- **Depends On**: research-codebase
- **Assigned To**: phase-doc-writer-4
- **Agent Type**: builder
- **Parallel**: true (can start once research complete)
- Read `plan-overview.md` Phase 6
- Follow PhaseX.md Template Standard exactly
- Include all 8 steps from "Phase6.md Content Requirements"
- Workflow versioning must use a strategy (e.g., copy-on-write or event sourcing)
- Production readiness checklist must be comprehensive — this is the final gate before launch
- Include runbook templates for common operational scenarios:
  - Tenant provisioning
  - Execution failure investigation
  - Scaling workers up/down
  - Database maintenance
- Save to `specs/Phase6.md`

### 8. Cross-Phase Validation
- **Task ID**: validate-all
- **Depends On**: write-phase1, write-phase2, write-phase3, write-phase4, write-phase5, write-phase6
- **Assigned To**: cross-phase-validator
- **Agent Type**: validator
- **Parallel**: false
- Read all six phase documents
- Verify each follows the PhaseX.md Template Standard exactly
- Verify cross-phase dependencies are correct:
  - Phase 2 references Phase 1 outputs correctly
  - Phase 3 references Phase 1 DB schema and Phase 2 JSON translator
  - Phase 4 references Phase 3 execution service
  - Phase 5 references all prior phases
  - Phase 6 references all prior phases
- Verify no gaps: every item in plan-overview.md is covered by at least one phase
- Verify no contradictions between phase documents
- Verify Cardinal Rule is consistently enforced in Phases 3-6
- Verify TDD pattern is present in every step of every phase
- Verify success criteria are measurable and verifiable in every step
- Verify self-correcting "if fails" instructions are present in every step
- Produce a validation report listing any issues found
- If issues found, create follow-up tasks for the appropriate builders to fix them

### 9. Fix Validation Issues (if any)
- **Task ID**: fix-issues
- **Depends On**: validate-all
- **Assigned To**: (assigned dynamically based on validation report)
- **Agent Type**: builder
- **Parallel**: true (multiple builders can fix different issues)
- Address any issues identified in the validation report
- Re-run validation after fixes

### 10. Final Sign-Off
- **Task ID**: final-signoff
- **Depends On**: fix-issues
- **Assigned To**: cross-phase-validator
- **Agent Type**: validator
- **Parallel**: false
- Final read of all six documents
- Verify all issues from task 8 are resolved
- Confirm the complete set forms a coherent, executable build plan
- Produce final sign-off report

## Acceptance Criteria

- [ ] `specs/Phase1.md` exists and follows template exactly — covers monorepo scaffolding, DB schema, auth, full CRUD API
- [ ] `specs/Phase2.md` exists and follows template exactly — covers API client, auth UI, workflow persistence, JSON translation layer
- [ ] `specs/Phase3.md` exists and follows template exactly — covers n8n DI bootstrap, node registry, credentials helper, execution service, lifecycle hooks, node palette, custom nodes, e2e test
- [ ] `specs/Phase4.md` exists and follows template exactly — covers BullMQ queue, sandboxing, webhooks, scheduling, real-time monitoring, load testing
- [ ] `specs/Phase5.md` exists and follows template exactly — covers data isolation audit, billing/Stripe, admin/onboarding, security hardening
- [ ] `specs/Phase6.md` exists and follows template exactly — covers templates, error UX, versioning, theming, docs, monitoring, load testing, production readiness
- [ ] Every step in every phase follows TDD: write failing tests -> implement -> run tests -> if fail debug -> refactor -> repeat
- [ ] Every step has measurable success criteria
- [ ] Every step has self-correcting "if fails" recovery instructions
- [ ] Every step has verification commands with expected output
- [ ] Cross-phase dependencies are correct and complete
- [ ] Cardinal Rule is enforced in all n8n-related phases (3-6)
- [ ] No gaps — every item in plan-overview.md is covered
- [ ] All six phases together produce a production-ready system

## Validation Commands

Execute these commands to validate the task is complete:

```bash
# Verify all phase files exist
ls -la specs/Phase{1,2,3,4,5,6}.md

# Verify each file is non-empty and substantial (>500 lines each)
wc -l specs/Phase{1,2,3,4,5,6}.md

# Verify TDD pattern appears in every phase
for f in specs/Phase{1,2,3,4,5,6}.md; do
  echo "=== $f ==="
  grep -c "Write failing tests" "$f"
  grep -c "Success Criteria" "$f"
  grep -c "Verification Commands" "$f"
  grep -c "If.*fail" "$f"
done

# Verify Cardinal Rule mentioned in Phase 3-6
for f in specs/Phase{3,4,5,6}.md; do
  echo "=== $f ==="
  grep -c "Cardinal Rule" "$f"
done

# Verify cross-phase references
grep -l "Phase 1" specs/Phase{2,3,4,5,6}.md
grep -l "Phase 2" specs/Phase{3,4,5,6}.md
grep -l "Phase 3" specs/Phase{4,5,6}.md
```

## Notes

- **Priority Order**: Phase 3 (n8n integration) is the highest-risk phase and should receive the most detailed treatment. The codebase researcher should prioritize n8n interface research.
- **Cardinal Rule**: Every builder writing Phase 3-6 documents MUST have the Cardinal Rule prominently in their context. Include it in every task prompt.
- **Template Compliance**: The PhaseX.md Template Standard is non-negotiable. The validator should reject any document that deviates from it.
- **Code Examples**: Phase documents should include actual code skeletons, not pseudocode. Builders writing n8n-related phases should reference exact interface signatures from the n8n reference copy.
- **Testing Philosophy**: Every test described in a phase document should be concrete enough that a developer could implement it without additional research. Include test descriptions, assertion patterns, and mock setup requirements.
- **Self-Correction**: The "if fails" instructions should cover the 3-5 most common failure modes for each step, based on the technology stack being used. Generic "debug and fix" is not acceptable — provide specific troubleshooting guidance.
- **Parallelism**: Phase doc writers 1-4 can work in parallel once codebase research is complete. Only Phase 2 depends on Phase 1 (same writer, sequential). Phase 5 depends on Phase 4 (same writer, sequential). All others are independent.
