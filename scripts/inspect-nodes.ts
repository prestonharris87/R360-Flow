import { getDb } from '@r360/db';
import { workflows } from '@r360/db';
import { eq } from 'drizzle-orm';

async function main() {
  const db = getDb();
  const rows = await db.select().from(workflows).where(eq(workflows.id, 'ff7d28a6-6b9a-46fb-b58e-afaabe5a18c1'));
  const defn = rows[0].definitionJson as any;

  // Show Create Airtop Session (index 8) - the HTTP request node
  const node8 = defn.nodes[8];
  console.log('=== NODE 8: Create Airtop Session (HTTP Request) ===');
  console.log(JSON.stringify(node8, null, 2));

  // Show Create a window (index 4) - the one that references session ID
  const node4 = defn.nodes[4];
  console.log('\n=== NODE 4: Create a window ===');
  console.log(JSON.stringify(node4, null, 2));

  // Show Fill Login Form (index 9)
  const node9 = defn.nodes[9];
  console.log('\n=== NODE 9: Fill Login Form ===');
  console.log(JSON.stringify(node9, null, 2));

  // Show connections specifically for these nodes
  console.log('\n=== CONNECTION: Create Airtop Session ===');
  console.log(JSON.stringify(defn.connections['Create Airtop Session'], null, 2));

  console.log('\n=== CONNECTION: Create a window ===');
  console.log(JSON.stringify(defn.connections['Create a window'], null, 2));

  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
