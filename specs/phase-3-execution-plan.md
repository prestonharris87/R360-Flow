# Phase 3 Execution Plan: Embed n8n Execution Engine

## Summary

Phase 3 integrates n8n npm packages as unmodified dependencies. Delivers: DI bootstrap, node registry, credentials helper, lifecycle hooks, execution service, node palette API, custom R360 nodes, and API integration.

**Cardinal Rule:** n8n packages are UNMODIFIED npm dependencies. NEVER fork, patch, or import from n8n/ source.

## Tasks

### Task 1: Package Scaffolding + n8n Dependencies
- Create packages/execution-engine/ with pinned n8n deps
- Size: Small | Deps: None

### Task 2: Cardinal Rule CI Script
- scripts/check-cardinal-rule.sh + test
- Size: Small | Deps: Task 1

### Task 3: DI Container Bootstrap
- packages/execution-engine/src/bootstrap.ts
- Set env vars, Container.get(InstanceSettings), BinaryDataService init
- Size: Medium | Deps: Task 1

### Task 4: Node Registry (R360NodeTypes)
- INodeTypes impl using LazyPackageDirectoryLoader
- Size: Medium | Deps: Task 3

### Task 5: Tenant Credentials Helper
- ICredentialsHelper impl with per-tenant encryption
- MUST use salt "r360-tenant-{tenantId}" (matching Phase 1 API)
- Size: Large | Deps: Task 1

### Task 6: Lifecycle Hooks Factory
- ExecutionLifecycleHooks with DB persistence
- Size: Medium | Deps: Task 1

### Task 7: Execution Service
- WorkflowExecute.run() wrapper with tenant-scoped additionalData
- Size: Large | Deps: Tasks 3, 4, 5, 6

### Task 8: Node Palette API
- INodeTypeDescription -> WB palette format + GET /api/nodes
- Size: Medium | Deps: Task 4

### Task 9: Custom R360 Nodes
- AssignInspection, RecordAction, DocumentAction
- Size: Medium | Deps: Task 4

### Task 10: API Execution Wiring
- Wire execution engine into POST /api/workflows/:id/execute
- Size: Medium | Deps: Task 7

### Task 11: E2E Execution Tests
- Full pipeline tests + tenant isolation
- Size: Medium | Deps: Task 7

### Task 12: Final Validation
- All tests, typecheck, Cardinal Rule
- Size: Small | Deps: All

## Dependency Graph
Task 1 -> Tasks 2,3,5,6 (parallel)
Task 3 -> Task 4 -> Tasks 8,9 (parallel)
Tasks 3,4,5,6 -> Task 7 -> Tasks 10,11 (parallel)
All -> Task 12

## Critical Warnings
1. Encryption salt: Use "r360-tenant-{tenantId}" (NOT "r360-tenant-key-")
2. ICredentialsHelper: Has extra abstract methods (getCredentialsProperties, 4-param updateCredentialsOauthTokenData)
3. InstanceSettings: Auto-constructs via DI, set env vars before Container.get()
4. WorkflowExecute.run(): Returns PCancelable, not async
5. hooks property: TypeScript declaration merged from n8n-core
