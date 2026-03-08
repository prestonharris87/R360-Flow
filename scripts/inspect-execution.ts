import { getDb, closeConnection } from '@r360/db';
import { executions, executionSteps } from '@r360/db';
import { eq, desc } from 'drizzle-orm';

async function main() {
  const db = getDb();

  // Get the most recent execution for this workflow
  const execs = await db.select().from(executions)
    .where(eq(executions.workflowId, 'ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1'))
    .orderBy(desc(executions.createdAt))
    .limit(1);

  if (execs.length === 0) {
    console.log('No executions found for workflow ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1');

    // List all executions to see what's there
    console.log('\n=== ALL EXECUTIONS (last 10) ===');
    const allExecs = await db.select().from(executions)
      .orderBy(desc(executions.createdAt))
      .limit(10);
    for (const e of allExecs) {
      console.log(`  ID: ${e.id} | Workflow: ${e.workflowId} | Status: ${e.status} | Created: ${e.createdAt}`);
    }

    await closeConnection();
    process.exit(0);
  }

  const exec = execs[0];
  console.log('=== EXECUTION ===');
  console.log('ID:', exec.id);
  console.log('Status:', exec.status);
  console.log('Mode:', exec.mode);
  console.log('Created:', exec.createdAt);
  console.log('Started:', exec.startedAt);
  console.log('Finished:', exec.finishedAt);
  console.log('Error:', exec.error);

  // Show the context JSON
  const contextStr = JSON.stringify(exec.contextJson, null, 2);
  console.log('\n=== CONTEXT JSON ===');
  console.log(contextStr);

  // Get execution steps
  const steps = await db.select().from(executionSteps)
    .where(eq(executionSteps.executionId, exec.id))
    .orderBy(executionSteps.startedAt);

  console.log(`\n=== EXECUTION STEPS (${steps.length} total) ===`);
  for (const step of steps) {
    console.log(`\n--- Step: ${step.nodeName ?? step.nodeId} (${step.nodeType ?? 'unknown type'}) ---`);
    console.log('  Node ID:', step.nodeId);
    console.log('  Status:', step.status);
    console.log('  Started:', step.startedAt);
    console.log('  Finished:', step.finishedAt);

    if (step.error) {
      const errorStr = JSON.stringify(step.error, null, 2);
      console.log('  Error:', errorStr);
    }

    if (step.inputJson) {
      const inputStr = JSON.stringify(step.inputJson, null, 2);
      console.log('  Input (first 3000 chars):', inputStr.substring(0, 3000));
      if (inputStr.length > 3000) console.log('  ... [truncated, total length:', inputStr.length, ']');
    }

    if (step.outputJson) {
      const outputStr = JSON.stringify(step.outputJson, null, 2);
      console.log('  Output (first 5000 chars):', outputStr.substring(0, 5000));
      if (outputStr.length > 5000) console.log('  ... [truncated, total length:', outputStr.length, ']');
    } else {
      console.log('  Output: null');
    }
  }

  await closeConnection();
  process.exit(0);
}

main().catch(async (e) => {
  console.error(e);
  await closeConnection();
  process.exit(1);
});
