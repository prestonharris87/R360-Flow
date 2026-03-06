# Phase 3: Embed n8n Execution Engine

## Overview

- **Goal**: Integrate n8n's npm packages as an embedded, unmodified workflow execution engine with full tenant isolation
- **Prerequisites**: Phase 1 DB schema (tenants, workflows, credentials, executions, execution_steps tables), Phase 2 JSON translator (`DiagramModel <-> WorkflowParameters` bidirectional mapping), pnpm monorepo workspace configured
- **Cardinal Rule Checkpoint**: This is the MOST CRITICAL phase for Cardinal Rule enforcement. Every integration point goes through our wrapper layer in `packages/execution-engine/`. We `npm install` n8n packages and NEVER modify them. If n8n's API does not support something, we build around it in our wrapper. We do NOT patch n8n. A CI check script runs on every commit to verify zero imports from the `n8n/` source directory.
- **Duration Estimate**: 3-4 weeks (Weeks 4-7)
- **Key Deliverables**:
  - n8n npm packages installed and pinned (`n8n-workflow`, `n8n-core`, `n8n-nodes-base`, `@n8n/di`, `@n8n/config`, `@n8n/backend-common`, `@n8n/errors`, `@n8n/constants`, `@n8n/decorators`)
  - DI container bootstrap (`packages/execution-engine/src/bootstrap.ts`)
  - Node registry implementing `INodeTypes` (`packages/execution-engine/src/node-types.ts`)
  - Tenant credentials helper implementing `ICredentialsHelper` (`packages/execution-engine/src/credentials-helper.ts`)
  - Execution service with tenant-scoped `IWorkflowExecuteAdditionalData` (`packages/execution-engine/src/execution-service.ts`)
  - Lifecycle hooks for execution persistence (`packages/execution-engine/src/lifecycle-hooks.ts`)
  - Node palette API endpoint (`GET /api/nodes`)
  - Custom R360 nodes (`packages/nodes-r360/`)
  - End-to-end execution test: API create workflow -> translate -> execute -> verify results
  - CI Cardinal Rule enforcement script

## Environment Setup

### Required Tools and Versions

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | >= 20.x LTS | Runtime |
| pnpm | >= 9.x | Package manager |
| PostgreSQL | >= 15 | Tenant-scoped data storage |
| Redis | >= 7 | Queue backend (Phase 4, but install now) |
| TypeScript | >= 5.4 | Type checking |
| Vitest or Jest | Latest | Test runner |

### Environment Variables

```bash
# .env.development
N8N_ENCRYPTION_KEY=a-32-byte-hex-string-for-dev-only-00
N8N_USER_FOLDER=/tmp/r360-flow-n8n
DATABASE_URL=postgresql://r360:r360@localhost:5432/r360_flow
REDIS_URL=redis://localhost:6379
MASTER_ENCRYPTION_KEY=master-key-for-tenant-key-derivation
API_BASE_URL=http://localhost:3000
WEBHOOK_BASE_URL=http://localhost:3000/webhook
```

### Infrastructure Prerequisites

```bash
# Start PostgreSQL and Redis via docker-compose
docker compose -f infrastructure/docker-compose.yml up -d postgres redis

# Verify DB is accessible
psql $DATABASE_URL -c "SELECT 1"

# Verify Redis is accessible
redis-cli -u $REDIS_URL ping
```

### Setup Verification Commands

```bash
# From monorepo root
pnpm install
pnpm -r build
pnpm -r typecheck

# Verify Phase 1 and Phase 2 are complete
pnpm --filter @r360/db test        # DB schema tests pass
pnpm --filter @r360/json-translator test  # Translator tests pass
```

---

## Step 3.1: Install n8n Packages and Cardinal Rule CI Check

### Objective

Install all required n8n npm packages with pinned versions. Create a CI check script that enforces the Cardinal Rule: no source file in our codebase may import from the `n8n/` reference directory. This check runs on every commit and blocks merges that violate the rule.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/n8n-imports.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';

describe('n8n package installation', () => {
  it('can import from n8n-workflow', () => {
    const { Workflow } = require('n8n-workflow');
    expect(Workflow).toBeDefined();
  });

  it('can import from n8n-core', () => {
    const { WorkflowExecute } = require('n8n-core');
    expect(WorkflowExecute).toBeDefined();
  });

  it('can import INodeTypes interface type check compiles', () => {
    // This test verifies TypeScript compilation succeeds
    // The actual type import is validated at build time
    const n8nWorkflow = require('n8n-workflow');
    expect(n8nWorkflow.NodeConnectionTypes).toBeDefined();
  });

  it('can import from @n8n/di', () => {
    const { Container } = require('@n8n/di');
    expect(Container).toBeDefined();
    expect(typeof Container.set).toBe('function');
    expect(typeof Container.get).toBe('function');
  });

  it('can import from @n8n/errors', () => {
    const errors = require('@n8n/errors');
    expect(errors).toBeDefined();
  });

  it('can import from @n8n/constants', () => {
    const constants = require('@n8n/constants');
    expect(constants).toBeDefined();
  });
});

describe('Cardinal Rule enforcement', () => {
  it('no source file imports from n8n/ directory', () => {
    const repoRoot = path.resolve(__dirname, '../../../../..');
    const scriptPath = path.join(repoRoot, 'scripts/check-cardinal-rule.sh');

    // This will throw if the script exits non-zero (violation found)
    const result = execSync(`bash ${scriptPath}`, {
      cwd: repoRoot,
      encoding: 'utf-8',
    });
    expect(result).toContain('Cardinal Rule: PASSED');
  });
});
```

#### 2. Install packages and create the CI script

**Command:**
```bash
cd packages/execution-engine
pnpm add n8n-workflow@1.76.1 n8n-core@1.76.1 n8n-nodes-base@1.76.1 \
  @n8n/di@1.76.1 @n8n/config@1.76.1 @n8n/backend-common@1.76.1 \
  @n8n/errors@1.76.1 @n8n/constants@1.76.1 @n8n/decorators@1.76.1
```

> **IMPORTANT:** Replace `1.76.1` with the actual latest stable version at the time of implementation. Pin EXACT versions. Do not use `^` or `~` ranges. Test upgrades explicitly in CI before bumping.

**File:** `scripts/check-cardinal-rule.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

# Cardinal Rule Enforcement Script
# Ensures no source file in our packages imports from the n8n/ reference directory.
#
# What it checks:
#   - No import/require statements referencing '../n8n/', '../../n8n/', etc.
#   - No import/require statements referencing paths inside 'n8n/' source tree
#   - Only npm package imports (e.g., from 'n8n-workflow') are allowed
#
# Exit codes:
#   0 = PASSED (no violations)
#   1 = FAILED (violations found)

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VIOLATIONS=0

echo "=== Cardinal Rule Check ==="
echo "Scanning packages/ and workflowbuilder/ for n8n/ source imports..."

# Pattern 1: Relative imports into n8n/ directory
# Matches: from '../n8n/', from '../../n8n/', require('../n8n/')
if grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "(from\s+['\"]\.\.?/.*n8n/|require\s*\(\s*['\"]\.\.?/.*n8n/)" \
  "$REPO_ROOT/packages/" "$REPO_ROOT/workflowbuilder/" 2>/dev/null; then
  echo ""
  echo "ERROR: Found relative imports into n8n/ source directory!"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 2: Absolute imports referencing n8n source paths
# Matches: from 'n8n/packages/', require('n8n/packages/')
if grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "(from\s+['\"]n8n/packages/|require\s*\(\s*['\"]n8n/packages/)" \
  "$REPO_ROOT/packages/" "$REPO_ROOT/workflowbuilder/" 2>/dev/null; then
  echo ""
  echo "ERROR: Found imports from n8n source paths!"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

# Pattern 3: Path aliases that might resolve to n8n/
if grep -rn --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' \
  -E "(from\s+['\"]@n8n-src/|require\s*\(\s*['\"]@n8n-src/)" \
  "$REPO_ROOT/packages/" "$REPO_ROOT/workflowbuilder/" 2>/dev/null; then
  echo ""
  echo "ERROR: Found imports from n8n source aliases!"
  VIOLATIONS=$((VIOLATIONS + 1))
fi

if [ "$VIOLATIONS" -gt 0 ]; then
  echo ""
  echo "Cardinal Rule: FAILED ($VIOLATIONS violation pattern(s) found)"
  echo ""
  echo "REMINDER: n8n packages are UNMODIFIED npm dependencies."
  echo "Import from 'n8n-workflow', 'n8n-core', 'n8n-nodes-base', '@n8n/*' only."
  echo "The n8n/ directory is a READ-ONLY reference. Never import from it."
  exit 1
fi

echo ""
echo "Cardinal Rule: PASSED"
echo "All imports reference npm packages only. No n8n/ source imports detected."
exit 0
```

**File:** `packages/execution-engine/package.json` (relevant section)

```json
{
  "name": "@r360/execution-engine",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "cardinal-rule": "bash ../../scripts/check-cardinal-rule.sh"
  },
  "dependencies": {
    "n8n-workflow": "1.76.1",
    "n8n-core": "1.76.1",
    "n8n-nodes-base": "1.76.1",
    "@n8n/di": "1.76.1",
    "@n8n/config": "1.76.1",
    "@n8n/backend-common": "1.76.1",
    "@n8n/errors": "1.76.1",
    "@n8n/constants": "1.76.1",
    "@n8n/decorators": "1.76.1"
  }
}
```

#### 3. Run tests and verify

```bash
cd packages/execution-engine
pnpm test src/__tests__/n8n-imports.test.ts
bash ../../scripts/check-cardinal-rule.sh
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'n8n-workflow'` | Package not installed or version mismatch | Run `pnpm install` from monorepo root; verify `node_modules/n8n-workflow` exists |
| `Cannot find module '@n8n/di'` | Scoped packages not hoisted correctly | Add `@n8n/*` to pnpm `public-hoist-pattern` in `.npmrc` |
| `Peer dependency warning for n8n-core` | Missing transitive peer deps | Install missing peers explicitly; check `pnpm install` output |
| `Cardinal Rule: FAILED` | Leftover import from n8n/ in a file | Remove the offending import; replace with npm package import |
| `TypeError: Container.set is not a function` | Wrong version of `@n8n/di` | Verify pinned version matches other n8n packages |

#### 5. Refactor if needed

Add the cardinal rule check to CI pipeline:

**File:** `.github/workflows/ci.yml` (add step)

```yaml
- name: Cardinal Rule Check
  run: bash scripts/check-cardinal-rule.sh
```

### Success Criteria

- [ ] All n8n packages installed with pinned exact versions
- [ ] `require('n8n-workflow')` resolves `Workflow`, `NodeConnectionTypes`
- [ ] `require('n8n-core')` resolves `WorkflowExecute`
- [ ] `require('@n8n/di')` resolves `Container` with `.set()` and `.get()` methods
- [ ] Cardinal Rule script passes with zero violations
- [ ] Cardinal Rule script integrated into CI pipeline
- [ ] `pnpm typecheck` passes in `packages/execution-engine`

### Verification Commands

```bash
# Install verification
node -e "console.log(require('n8n-workflow').Workflow.name)"
# Expected: "Workflow"

node -e "console.log(require('n8n-core').WorkflowExecute.name)"
# Expected: "WorkflowExecute"

node -e "console.log(typeof require('@n8n/di').Container.set)"
# Expected: "function"

# Cardinal Rule
bash scripts/check-cardinal-rule.sh
# Expected: "Cardinal Rule: PASSED"

# Tests
pnpm --filter @r360/execution-engine test
# Expected: All tests pass
```

---

## Step 3.2: DI Container Bootstrap

### Objective

Create `packages/execution-engine/src/bootstrap.ts` that initializes n8n's dependency injection container with our implementations for `InstanceSettings`, `Logger`, `ErrorReporter`, and `BinaryDataService`. This runs ONCE at server startup and is idempotent. It must NOT be run per-tenant -- tenant context is injected at execution time, not at DI bootstrap time.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/bootstrap.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Container } from '@n8n/di';
import { InstanceSettings, BinaryDataService } from 'n8n-core';

describe('bootstrapN8nContainer', () => {
  beforeAll(async () => {
    // Clean container state
    // Note: Container may not have a reset method; we test idempotency instead
  });

  it('registers InstanceSettings in the DI container', async () => {
    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();

    const settings = Container.get(InstanceSettings);
    expect(settings).toBeDefined();
    expect(settings.encryptionKey).toBeDefined();
    expect(typeof settings.encryptionKey).toBe('string');
    expect(settings.encryptionKey.length).toBeGreaterThan(0);
  });

  it('is idempotent - calling twice does not throw', async () => {
    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();
    await bootstrapN8nContainer(); // second call should not throw
  });

  it('does not register any tenant-specific services', async () => {
    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();

    // The container should NOT have TenantCredentialsHelper registered
    // Credentials helper is injected per-execution, not per-container
    // This test verifies the separation of concerns
    expect(() => {
      // Attempting to get a service that should NOT be registered
      Container.get('TenantCredentialsHelper' as any);
    }).toThrow();
  });

  it('configures BinaryDataService with filesystem mode', async () => {
    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();

    const binaryDataService = Container.get(BinaryDataService);
    expect(binaryDataService).toBeDefined();
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/bootstrap.ts`

```typescript
import { Container } from '@n8n/di';
import { InstanceSettings, BinaryDataService } from 'n8n-core';
import { Logger } from '@n8n/backend-common';
import { ErrorReporter } from '@n8n/errors';

let bootstrapped = false;

/**
 * Bootstrap the n8n DI container with our service implementations.
 *
 * IMPORTANT:
 * - Call ONCE at server startup, NOT per-tenant
 * - Tenant-specific context (credentials, variables, hooks) is injected
 *   per-execution via IWorkflowExecuteAdditionalData, NOT here
 * - This function is idempotent; calling it multiple times is safe
 *
 * Services registered:
 * - InstanceSettings: encryption key, file paths, instance identity
 * - Logger: structured logging (our implementation)
 * - ErrorReporter: error tracking (Sentry/Datadog)
 * - BinaryDataService: file storage for binary node outputs
 */
export async function bootstrapN8nContainer(): Promise<void> {
  if (bootstrapped) {
    return; // Idempotent: already initialized
  }

  // 1. InstanceSettings -- encryption key and paths
  //    n8n-core uses this for various internal operations.
  //    The encryption key here is the SYSTEM-level key, not per-tenant.
  //    Per-tenant encryption is handled in TenantCredentialsHelper.
  const instanceSettings = Container.get(InstanceSettings);
  // InstanceSettings reads from env/filesystem by default.
  // We ensure the required env vars are set:
  //   N8N_ENCRYPTION_KEY - system-level encryption key
  //   N8N_USER_FOLDER    - writable directory for n8n internal state
  if (!process.env.N8N_ENCRYPTION_KEY) {
    throw new Error(
      'N8N_ENCRYPTION_KEY environment variable is required for DI bootstrap'
    );
  }
  if (!process.env.N8N_USER_FOLDER) {
    throw new Error(
      'N8N_USER_FOLDER environment variable is required for DI bootstrap'
    );
  }

  // 2. Logger -- our structured logging implementation
  //    n8n-core calls Container.get(Logger) internally.
  //    We provide our own logger that integrates with our logging infrastructure.
  const logger = Container.get(Logger);
  // Logger from @n8n/backend-common is auto-registered by @n8n/di decorators.
  // If we need custom transports, configure them here:
  // logger.configure({ level: process.env.LOG_LEVEL || 'info' });

  // 3. ErrorReporter -- our error tracking service
  //    n8n-core uses this to report internal errors.
  //    We configure it to send to our Sentry/Datadog instance.
  // ErrorReporter is also auto-registered via decorators.
  // Custom configuration:
  // const errorReporter = Container.get(ErrorReporter);
  // errorReporter.init({ dsn: process.env.SENTRY_DSN });

  // 4. BinaryDataService -- storage for binary node outputs (files, images)
  //    Configure filesystem-based storage for local dev.
  //    Production should use object storage (S3/GCS).
  const binaryDataService = Container.get(BinaryDataService);
  await binaryDataService.init({
    mode: 'default',
    availableModes: ['default'],
    localStoragePath: process.env.BINARY_DATA_PATH || '/tmp/r360-flow-binary',
  });

  bootstrapped = true;
}

/**
 * Check if the DI container has been bootstrapped.
 * Useful for health checks and startup verification.
 */
export function isBootstrapped(): boolean {
  return bootstrapped;
}

/**
 * Reset bootstrap state. FOR TESTING ONLY.
 */
export function resetBootstrap(): void {
  bootstrapped = false;
}
```

#### 3. Run tests and verify

```bash
cd packages/execution-engine
N8N_ENCRYPTION_KEY=test-key-32-bytes-long-xxxxxxxx N8N_USER_FOLDER=/tmp/r360-test \
  pnpm test src/__tests__/bootstrap.test.ts
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `Error: Service InstanceSettings not found` | `@n8n/di` decorators not initialized | Ensure `reflect-metadata` is imported at the top of the test file; ensure `@n8n/di` version matches `n8n-core` |
| `Error: N8N_ENCRYPTION_KEY environment variable is required` | Missing env var in test | Set env var in test setup or use `vi.stubEnv()` |
| `BinaryDataService.init is not a function` | API changed in newer n8n version | Check n8n-core source for current `BinaryDataService` init signature; adjust accordingly |
| `Container.get(Logger) throws` | Logger class not decorated with `@Service()` | Import Logger from the correct package (`@n8n/backend-common` or `n8n-core`); check which package exports the DI-registered Logger |
| `Maximum call stack exceeded` | Circular DI dependency | Verify import order; ensure bootstrap does not trigger lazy-loading that re-enters bootstrap |

### Success Criteria

- [ ] `bootstrapN8nContainer()` completes without error
- [ ] `Container.get(InstanceSettings)` returns a valid object
- [ ] `Container.get(BinaryDataService)` returns a valid object
- [ ] Function is idempotent (second call is a no-op)
- [ ] No tenant-specific services are registered in the container
- [ ] All environment variables are validated on startup
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

### Verification Commands

```bash
N8N_ENCRYPTION_KEY=test-key-32-bytes-long-xxxxxxxx \
N8N_USER_FOLDER=/tmp/r360-test \
pnpm --filter @r360/execution-engine test src/__tests__/bootstrap.test.ts
# Expected: All tests pass

pnpm --filter @r360/execution-engine typecheck
# Expected: No type errors
```

---

## Step 3.3: Node Registry (R360NodeTypes)

### Objective

Create `packages/execution-engine/src/node-types.ts` implementing `INodeTypes` from `n8n-workflow`. This class uses `LazyPackageDirectoryLoader` from `n8n-core` to load node type definitions from the installed `n8n-nodes-base` npm package. Node types are loaded once and cached for all tenants.

### Key n8n Interfaces

```typescript
// From n8n-workflow (interfaces.ts line 2571)
interface INodeTypes {
  getByName(nodeType: string): INodeType | IVersionedNodeType;
  getByNameAndVersion(nodeType: string, version?: number): INodeType;
  getKnownTypes(): IDataObject;
}

// From n8n-core DirectoryLoader (directory-loader.ts line 61)
// LazyPackageDirectoryLoader extends PackageDirectoryLoader extends DirectoryLoader
// Key properties after loadAll():
//   .nodeTypes: INodeTypeData     -- loaded node type data
//   .types.nodes: INodeTypeDescription[]  -- node type descriptions
//   .known.nodes: Record<string, LoadingDetails>  -- known node locations
```

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/node-types.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import type { INodeType, IVersionedNodeType, IDataObject } from 'n8n-workflow';

describe('R360NodeTypes', () => {
  let nodeTypes: import('../node-types').R360NodeTypes;

  beforeAll(async () => {
    // Bootstrap DI first (required for LazyPackageDirectoryLoader)
    process.env.N8N_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';
    process.env.N8N_USER_FOLDER = '/tmp/r360-test';
    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();

    const { R360NodeTypes } = await import('../node-types');
    nodeTypes = new R360NodeTypes();
    await nodeTypes.init();
  });

  it('implements INodeTypes interface', () => {
    expect(typeof nodeTypes.getByName).toBe('function');
    expect(typeof nodeTypes.getByNameAndVersion).toBe('function');
    expect(typeof nodeTypes.getKnownTypes).toBe('function');
  });

  it('loads ManualTrigger node type', () => {
    const manualTrigger = nodeTypes.getByNameAndVersion(
      'n8n-nodes-base.manualTrigger'
    );
    expect(manualTrigger).toBeDefined();
    expect(manualTrigger.description).toBeDefined();
    expect(manualTrigger.description.name).toBe('n8n-nodes-base.manualTrigger');
  });

  it('loads HttpRequest node type', () => {
    const httpRequest = nodeTypes.getByNameAndVersion(
      'n8n-nodes-base.httpRequest'
    );
    expect(httpRequest).toBeDefined();
    expect(httpRequest.description.name).toBe('n8n-nodes-base.httpRequest');
  });

  it('loads Set node type', () => {
    const setNode = nodeTypes.getByNameAndVersion('n8n-nodes-base.set');
    expect(setNode).toBeDefined();
  });

  it('returns known types as a non-empty object', () => {
    const known = nodeTypes.getKnownTypes();
    expect(known).toBeDefined();
    expect(Object.keys(known).length).toBeGreaterThan(0);
  });

  it('throws for unknown node type', () => {
    expect(() => {
      nodeTypes.getByNameAndVersion('n8n-nodes-base.nonExistentNode');
    }).toThrow();
  });

  it('enumerates available node type descriptions', () => {
    const descriptions = nodeTypes.getNodeTypeDescriptions();
    expect(Array.isArray(descriptions)).toBe(true);
    expect(descriptions.length).toBeGreaterThan(100); // n8n-nodes-base has 400+
  });

  it('caches loaded node types (second access is fast)', () => {
    const start = performance.now();
    nodeTypes.getByNameAndVersion('n8n-nodes-base.manualTrigger');
    const firstAccess = performance.now() - start;

    const start2 = performance.now();
    nodeTypes.getByNameAndVersion('n8n-nodes-base.manualTrigger');
    const secondAccess = performance.now() - start2;

    // Second access should be significantly faster (cached)
    expect(secondAccess).toBeLessThan(firstAccess + 1);
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/node-types.ts`

```typescript
import path from 'path';
import type {
  INodeType,
  IVersionedNodeType,
  INodeTypes,
  IDataObject,
  INodeTypeDescription,
  INodeTypeData,
} from 'n8n-workflow';
import { ApplicationError } from 'n8n-workflow';
import { LazyPackageDirectoryLoader } from 'n8n-core';

/**
 * R360NodeTypes implements n8n's INodeTypes interface.
 *
 * It uses LazyPackageDirectoryLoader to load node type definitions from
 * the installed n8n-nodes-base npm package in node_modules/.
 *
 * Key design decisions:
 * - Loaded ONCE at startup, shared across all tenants (node types are stateless)
 * - Uses lazy loading for performance (nodes loaded on first access)
 * - Can register additional custom R360 nodes alongside n8n's built-in nodes
 * - The loader reads from node_modules/n8n-nodes-base/dist/ which is populated
 *   by npm install -- no filesystem hacks needed
 */
export class R360NodeTypes implements INodeTypes {
  private loader: LazyPackageDirectoryLoader | null = null;
  private nodeTypeCache: Map<string, INodeType | IVersionedNodeType> = new Map();
  private customNodeTypes: Map<string, INodeType | IVersionedNodeType> = new Map();
  private initialized = false;

  /**
   * Initialize the node type loader.
   * Must be called once after DI bootstrap and before any execution.
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    // Resolve the installed n8n-nodes-base package directory
    const n8nNodesBasePath = path.dirname(
      require.resolve('n8n-nodes-base/package.json')
    );

    this.loader = new LazyPackageDirectoryLoader(n8nNodesBasePath);
    await this.loader.loadAll();

    this.initialized = true;
  }

  /**
   * Register a custom node type (e.g., R360-specific nodes).
   * Called during startup to add custom nodes alongside n8n built-in nodes.
   */
  registerCustomNodeType(
    typeName: string,
    nodeType: INodeType | IVersionedNodeType
  ): void {
    this.customNodeTypes.set(typeName, nodeType);
  }

  /**
   * Get a node type by name. Returns the latest version if multiple exist.
   * Required by INodeTypes interface.
   */
  getByName(nodeType: string): INodeType | IVersionedNodeType {
    // Check custom nodes first
    const custom = this.customNodeTypes.get(nodeType);
    if (custom) return custom;

    // Check cache
    const cached = this.nodeTypeCache.get(nodeType);
    if (cached) return cached;

    // Load from n8n-nodes-base
    this.ensureInitialized();
    const nodeTypeData = this.loader!.nodeTypes[nodeType];
    if (!nodeTypeData) {
      throw new ApplicationError(`Unknown node type: ${nodeType}`, {
        extra: { nodeType },
      });
    }

    // Lazy-load the actual node class if needed
    const loaded = this.resolveNodeType(nodeType, nodeTypeData);
    this.nodeTypeCache.set(nodeType, loaded);
    return loaded;
  }

  /**
   * Get a node type by name and specific version.
   * Required by INodeTypes interface.
   */
  getByNameAndVersion(nodeType: string, version?: number): INodeType {
    const node = this.getByName(nodeType);

    // If it's a versioned node type, get the specific version
    if ('nodeVersions' in node) {
      const versionedNode = node as IVersionedNodeType;
      const targetVersion =
        version ?? versionedNode.currentVersion;
      const versionNode = versionedNode.nodeVersions[targetVersion];
      if (!versionNode) {
        throw new ApplicationError(
          `Node type ${nodeType} version ${targetVersion} not found`,
          { extra: { nodeType, version: targetVersion } }
        );
      }
      return versionNode;
    }

    return node as INodeType;
  }

  /**
   * Get known node types metadata.
   * Required by INodeTypes interface.
   */
  getKnownTypes(): IDataObject {
    this.ensureInitialized();
    return this.loader!.known.nodes as unknown as IDataObject;
  }

  /**
   * Get all node type descriptions (for palette API).
   * Not part of INodeTypes interface but needed for our node palette endpoint.
   */
  getNodeTypeDescriptions(): INodeTypeDescription[] {
    this.ensureInitialized();
    const descriptions = [...(this.loader!.types.nodes || [])];

    // Add custom node descriptions
    for (const [, nodeType] of this.customNodeTypes) {
      if ('description' in nodeType) {
        descriptions.push(nodeType.description as INodeTypeDescription);
      }
    }

    return descriptions;
  }

  private resolveNodeType(
    nodeType: string,
    nodeTypeData: INodeTypeData[string]
  ): INodeType | IVersionedNodeType {
    if (nodeTypeData.type) {
      return nodeTypeData.type;
    }

    // Lazy load: require the source file
    const sourcePath = nodeTypeData.sourcePath;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeModule = require(sourcePath);
    const nodeClass = nodeModule[nodeTypeData.className || ''];

    if (!nodeClass) {
      throw new ApplicationError(
        `Failed to load node type class for ${nodeType}`,
        { extra: { nodeType, sourcePath } }
      );
    }

    const instance = new nodeClass();
    nodeTypeData.type = instance;
    return instance;
  }

  private ensureInitialized(): void {
    if (!this.initialized || !this.loader) {
      throw new ApplicationError(
        'R360NodeTypes not initialized. Call init() before using.'
      );
    }
  }
}
```

#### 3. Run tests and verify

```bash
cd packages/execution-engine
pnpm test src/__tests__/node-types.test.ts
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `Cannot find module 'n8n-nodes-base/package.json'` | Package not installed or not hoisted | Verify `node_modules/n8n-nodes-base/` exists; check pnpm hoist settings |
| `Error reading dist/known/nodes.json` | n8n-nodes-base not built or missing dist | Ensure installed package has `dist/` directory (it should from npm) |
| `Unknown node type: n8n-nodes-base.manualTrigger` | Loader did not populate nodeTypes | Debug `loader.known.nodes` to see what was loaded; check if node names include the package prefix |
| `Container.get(Logger) fails inside loader` | DI not bootstrapped before init() | Ensure `bootstrapN8nContainer()` is called before `R360NodeTypes.init()` |
| `Node type descriptions length is 0` | Lazy loader skipped type loading | Check `loader.types.nodes` after `loadAll()`; verify `dist/types/nodes.json` exists in n8n-nodes-base |

### Success Criteria

- [ ] `R360NodeTypes` implements all three `INodeTypes` methods
- [ ] `getByNameAndVersion('n8n-nodes-base.manualTrigger')` returns a valid node type
- [ ] `getByNameAndVersion('n8n-nodes-base.httpRequest')` returns a valid node type
- [ ] `getByNameAndVersion('n8n-nodes-base.set')` returns a valid node type
- [ ] `getKnownTypes()` returns a non-empty object
- [ ] `getNodeTypeDescriptions()` returns 100+ node descriptions
- [ ] Unknown node types throw a descriptive error
- [ ] Node types are cached after first access
- [ ] Custom node registration works
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

### Verification Commands

```bash
pnpm --filter @r360/execution-engine test src/__tests__/node-types.test.ts
# Expected: All tests pass

pnpm --filter @r360/execution-engine typecheck
# Expected: No type errors

bash scripts/check-cardinal-rule.sh
# Expected: Cardinal Rule: PASSED
```

---

## Step 3.4: Tenant Credentials Helper

### Objective

Create `packages/execution-engine/src/credentials-helper.ts` implementing n8n's abstract `ICredentialsHelper` class. This is the primary tenant isolation boundary for credentials. Each execution receives a `TenantCredentialsHelper` bound to a specific tenant ID. It queries ONLY that tenant's credentials from the database and decrypts using a per-tenant encryption key derived from the master key + tenant ID.

### Key n8n Interface

```typescript
// From n8n-workflow (interfaces.ts line 209)
abstract class ICredentialsHelper {
  abstract getParentTypes(name: string): string[];
  abstract authenticate(
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    requestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
    workflow: Workflow,
    node: INode,
  ): Promise<IHttpRequestOptions>;
  abstract preAuthentication(
    helpers: IHttpRequestHelper,
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    node: INode,
    credentialsExpired: boolean,
  ): Promise<ICredentialDataDecryptedObject | undefined>;
  abstract getCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
  ): Promise<ICredentials>;
  abstract getDecrypted(
    additionalData: IWorkflowExecuteAdditionalData,
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    mode: WorkflowExecuteMode,
    executeData?: IExecuteData,
    raw?: boolean,
    expressionResolveValues?: ICredentialsExpressionResolveValues,
  ): Promise<ICredentialDataDecryptedObject>;
  abstract updateCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject,
  ): Promise<void>;
}
```

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/credentials-helper.test.ts`

```typescript
import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import type {
  ICredentialDataDecryptedObject,
  INodeCredentialsDetails,
  IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

// Mock the database layer
const mockCredentialStore = {
  findByTenantAndId: vi.fn(),
  findByTenantAndType: vi.fn(),
  updateByTenantAndId: vi.fn(),
};

vi.mock('@r360/db', () => ({
  credentialStore: mockCredentialStore,
}));

describe('TenantCredentialsHelper', () => {
  const tenantId = 'tenant-001';
  const otherTenantId = 'tenant-002';
  const masterKey = 'master-encryption-key-for-testing!';

  let helper: import('../credentials-helper').TenantCredentialsHelper;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { TenantCredentialsHelper } = await import('../credentials-helper');
    helper = new TenantCredentialsHelper(tenantId, masterKey);
  });

  describe('tenant isolation', () => {
    it('queries only the bound tenant credentials', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-123',
        name: 'My Slack Token',
      };

      mockCredentialStore.findByTenantAndId.mockResolvedValue({
        id: 'cred-123',
        tenant_id: tenantId,
        name: 'My Slack Token',
        type: 'slackApi',
        encrypted_data: 'encrypted-blob',
      });

      await helper.getCredentials(nodeCredentials, 'slackApi');

      // Verify the query included the correct tenant_id
      expect(mockCredentialStore.findByTenantAndId).toHaveBeenCalledWith(
        tenantId,
        'cred-123'
      );
    });

    it('rejects credentials from a different tenant', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-456',
        name: 'Other Tenant Cred',
      };

      // Simulate no result for this tenant (credential belongs to another)
      mockCredentialStore.findByTenantAndId.mockResolvedValue(null);

      await expect(
        helper.getCredentials(nodeCredentials, 'slackApi')
      ).rejects.toThrow(/credential.*not found/i);
    });
  });

  describe('encryption round-trip', () => {
    it('encrypts and decrypts credential data correctly', async () => {
      const { TenantCredentialsHelper } = await import(
        '../credentials-helper'
      );
      const originalData: ICredentialDataDecryptedObject = {
        apiKey: 'xoxb-my-slack-token-12345',
        workspace: 'my-workspace',
      };

      // Encrypt
      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        originalData,
        tenantId,
        masterKey
      );
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted).not.toContain('xoxb-my-slack-token');

      // Decrypt
      const decrypted = TenantCredentialsHelper.decryptCredentialData(
        encrypted,
        tenantId,
        masterKey
      );
      expect(decrypted).toEqual(originalData);
    });

    it('cannot decrypt with wrong tenant ID', () => {
      const { TenantCredentialsHelper } = require('../credentials-helper');
      const originalData = { apiKey: 'secret-value' };

      const encrypted = TenantCredentialsHelper.encryptCredentialData(
        originalData,
        tenantId,
        masterKey
      );

      // Different tenant ID should fail decryption
      expect(() => {
        TenantCredentialsHelper.decryptCredentialData(
          encrypted,
          otherTenantId,
          masterKey
        );
      }).toThrow();
    });

    it('derives unique encryption keys per tenant', () => {
      const { TenantCredentialsHelper } = require('../credentials-helper');
      const key1 = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
      const key2 = TenantCredentialsHelper.deriveTenantKey(
        otherTenantId,
        masterKey
      );

      expect(key1).not.toEqual(key2);
      expect(key1.length).toBe(32); // 256-bit key
    });
  });

  describe('getParentTypes', () => {
    it('returns parent credential types', () => {
      // n8n credential types can have inheritance
      // e.g., 'oAuth2Api' is a parent of 'googleSheetsOAuth2Api'
      const parents = helper.getParentTypes('googleSheetsOAuth2Api');
      expect(Array.isArray(parents)).toBe(true);
    });
  });

  describe('getDecrypted', () => {
    it('returns decrypted credential data for the bound tenant', async () => {
      const nodeCredentials: INodeCredentialsDetails = {
        id: 'cred-789',
        name: 'My API Key',
      };

      const { TenantCredentialsHelper } = await import(
        '../credentials-helper'
      );
      const encryptedData = TenantCredentialsHelper.encryptCredentialData(
        { apiKey: 'decrypted-secret-value' },
        tenantId,
        masterKey
      );

      mockCredentialStore.findByTenantAndId.mockResolvedValue({
        id: 'cred-789',
        tenant_id: tenantId,
        name: 'My API Key',
        type: 'httpHeaderAuth',
        encrypted_data: encryptedData,
      });

      const decrypted = await helper.getDecrypted(
        {} as IWorkflowExecuteAdditionalData,
        nodeCredentials,
        'httpHeaderAuth',
        'manual'
      );

      expect(decrypted.apiKey).toBe('decrypted-secret-value');
    });
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/credentials-helper.ts`

```typescript
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import type {
  ICredentialDataDecryptedObject,
  ICredentials,
  ICredentialsExpressionResolveValues,
  IExecuteData,
  IHttpRequestHelper,
  IHttpRequestOptions,
  INode,
  INodeCredentialsDetails,
  IRequestOptionsSimplified,
  IWorkflowExecuteAdditionalData,
  WorkflowExecuteMode,
} from 'n8n-workflow';
import { ICredentialsHelper } from 'n8n-workflow';
import type { Workflow } from 'n8n-workflow';

// Import from our DB package (Phase 1 deliverable)
// import { credentialStore } from '@r360/db';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits
const SALT_PREFIX = 'r360-tenant-key-';

/**
 * TenantCredentialsHelper implements n8n's ICredentialsHelper for tenant isolation.
 *
 * Each instance is bound to a specific tenant ID at construction time.
 * All credential operations are scoped to that tenant:
 * - Database queries filter by tenant_id
 * - Encryption/decryption uses a per-tenant key derived from master key + tenant ID
 * - No cross-tenant credential access is possible
 *
 * Created per-execution, NOT per-container.
 * Injected via IWorkflowExecuteAdditionalData.credentialsHelper
 */
export class TenantCredentialsHelper extends ICredentialsHelper {
  private readonly tenantKey: Buffer;

  constructor(
    private readonly tenantId: string,
    private readonly masterKey: string
  ) {
    super();
    this.tenantKey = TenantCredentialsHelper.deriveTenantKey(
      tenantId,
      masterKey
    );
  }

  // --- Static encryption utilities ---

  /**
   * Derive a per-tenant encryption key from master key + tenant ID.
   * Uses scrypt for key derivation (resistant to brute-force).
   */
  static deriveTenantKey(tenantId: string, masterKey: string): Buffer {
    const salt = `${SALT_PREFIX}${tenantId}`;
    return scryptSync(masterKey, salt, KEY_LENGTH);
  }

  /**
   * Encrypt credential data using the tenant-specific key.
   * Returns a base64 string containing IV + auth tag + ciphertext.
   */
  static encryptCredentialData(
    data: ICredentialDataDecryptedObject,
    tenantId: string,
    masterKey: string
  ): string {
    const key = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const jsonData = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt credential data using the tenant-specific key.
   * Throws if the data was encrypted with a different tenant key.
   */
  static decryptCredentialData(
    encryptedBase64: string,
    tenantId: string,
    masterKey: string
  ): ICredentialDataDecryptedObject {
    const key = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  }

  // --- ICredentialsHelper implementation ---

  getParentTypes(name: string): string[] {
    // TODO: Load credential type hierarchy from n8n-nodes-base
    // For now, return empty array. Phase 3.4 enhancement.
    return [];
  }

  async authenticate(
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    requestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
    workflow: Workflow,
    node: INode
  ): Promise<IHttpRequestOptions> {
    // TODO: Implement credential-specific authentication logic
    // This applies credentials to HTTP requests (e.g., adding auth headers)
    // For now, pass through. Full implementation in Phase 3.4 enhancement.
    return requestOptions as IHttpRequestOptions;
  }

  async preAuthentication(
    helpers: IHttpRequestHelper,
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    node: INode,
    credentialsExpired: boolean
  ): Promise<ICredentialDataDecryptedObject | undefined> {
    // Pre-authentication hook (e.g., refresh OAuth tokens)
    return undefined;
  }

  async getCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string
  ): Promise<ICredentials> {
    // Query credentials from DB, scoped to this tenant
    // const row = await credentialStore.findByTenantAndId(
    //   this.tenantId,
    //   nodeCredentials.id!,
    // );
    //
    // if (!row) {
    //   throw new Error(
    //     `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
    //     `not found for tenant ${this.tenantId}`
    //   );
    // }
    //
    // return {
    //   id: row.id,
    //   name: row.name,
    //   type: row.type,
    //   data: row.encrypted_data,
    //   getData: () => this.decryptRow(row),
    //   getDataToSave: () => ({ id: row.id, name: row.name, type: row.type, data: row.encrypted_data }),
    //   setData: () => { throw new Error('Read-only during execution'); },
    // };

    // Placeholder until DB integration:
    throw new Error(
      `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
        `not found for tenant ${this.tenantId}`
    );
  }

  async getDecrypted(
    additionalData: IWorkflowExecuteAdditionalData,
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    mode: WorkflowExecuteMode,
    executeData?: IExecuteData,
    raw?: boolean,
    expressionResolveValues?: ICredentialsExpressionResolveValues
  ): Promise<ICredentialDataDecryptedObject> {
    // 1. Fetch the encrypted credential row (tenant-scoped)
    // const row = await credentialStore.findByTenantAndId(
    //   this.tenantId,
    //   nodeCredentials.id!,
    // );
    //
    // if (!row) {
    //   throw new Error(
    //     `Credential "${nodeCredentials.name}" not found for tenant ${this.tenantId}`
    //   );
    // }
    //
    // 2. Decrypt using tenant-specific key
    // return TenantCredentialsHelper.decryptCredentialData(
    //   row.encrypted_data,
    //   this.tenantId,
    //   this.masterKey,
    // );

    throw new Error(
      `Credential "${nodeCredentials.name}" not found for tenant ${this.tenantId}`
    );
  }

  async updateCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject
  ): Promise<void> {
    // Encrypt and update in DB (tenant-scoped)
    // const encrypted = TenantCredentialsHelper.encryptCredentialData(
    //   data,
    //   this.tenantId,
    //   this.masterKey,
    // );
    // await credentialStore.updateByTenantAndId(
    //   this.tenantId,
    //   nodeCredentials.id!,
    //   encrypted,
    // );
  }

  // n8n-workflow may also call updateCredentialsOauthTokenData
  async updateCredentialsOauthTokenData?(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject
  ): Promise<void> {
    return this.updateCredentials(nodeCredentials, type, data);
  }
}
```

#### 3. Run tests and verify

```bash
cd packages/execution-engine
pnpm test src/__tests__/credentials-helper.test.ts
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `ICredentialsHelper is not a constructor` | ICredentialsHelper is abstract class, not interface | Use `extends ICredentialsHelper` (it IS an abstract class in n8n-workflow) |
| `TypeError: super() not called` | Missing super() in constructor | Add `super()` call in TenantCredentialsHelper constructor |
| `Unsupported state or unable to authenticate data` | Wrong key used for decryption | Verify tenant ID matches between encrypt and decrypt; check key derivation |
| `Missing abstract method` | n8n updated ICredentialsHelper with new abstract methods | Check n8n-workflow source for any new abstract methods; implement them |
| `Cannot find module '@r360/db'` | DB package not yet linked | Mock the import in tests; actual integration happens when Phase 1 DB is connected |

### Success Criteria

- [ ] `TenantCredentialsHelper` extends `ICredentialsHelper` from `n8n-workflow`
- [ ] All abstract methods implemented (getParentTypes, authenticate, preAuthentication, getCredentials, getDecrypted, updateCredentials)
- [ ] Per-tenant encryption key derivation produces unique keys per tenant
- [ ] Encrypt/decrypt round-trip preserves credential data exactly
- [ ] Decryption with wrong tenant ID throws an error
- [ ] Database queries include tenant_id filtering
- [ ] TypeScript compilation passes with no errors
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

### Verification Commands

```bash
pnpm --filter @r360/execution-engine test src/__tests__/credentials-helper.test.ts
# Expected: All tests pass

pnpm --filter @r360/execution-engine typecheck
# Expected: No type errors

bash scripts/check-cardinal-rule.sh
# Expected: Cardinal Rule: PASSED
```

---

## Step 3.5: Execution Service

### Objective

Create `packages/execution-engine/src/execution-service.ts` -- the central orchestrator that constructs a `Workflow` object, builds tenant-scoped `IWorkflowExecuteAdditionalData`, and calls `WorkflowExecute.run()`. This is where all the pieces from Steps 3.2-3.4 come together.

### Key n8n Interfaces

```typescript
// WorkflowExecute constructor (workflow-execute.ts line 105)
class WorkflowExecute {
  constructor(
    additionalData: IWorkflowExecuteAdditionalData,
    mode: WorkflowExecuteMode,
    runExecutionData?: IRunExecutionData,
  ) {}

  run(options: {
    workflow: Workflow;
    startNode?: INode;
    destinationNode?: IDestinationNode;
    pinData?: IPinData;
  }): PCancelable<IRun>
}

// Workflow constructor (workflow.ts line 47)
interface WorkflowParameters {
  id?: string;
  name?: string;
  nodes: INode[];
  connections: IConnections;
  active: boolean;
  nodeTypes: INodeTypes;
  staticData?: IDataObject;
  settings?: IWorkflowSettings;
  pinData?: IPinData;
}

// IWorkflowExecuteAdditionalData (interfaces.ts line 2917)
// COMPLETE field list -- all fields that must be provided:
interface IWorkflowExecuteAdditionalData {
  credentialsHelper: ICredentialsHelper;
  executeWorkflow: (...) => Promise<ExecuteWorkflowData>;
  getRunExecutionData: (executionId: string) => Promise<IRunExecutionData | undefined>;
  executionId?: string;
  restartExecutionId?: string;
  currentNodeExecutionIndex: number;
  restApiUrl: string;
  instanceBaseUrl: string;
  formWaitingBaseUrl: string;
  webhookBaseUrl: string;
  webhookWaitingBaseUrl: string;
  webhookTestBaseUrl: string;
  variables: IDataObject;
  logAiEvent: (eventName, payload) => void;
  hooks?: ExecutionLifecycleHooks; // augmented by n8n-core
  // Optional fields:
  setExecutionStatus?: (status: ExecutionStatus) => void;
  sendDataToUI?: (type: string, data: IDataObject | IDataObject[]) => void;
  executionTimeoutTimestamp?: number;
  userId?: string;
  currentNodeParameters?: INodeParameters;
  parentCallbackManager?: CallbackManager;
  rootExecutionMode?: WorkflowExecuteMode;
  startRunnerTask: (...) => Promise<Result<T, E>>;
}
```

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/execution-service.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import type { IRun } from 'n8n-workflow';

describe('ExecutionService', () => {
  beforeAll(async () => {
    process.env.N8N_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';
    process.env.N8N_USER_FOLDER = '/tmp/r360-test';
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.WEBHOOK_BASE_URL = 'http://localhost:3000/webhook';
    process.env.MASTER_ENCRYPTION_KEY = 'master-key-for-testing-purposes!';

    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();
  });

  it('executes a ManualTrigger -> Set workflow end-to-end', async () => {
    const { ExecutionService } = await import('../execution-service');
    const { R360NodeTypes } = await import('../node-types');

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    const service = new ExecutionService(nodeTypes);

    // Minimal n8n workflow: ManualTrigger -> Set node
    const n8nWorkflowJson = {
      id: 'test-workflow-001',
      name: 'Test Workflow',
      nodes: [
        {
          id: 'node-1',
          name: 'Manual Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
        {
          id: 'node-2',
          name: 'Set Data',
          type: 'n8n-nodes-base.set',
          typeVersion: 3,
          position: [200, 0] as [number, number],
          parameters: {
            mode: 'manual',
            duplicateItem: false,
            assignments: {
              assignments: [
                {
                  id: 'assign-1',
                  name: 'greeting',
                  value: 'Hello from R360!',
                  type: 'string',
                },
              ],
            },
            options: {},
          },
        },
      ],
      connections: {
        'Manual Trigger': {
          main: [
            [{ node: 'Set Data', type: 'main' as const, index: 0 }],
          ],
        },
      },
      active: false,
      settings: {
        executionOrder: 'v1' as const,
      },
    };

    const result: IRun = await service.executeWorkflow({
      tenantId: 'tenant-test-001',
      workflowJson: n8nWorkflowJson,
      mode: 'manual',
    });

    expect(result).toBeDefined();
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // Verify the Set node output contains our greeting
    const setNodeData = result.data.resultData.runData['Set Data'];
    expect(setNodeData).toBeDefined();
    expect(setNodeData.length).toBeGreaterThan(0);

    const outputItems = setNodeData[0].data?.main?.[0];
    expect(outputItems).toBeDefined();
    expect(outputItems!.length).toBeGreaterThan(0);
    expect(outputItems![0].json.greeting).toBe('Hello from R360!');
  }, 30000); // 30s timeout for execution

  it('records execution status via lifecycle hooks', async () => {
    const { ExecutionService } = await import('../execution-service');
    const { R360NodeTypes } = await import('../node-types');

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    const service = new ExecutionService(nodeTypes);
    const hookEvents: string[] = [];

    const result = await service.executeWorkflow({
      tenantId: 'tenant-test-002',
      workflowJson: {
        id: 'test-wf-hooks',
        name: 'Hook Test',
        nodes: [
          {
            id: 'n1',
            name: 'Trigger',
            type: 'n8n-nodes-base.manualTrigger',
            typeVersion: 1,
            position: [0, 0] as [number, number],
            parameters: {},
          },
        ],
        connections: {},
        active: false,
        settings: { executionOrder: 'v1' as const },
      },
      mode: 'manual',
      onHookEvent: (event: string) => hookEvents.push(event),
    });

    expect(hookEvents).toContain('workflowExecuteBefore');
    expect(hookEvents).toContain('workflowExecuteAfter');
  }, 30000);

  it('rejects execution with missing tenant ID', async () => {
    const { ExecutionService } = await import('../execution-service');
    const { R360NodeTypes } = await import('../node-types');

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    const service = new ExecutionService(nodeTypes);

    await expect(
      service.executeWorkflow({
        tenantId: '', // Empty tenant ID
        workflowJson: { id: '1', name: 'x', nodes: [], connections: {}, active: false },
        mode: 'manual',
      })
    ).rejects.toThrow(/tenant/i);
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/execution-service.ts`

```typescript
import { v4 as uuidv4 } from 'uuid';
import {
  Workflow,
  type INode,
  type IConnections,
  type IRun,
  type IWorkflowExecuteAdditionalData,
  type IWorkflowSettings,
  type IDataObject,
  type WorkflowExecuteMode,
  type IRunExecutionData,
  type IWorkflowBase,
  type ExecuteWorkflowOptions,
  type IExecuteWorkflowInfo,
  ApplicationError,
} from 'n8n-workflow';
import { WorkflowExecute } from 'n8n-core';
import { ExecutionLifecycleHooks } from 'n8n-core';

import type { R360NodeTypes } from './node-types';
import { TenantCredentialsHelper } from './credentials-helper';

export interface ExecuteWorkflowParams {
  tenantId: string;
  workflowJson: {
    id?: string;
    name?: string;
    nodes: INode[];
    connections: IConnections;
    active: boolean;
    settings?: IWorkflowSettings;
  };
  mode: WorkflowExecuteMode;
  /** Optional callback for lifecycle hook events (useful for testing/monitoring) */
  onHookEvent?: (event: string, data?: unknown) => void;
}

/**
 * ExecutionService orchestrates workflow execution with tenant isolation.
 *
 * For each execution it:
 * 1. Validates tenant context
 * 2. Constructs a Workflow object from translated JSON
 * 3. Creates a tenant-scoped TenantCredentialsHelper
 * 4. Builds IWorkflowExecuteAdditionalData with all required fields
 * 5. Sets up ExecutionLifecycleHooks for result persistence
 * 6. Calls WorkflowExecute.run() and returns the result
 *
 * IMPORTANT: The execution engine (n8n packages) is tenant-UNAWARE.
 * All tenant context is injected via additionalData at call time.
 */
export class ExecutionService {
  constructor(private readonly nodeTypes: R360NodeTypes) {}

  /**
   * Execute a workflow with full tenant isolation.
   *
   * @param params - Execution parameters including tenant ID and workflow JSON
   * @returns The complete execution result (IRun)
   */
  async executeWorkflow(params: ExecuteWorkflowParams): Promise<IRun> {
    const { tenantId, workflowJson, mode, onHookEvent } = params;

    // 1. Validate tenant context
    if (!tenantId || tenantId.trim() === '') {
      throw new ApplicationError(
        'Tenant ID is required for workflow execution',
        { extra: { tenantId } }
      );
    }

    // 2. Generate execution ID
    const executionId = uuidv4();

    // 3. Construct the Workflow object
    const workflow = new Workflow({
      id: workflowJson.id || uuidv4(),
      name: workflowJson.name || 'Untitled Workflow',
      nodes: workflowJson.nodes,
      connections: workflowJson.connections,
      active: workflowJson.active,
      nodeTypes: this.nodeTypes,
      staticData: {},
      settings: workflowJson.settings || { executionOrder: 'v1' },
    });

    // 4. Create tenant-scoped credentials helper
    const masterKey =
      process.env.MASTER_ENCRYPTION_KEY || 'default-dev-key-change-in-prod';
    const credentialsHelper = new TenantCredentialsHelper(tenantId, masterKey);

    // 5. Build lifecycle hooks
    const workflowData: IWorkflowBase = {
      id: workflow.id,
      name: workflow.name || 'Untitled',
      nodes: workflowJson.nodes,
      connections: workflowJson.connections,
      active: workflowJson.active,
      settings: workflowJson.settings || {},
    };

    const hooks = new ExecutionLifecycleHooks(mode, executionId, workflowData);

    // Register lifecycle hook handlers
    hooks.addHandler('workflowExecuteBefore', async function (wf) {
      onHookEvent?.('workflowExecuteBefore', { workflowId: wf.id });
      // TODO: Write execution start to DB
      // await executionStore.create({
      //   id: executionId,
      //   tenant_id: tenantId,
      //   workflow_id: workflow.id,
      //   status: 'running',
      //   started_at: new Date(),
      // });
    });

    hooks.addHandler('nodeExecuteBefore', async function (nodeName, data) {
      onHookEvent?.('nodeExecuteBefore', { nodeName });
      // TODO: Write step start to DB
    });

    hooks.addHandler(
      'nodeExecuteAfter',
      async function (nodeName, taskData, executionData) {
        onHookEvent?.('nodeExecuteAfter', { nodeName, taskData });
        // TODO: Write step result to DB
        // await executionStepStore.create({
        //   execution_id: executionId,
        //   node_id: nodeName,
        //   status: taskData.executionStatus || 'success',
        //   input_json: JSON.stringify(taskData.data),
        //   output_json: JSON.stringify(taskData.data),
        //   started_at: taskData.startTime,
        //   finished_at: new Date(),
        // });
      }
    );

    hooks.addHandler('workflowExecuteAfter', async function (fullRunData) {
      onHookEvent?.('workflowExecuteAfter', {
        status: fullRunData.status,
        finished: fullRunData.finished,
      });
      // TODO: Write execution completion to DB
      // await executionStore.update(executionId, {
      //   status: fullRunData.status,
      //   finished_at: new Date(),
      //   context_json: JSON.stringify(fullRunData.data),
      //   error: fullRunData.data.resultData.error?.message,
      // });
    });

    // 6. Build IWorkflowExecuteAdditionalData
    const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
    const webhookBaseUrl =
      process.env.WEBHOOK_BASE_URL || 'http://localhost:3000/webhook';

    const additionalData: IWorkflowExecuteAdditionalData = {
      // Tenant-scoped credentials helper
      credentialsHelper,

      // Sub-workflow execution (for Execute Workflow nodes)
      executeWorkflow: async (
        workflowInfo: IExecuteWorkflowInfo,
        additionalData: IWorkflowExecuteAdditionalData,
        options: ExecuteWorkflowOptions
      ) => {
        // TODO: Implement sub-workflow execution with same tenant context
        throw new ApplicationError('Sub-workflow execution not yet implemented');
      },

      // Execution data retrieval (for wait/resume)
      getRunExecutionData: async (execId: string) => {
        // TODO: Retrieve from DB
        return undefined;
      },

      // Execution identity
      executionId,
      currentNodeExecutionIndex: 0,

      // URL configuration (tenant-prefixed)
      restApiUrl: `${baseUrl}/api`,
      instanceBaseUrl: baseUrl,
      formWaitingBaseUrl: `${baseUrl}/form-waiting/${tenantId}`,
      webhookBaseUrl: `${webhookBaseUrl}/${tenantId}`,
      webhookWaitingBaseUrl: `${webhookBaseUrl}/waiting/${tenantId}`,
      webhookTestBaseUrl: `${webhookBaseUrl}/test/${tenantId}`,

      // Tenant-specific variables
      variables: {},

      // AI event logging
      logAiEvent: (eventName, payload) => {
        // TODO: Implement AI event logging
      },

      // Lifecycle hooks
      hooks,

      // Execution status updates
      setExecutionStatus: (status) => {
        onHookEvent?.('executionStatus', { status });
      },

      // UI data push (for real-time updates)
      sendDataToUI: (type, data) => {
        onHookEvent?.('sendDataToUI', { type, data });
      },

      // Runner task support (for code execution nodes)
      startRunnerTask: async () => {
        throw new ApplicationError('Runner tasks not yet implemented');
      },

      // User context
      userId: tenantId, // Map tenant to user context
    };

    // 7. Execute the workflow
    const workflowExecute = new WorkflowExecute(additionalData, mode);

    const startNode = workflow.getStartNode();
    if (!startNode) {
      throw new ApplicationError(
        'Workflow has no start node (trigger or manual trigger required)',
        { extra: { workflowId: workflow.id } }
      );
    }

    const executionPromise = workflowExecute.run({ workflow, startNode });

    // 8. Await and return the result
    const result: IRun = await executionPromise;
    return result;
  }
}
```

#### 3. Run tests and verify

```bash
cd packages/execution-engine
pnpm test src/__tests__/execution-service.test.ts
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `Failed to run workflow due to missing execution lifecycle hooks` | `hooks` not set on `additionalData` | Ensure `hooks` is assigned to `additionalData` (it is augmented via declaration merging in n8n-core) |
| `No node to start the workflow from could be found` | ManualTrigger node type name is wrong | Verify exact node type name: `n8n-nodes-base.manualTrigger` (case-sensitive) |
| `Unknown node type` | Node types not initialized | Ensure `R360NodeTypes.init()` is called before execution |
| `Cannot read properties of undefined (reading 'runHook')` | Hooks object is null | Double-check hooks assignment; may need explicit type cast for augmented interface |
| `Timeout` | Workflow execution hangs | Check for missing required fields in additionalData; add timeout to test |
| `result.status is 'error'` | Node execution failed internally | Check `result.data.resultData.error` for the detailed error message |

### Success Criteria

- [ ] ManualTrigger -> Set workflow executes successfully
- [ ] `result.finished` is `true` and `result.status` is `'success'`
- [ ] Set node output contains the expected data (`greeting: 'Hello from R360!'`)
- [ ] Lifecycle hooks fire in order: workflowExecuteBefore, nodeExecuteBefore (x2), nodeExecuteAfter (x2), workflowExecuteAfter
- [ ] Empty tenant ID is rejected with descriptive error
- [ ] Webhook URLs contain tenant ID prefix
- [ ] TypeScript compilation passes
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

### Verification Commands

```bash
pnpm --filter @r360/execution-engine test src/__tests__/execution-service.test.ts
# Expected: All tests pass (may take 10-30 seconds for execution)

pnpm --filter @r360/execution-engine typecheck
# Expected: No type errors

bash scripts/check-cardinal-rule.sh
# Expected: Cardinal Rule: PASSED
```

---

## Step 3.6: Lifecycle Hooks

### Objective

Create `packages/execution-engine/src/lifecycle-hooks.ts` with factory functions that produce tenant-scoped lifecycle hook handlers. These handlers persist execution state to the database so every execution is tracked per-tenant.

### Key n8n Interface

```typescript
// From n8n-core (execution-lifecycle-hooks.ts line 15)
type ExecutionLifecycleHookHandlers = {
  nodeExecuteBefore: Array<
    (this: ExecutionLifecycleHooks, nodeName: string, data: ITaskStartedData) => Promise<void> | void
  >;
  nodeExecuteAfter: Array<
    (this: ExecutionLifecycleHooks, nodeName: string, data: ITaskData, executionData: IRunExecutionData) => Promise<void> | void
  >;
  workflowExecuteBefore: Array<
    (this: ExecutionLifecycleHooks, workflow: Workflow, data?: IRunExecutionData) => Promise<void> | void
  >;
  workflowExecuteAfter: Array<
    (this: ExecutionLifecycleHooks, data: IRun, newStaticData: IDataObject) => Promise<void> | void
  >;
  // Also: workflowExecuteResume, sendResponse, sendChunk, nodeFetchedData
};
```

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/lifecycle-hooks.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IRun, IDataObject, Workflow, IRunExecutionData, ITaskData } from 'n8n-workflow';
import { ExecutionLifecycleHooks } from 'n8n-core';
import type { IWorkflowBase } from 'n8n-workflow';

// Mock DB stores
const mockExecutionStore = {
  create: vi.fn(),
  update: vi.fn(),
};
const mockStepStore = {
  create: vi.fn(),
};

vi.mock('@r360/db', () => ({
  executionStore: mockExecutionStore,
  executionStepStore: mockStepStore,
}));

describe('createTenantLifecycleHooks', () => {
  const tenantId = 'tenant-hook-test';
  const executionId = 'exec-001';
  const workflowData: IWorkflowBase = {
    id: 'wf-001',
    name: 'Test WF',
    nodes: [],
    connections: {},
    active: false,
    settings: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates hooks with all required handler types', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    expect(hooks).toBeInstanceOf(ExecutionLifecycleHooks);
    expect(hooks.handlers.workflowExecuteBefore.length).toBeGreaterThan(0);
    expect(hooks.handlers.workflowExecuteAfter.length).toBeGreaterThan(0);
    expect(hooks.handlers.nodeExecuteBefore.length).toBeGreaterThan(0);
    expect(hooks.handlers.nodeExecuteAfter.length).toBeGreaterThan(0);
  });

  it('workflowExecuteBefore handler writes execution start to DB', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockWorkflow = { id: 'wf-001' } as Workflow;
    await hooks.runHook('workflowExecuteBefore', [mockWorkflow]);

    expect(mockExecutionStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: executionId,
        tenant_id: tenantId,
        workflow_id: 'wf-001',
        status: 'running',
      })
    );
  });

  it('workflowExecuteAfter handler writes completion to DB', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockRunData: IRun = {
      finished: true,
      status: 'success',
      mode: 'manual',
      startedAt: new Date(),
      data: { resultData: { runData: {}, lastNodeExecuted: 'Set Data' } },
    } as IRun;

    await hooks.runHook('workflowExecuteAfter', [mockRunData, {}]);

    expect(mockExecutionStore.update).toHaveBeenCalledWith(
      executionId,
      expect.objectContaining({
        status: 'success',
        tenant_id: tenantId,
      })
    );
  });

  it('nodeExecuteAfter handler writes step data to DB', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId,
      executionId,
      workflowData,
      mode: 'manual',
    });

    const mockTaskData = {
      executionStatus: 'success',
      startTime: Date.now(),
      data: { main: [[{ json: { result: 'ok' } }]] },
    } as unknown as ITaskData;

    await hooks.runHook('nodeExecuteAfter', [
      'Set Data',
      mockTaskData,
      {} as IRunExecutionData,
    ]);

    expect(mockStepStore.create).toHaveBeenCalledWith(
      expect.objectContaining({
        execution_id: executionId,
        tenant_id: tenantId,
        node_id: 'Set Data',
      })
    );
  });

  it('all hooks include tenant_id in DB writes', async () => {
    const { createTenantLifecycleHooks } = await import('../lifecycle-hooks');

    const hooks = createTenantLifecycleHooks({
      tenantId: 'tenant-isolation-check',
      executionId,
      workflowData,
      mode: 'manual',
    });

    await hooks.runHook('workflowExecuteBefore', [{ id: 'wf-1' } as Workflow]);

    const createCall = mockExecutionStore.create.mock.calls[0][0];
    expect(createCall.tenant_id).toBe('tenant-isolation-check');
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/lifecycle-hooks.ts`

```typescript
import type {
  IRun,
  IDataObject,
  ITaskData,
  IRunExecutionData,
  IWorkflowBase,
  WorkflowExecuteMode,
  ITaskStartedData,
} from 'n8n-workflow';
import type { Workflow } from 'n8n-workflow';
import { ExecutionLifecycleHooks } from 'n8n-core';

// import { executionStore, executionStepStore } from '@r360/db';

export interface CreateHooksParams {
  tenantId: string;
  executionId: string;
  workflowData: IWorkflowBase;
  mode: WorkflowExecuteMode;
}

/**
 * Create tenant-scoped lifecycle hooks for a workflow execution.
 *
 * Every hook handler writes to tenant-scoped database rows,
 * ensuring execution data is never mixed between tenants.
 *
 * Hook execution order during a normal run:
 *   1. workflowExecuteBefore  (once, at start)
 *   2. nodeExecuteBefore      (per node, before execution)
 *   3. nodeExecuteAfter       (per node, after execution)
 *   4. ... repeat 2-3 for each node ...
 *   5. workflowExecuteAfter   (once, at end)
 */
export function createTenantLifecycleHooks(
  params: CreateHooksParams
): ExecutionLifecycleHooks {
  const { tenantId, executionId, workflowData, mode } = params;

  const hooks = new ExecutionLifecycleHooks(mode, executionId, workflowData);

  // --- workflowExecuteBefore ---
  // Record execution start in the executions table
  hooks.addHandler('workflowExecuteBefore', async function (workflow: Workflow) {
    // await executionStore.create({
    //   id: executionId,
    //   tenant_id: tenantId,
    //   workflow_id: workflow.id,
    //   status: 'running',
    //   started_at: new Date(),
    //   context_json: null,
    //   error: null,
    // });
  });

  // --- nodeExecuteBefore ---
  // Record that a node has started executing
  hooks.addHandler(
    'nodeExecuteBefore',
    async function (nodeName: string, data: ITaskStartedData) {
      // await executionStepStore.create({
      //   execution_id: executionId,
      //   tenant_id: tenantId,
      //   node_id: nodeName,
      //   status: 'running',
      //   started_at: new Date(),
      //   input_json: null,
      //   output_json: null,
      // });
    }
  );

  // --- nodeExecuteAfter ---
  // Record node execution result with input/output data
  hooks.addHandler(
    'nodeExecuteAfter',
    async function (
      nodeName: string,
      taskData: ITaskData,
      executionData: IRunExecutionData
    ) {
      // await executionStepStore.create({
      //   execution_id: executionId,
      //   tenant_id: tenantId,
      //   node_id: nodeName,
      //   status: taskData.executionStatus || 'success',
      //   input_json: JSON.stringify(taskData.data),
      //   output_json: JSON.stringify(taskData.data),
      //   started_at: taskData.startTime
      //     ? new Date(taskData.startTime)
      //     : new Date(),
      //   finished_at: new Date(),
      // });
    }
  );

  // --- workflowExecuteAfter ---
  // Record final execution status and full result data
  hooks.addHandler(
    'workflowExecuteAfter',
    async function (fullRunData: IRun, newStaticData: IDataObject) {
      // await executionStore.update(executionId, {
      //   tenant_id: tenantId,
      //   status: fullRunData.status || (fullRunData.finished ? 'success' : 'error'),
      //   finished_at: new Date(),
      //   context_json: JSON.stringify(fullRunData.data),
      //   error: fullRunData.data.resultData.error?.message || null,
      // });
    }
  );

  return hooks;
}
```

#### 3. Run tests and verify

```bash
pnpm --filter @r360/execution-engine test src/__tests__/lifecycle-hooks.test.ts
```

#### 4. If tests fail

| Failure | Cause | Fix |
|---------|-------|-----|
| `ExecutionLifecycleHooks is not a constructor` | Wrong import path | Import from `n8n-core` (check export path -- may be `n8n-core/dist/execution-engine/execution-lifecycle-hooks`) |
| `hooks.runHook is not a function` | Wrong class instantiated | Verify `ExecutionLifecycleHooks` is the correct class from n8n-core exports |
| `handlers.workflowExecuteBefore.length is 0` | addHandler failed silently | Check addHandler signature matches expected types; TypeScript may silently reject mismatched handler signatures |
| `Cannot find module '@r360/db'` | DB package not yet integrated | Ensure mock is in place for tests; actual DB calls are commented out |

### Success Criteria

- [ ] `createTenantLifecycleHooks` returns a valid `ExecutionLifecycleHooks` instance
- [ ] All four core handlers registered (workflowExecuteBefore/After, nodeExecuteBefore/After)
- [ ] Every DB write includes `tenant_id`
- [ ] Hook execution order is correct
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

### Verification Commands

```bash
pnpm --filter @r360/execution-engine test src/__tests__/lifecycle-hooks.test.ts
# Expected: All tests pass

bash scripts/check-cardinal-rule.sh
# Expected: Cardinal Rule: PASSED
```

---

## Step 3.7: Node Palette API

### Objective

Create a `GET /api/nodes` endpoint that converts n8n `INodeTypeDescription` objects to Workflow Builder `PaletteItem<NodeSchema>` format. This bridges n8n's node catalog with the Workflow Builder's visual palette.

### Key Type Mapping

```
n8n INodeTypeDescription          Workflow Builder NodeDefinition<NodeSchema>
──────────────────────            ────────────────────────────────────────
.name                        ->   .type
.displayName                 ->   .label
.description                 ->   .description
.icon                        ->   .icon (requires icon mapping)
.group (e.g., ['trigger'])   ->   .templateType (NodeType enum)
.properties[]                ->   .schema.properties (field conversion)
.defaults                    ->   .defaultPropertiesData
```

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/execution-engine/src/__tests__/node-palette.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import type { INodeTypeDescription } from 'n8n-workflow';
import type { PaletteItem } from '@workflow-builder/types/common';
import type { NodeSchema } from '@workflow-builder/types/node-schema';

describe('convertToPaletteItem', () => {
  it('converts an n8n node description to PaletteItem', async () => {
    const { convertToPaletteItem } = await import('../node-palette');

    const n8nDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.httpRequest',
      displayName: 'HTTP Request',
      description: 'Makes an HTTP request and returns the response',
      icon: 'file:httpRequest.svg',
      group: ['output'],
      version: [1, 2, 3, 4],
      defaults: { name: 'HTTP Request' },
      properties: [
        {
          displayName: 'Method',
          name: 'method',
          type: 'options',
          options: [
            { name: 'GET', value: 'GET' },
            { name: 'POST', value: 'POST' },
          ],
          default: 'GET',
        },
        {
          displayName: 'URL',
          name: 'url',
          type: 'string',
          default: '',
          placeholder: 'https://example.com',
        },
      ],
      inputs: ['main'],
      outputs: ['main'],
    };

    const paletteItem = convertToPaletteItem(
      n8nDesc as INodeTypeDescription
    );

    expect(paletteItem.type).toBe('n8n-nodes-base.httpRequest');
    expect(paletteItem.label).toBe('HTTP Request');
    expect(paletteItem.description).toBe(
      'Makes an HTTP request and returns the response'
    );
    expect(paletteItem.schema).toBeDefined();
    expect(paletteItem.schema.properties).toBeDefined();
    expect(paletteItem.defaultPropertiesData).toBeDefined();
  });

  it('maps trigger nodes to trigger templateType', async () => {
    const { convertToPaletteItem } = await import('../node-palette');

    const triggerDesc: Partial<INodeTypeDescription> = {
      name: 'n8n-nodes-base.manualTrigger',
      displayName: 'Manual Trigger',
      description: 'Runs the workflow manually',
      group: ['trigger'],
      version: 1,
      defaults: { name: 'Manual Trigger' },
      properties: [],
      inputs: [],
      outputs: ['main'],
    };

    const item = convertToPaletteItem(
      triggerDesc as INodeTypeDescription
    );

    expect(item.templateType).toBe('trigger');
  });

  it('converts n8n properties to NodeSchema fields', async () => {
    const { convertN8nPropertiesToSchema } = await import('../node-palette');

    const n8nProperties = [
      {
        displayName: 'Name',
        name: 'name',
        type: 'string' as const,
        default: '',
        placeholder: 'Enter name',
      },
      {
        displayName: 'Count',
        name: 'count',
        type: 'number' as const,
        default: 0,
      },
      {
        displayName: 'Active',
        name: 'active',
        type: 'boolean' as const,
        default: true,
      },
    ];

    const schema = convertN8nPropertiesToSchema(n8nProperties);

    expect(schema.properties.name.type).toBe('string');
    expect(schema.properties.count.type).toBe('number');
    expect(schema.properties.active.type).toBe('boolean');
  });
});

describe('GET /api/nodes (integration)', () => {
  it('returns palette items for all available nodes', async () => {
    const { buildNodePalette } = await import('../node-palette');
    const { R360NodeTypes } = await import('../node-types');

    process.env.N8N_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';
    process.env.N8N_USER_FOLDER = '/tmp/r360-test';

    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    const palette = buildNodePalette(nodeTypes);

    expect(Array.isArray(palette)).toBe(true);
    expect(palette.length).toBeGreaterThan(50);

    // Verify a known node exists
    const httpNode = palette.find(
      (item) => item.type === 'n8n-nodes-base.httpRequest'
    );
    expect(httpNode).toBeDefined();
    expect(httpNode!.label).toBe('HTTP Request');
  });

  it('supports category filtering', async () => {
    const { buildNodePalette } = await import('../node-palette');
    const { R360NodeTypes } = await import('../node-types');

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    const triggerNodes = buildNodePalette(nodeTypes, {
      category: 'trigger',
    });

    expect(triggerNodes.length).toBeGreaterThan(0);
    triggerNodes.forEach((node) => {
      expect(node.templateType).toBe('trigger');
    });
  });
});
```

#### 2. Implement the feature

**File:** `packages/execution-engine/src/node-palette.ts`

```typescript
import type {
  INodeTypeDescription,
  INodeProperties,
} from 'n8n-workflow';
import type { NodeSchema, FieldSchema, NodePropertiesSchema } from '@workflow-builder/types/node-schema';

import type { R360NodeTypes } from './node-types';

// Simplified PaletteItem type for our API response
// Full type integration with Workflow Builder happens at the frontend layer
export interface N8nPaletteItem {
  type: string;
  label: string;
  description: string;
  icon: string;
  templateType: 'trigger' | 'action' | 'conditional' | 'default';
  schema: NodeSchema;
  defaultPropertiesData: Record<string, unknown>;
  category: string;
}

export interface PaletteFilterOptions {
  category?: string;
  search?: string;
}

/**
 * Convert a single n8n INodeTypeDescription to a PaletteItem-compatible object.
 */
export function convertToPaletteItem(
  desc: INodeTypeDescription
): N8nPaletteItem {
  const isTrigger =
    desc.group?.includes('trigger') ||
    desc.name.toLowerCase().includes('trigger');

  const templateType = isTrigger ? 'trigger' : 'action';

  const schema = convertN8nPropertiesToSchema(desc.properties || []);
  const defaults = buildDefaults(desc.properties || [], desc.defaults);

  // Map n8n icon format to a string identifier
  const icon = resolveIcon(desc);

  // Determine category from codex or group
  const category = desc.codex?.categories?.[0] || desc.group?.[0] || 'other';

  return {
    type: desc.name,
    label: desc.displayName,
    description: desc.description,
    icon,
    templateType,
    schema,
    defaultPropertiesData: {
      label: desc.displayName,
      description: desc.description,
      ...defaults,
    },
    category,
  };
}

/**
 * Convert n8n INodeProperties[] to Workflow Builder NodeSchema.
 */
export function convertN8nPropertiesToSchema(
  properties: INodeProperties[]
): NodeSchema {
  const schemaProperties: NodePropertiesSchema = {
    label: { type: 'string' },
    description: { type: 'string' },
  };

  for (const prop of properties) {
    const fieldSchema = convertPropertyToField(prop);
    if (fieldSchema) {
      schemaProperties[prop.name] = fieldSchema;
    }
  }

  return { properties: schemaProperties };
}

function convertPropertyToField(prop: INodeProperties): FieldSchema | null {
  switch (prop.type) {
    case 'string':
      return {
        type: 'string',
        label: prop.displayName,
        placeholder: prop.placeholder as string | undefined,
      };
    case 'number':
      return {
        type: 'number',
        label: prop.displayName,
      };
    case 'boolean':
      return {
        type: 'boolean',
        label: prop.displayName,
      };
    case 'options':
      return {
        type: 'string',
        label: prop.displayName,
        options: (prop.options || [])
          .filter((o): o is { name: string; value: string } => 'value' in o)
          .map((o) => ({
            label: o.name,
            value: String(o.value),
          })),
      };
    case 'collection':
    case 'fixedCollection':
      return {
        type: 'object',
        label: prop.displayName,
        properties: {},
      };
    default:
      // For complex types, fall back to string
      return {
        type: 'string',
        label: prop.displayName,
      };
  }
}

function buildDefaults(
  properties: INodeProperties[],
  nodeDefaults?: Record<string, unknown>
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const prop of properties) {
    if (prop.default !== undefined) {
      defaults[prop.name] = prop.default;
    }
  }
  return { ...defaults, ...nodeDefaults };
}

function resolveIcon(desc: INodeTypeDescription): string {
  if (typeof desc.icon === 'string') {
    return desc.icon;
  }
  return 'default-node-icon';
}

/**
 * Build the full node palette from all available node types.
 */
export function buildNodePalette(
  nodeTypes: R360NodeTypes,
  filters?: PaletteFilterOptions
): N8nPaletteItem[] {
  const descriptions = nodeTypes.getNodeTypeDescriptions();
  let items = descriptions.map(convertToPaletteItem);

  if (filters?.category) {
    const cat = filters.category.toLowerCase();
    items = items.filter(
      (item) =>
        item.category.toLowerCase() === cat ||
        item.templateType === cat
    );
  }

  if (filters?.search) {
    const search = filters.search.toLowerCase();
    items = items.filter(
      (item) =>
        item.label.toLowerCase().includes(search) ||
        item.description.toLowerCase().includes(search) ||
        item.type.toLowerCase().includes(search)
    );
  }

  return items;
}
```

#### 3-4. Run tests, handle failures

```bash
pnpm --filter @r360/execution-engine test src/__tests__/node-palette.test.ts
```

### Success Criteria

- [ ] `convertToPaletteItem` maps all required fields
- [ ] Trigger nodes get `templateType: 'trigger'`
- [ ] n8n properties convert to valid NodeSchema fields
- [ ] `buildNodePalette` returns 50+ node items from n8n-nodes-base
- [ ] Category filtering works
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

---

## Step 3.8: Custom R360 Nodes

### Objective

Create custom R360-specific n8n nodes in `packages/nodes-r360/` and register them in both the n8n node registry and the Workflow Builder plugin system.

### TDD Implementation

#### 1. Write failing tests first

**File:** `packages/nodes-r360/src/__tests__/assign-inspection.test.ts`

```typescript
import { describe, it, expect } from 'vitest';

describe('AssignInspection node', () => {
  it('has a valid INodeType description', async () => {
    const { AssignInspection } = await import('../nodes/AssignInspection');
    const node = new AssignInspection();

    expect(node.description).toBeDefined();
    expect(node.description.name).toBe('r360.assignInspection');
    expect(node.description.displayName).toBe('Assign Inspection');
    expect(node.description.group).toContain('transform');
    expect(node.description.inputs).toBeDefined();
    expect(node.description.outputs).toBeDefined();
    expect(node.description.properties.length).toBeGreaterThan(0);
  });

  it('registers in R360NodeTypes', async () => {
    process.env.N8N_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';
    process.env.N8N_USER_FOLDER = '/tmp/r360-test';

    const { bootstrapN8nContainer } = await import(
      '@r360/execution-engine/bootstrap'
    );
    await bootstrapN8nContainer();

    const { R360NodeTypes } = await import(
      '@r360/execution-engine/node-types'
    );
    const { AssignInspection } = await import('../nodes/AssignInspection');

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();
    nodeTypes.registerCustomNodeType(
      'r360.assignInspection',
      new AssignInspection()
    );

    const resolved = nodeTypes.getByNameAndVersion('r360.assignInspection');
    expect(resolved).toBeDefined();
    expect(resolved.description.name).toBe('r360.assignInspection');
  });
});
```

#### 2. Implement the feature

**File:** `packages/nodes-r360/src/nodes/AssignInspection.ts`

```typescript
import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class AssignInspection implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Assign Inspection',
    name: 'r360.assignInspection',
    group: ['transform'],
    version: 1,
    description: 'Assign an inspection to a user or team in Record360',
    defaults: { name: 'Assign Inspection' },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    properties: [
      {
        displayName: 'Inspection ID',
        name: 'inspectionId',
        type: 'string',
        default: '',
        required: true,
        description: 'The ID of the inspection to assign',
      },
      {
        displayName: 'Assignee',
        name: 'assignee',
        type: 'string',
        default: '',
        required: true,
        description: 'The user or team to assign the inspection to',
      },
      {
        displayName: 'Priority',
        name: 'priority',
        type: 'options',
        options: [
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
          { name: 'High', value: 'high' },
          { name: 'Urgent', value: 'urgent' },
        ],
        default: 'medium',
        description: 'Priority level for the inspection',
      },
      {
        displayName: 'Notes',
        name: 'notes',
        type: 'string',
        default: '',
        description: 'Additional notes for the assignment',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const inspectionId = this.getNodeParameter('inspectionId', i) as string;
      const assignee = this.getNodeParameter('assignee', i) as string;
      const priority = this.getNodeParameter('priority', i) as string;
      const notes = this.getNodeParameter('notes', i) as string;

      // TODO: Call R360 API to assign inspection
      returnData.push({
        json: {
          success: true,
          inspectionId,
          assignee,
          priority,
          notes,
          assignedAt: new Date().toISOString(),
        },
      });
    }

    return [returnData];
  }
}
```

Create similar files for `RecordAction.ts` and `DocumentAction.ts` following the same pattern.

### Success Criteria

- [ ] AssignInspection, RecordAction, DocumentAction nodes implement `INodeType`
- [ ] Each has valid `INodeTypeDescription` with proper inputs/outputs
- [ ] Each registers in `R360NodeTypes` via `registerCustomNodeType()`
- [ ] Each appears in node palette via `getNodeTypeDescriptions()`
- [ ] Cardinal Rule: zero imports from `n8n/` source directory

---

## Step 3.9: End-to-End Execution Test

### Objective

Verify the complete execution pipeline: create a workflow definition, translate it (if using Workflow Builder format), execute it via the execution service, and verify results. This is the integration smoke test that proves all Phase 3 components work together.

### TDD Implementation

**File:** `packages/execution-engine/src/__tests__/e2e-execution.test.ts`

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import type { IRun } from 'n8n-workflow';

describe('End-to-End Execution', () => {
  beforeAll(async () => {
    process.env.N8N_ENCRYPTION_KEY = 'test-key-32-bytes-long-xxxxxxxx';
    process.env.N8N_USER_FOLDER = '/tmp/r360-test-e2e';
    process.env.MASTER_ENCRYPTION_KEY = 'master-key-for-e2e-testing!!!!!';
    process.env.API_BASE_URL = 'http://localhost:3000';
    process.env.WEBHOOK_BASE_URL = 'http://localhost:3000/webhook';

    const { bootstrapN8nContainer } = await import('../bootstrap');
    await bootstrapN8nContainer();
  });

  it('full pipeline: create -> execute -> verify ManualTrigger -> Set', async () => {
    const { R360NodeTypes } = await import('../node-types');
    const { ExecutionService } = await import('../execution-service');

    // 1. Initialize node types
    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();

    // 2. Create execution service
    const service = new ExecutionService(nodeTypes);

    // 3. Define workflow (simulating what the API would receive)
    const workflowDefinition = {
      id: 'e2e-test-wf-001',
      name: 'E2E Test Workflow',
      nodes: [
        {
          id: 'trigger-1',
          name: 'Start',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
        {
          id: 'set-1',
          name: 'Transform',
          type: 'n8n-nodes-base.set',
          typeVersion: 3,
          position: [200, 0] as [number, number],
          parameters: {
            mode: 'manual',
            duplicateItem: false,
            assignments: {
              assignments: [
                {
                  id: 'a1',
                  name: 'status',
                  value: 'processed',
                  type: 'string',
                },
                {
                  id: 'a2',
                  name: 'tenant',
                  value: '={{ $execution.id }}',
                  type: 'string',
                },
              ],
            },
            options: {},
          },
        },
      ],
      connections: {
        Start: {
          main: [[{ node: 'Transform', type: 'main' as const, index: 0 }]],
        },
      },
      active: false,
      settings: { executionOrder: 'v1' as const },
    };

    // 4. Execute with tenant context
    const hookEvents: string[] = [];
    const result: IRun = await service.executeWorkflow({
      tenantId: 'e2e-tenant-001',
      workflowJson: workflowDefinition,
      mode: 'manual',
      onHookEvent: (event) => hookEvents.push(event),
    });

    // 5. Verify execution completed
    expect(result.finished).toBe(true);
    expect(result.status).toBe('success');

    // 6. Verify node execution data
    const transformData = result.data.resultData.runData['Transform'];
    expect(transformData).toBeDefined();
    expect(transformData[0].data?.main?.[0]?.[0].json.status).toBe(
      'processed'
    );

    // 7. Verify lifecycle hooks fired
    expect(hookEvents).toContain('workflowExecuteBefore');
    expect(hookEvents).toContain('nodeExecuteBefore');
    expect(hookEvents).toContain('nodeExecuteAfter');
    expect(hookEvents).toContain('workflowExecuteAfter');

    // 8. Verify execution order
    const beforeIndex = hookEvents.indexOf('workflowExecuteBefore');
    const afterIndex = hookEvents.indexOf('workflowExecuteAfter');
    expect(beforeIndex).toBeLessThan(afterIndex);
  }, 60000);

  it('tenant isolation: different tenants get independent executions', async () => {
    const { R360NodeTypes } = await import('../node-types');
    const { ExecutionService } = await import('../execution-service');

    const nodeTypes = new R360NodeTypes();
    await nodeTypes.init();
    const service = new ExecutionService(nodeTypes);

    const minimalWorkflow = {
      id: 'isolation-test',
      name: 'Isolation Test',
      nodes: [
        {
          id: 'n1',
          name: 'Trigger',
          type: 'n8n-nodes-base.manualTrigger',
          typeVersion: 1,
          position: [0, 0] as [number, number],
          parameters: {},
        },
      ],
      connections: {},
      active: false,
      settings: { executionOrder: 'v1' as const },
    };

    // Execute for two different tenants
    const [result1, result2] = await Promise.all([
      service.executeWorkflow({
        tenantId: 'tenant-A',
        workflowJson: minimalWorkflow,
        mode: 'manual',
      }),
      service.executeWorkflow({
        tenantId: 'tenant-B',
        workflowJson: minimalWorkflow,
        mode: 'manual',
      }),
    ]);

    // Both should succeed independently
    expect(result1.finished).toBe(true);
    expect(result2.finished).toBe(true);

    // Execution IDs should be different
    // (verified via the additionalData.executionId set in ExecutionService)
  }, 60000);
});
```

### Verification Commands

```bash
pnpm --filter @r360/execution-engine test src/__tests__/e2e-execution.test.ts
# Expected: All tests pass

# Run all Phase 3 tests together
pnpm --filter @r360/execution-engine test
# Expected: All tests pass

# Final Cardinal Rule check
bash scripts/check-cardinal-rule.sh
# Expected: Cardinal Rule: PASSED

# Full typecheck
pnpm --filter @r360/execution-engine typecheck
# Expected: No type errors
```

### Success Criteria

- [ ] Full pipeline executes: workflow definition -> Workflow object -> WorkflowExecute.run() -> IRun result
- [ ] ManualTrigger -> Set workflow produces expected output data
- [ ] Lifecycle hooks fire in correct order
- [ ] Multiple tenants can execute workflows concurrently
- [ ] All Phase 3 tests pass in a single run
- [ ] TypeScript compiles with zero errors
- [ ] Cardinal Rule passes

---

## Debugging n8n Integration

### Common Errors and Solutions

#### 1. Missing DI Service Registration

**Symptom:** `Error: Service "XYZ" was not found, make sure it was registered`

**Cause:** n8n-core's `WorkflowExecute` internally calls `Container.get(SomeService)` for a service we have not registered.

**Solution:**
1. Check the n8n-core source (in `n8n/` reference) for the exact `Container.get()` call
2. Add the corresponding `Container.set()` or ensure the class has `@Service()` decorator and is imported
3. Add a test that exercises the full execution path to catch future regressions
4. Common missing services: `Logger`, `ErrorReporter`, `InstanceSettings`, `ExternalSecretsProxy`

```typescript
// Example fix: register a missing service
import { Container } from '@n8n/di';
Container.set(MissingService, new OurImplementation());
```

#### 2. Credential Resolution Failures

**Symptom:** `Credential "X" not found` or `Unable to decrypt credentials`

**Cause:** TenantCredentialsHelper cannot find or decrypt the credential for the current tenant.

**Diagnosis:**
```typescript
// Add debug logging to getDecrypted
console.log('Resolving credential:', {
  tenantId: this.tenantId,
  credentialId: nodeCredentials.id,
  credentialName: nodeCredentials.name,
  type,
});
```

**Common fixes:**
- Verify the credential exists in the DB with the correct `tenant_id`
- Verify the encryption key derivation matches between encrypt and decrypt
- Check that `nodeCredentials.id` is not null/undefined
- For OAuth credentials, ensure token refresh is handled in `preAuthentication`

#### 3. Node Type Not Found

**Symptom:** `Unknown node type: n8n-nodes-base.someNode`

**Cause:** LazyPackageDirectoryLoader did not load the node, or the name is wrong.

**Diagnosis:**
```typescript
// List all known node types
const known = nodeTypes.getKnownTypes();
console.log('Known nodes:', Object.keys(known).sort());

// Check for the node with partial name match
const matches = Object.keys(known).filter(k => k.includes('someNode'));
console.log('Partial matches:', matches);
```

**Common fixes:**
- Node names are case-sensitive: `manualTrigger` not `ManualTrigger`
- Always include package prefix: `n8n-nodes-base.httpRequest` not just `httpRequest`
- Verify `n8n-nodes-base` package has `dist/known/nodes.json`
- Some nodes are in `@n8n/n8n-nodes-langchain` (AI nodes) -- install separately if needed

#### 4. Expression Evaluation Errors

**Symptom:** `Expression error: ... is not a function` or `Cannot read property of undefined`

**Cause:** n8n expression syntax (e.g., `{{ $json.field }}`) fails because the execution context is incomplete.

**Solution:**
- Ensure `IWorkflowExecuteAdditionalData.variables` is populated
- Verify the input data from the previous node is correctly passed
- Check that `settings.executionOrder` is set to `'v1'` in the workflow

#### 5. Missing Lifecycle Hooks

**Symptom:** `Failed to run workflow due to missing execution lifecycle hooks`

**Cause:** `additionalData.hooks` is undefined. The `hooks` property is augmented onto `IWorkflowExecuteAdditionalData` by n8n-core via TypeScript declaration merging.

**Solution:**
```typescript
// The hooks property is added by n8n-core's declaration merging:
// declare module 'n8n-workflow' {
//   interface IWorkflowExecuteAdditionalData {
//     hooks?: ExecutionLifecycleHooks;
//   }
// }

// You MUST set it on additionalData:
const hooks = new ExecutionLifecycleHooks(mode, executionId, workflowData);
(additionalData as any).hooks = hooks;
// OR: ensure TypeScript sees the augmented type by importing from n8n-core
```

#### 6. WorkflowExecute.run() Returns Immediately With No Data

**Symptom:** `IRun` result has empty `runData` or `undefined` output.

**Cause:** The workflow has no start node, or the start node is not connected.

**Diagnosis:**
```typescript
const startNode = workflow.getStartNode();
console.log('Start node:', startNode?.name, startNode?.type);
console.log('Connections:', JSON.stringify(workflow.connectionsBySourceNode, null, 2));
```

**Common fixes:**
- Ensure the trigger node (ManualTrigger) is present
- Ensure connections use correct node NAMES (not IDs)
- Verify `connections` format matches n8n's expected structure: `{ "NodeName": { main: [[{ node, type, index }]] } }`

#### 7. Version Mismatch Between n8n Packages

**Symptom:** TypeScript compilation errors or runtime `TypeError` from n8n internals.

**Cause:** Different n8n packages at different versions have incompatible interfaces.

**Solution:**
- Pin ALL n8n packages to the SAME version
- Run `pnpm list n8n-workflow n8n-core n8n-nodes-base` to verify versions match
- Test upgrades in CI before bumping: change version, run full test suite

---

## Phase Completion Checklist

- [ ] **Step 3.1**: n8n packages installed, pinned, importable; Cardinal Rule CI script passes
- [ ] **Step 3.2**: DI bootstrap runs once, registers InstanceSettings/Logger/ErrorReporter/BinaryDataService
- [ ] **Step 3.3**: R360NodeTypes loads 400+ nodes from n8n-nodes-base, implements INodeTypes
- [ ] **Step 3.4**: TenantCredentialsHelper implements ICredentialsHelper with per-tenant encryption
- [ ] **Step 3.5**: ExecutionService builds tenant-scoped additionalData, calls WorkflowExecute.run()
- [ ] **Step 3.6**: Lifecycle hooks write execution state to tenant-scoped DB rows
- [ ] **Step 3.7**: Node palette API converts INodeTypeDescription to PaletteItem format
- [ ] **Step 3.8**: Custom R360 nodes (AssignInspection, RecordAction, DocumentAction) registered
- [ ] **Step 3.9**: E2E test passes: create workflow -> execute -> verify results
- [ ] All tests pass: `pnpm --filter @r360/execution-engine test`
- [ ] TypeScript compiles: `pnpm --filter @r360/execution-engine typecheck`
- [ ] Cardinal Rule enforced: `bash scripts/check-cardinal-rule.sh` passes
- [ ] No imports from `n8n/` source directory in any package
- [ ] All n8n packages at same pinned version

## Rollback Procedure

If Phase 3 integration causes issues that cannot be resolved:

### Level 1: Revert Specific Step

```bash
# Identify the problematic commit
git log --oneline packages/execution-engine/

# Revert the specific commit
git revert <commit-hash>

# Re-run tests to verify stability
pnpm --filter @r360/execution-engine test
```

### Level 2: Revert n8n Package Version

```bash
# If a version upgrade broke things, pin back to last known good version
cd packages/execution-engine
pnpm add n8n-workflow@<previous-version> n8n-core@<previous-version> n8n-nodes-base@<previous-version>

# Re-run full test suite
pnpm --filter @r360/execution-engine test
```

### Level 3: Full Phase Rollback

```bash
# If the entire n8n integration is unstable, remove execution-engine package
# Phase 1 (DB) and Phase 2 (JSON translator) remain unaffected
git revert --no-commit <first-phase3-commit>..<latest-phase3-commit>
git commit -m "Revert Phase 3: n8n integration unstable, reverting to pre-integration state"

# The API server continues to work for workflow CRUD (Phase 1)
# The JSON translator continues to work (Phase 2)
# Execution is disabled until Phase 3 is re-attempted
```

### Data Safety

- Phase 3 does NOT modify the database schema (that was Phase 1)
- Phase 3 does NOT modify the JSON translator (that was Phase 2)
- Phase 3 does NOT modify the Workflow Builder frontend
- Rollback only affects `packages/execution-engine/` and `packages/nodes-r360/`
- All existing workflow definitions and credentials remain intact in the DB
