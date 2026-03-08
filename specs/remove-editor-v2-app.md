# Plan: Remove editor-v2 App

## Task Description
Completely remove the `workflowbuilder/apps/editor-v2/` application and all references to it across the codebase. The editor-v2 was an experimental standalone Vue 3 workflow editor running on port 4202. It has been superseded by the integrated editor in `frontend-v2`. Leaving editor-v2 around creates confusion for developers and AI agents working on the project.

## Objective
When complete, the `editor-v2` directory will be deleted, all references to it (port 4202, `@r360/editor-v2`, `editor-v2`) will be removed or updated, and the codebase will have zero trace of the old experiment. The `frontend-v2` app is unaffected.

## Problem Statement
The `editor-v2` app at `workflowbuilder/apps/editor-v2/` is an obsolete experiment. A new editor lives in `frontend-v2`. Keeping editor-v2 around causes confusion — developers and AI agents may mistakenly reference or build upon it. All traces must be removed.

## Solution Approach
1. Delete the entire `workflowbuilder/apps/editor-v2/` directory
2. Update the backend settings file to point `urlBaseEditor` at frontend-v2 (port 4200) instead of port 4202
3. Clean up spec/documentation files that reference editor-v2 to prevent future confusion
4. Run `pnpm install` in the workflowbuilder workspace to update the lockfile

## Relevant Files
Use these files to complete the task:

**Delete:**
- `workflowbuilder/apps/editor-v2/` — Entire directory (20 source files). The obsolete experimental editor app.

**Edit:**
- `packages/api/src/services/n8n-compat-settings.ts` (line 46) — `urlBaseEditor` points to `http://localhost:4202/`, needs to change to `http://localhost:4200/` (frontend-v2 port)
- `specs/Phase8.md` — ~35 references to editor-v2. Update to note it has been removed and replaced by frontend-v2.
- `specs/n8n-editor-v2-integration.md` — Entire file is about scaffolding editor-v2. Should be deleted since it's fully obsolete.
- `specs/plan-phase8-vue-frontend-rewrite.md` — ~7 references to editor-v2. Update to reflect removal.
- `specs/remove-v2-references-from-v1-frontend.md` — ~13 references to editor-v2 being "untouched". Update to reflect it's been removed.

**No changes needed:**
- `workflowbuilder/pnpm-workspace.yaml` — Uses `'./apps/*'` wildcard, no editor-v2 specific reference
- `workflowbuilder/package.json` — No editor-v2 references
- Root `package.json` — No editor-v2 references
- `workflowbuilder/apps/frontend/` — No editor-v2 cross-references (already cleaned in prior task)
- `workflowbuilder/apps/frontend-v2/` — No editor-v2 cross-references

## Implementation Phases
### Phase 1: Foundation
Delete the editor-v2 directory and update the backend config that points to port 4202.

### Phase 2: Core Implementation
Clean up all spec/documentation files that reference editor-v2 so future agents and developers are not confused.

### Phase 3: Integration & Polish
Run pnpm install to clean up the workspace lockfile, then validate no references remain.

## Team Orchestration

- You operate as the team lead and orchestrate the team to execute the plan.
- You're responsible for deploying the right team members with the right context to execute the plan.
- IMPORTANT: You NEVER operate directly on the codebase. You use `Task` and `Task*` tools to deploy team members to to the building, validating, testing, deploying, and other tasks.
  - This is critical. You're job is to act as a high level director of the team, not a builder.
  - You're role is to validate all work is going well and make sure the team is on track to complete the plan.
  - You'll orchestrate this by using the Task* Tools to manage coordination between the team members.
  - Communication is paramount. You'll use the Task* Tools to communicate with the team members and ensure they're on track to complete the plan.
- Take note of the session id of each team member. This is how you'll reference them.

### Team Members

- Builder
  - Name: builder-delete-editor-v2
  - Role: Delete the editor-v2 directory and update the backend settings file
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: builder-cleanup-specs
  - Role: Clean up spec/documentation files that reference editor-v2
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: validator-editor-v2-removal
  - Role: Verify editor-v2 is fully removed, no references remain, and project still builds
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Delete editor-v2 Directory
- **Task ID**: delete-editor-v2
- **Depends On**: none
- **Assigned To**: builder-delete-editor-v2
- **Agent Type**: builder
- **Parallel**: true
- Delete the entire `workflowbuilder/apps/editor-v2/` directory using `rm -rf`
- Run `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm install` to update the workspace lockfile

### 2. Update Backend Settings
- **Task ID**: update-backend-settings
- **Depends On**: none
- **Assigned To**: builder-delete-editor-v2
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 1)
- In `packages/api/src/services/n8n-compat-settings.ts`, line 46:
  - Change `urlBaseEditor: 'http://localhost:4202/',` to `urlBaseEditor: 'http://localhost:4200/',`
  - This points the n8n compat settings to frontend-v2 instead of the deleted editor-v2

### 3. Clean Up Spec Files
- **Task ID**: cleanup-specs
- **Depends On**: none
- **Assigned To**: builder-cleanup-specs
- **Agent Type**: builder
- **Parallel**: true (independent of tasks 1-2)
- Delete `specs/n8n-editor-v2-integration.md` — entirely about the editor-v2 experiment, fully obsolete
- In `specs/Phase8.md`:
  - Add a note at the top of the file: `> **Note:** The editor-v2 experiment (`workflowbuilder/apps/editor-v2/`) referenced in this document has been removed. Its functionality is now part of frontend-v2.`
  - Do NOT rewrite the entire document — just add the note so readers understand the context
- In `specs/plan-phase8-vue-frontend-rewrite.md`:
  - Add a similar note at the top: `> **Note:** The editor-v2 experiment referenced in this document has been removed and replaced by frontend-v2.`
- In `specs/remove-v2-references-from-v1-frontend.md`:
  - Update lines referencing "editor-v2 untouched" to note editor-v2 has been removed
  - Remove the validation command that checks editor-v2 still exists (`test -d .../editor-v2/`)

### 4. Validate Complete Removal
- **Task ID**: validate-all
- **Depends On**: delete-editor-v2, update-backend-settings, cleanup-specs
- **Assigned To**: validator-editor-v2-removal
- **Agent Type**: validator
- **Parallel**: false
- Confirm `workflowbuilder/apps/editor-v2/` directory no longer exists
- Grep the entire project for `editor-v2` — only acceptable remaining matches are in git history or in spec notes that explicitly say "has been removed"
- Grep for port `4202` — should have zero matches
- Grep for `@r360/editor-v2` — should have zero matches
- Verify `packages/api/src/services/n8n-compat-settings.ts` has `urlBaseEditor: 'http://localhost:4200/'`
- Verify `frontend-v2/` directory still exists and is untouched
- Run `cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm install` and confirm no errors
- Report any remaining references found

## Acceptance Criteria
- The `workflowbuilder/apps/editor-v2/` directory is completely deleted
- Zero references to `@r360/editor-v2` exist in the codebase
- Zero references to port `4202` exist in the codebase
- `urlBaseEditor` in `n8n-compat-settings.ts` points to `http://localhost:4200/` (frontend-v2)
- The `specs/n8n-editor-v2-integration.md` file is deleted
- Remaining spec files that mentioned editor-v2 have notes clarifying it was removed
- `pnpm install` in the workflowbuilder workspace succeeds without errors
- `frontend-v2/` and `frontend/` directories are completely untouched
- No code functionality is broken by the removal

## Validation Commands
Execute these commands to validate the task is complete:

```bash
# Verify editor-v2 directory is deleted
test ! -d /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/editor-v2 && echo "PASS: editor-v2 deleted" || echo "FAIL: editor-v2 still exists"

# Verify n8n-editor-v2-integration.md spec is deleted
test ! -f /Users/preston/Documents/Claude/R360-Flow/specs/n8n-editor-v2-integration.md && echo "PASS: spec deleted" || echo "FAIL: spec still exists"

# Search for port 4202 references (should be zero)
grep -rn "4202" /Users/preston/Documents/Claude/R360-Flow/ --include="*.ts" --include="*.tsx" --include="*.json" --include="*.yaml" --include="*.yml" --include="*.mts" || echo "PASS: No 4202 references"

# Search for @r360/editor-v2 references (should be zero)
grep -rn "@r360/editor-v2" /Users/preston/Documents/Claude/R360-Flow/ || echo "PASS: No @r360/editor-v2 references"

# Verify urlBaseEditor points to frontend-v2
grep "urlBaseEditor" /Users/preston/Documents/Claude/R360-Flow/packages/api/src/services/n8n-compat-settings.ts

# Verify frontend-v2 is untouched
test -d /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2 && echo "PASS: frontend-v2 intact" || echo "FAIL: frontend-v2 missing"

# Verify workspace installs cleanly
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm install --frozen-lockfile 2>&1 | tail -5
```

## Notes
- The `pnpm-workspace.yaml` uses `'./apps/*'` wildcard, so deleting `editor-v2/` automatically removes it from the workspace — no config change needed.
- The `@r360/editor-v2` package is not referenced as a dependency by any other package, so deletion is clean.
- Spec files get notes added rather than full rewrites — they're historical documents and the notes prevent confusion without losing context.
- The `frontend-v2` app on port 4200 is the replacement and must NOT be touched.
