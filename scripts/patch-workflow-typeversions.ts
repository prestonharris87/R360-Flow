/**
 * Patch all workflows in the database:
 * 1. Add typeVersion to every node (looked up from n8n node type registry)
 * 2. Remove provideSslCertificates from nodes that don't have httpSslAuth credentials
 *
 * Run with: pnpm tsx scripts/patch-workflow-typeversions.ts
 */
import 'reflect-metadata';
import postgres from 'postgres';
import { bootstrapN8nContainer, isBootstrapped, R360NodeTypes } from '@r360/execution-engine';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://r360:r360_dev_password@localhost:5432/r360flow';

async function main() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  // Bootstrap n8n DI container to get node type info
  console.log('Bootstrapping n8n container...');
  if (!isBootstrapped()) {
    await bootstrapN8nContainer({
      encryptionKey: process.env.MASTER_ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      userFolder: '/tmp/r360-flow-n8n',
    });
  }

  console.log('Initializing R360NodeTypes...');
  const nodeTypes = new R360NodeTypes();
  await nodeTypes.init();

  // Build a map of node type name -> latest version number.
  // getNodeTypeDescriptions() returns SHORT names (e.g., "httpRequest", "agent")
  // but workflow definitions use FULLY QUALIFIED names (e.g., "n8n-nodes-base.httpRequest").
  // We store both the short name and common fully-qualified prefixes so lookups work either way.
  const descriptions = nodeTypes.getNodeTypeDescriptions();
  const versionMap = new Map<string, number>();
  for (const desc of descriptions) {
    const version = Array.isArray(desc.version)
      ? Math.max(...desc.version)
      : (desc.version ?? 1);
    // Store by short name
    versionMap.set(desc.name, version);
    // Also store with common package prefixes for fully-qualified lookup
    versionMap.set(`n8n-nodes-base.${desc.name}`, version);
    versionMap.set(`@n8n/n8n-nodes-langchain.${desc.name}`, version);
  }

  console.log(`Loaded ${descriptions.length} node type descriptions (${versionMap.size} lookup entries).`);

  // Print a few examples
  const examples = ['n8n-nodes-base.httpRequest', 'n8n-nodes-base.manualTrigger', 'n8n-nodes-base.airtop', 'n8n-nodes-base.airtopTool', '@n8n/n8n-nodes-langchain.agent', '@n8n/n8n-nodes-langchain.lmChatOpenAi'];
  for (const ex of examples) {
    console.log(`  ${ex} -> v${versionMap.get(ex) ?? 'NOT FOUND'}`);
  }

  // Fetch all workflows
  const allWorkflows = await sql`SELECT id, name, definition_json FROM workflows`;
  console.log(`\nFound ${allWorkflows.length} workflows to check.`);

  let patchedCount = 0;

  for (const wf of allWorkflows) {
    const defn = wf.definition_json as any;
    if (!defn?.nodes || !Array.isArray(defn.nodes)) {
      console.log(`  SKIP: ${wf.name} (${wf.id}) - no nodes array`);
      continue;
    }

    let changed = false;
    const changes: string[] = [];

    for (const node of defn.nodes) {
      // Add typeVersion if missing
      if (!node.typeVersion) {
        const nodeType = node.type as string;
        const version = versionMap.get(nodeType);
        if (version) {
          node.typeVersion = version;
          changes.push(`  + typeVersion=${version} for "${node.name}" (${nodeType})`);
          changed = true;
        } else {
          changes.push(`  ! Could not find version for "${node.name}" (${nodeType})`);
        }
      }

      // Fix provideSslCertificates: remove if set but no httpSslAuth credential
      if (node.parameters?.provideSslCertificates === true) {
        if (!node.credentials?.httpSslAuth) {
          delete node.parameters.provideSslCertificates;
          changes.push(`  - Removed provideSslCertificates from "${node.name}" (no httpSslAuth credential)`);
          changed = true;
        }
      }
    }

    if (changed) {
      // postgres.js handles object -> jsonb serialization automatically via sql.json()
      await sql`UPDATE workflows SET definition_json = ${sql.json(defn)}, updated_at = NOW() WHERE id = ${wf.id}`;
      patchedCount++;
      console.log(`\nPatched: ${wf.name} (${wf.id})`);
      for (const c of changes) {
        console.log(c);
      }
    }
  }

  console.log(`\nDone. Patched ${patchedCount} of ${allWorkflows.length} workflows.`);

  await sql.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
