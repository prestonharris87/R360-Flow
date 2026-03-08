# Plan: Fix API URL Prefix Mismatch

## Task Description
The frontend pages call the API at `http://localhost:3100/workflows` but the backend routes are all prefixed with `/api/` (e.g., `/api/workflows`). This causes 404 errors on every authenticated API call from the dashboard, workflow list, executions, credentials, and settings pages.

## Objective
Fix all 7 page components to use the correct env var (`VITE_API_BASE_URL`) and correct fallback (`http://localhost:3100/api`) so API calls resolve to `/api/*` routes.

## Problem Statement
All Phase 7 page components were created with `import.meta.env.VITE_API_URL ?? 'http://localhost:3100'` but:
- The actual env var defined in `.env.development` is `VITE_API_BASE_URL` (not `VITE_API_URL`)
- The fallback is missing the `/api` path prefix
- The existing working integration (`with-integration-through-r360-api.tsx`) correctly uses `VITE_API_BASE_URL`
- The `api-client.ts` concatenates `baseUrl + path`, so `/workflows` becomes `http://localhost:3100/workflows` (404) instead of `http://localhost:3100/api/workflows`

## Solution Approach
Simple find-and-replace across 7 files: change `VITE_API_URL` to `VITE_API_BASE_URL` and update the fallback from `'http://localhost:3100'` to `'http://localhost:3100/api'`.

## Relevant Files

- `workflowbuilder/apps/frontend/src/pages/dashboard/dashboard-page.tsx` (line 19) — wrong env var + fallback
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx` (line 16) — wrong env var + fallback
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.tsx` (line 21) — wrong env var + fallback
- `workflowbuilder/apps/frontend/src/pages/executions/execution-list-page.tsx` (line 17) — wrong env var + fallback
- `workflowbuilder/apps/frontend/src/pages/executions/execution-detail-page.tsx` (line 24) — wrong env var + fallback
- `workflowbuilder/apps/frontend/src/pages/credentials/credentials-page.tsx` (line 14) — wrong env var + fallback
- `workflowbuilder/apps/frontend/src/pages/settings/settings-page.tsx` (line 10) — wrong env var + fallback (settings page only uses it for display, but should still be consistent)

### Reference Files (correct pattern)
- `workflowbuilder/apps/frontend/src/app/features/integration/components/integration-variants/with-integration-through-r360-api.tsx` (line 14) — uses `VITE_API_BASE_URL` correctly
- `workflowbuilder/apps/frontend/.env.development` — defines `VITE_API_BASE_URL=http://localhost:3100/api`
- `workflowbuilder/apps/frontend/src/api/api-client.ts` — builds URLs as `${baseUrl}${path}`

## Team Orchestration

- Single builder task — this is a straightforward find-and-replace across 7 files.
- One validator task to confirm the fix.

### Team Members

- Builder
  - Name: url-fixer
  - Role: Fix the API base URL in all 7 page components
  - Agent Type: builder
  - Resume: false

- Validator
  - Name: url-validator
  - Role: Verify all pages use correct env var and fallback, run typecheck
  - Agent Type: validator
  - Resume: false

## Step by Step Tasks

### 1. Fix API base URL in all 7 page files
- **Task ID**: fix-api-urls
- **Depends On**: none
- **Assigned To**: url-fixer
- **Agent Type**: builder
- **Parallel**: false
- In each of the 7 files listed above, replace:
  ```typescript
  import.meta.env.VITE_API_URL ?? 'http://localhost:3100'
  ```
  with:
  ```typescript
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3100/api'
  ```
- This is the ONLY change needed per file — a single string replacement on one line

### 2. Validate fix
- **Task ID**: validate-fix
- **Depends On**: fix-api-urls
- **Assigned To**: url-validator
- **Agent Type**: validator
- **Parallel**: false
- Grep all files in `workflowbuilder/apps/frontend/src/` for `VITE_API_URL` — should return ZERO matches (only `VITE_API_BASE_URL` should exist)
- Grep for `localhost:3100'` (without `/api`) in page files — should return ZERO matches
- Run `cd workflowbuilder && pnpm --filter frontend build` — should pass
- Verify the dashboard loads without 404 errors

## Acceptance Criteria
- All 7 page files use `VITE_API_BASE_URL` instead of `VITE_API_URL`
- All 7 page files have fallback `'http://localhost:3100/api'` (with `/api` suffix)
- No references to `VITE_API_URL` remain in the codebase
- Frontend builds successfully with zero errors
- Dashboard page loads and calls `/api/workflows` and `/api/executions` (not `/workflows`)

## Validation Commands
```bash
# Should return ZERO results
grep -r "VITE_API_URL" workflowbuilder/apps/frontend/src/pages/

# Should return 7 results (one per page file)
grep -r "VITE_API_BASE_URL" workflowbuilder/apps/frontend/src/pages/

# Build should pass
cd workflowbuilder && pnpm --filter frontend build
```

## Notes
- The login page (`login-page.tsx`) uses a relative URL `/api/auth/login` which is correct (resolved by the Vite dev proxy or same-origin in production). No change needed there.
- The settings page uses the URL for display purposes only, but should still be consistent.
- The `.env.example` at the project root defines `VITE_API_URL=http://localhost:3100` which should also be updated to `VITE_API_BASE_URL=http://localhost:3100/api` for consistency.
