import { getDb } from '@r360/db';
import { credentials } from '@r360/db';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';

const masterKey = process.env.MASTER_ENCRYPTION_KEY || 'default-dev-key-change-in-prod';
console.log('Master key length:', masterKey.length);

const db = getDb();

async function main() {
  const rows = await db.select().from(credentials).where(eq(credentials.id, 'd4371c4a-546b-4215-a9c2-9c572ea06238'));
  if (rows.length === 0) {
    console.log('Credential not found in DB');
    process.exit(1);
  }
  const row = rows[0];
  console.log('Credential name:', row.name);
  console.log('Credential type:', row.type);
  console.log('TenantId:', row.tenantId);
  const encData = String(row.encryptedData);
  console.log('Encrypted data length:', encData.length);
  console.log('Encrypted data preview:', encData.substring(0, 60) + '...');

  // Derive key same way as TenantCredentialsHelper
  const tenantId = row.tenantId;
  const salt = `r360-tenant-${tenantId}`;
  const derivedKey = crypto.scryptSync(masterKey, salt, 32);
  console.log('Derived key hex (first 16):', derivedKey.toString('hex').substring(0, 16));

  try {
    const buf = Buffer.from(encData, 'base64');
    console.log('Buffer length:', buf.length);
    const iv = buf.subarray(0, 16);
    const authTag = buf.subarray(16, 32);
    const ciphertext = buf.subarray(32);
    console.log('IV length:', iv.length, 'AuthTag length:', authTag.length, 'Ciphertext length:', ciphertext.length);

    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(ciphertext, undefined, 'utf8');
    decrypted += decipher.final('utf8');
    const parsed = JSON.parse(decrypted);

    // Redact values but show structure
    const redacted: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.length > 6) {
        redacted[k] = v.substring(0, 6) + '***';
      } else {
        redacted[k] = v;
      }
    }
    console.log('\nDecryption SUCCESS');
    console.log('Decrypted credential keys:', Object.keys(parsed));
    console.log('Decrypted credential data (redacted):', JSON.stringify(redacted));
  } catch (err: unknown) {
    console.log('\nDecryption FAILED:', (err as Error).message);

    // Try treating encrypted_data as plain JSON (not encrypted)
    try {
      const plain = JSON.parse(encData);
      console.log('Data appears to be PLAIN JSON (not encrypted):', Object.keys(plain));
    } catch {
      console.log('Data is not plain JSON either');
    }
  }

  process.exit(0);
}

main().catch((err) => { console.error(err); process.exit(1); });
