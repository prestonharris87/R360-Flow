import { bootstrapN8nContainer, isBootstrapped, getCredentialTypeRegistry } from '@r360/execution-engine';
import { TenantCredentialsHelper } from '@r360/execution-engine';
import { getDb } from '@r360/db';
import { credentials } from '@r360/db';
import { eq } from 'drizzle-orm';

async function main() {
  const bootstrapped = isBootstrapped();
  if (bootstrapped === false) {
    await bootstrapN8nContainer({
      encryptionKey: process.env.N8N_ENCRYPTION_KEY || process.env.MASTER_ENCRYPTION_KEY || 'default-dev-key-change-in-prod',
      userFolder: '/tmp/r360-flow-n8n',
    });
  }

  // 1. Check the credential type definition
  const registry = getCredentialTypeRegistry();
  const airtopType = registry.getByName('airtopApi');
  if (airtopType) {
    console.log('=== Airtop Credential Type ===');
    console.log('authenticate:', JSON.stringify((airtopType as any).authenticate, null, 2));
    console.log('properties:', airtopType.properties?.map(p => p.name));
  } else {
    console.log('airtopApi NOT FOUND in registry');
  }

  // 2. Try decrypting the credential
  const masterKey = process.env.MASTER_ENCRYPTION_KEY || 'default-dev-key-change-in-prod';
  const tenantId = '00000000-0000-0000-0000-000000000001';

  const db = getDb();
  const rows = await db.select().from(credentials).where(eq(credentials.id, 'd4371c4a-546b-4215-a9c2-9c572ea06238'));
  if (rows.length === 0) {
    console.log('Credential not found in DB');
    process.exit(1);
  }
  const row = rows[0];

  console.log('\n=== Credential Decryption ===');
  try {
    const decrypted = TenantCredentialsHelper.decryptCredentialData(
      String(row.encryptedData),
      tenantId,
      masterKey,
    );
    console.log('Decrypted keys:', Object.keys(decrypted));
    const apiKey = decrypted.apiKey as string;
    console.log('apiKey starts with:', apiKey?.substring(0, 10) + '...');
    console.log('apiKey length:', apiKey?.length);

    // 3. Test the authenticate method
    if (airtopType) {
      console.log('\n=== Testing authenticate() ===');
      const helper = new TenantCredentialsHelper(
        tenantId,
        masterKey,
        async () => ({
          id: row.id,
          name: row.name,
          type: row.type,
          encrypted_data: String(row.encryptedData),
        }),
        registry,
      );

      const requestOptions = {
        url: 'https://api.airtop.ai/api/v1/sessions',
        method: 'POST' as const,
        headers: {},
        body: '{}',
      };

      const result = await helper.authenticate(
        decrypted,
        'airtopApi',
        requestOptions as any,
      );

      console.log('Result headers:', JSON.stringify((result as any).headers, null, 2));
      console.log('Result auth:', (result as any).auth);
    }
  } catch (err: unknown) {
    console.log('Error:', (err as Error).message);
    console.log('Stack:', (err as Error).stack);
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
