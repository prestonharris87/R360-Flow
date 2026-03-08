import { getDb } from '@r360/db';
import { workflows } from '@r360/db';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const rows = await db.select().from(workflows).where(eq(workflows.id, 'ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1'));

  if (rows.length === 0) {
    console.log('No workflow found with that ID');
    process.exit(1);
  }

  const defn = rows[0].definitionJson as any;

  console.log('=== ALL NODES (summary) ===');
  for (let i = 0; i < defn.nodes.length; i++) {
    const node = defn.nodes[i];
    console.log(`[${i}] ${node.name} | type: ${node.type} | typeVersion: ${node.typeVersion}`);
  }

  // Show first 5 nodes in full detail
  for (let i = 0; i < Math.min(5, defn.nodes.length); i++) {
    console.log(`\n=== NODE [${i}]: ${defn.nodes[i].name} ===`);
    console.log(JSON.stringify(defn.nodes[i], null, 2));
  }

  console.log('\n=== CONNECTIONS ===');
  console.log(JSON.stringify(defn.connections, null, 2));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
