# R360 Flow — CLAUDE.md

## Operating Mode: Orchestrator Only

You are an **orchestrator**. You do NOT perform work directly. ALL research, code reading, file exploration, implementation, and analysis MUST be delegated to subagents using the Agent tool.

**What you do:**
- Break tasks into discrete units of work
- Delegate each unit to a subagent with clear, specific instructions
- Synthesize subagent results into decisions and next steps
- Coordinate parallel subagent calls when tasks are independent
- Communicate status and decisions to the user

**What you do NOT do:**
- Read files directly (delegate to a subagent)
- Search the codebase directly (delegate to a subagent)
- Write or edit code directly (delegate to a subagent)
- Run shell commands directly (delegate to a subagent)
- Perform research or exploration directly (delegate to a subagent)

**Subagent delegation guidelines:**
- Give each subagent a focused, well-scoped task with clear deliverables
- Include relevant context (file paths, function names, constraints) in the subagent prompt
- Use `subagent_type: "Explore"` for research and codebase exploration
- Use the default subagent for implementation tasks (writing, editing, running commands)
- Launch independent subagents in parallel to maximize throughput
- Always pass along the Cardinal Rule and any relevant architectural constraints when a subagent will touch n8n-related code

## Cardinal Rule

n8n packages (`n8n-workflow`, `n8n-core`, `n8n-nodes-base`, `@n8n/di`, `@n8n/config`, `@n8n/backend-common`, `@n8n/errors`, `@n8n/constants`, `@n8n/decorators`) are **unmodified npm dependencies**. Every line of code in this repo must respect this constraint.

- **NEVER** fork, patch, monkey-patch, or vendor n8n source code
- **NEVER** import from `n8n/` source paths — only from installed npm packages
- **NEVER** add `n8n/` as a build dependency — it is a read-only reference copy
- **NEVER** spin up n8n server instances per tenant
- If n8n's API doesn't support something, build around it in our wrapper — do not patch n8n

## Architecture at a Glance

```
Workflow Builder (frontend) -> R360 Flow API (our code) -> n8n npm packages (unmodified)
```

- **Workflow Builder SDK** — visual editor, plugin nodes, schema-driven panels
- **R360 Flow API** — tenant-aware server, auth, credentials, billing, execution queue
- **n8n npm packages** — workflow execution engine, used as library imports

All multi-tenancy is implemented in OUR wrapper layer. n8n libraries are tenant-unaware by design.

## Multi-Tenancy Boundaries

Tenant isolation is enforced entirely in our code, at four points:

1. **Credentials** — `TenantCredentialsHelper` implements `ICredentialsHelper`, resolves only current tenant's credentials with per-tenant encryption keys
2. **Execution data** — Each `WorkflowExecute` call gets tenant-specific `IWorkflowExecuteAdditionalData` (credentials helper, webhook URLs, lifecycle hooks)
3. **Storage** — All DB tables carry `tenant_id`; n8n never touches the DB directly
4. **Resource limits** — BullMQ enforces per-tenant concurrency/rate limits before calling `WorkflowExecute.run()`

## Key Integration Points

- **DI bootstrap** (`packages/execution-engine/src/bootstrap.ts`) — `Container.set()` for `InstanceSettings`, `Logger`, `ErrorReporter`, `BinaryDataService`. Run once at startup, not per-tenant.
- **Node registry** (`packages/execution-engine/src/node-types.ts`) — `R360NodeTypes` implements `INodeTypes`, uses `LazyPackageDirectoryLoader` against installed `n8n-nodes-base`
- **Execution service** (`packages/execution-engine/src/execution-service.ts`) — constructs `Workflow`, builds tenant-scoped `additionalData`, calls `WorkflowExecute.run()`
- **Credential helper** (`packages/execution-engine/src/credentials-helper.ts`) — `TenantCredentialsHelper` implements `ICredentialsHelper`
- **JSON translation** (`packages/json-translator/`) — bidirectional `DiagramModel <-> n8n WorkflowParameters`

## Project Structure

```
R360-Flow/
  workflowbuilder/          # Workflow Builder SDK (frontend)
  packages/
    api/                    # Tenant-aware API server
    types/                  # Shared TypeScript types
    db/                     # Schema, migrations, queries
    execution-engine/       # n8n wrapper (bootstrap, execution, node types, credentials)
    json-translator/        # DiagramModel <-> n8n WorkflowParameters
    nodes-r360/             # Custom R360 n8n nodes + Workflow Builder plugins
  n8n/                      # READ-ONLY reference (not a build dependency)
  infrastructure/           # Docker, K8s configs
```

## Development Rules

- Read `plan-overview.md` for the full implementation plan and phase details
- Every DB query must include `tenant_id` filtering — no exceptions
- The `n8n/` directory is for reading source to understand APIs — never import from it, never modify it
- When adding n8n integration code, it goes in `packages/execution-engine/` behind our wrapper interfaces
- When converting n8n node types for the UI, map `INodeTypeDescription` to Workflow Builder's `PaletteItem<NodeSchema>` format
- Pin n8n package versions explicitly; test upgrades in CI before merging

## Tech Stack

- **Frontend:** React 19, @xyflow/react, Zustand, TypeScript (Workflow Builder SDK)
- **Backend:** Node.js, TypeScript, Express/Fastify
- **Database:** PostgreSQL (all tables tenant-scoped)
- **Queue:** Redis + BullMQ
- **Execution:** n8n npm packages (unmodified)
- **Auth:** Clerk/Auth0/Supabase Auth
- **Billing:** Stripe
