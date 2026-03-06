import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';
import type {
  ICredentialDataDecryptedObject,
  ICredentialsEncrypted,
  ICredentialsExpressionResolveValues,
  IExecuteData,
  IHttpRequestHelper,
  IHttpRequestOptions,
  INode,
  INodeCredentialsDetails,
  INodeProperties,
  IRequestOptionsSimplified,
  IWorkflowExecuteAdditionalData,
  WorkflowExecuteMode,
} from 'n8n-workflow';
import { ICredentials, ICredentialsHelper } from 'n8n-workflow';
import type { Workflow } from 'n8n-workflow';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

// CRITICAL: This salt prefix MUST match the API encryption service in
// packages/api/src/services/encryption.ts which uses `r360-tenant-${tenantId}`.
// Using a different prefix would cause decryption failures at runtime.
const SALT_PREFIX = 'r360-tenant-';

/**
 * Credential lookup function type.
 * Provided by the caller (execution service) to query the DB for credentials.
 * Must always filter by tenant_id.
 */
export type CredentialLookupFn = (
  tenantId: string,
  credentialId: string,
) => Promise<{
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  encrypted_data: string;
} | null>;

/**
 * Concrete implementation of ICredentials for tenant-scoped credential objects.
 * Returned by TenantCredentialsHelper.getCredentials().
 */
class TenantCredentials extends ICredentials {
  private readonly _tenantId: string;
  private readonly _masterKey: string;

  constructor(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    tenantId: string,
    masterKey: string,
    data?: string,
  ) {
    super(nodeCredentials, type, data);
    this._tenantId = tenantId;
    this._masterKey = masterKey;
  }

  getData(_nodeType?: string): ICredentialDataDecryptedObject {
    if (!this.data) {
      throw new Error('No credential data available');
    }
    return TenantCredentialsHelper.decryptCredentialData(
      this.data,
      this._tenantId,
      this._masterKey,
    );
  }

  getDataToSave(): ICredentialsEncrypted {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      data: this.data,
    };
  }

  setData(_data: ICredentialDataDecryptedObject): void {
    throw new Error('Credentials are read-only during execution');
  }
}

/**
 * TenantCredentialsHelper implements n8n's ICredentialsHelper for tenant isolation.
 *
 * Each instance is bound to a specific tenant ID at construction time.
 * All credential operations are scoped to that tenant:
 * - Database queries filter by tenant_id
 * - Encryption/decryption uses a per-tenant key derived from master key + tenant ID
 * - No cross-tenant credential access is possible
 *
 * Created per-execution, NOT per-container.
 * Injected via IWorkflowExecuteAdditionalData.credentialsHelper
 */
export class TenantCredentialsHelper extends ICredentialsHelper {
  private readonly tenantKey: Buffer;
  private readonly credentialLookup: CredentialLookupFn | null;

  constructor(
    private readonly tenantId: string,
    private readonly masterKey: string,
    credentialLookup?: CredentialLookupFn,
  ) {
    super();
    this.tenantKey = TenantCredentialsHelper.deriveTenantKey(
      tenantId,
      masterKey,
    );
    this.credentialLookup = credentialLookup ?? null;
  }

  // --- Static encryption utilities ---

  /**
   * Derive a per-tenant encryption key from master key + tenant ID.
   * Uses scrypt for key derivation (resistant to brute-force).
   *
   * CRITICAL: The salt MUST be `r360-tenant-${tenantId}` to match the
   * API encryption service. Do NOT change this without updating both.
   */
  static deriveTenantKey(tenantId: string, masterKey: string): Buffer {
    const salt = `${SALT_PREFIX}${tenantId}`;
    return scryptSync(masterKey, salt, KEY_LENGTH);
  }

  /**
   * Encrypt credential data using the tenant-specific key.
   * Returns a base64 string containing IV + auth tag + ciphertext.
   *
   * Format: base64(iv[16] + authTag[16] + ciphertext)
   * This format matches the API encryption service exactly.
   */
  static encryptCredentialData(
    data: ICredentialDataDecryptedObject,
    tenantId: string,
    masterKey: string,
  ): string {
    const key = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const jsonData = JSON.stringify(data);
    const encrypted = Buffer.concat([
      cipher.update(jsonData, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  /**
   * Decrypt credential data using the tenant-specific key.
   * Throws if the data was encrypted with a different tenant key.
   */
  static decryptCredentialData(
    encryptedBase64: string,
    tenantId: string,
    masterKey: string,
  ): ICredentialDataDecryptedObject {
    const key = TenantCredentialsHelper.deriveTenantKey(tenantId, masterKey);
    const combined = Buffer.from(encryptedBase64, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8')) as ICredentialDataDecryptedObject;
  }

  // --- ICredentialsHelper implementation ---

  /**
   * Returns parent credential types for a given credential type name.
   * For example, 'googleSheetsOAuth2Api' has parent type 'oAuth2Api'.
   *
   * TODO: Load credential type hierarchy from n8n-nodes-base credential type descriptions.
   * For now, returns empty array. Full implementation will parse credential type
   * definitions and build the inheritance chain.
   */
  getParentTypes(_name: string): string[] {
    // TODO: Load credential type hierarchy from n8n-nodes-base
    return [];
  }

  /**
   * Applies credential authentication to an HTTP request.
   * For example, adds Authorization headers based on credential type.
   *
   * TODO: Implement credential-specific authentication logic by looking up the
   * credential type's `authenticate` property from ICredentialType definitions.
   * For now, passes through the request options unchanged.
   */
  async authenticate(
    _credentials: ICredentialDataDecryptedObject,
    _typeName: string,
    requestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
    _workflow: Workflow,
    _node: INode,
  ): Promise<IHttpRequestOptions> {
    // TODO: Implement credential-specific authentication logic
    return requestOptions as IHttpRequestOptions;
  }

  /**
   * Pre-authentication hook, called before the main authenticate step.
   * Used for operations like OAuth token refresh.
   *
   * TODO: Implement OAuth token refresh logic for credential types that support it.
   * For now, returns undefined (no pre-authentication needed).
   */
  async preAuthentication(
    _helpers: IHttpRequestHelper,
    _credentials: ICredentialDataDecryptedObject,
    _typeName: string,
    _node: INode,
    _credentialsExpired: boolean,
  ): Promise<ICredentialDataDecryptedObject | undefined> {
    // TODO: Implement OAuth token refresh
    return undefined;
  }

  /**
   * Fetches credential metadata from the database, scoped to this tenant.
   * Returns an ICredentials object containing the encrypted data.
   *
   * All DB queries are filtered by tenant_id to ensure tenant isolation.
   */
  async getCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
  ): Promise<ICredentials> {
    if (!this.credentialLookup) {
      // No credential lookup function provided -- throw a descriptive error.
      // This happens during initial setup before DB integration is connected.
      throw new Error(
        `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
          `not found for tenant ${this.tenantId}`,
      );
    }

    const row = await this.credentialLookup(
      this.tenantId,
      nodeCredentials.id!,
    );

    if (!row) {
      throw new Error(
        `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
          `not found for tenant ${this.tenantId}`,
      );
    }

    return new TenantCredentials(
      { id: row.id, name: row.name },
      row.type,
      this.tenantId,
      this.masterKey,
      row.encrypted_data,
    );
  }

  /**
   * Fetches and decrypts credential data for the current tenant.
   * This is the main method called by WorkflowExecute during node execution.
   *
   * All DB queries are filtered by tenant_id to ensure tenant isolation.
   * Decryption uses the per-tenant derived key.
   */
  async getDecrypted(
    _additionalData: IWorkflowExecuteAdditionalData,
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    _mode: WorkflowExecuteMode,
    _executeData?: IExecuteData,
    _raw?: boolean,
    _expressionResolveValues?: ICredentialsExpressionResolveValues,
  ): Promise<ICredentialDataDecryptedObject> {
    if (!this.credentialLookup) {
      throw new Error(
        `Credential "${nodeCredentials.name}" not found for tenant ${this.tenantId}`,
      );
    }

    // 1. Fetch the encrypted credential row (tenant-scoped)
    const row = await this.credentialLookup(
      this.tenantId,
      nodeCredentials.id!,
    );

    if (!row) {
      throw new Error(
        `Credential "${nodeCredentials.name}" (id: ${nodeCredentials.id}) ` +
          `not found for tenant ${this.tenantId}`,
      );
    }

    // 2. Decrypt using tenant-specific key
    return TenantCredentialsHelper.decryptCredentialData(
      row.encrypted_data,
      this.tenantId,
      this.masterKey,
    );
  }

  /**
   * Encrypts and updates credential data in the database (tenant-scoped).
   *
   * TODO: Wire up to actual DB update once @r360/db credential store is integrated.
   * For now, this is a no-op stub.
   */
  async updateCredentials(
    _nodeCredentials: INodeCredentialsDetails,
    _type: string,
    _data: ICredentialDataDecryptedObject,
  ): Promise<void> {
    // TODO: Encrypt and update in DB (tenant-scoped)
    // const encrypted = TenantCredentialsHelper.encryptCredentialData(
    //   data,
    //   this.tenantId,
    //   this.masterKey,
    // );
    // await credentialStore.updateByTenantAndId(
    //   this.tenantId,
    //   nodeCredentials.id!,
    //   encrypted,
    // );
  }

  /**
   * Updates OAuth token data for a credential (tenant-scoped).
   * Delegates to updateCredentials since the encryption process is the same.
   *
   * TODO: Wire up to actual DB update once @r360/db credential store is integrated.
   */
  async updateCredentialsOauthTokenData(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject,
    _additionalData: IWorkflowExecuteAdditionalData,
  ): Promise<void> {
    return this.updateCredentials(nodeCredentials, type, data);
  }

  /**
   * Returns the credential properties (form fields) for a given credential type.
   *
   * TODO: Load credential type descriptions from n8n-nodes-base and return
   * the properties array. For now, returns empty array.
   */
  getCredentialsProperties(_type: string): INodeProperties[] {
    // TODO: Load credential type properties from n8n-nodes-base
    return [];
  }
}
