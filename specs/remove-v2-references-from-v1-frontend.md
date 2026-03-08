# Plan: Remove V2 Editor References from V1 Frontend

## Task Description
Remove all references to the v2 workflow editor from the v1 React frontend (`workflowbuilder/apps/frontend/`). The v1 and v2 frontends should be completely isolated — users of v1 should have no knowledge of or access to the v2 editor. This includes removing the "v2" badge button from the workflow list, the v2 editor bridge page, the v2 route, and all associated styling and props.

## Objective
When complete, the v1 React frontend will have zero references to v2. The workflow list will show workflows without any "v2" badge/button. The `/workflows/:id/edit-v2` route will no longer exist. The `frontend-v2/` frontend remains untouched. The `editor-v2/` experiment has been removed.

## Problem Statement
Currently, the v1 React frontend contains a "v2" badge button on each workflow row in the workflow list. Clicking it navigates to a bridge page (`/workflows/:id/edit-v2`) that links out to the standalone v2 Vue editor running on port 4202. This creates an undesirable coupling between the two frontend systems. The v1 and v2 frontends should be fully independent.

## Solution Approach
Surgically remove all v2-related code from the v1 frontend:
1. Remove the v2 route from the router
2. Delete the v2 editor bridge page component
3. Remove the v2 badge button from the workflow list page
4. Remove the `onOpenV2` prop from the workflow card component
5. Remove the `.v2-badge` CSS styles

## Relevant Files
Use these files to complete the task:

- `workflowbuilder/apps/frontend/src/router.tsx` (lines 23-26, 125-131) — Contains the lazy-loaded `WorkflowEditorV2Page` import and the `/workflows/:id/edit-v2` route definition. Remove both.
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx` (lines 144-152) — Contains the "v2" badge button with `navigate(/workflows/${row.id}/edit-v2)`. Remove the button.
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.module.css` (lines 119-147) — Contains the `.v2-badge` CSS class. Remove it.
- `workflowbuilder/apps/frontend/src/workflows/components/workflow-card.tsx` (line 7, lines 63-86) — Contains the optional `onOpenV2` prop and conditional v2 button rendering. Remove both.
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-v2-page.tsx` — The entire bridge page component. Delete this file.

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
  - Name: builder-v2-removal
  - Role: Remove all v2 editor references from the v1 React frontend
  - Agent Type: builder
  - Resume: true

- Validator
  - Name: validator-v2-removal
  - Role: Verify all v2 references are removed and v1 frontend still builds correctly
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Remove V2 Route and Bridge Page
- **Task ID**: remove-v2-route
- **Depends On**: none
- **Assigned To**: builder-v2-removal
- **Agent Type**: builder
- **Parallel**: false
- In `workflowbuilder/apps/frontend/src/router.tsx`:
  - Remove the lazy import of `WorkflowEditorV2Page` (around lines 23-26)
  - Remove the route object with `path: 'workflows/:id/edit-v2'` (around lines 125-131)
- Delete the file `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-v2-page.tsx` entirely

### 2. Remove V2 Badge from Workflow List Page
- **Task ID**: remove-v2-badge-list
- **Depends On**: none
- **Assigned To**: builder-v2-removal
- **Agent Type**: builder
- **Parallel**: true (can run alongside task 1, but same builder so sequential)
- In `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.tsx`:
  - Remove the v2 badge `<button>` block (around lines 144-152) that navigates to `/workflows/${row.id}/edit-v2`
  - Remove any unused imports that were only needed for the v2 badge (check if `navigate` is still used elsewhere — it likely is for v1 editor navigation, so keep it)
- In `workflowbuilder/apps/frontend/src/pages/workflows/workflow-list-page.module.css`:
  - Remove the `.v2-badge` CSS class (around lines 119-147)

### 3. Remove V2 Props from Workflow Card Component
- **Task ID**: remove-v2-card-props
- **Depends On**: none
- **Assigned To**: builder-v2-removal
- **Agent Type**: builder
- **Parallel**: true (can run alongside tasks 1-2, but same builder so sequential)
- In `workflowbuilder/apps/frontend/src/workflows/components/workflow-card.tsx`:
  - Remove the `onOpenV2?: () => void` prop from the component's props type/interface (line 7)
  - Remove the conditional v2 button rendering block (lines 63-86)
  - Remove the `onOpenV2` destructure from props if present
- Check if any parent components pass `onOpenV2` to `<WorkflowCard>` and remove those props as well

### 4. Verify Build and Grep for Remaining V2 References
- **Task ID**: validate-all
- **Depends On**: remove-v2-route, remove-v2-badge-list, remove-v2-card-props
- **Assigned To**: validator-v2-removal
- **Agent Type**: validator
- **Parallel**: false
- Run `pnpm --filter @workflow-builder/frontend build` (or equivalent) to verify the v1 frontend still compiles without errors
- Grep the entire `workflowbuilder/apps/frontend/` directory for any remaining references to: `v2`, `V2`, `edit-v2`, `editor-v2`, `EditorV2`, `openV2`, `onOpenV2`, `WorkflowEditorV2`
- Confirm the deleted file `workflow-editor-v2-page.tsx` no longer exists
- Confirm no broken imports or routes reference removed code
- Report any remaining v2 references found

## Acceptance Criteria
- The v1 React frontend (`workflowbuilder/apps/frontend/`) contains zero references to v2 editor functionality
- The `/workflows/:id/edit-v2` route no longer exists in the router
- The `workflow-editor-v2-page.tsx` file is deleted
- No "v2" badge button appears in the workflow list UI
- The `WorkflowCard` component has no `onOpenV2` prop
- The `.v2-badge` CSS class is removed
- The v1 frontend builds successfully with no errors
- The `frontend-v2/` frontend is completely untouched; `editor-v2/` has been removed

## Validation Commands
Execute these commands to validate the task is complete:

```bash
# Build the v1 frontend to ensure no compilation errors
cd /Users/preston/Documents/Claude/R360-Flow/workflowbuilder && pnpm --filter @workflow-builder/frontend build

# Verify the v2 bridge page file is deleted
test ! -f /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-v2-page.tsx && echo "PASS: v2 page deleted" || echo "FAIL: v2 page still exists"

# Search for any remaining v2 references in v1 frontend
grep -rn "v2\|V2\|edit-v2\|editor-v2\|EditorV2\|openV2\|onOpenV2\|WorkflowEditorV2" /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend/src/ || echo "PASS: No v2 references found"

# Confirm v2 frontends are untouched (should still have files)
test -d /Users/preston/Documents/Claude/R360-Flow/workflowbuilder/apps/frontend-v2/ && echo "PASS: frontend-v2 untouched" || echo "FAIL: frontend-v2 missing"
```

## Notes
- This is a simple, surgical removal task. The v2 code is cleanly isolated in the v1 frontend — it's a route, a page component, badge buttons, and CSS. No shared state or complex dependencies.
- The `frontend-v2/` frontend must NOT be modified. It continues to exist and operate independently. The `editor-v2/` experiment has been removed.
- The v1 workflow list's primary navigation (clicking a row to open `/workflows/:id/edit`) is unaffected by this change.
