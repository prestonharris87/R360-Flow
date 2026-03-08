# Plan: Fix Server Startup — ESM to CJS Migration

## Task Description
The R360 Flow API server cannot start. Running `pnpm dev` (tsx) or `pnpm start` (node) both fail due to incompatibility between our ESM package configuration and n8n-workflow's ESM entry point, which has extensionless internal imports that break under Node.js native ESM resolution.

## Objective
Fix ALL issues preventing the server from starting, then successfully start the server on the default port (3100).

## Problem Statement
All 6 R360 packages declare `"type": "module"` in their package.json. This forces Node.js to use ESM resolution, which picks up n8n-workflow's `"import"` conditional export (`dist/esm/index.js`). That ESM build has extensionless internal imports (e.g., `import * as LoggerProxy from './logger-proxy'` instead of `'./logger-proxy.js'`), which violates Node.js ESM resolution rules. This causes:

- **With `node`**: `ERR_MODULE_NOT_FOUND: Cannot find module '.../n8n-workflow/dist/esm/logger-proxy'`
- **With `tsx`**: `SyntaxError: The requested module 'n8n-workflow' does not provide an export named 'ICredentials'` (cascading failure from the same root cause)

The n8n-workflow CJS entry point (`dist/cjs/index.js`) works perfectly — n8n itself uses CJS at runtime.

## Solution Approach
Convert all server-side packages from ESM to CommonJS. This is a mechanical transformation:

1. Remove `"type": "module"` from all package.json files
2. Update `tsconfig.base.json` to emit CommonJS (`"module": "CommonJS"`, `"moduleResolution": "Node10"`)
3. Remove `.js` extensions from all local imports (~234 import statements across ~90 files)
4. Replace 2 uses of `import.meta.url` with CJS equivalents (`__filename`, `__dirname`)
5. Rebuild all packages and verify the server starts

This is the correct approach because:
- n8n packages are designed to work with CJS (n8n itself uses CJS)
- TypeScript source code still uses `import`/`export` syntax — only compiled output changes
- No functional changes to business logic

## Relevant Files

### Configuration Files (must change)
- `tsconfig.base.json` — Change `module` and `moduleResolution` to CommonJS/Node10
- `packages/api/package.json` — Remove `"type": "module"`
- `packages/db/package.json` — Remove `"type": "module"`
- `packages/types/package.json` — Remove `"type": "module"`
- `packages/json-translator/package.json` — Remove `"type": "module"`
- `packages/execution-engine/package.json` — Remove `"type": "module"`
- `packages/nodes-r360/package.json` — Remove `"type": "module"`

### ESM-Specific Code (must change)
- `packages/api/src/server.ts:561-564` — Replace `import.meta.url` with `require.main` check
- `packages/execution-engine/src/node-types.ts:13` — Replace `createRequire(import.meta.url)` with native `require`

### Files with `.js` Extension Imports (must strip `.js` from import paths)
~90 source files across all packages. The full list (non-test files):
- `packages/api/src/server.ts`
- `packages/api/src/billing/plan-limits.ts`
- `packages/api/src/realtime/ws-server.ts`
- `packages/api/src/routes/*.ts` (admin-routes, billing-routes, credentials, docs-routes, executions, health-routes, template-routes, theme-routes, webhook-routes, workflows)
- `packages/api/src/scheduler/scheduler-service.ts`
- `packages/api/src/webhooks/webhook-lifecycle.ts`
- `packages/api/src/webhooks/webhook-router.ts`
- `packages/db/src/connection.ts`
- `packages/db/src/index.ts`
- `packages/db/src/schema/*.ts`
- `packages/db/src/stores/*.ts`
- `packages/execution-engine/src/index.ts`
- `packages/execution-engine/src/execution-service.ts`
- `packages/execution-engine/src/node-palette.ts`
- `packages/execution-engine/src/queue/execution-queue.ts`
- `packages/execution-engine/src/queue/execution-worker.ts`
- `packages/json-translator/src/*.ts`
- `packages/nodes-r360/src/index.ts`
- `packages/types/src/index.ts`
- All `__tests__/**/*.test.ts` files

## Implementation Phases

### Phase 1: Foundation — Configuration Changes
Update tsconfig and all package.json files to switch from ESM to CJS.

### Phase 2: Core Implementation — Code Changes
Strip `.js` extensions from all import paths and replace `import.meta` usages with CJS equivalents.

### Phase 3: Integration & Polish — Build, Start, Verify
Clean dist directories, rebuild all packages, start the server, and verify it runs.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to do the building, validating, testing, deploying, and other tasks.

### Team Members

- Builder
  - Name: config-updater
  - Role: Update tsconfig.base.json and all 6 package.json files to switch from ESM to CJS
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: import-fixer
  - Role: Strip `.js` extensions from all import/export paths and replace `import.meta` usages across all source files
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: server-starter
  - Role: Clean dist, rebuild all packages, and start the server
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: startup-validator
  - Role: Validate the server starts successfully and responds to health checks
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Update Configuration Files
- **Task ID**: update-configs
- **Depends On**: none
- **Assigned To**: config-updater
- **Agent Type**: builder
- **Parallel**: false
- Edit `tsconfig.base.json`: change `"module": "Node16"` to `"module": "CommonJS"` and `"moduleResolution": "Node16"` to `"moduleResolution": "Node10"`
- Edit each of these 6 package.json files to remove the `"type": "module"` line:
  - `packages/api/package.json`
  - `packages/db/package.json`
  - `packages/types/package.json`
  - `packages/json-translator/package.json`
  - `packages/execution-engine/package.json`
  - `packages/nodes-r360/package.json`
- Do NOT change any other fields in these files

### 2. Strip `.js` Extensions from All Imports
- **Task ID**: strip-js-extensions
- **Depends On**: update-configs
- **Assigned To**: import-fixer
- **Agent Type**: builder
- **Parallel**: false
- In ALL `.ts` files under `packages/*/src/` (including test files), find every `from '...'` or `from "..."` import/export that ends with `.js'` or `.js"` and remove the `.js` extension
- This applies to local relative imports only (e.g., `from './routes/health.js'` becomes `from './routes/health'`). Do NOT touch imports from npm packages (e.g., `from 'n8n-workflow'`, `from 'fastify'`)
- Use `sed` or similar to do this in bulk: `find packages/*/src -name '*.ts' -exec sed -i '' "s/from '\(\.\.\/[^']*\)\.js'/from '\1'/g" {} +` and similar for double quotes and `./` paths
- Verify: run `grep -rn "from '\..*\.js'" packages/*/src/ --include="*.ts" | wc -l` — should return 0

### 3. Replace `import.meta` Usages
- **Task ID**: fix-import-meta
- **Depends On**: strip-js-extensions
- **Assigned To**: import-fixer (resume)
- **Agent Type**: builder
- **Parallel**: false
- In `packages/api/src/server.ts` (lines 561-564), replace the ESM main-module check:
  ```typescript
  // BEFORE (ESM):
  const isMain =
    import.meta.url === `file://${process.argv[1]}` ||
    process.argv[1]?.endsWith('/server.js') ||
    process.argv[1]?.endsWith('/server.ts');

  // AFTER (CJS):
  const isMain =
    require.main === module ||
    process.argv[1]?.endsWith('/server.js') ||
    process.argv[1]?.endsWith('/server.ts');
  ```
- In `packages/execution-engine/src/node-types.ts` (line 13), replace the ESM createRequire:
  ```typescript
  // BEFORE (ESM):
  import { createRequire } from 'module';
  const require = createRequire(import.meta.url);

  // AFTER (CJS): Remove both lines entirely — `require` is globally available in CJS
  ```
  Also remove the `import { createRequire } from 'module';` on line 2 if present.
- Verify: `grep -rn "import\.meta" packages/*/src/ --include="*.ts"` should return 0 results (excluding node_modules and dist)

### 4. Clean and Rebuild
- **Task ID**: rebuild
- **Depends On**: fix-import-meta
- **Assigned To**: server-starter
- **Agent Type**: builder
- **Parallel**: false
- Run `rm -rf packages/*/dist` to clean all compiled output
- Run `pnpm --filter @r360/types build && pnpm --filter @r360/db build && pnpm --filter @r360/json-translator build && pnpm --filter @r360/execution-engine build && pnpm --filter @r360/api build` to rebuild in dependency order
- All builds must succeed with zero errors

### 5. Start the Server
- **Task ID**: start-server
- **Depends On**: rebuild
- **Assigned To**: server-starter (resume)
- **Agent Type**: builder
- **Parallel**: false
- Run `pnpm --filter @r360/api start` (which runs `node dist/server.js`)
- The server should start and log `Server listening on 0.0.0.0:3100`
- If it fails, diagnose and fix any remaining issues (likely additional ESM artifacts missed in previous steps)
- Once running, verify with `curl http://localhost:3100/health` (should return 200)

### 6. Final Validation
- **Task ID**: validate-all
- **Depends On**: start-server
- **Assigned To**: startup-validator
- **Agent Type**: validator
- **Parallel**: false
- Verify the server process is running
- Run `curl http://localhost:3100/health` and confirm 200 OK response
- Verify `pnpm --filter @r360/types build && pnpm --filter @r360/db build && pnpm --filter @r360/json-translator build && pnpm --filter @r360/execution-engine build && pnpm --filter @r360/api build` completes with no errors
- Check `grep -rn "import\.meta" packages/*/src/ --include="*.ts"` returns 0 results
- Check `grep -rn "from '\..*\.js'" packages/*/src/ --include="*.ts" | wc -l` returns 0
- Check no package.json files in `packages/*/` contain `"type": "module"`

## Acceptance Criteria
- `pnpm --filter @r360/api start` successfully starts the server
- Server responds to `curl http://localhost:3100/health` with 200 OK
- All 5 server-side packages build with `tsc -b` (zero errors)
- No ESM-specific code remains (`import.meta`, `"type": "module"`)
- No `.js` extensions in local import paths

## Validation Commands
```bash
# 1. All packages build cleanly
pnpm --filter @r360/types build && pnpm --filter @r360/db build && pnpm --filter @r360/json-translator build && pnpm --filter @r360/execution-engine build && pnpm --filter @r360/api build

# 2. Server starts (run in background, check health, then kill)
pnpm --filter @r360/api start &
sleep 3
curl -s http://localhost:3100/health
kill %1

# 3. No remaining ESM artifacts
grep -rn "import\.meta" packages/*/src/ --include="*.ts" | grep -v node_modules | grep -v dist
grep -l '"type": "module"' packages/*/package.json
grep -rn "from '\..*\.js'" packages/*/src/ --include="*.ts" | wc -l
```

## Notes
- The `workflowbuilder/` package is NOT part of this migration — it's a separate frontend project with its own build system
- The `n8n/` directory is a read-only reference copy and is never imported from
- Tests use vitest which has its own module resolution (vitest handles both ESM and CJS), so tests should continue to work after this change
- The `dev` script uses tsx which can handle both ESM and CJS, so `pnpm dev` will also work after this change
- If any test files fail after the migration due to vitest config, adjust `vitest.config.ts` files to remove any ESM-specific settings
- n8n packages (n8n-workflow, n8n-core, n8n-nodes-base) are unmodified npm dependencies per the Cardinal Rule — we are only changing OUR code to be compatible with their CJS runtime
