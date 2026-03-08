# R360 Flow — Phase Build Orchestration Prompt

You are building R360 Flow, a multi-tenant workflow automation platform. This prompt drives a Ralph Wiggum loop that iterates through all 8 phases, running plan-then-build for each.

## Cardinal Rule (ALWAYS ENFORCE)

n8n packages are UNMODIFIED npm dependencies. NEVER fork, patch, monkey-patch, or vendor n8n source code. NEVER import from `n8n/` source paths. The `n8n/` directory is read-only reference only. All multi-tenancy lives in OUR wrapper layer.

## Progress Tracking

Read `.claude/build-progress.json` to determine current state. If the file doesn't exist, create it with:
```json
{
  "currentPhase": 1,
  "phaseState": "planning",
  "completedPhases": [],
  "lastCompletedStep": null,
  "notes": "",
  "status": "in_progress"
}
```

## Iteration Logic

Based on the current state in `build-progress.json`, execute ONE of these workflows:

### When phaseState == "planning"

You are planning Phase N. Execute these steps:

1. Read the phase spec (Phases 1-6: `specs/Phase{N}.md`, Phase 7: `specs/phase7-application-shell-and-pages.md`, Phase 8: `specs/Phase8.md`)
2. Read the existing architecture docs: `CLAUDE.md`, `plan-overview.md`
3. Analyze the spec and break it into discrete, implementable tasks
4. Create an execution plan at `specs/phase-{N}-execution-plan.md` with:
   - Summary of what this phase delivers
   - Ordered list of implementation tasks with:
     - Task name and description
     - Files to create or modify
     - Dependencies on other tasks
     - Acceptance criteria
     - Assigned agent (builder or validator)
   - Risk areas and mitigation strategies
   - Testing/validation approach
5. Use TaskCreate to create tasks for each implementation step. Include:
   - Clear task title
   - Detailed description with file paths and code patterns
   - Dependencies (which tasks must complete first)
   - Size estimate (small/medium/large)
6. Update `build-progress.json`: set `phaseState` to `"building"`, `lastCompletedStep` to `null`
7. Commit the execution plan: `git add specs/phase-{N}-execution-plan.md && git commit -m "Phase {N}: execution plan"`

### When phaseState == "building"

You are building Phase N. Execute these steps:

1. Read the execution plan at `specs/phase-{N}-execution-plan.md`
2. Use TaskList to see current task status
3. Find the next incomplete task (respecting dependency order)
4. Deploy a builder agent (using the Agent tool with subagent_type "builder") to implement the task:
   - Give it the full task description, file paths, and acceptance criteria
   - Include the Cardinal Rule in the agent prompt
   - Include relevant context from the execution plan
5. When the builder completes, deploy a validator agent to verify:
   - Check that files were created/modified correctly
   - Verify the acceptance criteria are met
   - Run any relevant tests
6. If validation passes:
   - Update the task status to completed via TaskUpdate
   - Update `build-progress.json` with `lastCompletedStep`
   - Commit the work: `git add -A && git commit -m "Phase {N}: {task description}"`
7. If validation fails:
   - Note what failed in `build-progress.json` notes field
   - Re-deploy builder with failure context to fix issues
   - Re-validate
8. When ALL tasks for the phase are complete, update `phaseState` to `"validating"`

### When phaseState == "validating"

You are validating Phase N completion. Execute these steps:

1. Read the phase spec (Phases 1-6: `specs/Phase{N}.md`, Phase 7: `specs/phase7-application-shell-and-pages.md`, Phase 8: `specs/Phase8.md`) — focus on the completion checklist / acceptance criteria
2. Read the execution plan at `specs/phase-{N}-execution-plan.md`
3. Deploy a validator agent to run the full phase completion checklist:
   - All files exist and have correct content
   - All acceptance criteria from the spec are met
   - No Cardinal Rule violations (no n8n/ imports or modifications)
   - Code compiles/passes linting if applicable
   - Integration points with previous phases work correctly
4. If validation PASSES:
   - Commit any final adjustments
   - Update `build-progress.json`:
     - Add current phase to `completedPhases` array
     - Increment `currentPhase`
     - Set `phaseState` to `"planning"`
     - Clear `lastCompletedStep` and `notes`
   - Commit progress update
5. If validation FAILS:
   - Set `phaseState` back to `"building"`
   - Add failure notes to `build-progress.json`
   - The next iteration will pick up the failing tasks

### When all phases complete

When `currentPhase > 8` or `completedPhases` contains all 8 phases:

1. Run a final validation across all phases
2. Update `build-progress.json` with `status: "complete"`
3. Create a final summary commit
4. Output: <promise>ALL PHASES COMPLETE</promise>

## Phase Overview

- **Phase 1**: Project scaffolding, monorepo setup, shared types, DB schema
- **Phase 2**: Execution engine — n8n npm wrapper, DI bootstrap, node registry
- **Phase 3**: API server — tenant-aware REST API, auth, credentials management
- **Phase 4**: JSON translator — DiagramModel <-> n8n WorkflowParameters conversion
- **Phase 5**: Workflow Builder SDK — React visual editor, plugin nodes, panels
- **Phase 6**: Integration, testing, deployment configs, documentation
- **Phase 7**: Application shell & core pages — React Router, sidebar nav, Dashboard, Workflow List, Execution History, Credentials, Settings
- **Phase 8**: Vue frontend rewrite — replace React app with Vue 3 + n8n design system, workflow editor with @vue-flow/core, all pages and features

## Agent Guidelines

When deploying builder agents:
- Give ONE focused task per agent
- Include file paths, function signatures, and code patterns
- Always include the Cardinal Rule
- Reference the execution plan for context

When deploying validator agents:
- Provide specific acceptance criteria to check
- Include paths to files that should exist
- Ask for pass/fail with detailed reasoning

## Important Reminders

- Always read `build-progress.json` FIRST each iteration
- Only do ONE chunk of work per iteration (one planning session, one build task, or one validation)
- Commit after each meaningful unit of work
- Never skip validation — every build step needs verification
- If stuck, add notes to `build-progress.json` and move on to the next viable task
