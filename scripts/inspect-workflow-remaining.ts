import { getDb } from '@r360/db';
import { workflows } from '@r360/db';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const rows = await db.select().from(workflows).where(eq(workflows.id, 'ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1'));
  const defn = rows[0].definitionJson as any;

  // Show remaining nodes 5-13
  for (let i = 5; i < defn.nodes.length; i++) {
    console.log(`\n=== NODE [${i}]: ${defn.nodes[i].name} ===`);
    console.log(JSON.stringify(defn.nodes[i], null, 2));
  }

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
