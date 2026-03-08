# Plan: Fix Scrolling and Canvas Viewport

## Task Description
Scrolling is broken across the entire application. Regular pages (Settings, Dashboard, Workflow List, Credentials, Executions) cannot scroll to reveal content below the fold. The workflow editor canvas is also broken — users cannot pan with scroll wheel or zoom with Ctrl+scroll. Both issues stem from CSS layout decisions inherited from the standalone Workflow Builder SDK that conflict with the multi-page AppShell architecture.

## Objective
After this fix:
1. All non-editor pages (Dashboard, Settings, Workflow List, Credentials, Executions) scroll normally when content exceeds the viewport
2. The workflow editor canvas supports panning (scroll wheel) and zooming (Ctrl+scroll / pinch) within the available space beside the sidebar
3. The sidebar remains fixed and unaffected by page scrolling

## Problem Statement
The Workflow Builder SDK was originally a standalone full-screen canvas app. Its `global.css` sets `body { overflow: hidden }` to prevent the browser from scrolling the page while React Flow handles its own pan/zoom. Now that the SDK is embedded inside a multi-page AppShell (with sidebar navigation, page headers, and routed content), this global rule kills scrolling on every page.

Additionally, the diagram container uses viewport units (`100vw x 100vh`) instead of relative sizing (`100% x 100%`). Inside the AppShell, the content area is offset by the 240px sidebar, so `100vw` extends the canvas behind the sidebar, causing React Flow to miscalculate its viewport bounds and potentially miss mouse/wheel events.

## Solution Approach
Five targeted CSS changes that separate concerns between the SDK's canvas (which should never scroll) and the AppShell's content area (which should scroll on regular pages):

1. Remove the global `body { overflow: hidden }` — let the AppShell control scrolling per-page
2. Make the AppShell content area a proper scroll container (`overflow-y: auto`)
3. Have the editor page opt OUT of scrolling by filling its parent with `overflow: hidden`
4. Size the diagram container relative to its parent, not the viewport
5. Give the diagram wrapper explicit dimensions so React Flow measures correctly

## Relevant Files

- `workflowbuilder/apps/frontend/src/global.css` — Global reset styles; line 62 sets `body { overflow: hidden }` which kills all page scrolling
- `workflowbuilder/apps/frontend/src/layouts/app-shell.module.css` — AppShell layout; `.content` lacks `overflow-y: auto` so even without the body rule, pages can't scroll
- `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.module.css` — Editor page container; uses `height: 100vh` which is incorrect inside the AppShell (should fill parent, not viewport)
- `workflowbuilder/apps/frontend/src/app/features/diagram/diagram.module.css` — Diagram container; uses `100vw x 100vh` instead of `100% x 100%`, extending behind the sidebar
- `workflowbuilder/apps/frontend/src/app/app.module.css` — SDK app container; `.diagram-container` has `position: absolute` but no explicit dimensions, leaving React Flow to infer sizing from viewport-unit children

### Reference files (read-only context)
- `workflowbuilder/apps/frontend/src/layouts/app-shell.tsx` — AppShell component structure (Sidebar + `<main>` with `<Outlet>`)
- `workflowbuilder/apps/frontend/src/router.tsx` — All pages route through AppShell except `/login`
- `workflowbuilder/apps/frontend/src/app/app.tsx` — SDK App component (ReactFlowProvider, diagram, overlays)
- `workflowbuilder/apps/frontend/src/app/features/diagram/diagram.tsx` — ReactFlow component with `panOnScroll`, `minZoom={0.1}`, `panOnDrag={[1, 2]}`
- `workflowbuilder/apps/frontend/src/app/features/diagram/diagram-wrapper.tsx` — Wraps diagram in `.diagram-container`
- `workflowbuilder/apps/frontend/src/pages/settings/settings-page.tsx` — Example page that needs scrolling (many cards)
- `workflowbuilder/apps/frontend/src/layouts/sidebar.module.css` — Sidebar is `position: fixed; width: 240px; height: 100vh`

## Implementation Phases

### Phase 1: Foundation — Unblock page scrolling
Remove the global `overflow: hidden` from body and make the AppShell content area scrollable. This immediately fixes Settings, Dashboard, and all non-editor pages.

### Phase 2: Core Implementation — Fix canvas viewport
Change the diagram container from viewport units to relative units so React Flow sizes correctly within the AppShell. Fix the editor page to fill its parent without using viewport height.

### Phase 3: Integration & Polish
Verify that the editor page does NOT scroll (it should fill the content area with overflow hidden), while all other pages scroll naturally. Confirm React Flow pan/zoom works.

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
  - Name: css-fixer
  - Role: Implements all CSS changes across the 5 files
  - Agent Type: builder
  - Resume: true

- Builder
  - Name: validator
  - Role: Verifies all changes are correct, no regressions, and acceptance criteria met
  - Agent Type: validator
  - Resume: true

## Step by Step Tasks

- IMPORTANT: Execute every step in order, top to bottom. Each task maps directly to a `TaskCreate` call.
- Before you start, run `TaskCreate` to create the initial task list that all team members can see and execute.

### 1. Remove body overflow hidden
- **Task ID**: remove-body-overflow
- **Depends On**: none
- **Assigned To**: css-fixer
- **Agent Type**: builder
- **Parallel**: false

- Edit `workflowbuilder/apps/frontend/src/global.css`
- Line 62: Remove `overflow: hidden;` from the `body` rule (keep the rest of the body block: `margin: 0; background-color: var(--wb-background-color);`)

### 2. Make AppShell content area scrollable
- **Task ID**: appshell-scroll
- **Depends On**: remove-body-overflow
- **Assigned To**: css-fixer
- **Agent Type**: builder
- **Parallel**: false

- Edit `workflowbuilder/apps/frontend/src/layouts/app-shell.module.css`
- Add to `.content`:
  ```css
  height: 100vh;
  overflow-y: auto;
  ```
- This makes the content area the scroll container for all pages inside the AppShell

### 3. Fix editor page container sizing
- **Task ID**: editor-page-sizing
- **Depends On**: appshell-scroll
- **Assigned To**: css-fixer
- **Agent Type**: builder
- **Parallel**: false

- Edit `workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.module.css`
- In `.container`, change `height: 100vh;` to `height: 100%;`
- Keep `overflow: hidden;` — the editor page must NOT scroll (React Flow handles its own pan/zoom)
- This makes the editor fill the AppShell content area instead of fighting with viewport height

### 4. Fix diagram container to use relative units
- **Task ID**: diagram-relative-units
- **Depends On**: editor-page-sizing
- **Assigned To**: css-fixer
- **Agent Type**: builder
- **Parallel**: false

- Edit `workflowbuilder/apps/frontend/src/app/features/diagram/diagram.module.css`
- Change `.container` from:
  ```css
  .container {
    width: 100vw;
    height: 100vh;
  }
  ```
  to:
  ```css
  .container {
    width: 100%;
    height: 100%;
  }
  ```
- This prevents the canvas from extending behind the sidebar and gives React Flow correct dimensions

### 5. Fix diagram wrapper dimensions
- **Task ID**: diagram-wrapper-dims
- **Depends On**: diagram-relative-units
- **Assigned To**: css-fixer
- **Agent Type**: builder
- **Parallel**: false

- Edit `workflowbuilder/apps/frontend/src/app/app.module.css`
- Change `.diagram-container` from:
  ```css
  .diagram-container {
    position: absolute;
  }
  ```
  to:
  ```css
  .diagram-container {
    position: absolute;
    inset: 0;
  }
  ```
- `inset: 0` is shorthand for `top: 0; right: 0; bottom: 0; left: 0;` — this gives the diagram wrapper explicit dimensions matching its parent (the SDK `.container`), so React Flow's ResizeObserver measures correctly

### 6. Validate all changes
- **Task ID**: validate-all
- **Depends On**: remove-body-overflow, appshell-scroll, editor-page-sizing, diagram-relative-units, diagram-wrapper-dims
- **Assigned To**: validator
- **Agent Type**: validator
- **Parallel**: false

- Read all 5 modified CSS files and verify exact changes
- Verify `body` in global.css has NO `overflow: hidden`
- Verify `.content` in app-shell.module.css has `overflow-y: auto` and `height: 100vh`
- Verify `.container` in workflow-editor-page.module.css has `height: 100%` (not `100vh`) and `overflow: hidden`
- Verify `.container` in diagram.module.css has `width: 100%` and `height: 100%` (not viewport units)
- Verify `.diagram-container` in app.module.css has `position: absolute` and `inset: 0`
- Grep for any remaining `100vw` or `100vh` in diagram.module.css to ensure no viewport units remain
- Confirm no other CSS files were unintentionally modified

## Acceptance Criteria

1. **Settings page scrolls**: Navigate to `/settings` — all cards (Workspace, API Configuration, Account, Appearance, Billing, Danger Zone) are reachable by scrolling
2. **Dashboard scrolls**: Navigate to `/` — if content exceeds viewport, page scrolls
3. **Workflow list scrolls**: Navigate to `/workflows` — table with many rows scrolls
4. **Execution pages scroll**: `/executions` and `/executions/:id` scroll when content is long
5. **Credentials page scrolls**: `/credentials` scrolls when content is long
6. **Editor canvas pans**: Open a workflow editor — scroll wheel pans the canvas (due to `panOnScroll`)
7. **Editor canvas zooms**: Ctrl+scroll (or pinch) zooms in/out on the canvas
8. **Editor page does NOT scroll**: The editor page fills the content area without page-level scrollbars
9. **Sidebar stays fixed**: The sidebar remains visible and fixed during scrolling on any page
10. **No layout regression**: Pages render without visual glitches, overlapping elements, or shifted content

## Validation Commands

```bash
# Verify body has no overflow: hidden
grep -n 'overflow' workflowbuilder/apps/frontend/src/global.css

# Verify app-shell content has overflow-y: auto
grep -n 'overflow' workflowbuilder/apps/frontend/src/layouts/app-shell.module.css

# Verify editor page uses height: 100% not 100vh
grep -n 'height' workflowbuilder/apps/frontend/src/pages/workflows/workflow-editor-page.module.css

# Verify diagram container uses 100% not viewport units
grep -n '100v' workflowbuilder/apps/frontend/src/app/features/diagram/diagram.module.css
# Expected: no matches

# Verify diagram-container has inset: 0
grep -n 'inset' workflowbuilder/apps/frontend/src/app/app.module.css

# Check for any remaining 100vw usage in layout-critical files
grep -rn '100vw' workflowbuilder/apps/frontend/src/layouts/ workflowbuilder/apps/frontend/src/app/features/diagram/
```

## Notes

- The `overflow: hidden` on body was correct for the standalone Workflow Builder SDK where the entire page IS the canvas. Now that the SDK is embedded inside a multi-page app, this rule must be removed and scrolling control moved to the AppShell content area.
- React Flow's `panOnScroll` prop means scroll wheel = pan (not zoom). Zoom is Ctrl+scroll or pinch. This is the existing design choice from the SDK and is not changed by this fix.
- The editor page's loading and error states also used `height: 100vh` — these are standalone (no AppShell Outlet context) and use viewport height correctly for centering. No change needed there.
- The `overflow: hidden` on `.table-section` in dashboard-page.module.css and `.table-container` in workflow-list-page.module.css are intentional (clip table card borders) and unrelated to page scrolling.
