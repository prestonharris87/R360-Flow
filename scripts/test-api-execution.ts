#!/usr/bin/env tsx
/**
 * Test n8n Workflow Execution via API
 *
 * Runs a Hello World workflow (ManualTrigger -> Set) through the full API stack
 * as the seeded dev user, so the execution shows up in the frontend UI.
 *
 * Prerequisites:
 *   1. PostgreSQL running with r360flow database
 *   2. pnpm db:seed executed (creates dev tenant/user)
 *   3. API server running (pnpm dev) on port 3100
 *   4. Frontend running (cd workflowbuilder/apps/frontend && pnpm dev) on port 4200
 *
 * Usage:
 *   pnpm tsx scripts/test-api-execution.ts
 */

const API_BASE = 'http://localhost:3100';
const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;

const HELLO_WORLD_WORKFLOW = {
  id: 'hello-world-001',
  name: 'Hello World Workflow',
  nodes: [
    {
      id: 'node-trigger',
      name: 'When clicking Test workflow',
      type: 'n8n-nodes-base.manualTrigger',
      typeVersion: 1,
      position: [0, 0],
      parameters: {},
    },
    {
      id: 'node-set',
      name: 'Set Hello World',
      type: 'n8n-nodes-base.set',
      typeVersion: 3.4,
      position: [200, 0],
      parameters: {
        mode: 'manual',
        duplicateItem: false,
        assignments: {
          assignments: [
            {
              id: 'assign-message',
              name: 'message',
              value: 'Hello World!',
              type: 'string',
            },
            {
              id: 'assign-timestamp',
              name: 'timestamp',
              value: '={{ $now }}',
              type: 'string',
            },
          ],
        },
        includeOtherFields: false,
        options: {},
      },
    },
  ],
  connections: {
    'When clicking Test workflow': {
      main: [[{ node: 'Set Hello World', type: 'main', index: 0 }]],
    },
  },
  active: false,
  settings: { executionOrder: 'v1' },
};

async function apiCall(
  method: string,
  path: string,
  token?: string,
  body?: unknown
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  return { status: res.status, data };
}

function log(step: string, msg: string) {
  console.log(`\n[${'Step ' + step}] ${msg}`);
}

function fail(msg: string): never {
  console.error(`\nFAILED: ${msg}`);
  process.exit(1);
}

async function main() {
  console.log('=== R360 Flow: Hello World Execution Test ===\n');

  // Step 0: Check API health
  log('0', 'Checking API server health...');
  try {
    const health = await apiCall('GET', '/api/health/live');
    if (health.status !== 200) fail(`Health check returned ${health.status}`);
    console.log('  API server is alive.');
  } catch (err: any) {
    fail(`Cannot reach API at ${API_BASE}. Is the server running? (${err.message})`);
  }

  // Step 1: Authenticate as seeded dev user
  log('1', 'Authenticating as admin@r360.dev...');
  const auth = await apiCall('POST', '/api/auth/login', undefined, {
    email: 'admin@r360.dev',
  });
  if (auth.status !== 200) fail(`Auth failed: ${auth.status} ${JSON.stringify(auth.data)}`);
  const token = auth.data.token;
  const tenantId = auth.data.user.tenantId;
  console.log(`  Authenticated. Token: ${token.slice(0, 20)}...`);
  console.log(`  Tenant: ${tenantId}`);

  // Step 2: Create workflow
  log('2', 'Creating Hello World workflow...');
  const createRes = await apiCall('POST', '/api/workflows', token, {
    name: 'Hello World Workflow',
    description: 'ManualTrigger -> Set: outputs { message, timestamp }',
    definitionJson: HELLO_WORLD_WORKFLOW,
  });
  if (createRes.status !== 201) {
    fail(`Create workflow failed: ${createRes.status} ${JSON.stringify(createRes.data)}`);
  }
  const workflowId = createRes.data.id;
  console.log(`  Workflow created: ${workflowId}`);

  // Step 3: Execute the workflow
  log('3', 'Triggering workflow execution...');
  const execRes = await apiCall('POST', `/api/workflows/${workflowId}/execute`, token, {});
  if (execRes.status !== 202) {
    fail(`Execute failed: ${execRes.status} ${JSON.stringify(execRes.data)}`);
  }
  const executionId = execRes.data.id;
  console.log(`  Execution started: ${executionId}`);

  // Step 4: Poll for completion
  log('4', 'Polling for execution completion...');
  const startTime = Date.now();
  let execution: any = null;

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    const pollRes = await apiCall('GET', `/api/executions/${executionId}`, token);
    if (pollRes.status !== 200) {
      fail(`Poll failed: ${pollRes.status} ${JSON.stringify(pollRes.data)}`);
    }
    execution = pollRes.data;
    const status = execution.status;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`  [${elapsed}s] Status: ${status}`);

    if (status === 'success' || status === 'failed' || status === 'cancelled') {
      break;
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!execution || (execution.status !== 'success' && execution.status !== 'failed')) {
    fail(`Execution did not complete within ${POLL_TIMEOUT_MS / 1000}s. Last status: ${execution?.status}`);
  }

  // Step 5: Print results
  log('5', 'Execution complete!');
  console.log(`\n  Status:     ${execution.status}`);
  console.log(`  Started:    ${execution.startedAt}`);
  console.log(`  Finished:   ${execution.finishedAt}`);

  if (execution.errorMessage) {
    console.log(`  Error:      ${execution.errorMessage}`);
  }

  if (execution.steps && execution.steps.length > 0) {
    console.log(`\n  Execution Steps (${execution.steps.length}):`);
    for (const step of execution.steps) {
      console.log(`    - ${step.nodeName} [${step.status}]`);
      if (step.outputData) {
        const output = typeof step.outputData === 'string' ? JSON.parse(step.outputData) : step.outputData;
        console.log(`      Output: ${JSON.stringify(output, null, 2).split('\n').join('\n      ')}`);
      }
    }
  }

  if (execution.contextJson) {
    const ctx = typeof execution.contextJson === 'string' ? JSON.parse(execution.contextJson) : execution.contextJson;
    if (ctx.resultData?.runData) {
      console.log('\n  Run Data (from context):');
      for (const [nodeName, runs] of Object.entries(ctx.resultData.runData) as any) {
        for (const run of runs) {
          if (run.data?.main?.[0]) {
            const items = run.data.main[0];
            console.log(`    ${nodeName}:`);
            for (const item of items) {
              console.log(`      ${JSON.stringify(item.json)}`);
            }
          }
        }
      }
    }
  }

  console.log('\n=== Test Complete ===');
  console.log(`\nView in the UI:`);
  console.log(`  Executions list: http://localhost:4200/executions`);
  console.log(`  This execution:  http://localhost:4200/executions/${executionId}`);
  console.log(`  Workflow:        http://localhost:4200/workflows/${workflowId}`);

  process.exit(execution.status === 'success' ? 0 : 1);
}

main().catch((err) => {
  console.error('\nUnhandled error:', err);
  process.exit(1);
});
