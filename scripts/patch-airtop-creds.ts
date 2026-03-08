import { getDb } from '@r360/db';
import { workflows } from '@r360/db';
import { eq, sql } from 'drizzle-orm';

const WORKFLOW_ID = 'ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1';
const AIRTOP_CRED = {
  airtopApi: {
    id: 'd4371c4a-546b-4215-a9c2-9c572ea06238',
    name: 'Preston Harris',
  },
};

async function main() {
  const db = getDb();
  const rows = await db.select().from(workflows).where(eq(workflows.id, WORKFLOW_ID));
  if (rows.length === 0) {
    console.log('Workflow not found');
    process.exit(1);
  }

  const wf = rows[0];
  const defn = wf.definitionJson as any;
  let changed = 0;

  for (const node of defn.nodes) {
    const t: string = node.type || '';
    // Patch any airtop/airtopTool node that's missing credentials
    const isAirtop = t.includes('airtop') || t.includes('Airtop');
    const isHttpRequest = t.includes('httpRequest');
    if (isAirtop && !isHttpRequest) {
      const hasCreds = node.credentials && Object.keys(node.credentials).length > 0;
      if (!hasCreds) {
        node.credentials = { ...AIRTOP_CRED };
        changed++;
        console.log('Patched:', node.name, `(${t})`);
      }
    }
  }

  // Also patch the OpenAI node if needed
  for (const node of defn.nodes) {
    const t: string = node.type || '';
    if (t.includes('lmChatOpenAi')) {
      const hasCreds = node.credentials && Object.keys(node.credentials).length > 0;
      if (!hasCreds) {
        // Check if there's an openAiApi credential in the DB
        console.log('OpenAI node missing credentials:', node.name);
      }
    }
  }

  if (changed > 0) {
    const jsonStr = JSON.stringify(defn);
    await db.execute(
      sql`UPDATE workflows SET definition_json = ${jsonStr}::jsonb WHERE id = ${WORKFLOW_ID}`
    );
    console.log(`\nDone. Patched ${changed} Airtop nodes with credentials.`);
  } else {
    console.log('No nodes needed patching.');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
