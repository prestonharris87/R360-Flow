import { eq, and, inArray } from 'drizzle-orm';
import { credentials } from '@r360/db';
import { getDb } from '@r360/db';

interface CredentialRef {
  id: string;
  name: string;
}

interface CredentialMappingResult {
  mapped: Array<{ type: string; credentialId: string; credentialName: string }>;
  unmapped: string[];
}

/**
 * Auto-map credential references in workflow nodes to tenant's actual credentials.
 * For each credential type found in the nodes, finds the first matching credential
 * owned by the tenant and replaces the reference.
 */
export async function autoMapCredentials(
  nodes: Array<{ data: { properties: Record<string, unknown>; [key: string]: unknown }; [key: string]: unknown }>,
  tenantId: string,
): Promise<{ nodes: typeof nodes; credentialMapping: CredentialMappingResult }> {
  // 1. Extract all unique credential types from nodes
  const credentialTypes = new Set<string>();
  for (const node of nodes) {
    const creds = node.data.properties.credentials as Record<string, CredentialRef> | undefined;
    if (creds && typeof creds === 'object') {
      for (const credType of Object.keys(creds)) {
        credentialTypes.add(credType);
      }
    }
  }

  if (credentialTypes.size === 0) {
    return { nodes, credentialMapping: { mapped: [], unmapped: [] } };
  }

  // 2. Query tenant's credentials for matching types
  const db = getDb();
  const tenantCreds = await db
    .select({ id: credentials.id, name: credentials.name, type: credentials.type })
    .from(credentials)
    .where(
      and(
        eq(credentials.tenantId, tenantId),
        inArray(credentials.type, Array.from(credentialTypes))
      )
    );

  // 3. Group by type (first match per type wins)
  const credByType = new Map<string, { id: string; name: string }>();
  for (const cred of tenantCreds) {
    if (!credByType.has(cred.type)) {
      credByType.set(cred.type, { id: cred.id, name: cred.name });
    }
  }

  // 4. Map credentials in nodes
  const mapped: CredentialMappingResult['mapped'] = [];
  const unmappedSet = new Set<string>();

  const updatedNodes = nodes.map((node) => {
    const creds = node.data.properties.credentials as Record<string, CredentialRef> | undefined;
    if (!creds || typeof creds !== 'object') return node;

    const newCreds: Record<string, CredentialRef> = {};
    for (const [credType, _ref] of Object.entries(creds)) {
      const tenantCred = credByType.get(credType);
      if (tenantCred) {
        newCreds[credType] = { id: tenantCred.id, name: tenantCred.name };
        // Only add to mapped once per type
        if (!mapped.some((m) => m.type === credType)) {
          mapped.push({ type: credType, credentialId: tenantCred.id, credentialName: tenantCred.name });
        }
      } else {
        newCreds[credType] = _ref; // Keep original reference
        unmappedSet.add(credType);
      }
    }

    return {
      ...node,
      data: {
        ...node.data,
        properties: {
          ...node.data.properties,
          credentials: newCreds,
        },
      },
    };
  });

  return {
    nodes: updatedNodes,
    credentialMapping: { mapped, unmapped: Array.from(unmappedSet) },
  };
}
