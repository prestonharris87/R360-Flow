import { getDb } from '@r360/db';
import { workflows } from '@r360/db';
import { eq, sql } from 'drizzle-orm';

const WORKFLOW_ID = 'ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1';

async function main() {
  const db = getDb();
  const rows = await db.select().from(workflows).where(eq(workflows.id, WORKFLOW_ID));
  const defn = rows[0].definitionJson as any;
  let changed = 0;

  for (const node of defn.nodes) {
    const t: string = node.type || '';
    if (t.includes('lmChatOpenAi')) {
      const hasCreds = node.credentials && Object.keys(node.credentials).length > 0;
      if (!hasCreds) {
        node.credentials = {
          openAiApi: {
            id: 'ad85776c-6c31-4abb-aa6c-471e0e963f12',
            name: 'Preston Harris',
          },
        };
        changed++;
        console.log('Patched:', node.name);
      }
    }
  }

  if (changed > 0) {
    const jsonStr = JSON.stringify(defn);
    await db.execute(
      sql`UPDATE workflows SET definition_json = ${jsonStr}::jsonb WHERE id = ${WORKFLOW_ID}`
    );
    console.log(`Patched ${changed} OpenAI nodes.`);
  } else {
    console.log('No OpenAI nodes needed patching.');
  }
  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
