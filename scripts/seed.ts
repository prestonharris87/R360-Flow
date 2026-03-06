import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://r360:r360_dev_password@localhost:5432/r360flow';

// Fixed UUIDs so the seed is idempotent
const DEV_TENANT_ID = '00000000-0000-0000-0000-000000000001';
const DEV_USER_ID   = '00000000-0000-0000-0000-000000000002';

async function seed() {
  const sql = postgres(DATABASE_URL, { max: 1 });

  console.log('Seeding database...\n');

  try {
    // Create enums if they don't exist (Drizzle migrations may not have run yet)
    // We use DO blocks to avoid errors if they already exist
    await sql.unsafe(`
      DO $$ BEGIN
        CREATE TYPE plan AS ENUM ('free', 'starter', 'pro', 'enterprise');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'viewer');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE workflow_status AS ENUM ('draft', 'active', 'inactive', 'archived');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE execution_status AS ENUM ('pending', 'running', 'success', 'error', 'cancelled', 'timeout');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE step_status AS ENUM ('pending', 'running', 'success', 'error', 'skipped');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      DO $$ BEGIN
        CREATE TYPE http_method AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);

    // Create tables if they don't exist
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS tenants (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        plan plan NOT NULL DEFAULT 'free',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        external_id VARCHAR(255) NOT NULL,
        email VARCHAR(320) NOT NULL,
        name VARCHAR(255),
        role user_role NOT NULL DEFAULT 'member',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        definition_json JSONB NOT NULL DEFAULT '{}',
        status workflow_status NOT NULL DEFAULT 'draft',
        is_active BOOLEAN NOT NULL DEFAULT FALSE,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS credentials (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(128) NOT NULL,
        encrypted_data TEXT NOT NULL,
        created_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS executions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        status execution_status NOT NULL DEFAULT 'pending',
        mode VARCHAR(50) NOT NULL DEFAULT 'manual',
        context_json JSONB DEFAULT '{}',
        error TEXT,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS execution_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        execution_id UUID NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
        node_id VARCHAR(255) NOT NULL,
        node_name VARCHAR(255),
        node_type VARCHAR(255),
        status step_status NOT NULL DEFAULT 'pending',
        input_json JSONB,
        output_json JSONB,
        error JSONB,
        started_at TIMESTAMPTZ,
        finished_at TIMESTAMPTZ
      );

      CREATE TABLE IF NOT EXISTS webhooks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        path VARCHAR(512) NOT NULL,
        method http_method NOT NULL DEFAULT 'POST',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create indexes (IF NOT EXISTS)
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS users_tenant_id_idx ON users(tenant_id);
      CREATE INDEX IF NOT EXISTS users_external_id_idx ON users(external_id);
      CREATE INDEX IF NOT EXISTS users_email_tenant_idx ON users(email, tenant_id);
      CREATE INDEX IF NOT EXISTS workflows_tenant_id_idx ON workflows(tenant_id);
      CREATE INDEX IF NOT EXISTS workflows_tenant_status_idx ON workflows(tenant_id, status);
      CREATE INDEX IF NOT EXISTS workflows_tenant_active_idx ON workflows(tenant_id, is_active);
      CREATE INDEX IF NOT EXISTS credentials_tenant_id_idx ON credentials(tenant_id);
      CREATE INDEX IF NOT EXISTS credentials_tenant_type_idx ON credentials(tenant_id, type);
      CREATE INDEX IF NOT EXISTS executions_tenant_id_idx ON executions(tenant_id);
      CREATE INDEX IF NOT EXISTS executions_workflow_id_idx ON executions(workflow_id);
      CREATE INDEX IF NOT EXISTS executions_tenant_status_idx ON executions(tenant_id, status);
      CREATE INDEX IF NOT EXISTS executions_tenant_created_idx ON executions(tenant_id, created_at);
      CREATE INDEX IF NOT EXISTS execution_steps_execution_id_idx ON execution_steps(execution_id);
      CREATE INDEX IF NOT EXISTS execution_steps_node_id_idx ON execution_steps(execution_id, node_id);
      CREATE INDEX IF NOT EXISTS webhooks_tenant_id_idx ON webhooks(tenant_id);
      CREATE INDEX IF NOT EXISTS webhooks_path_idx ON webhooks(tenant_id, path);
      CREATE INDEX IF NOT EXISTS webhooks_workflow_id_idx ON webhooks(workflow_id);
    `);

    console.log('  Tables and indexes created.');

    // Seed dev tenant (upsert)
    await sql.unsafe(`
      INSERT INTO tenants (id, name, slug, plan, settings)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        plan = EXCLUDED.plan,
        updated_at = NOW()
    `, [DEV_TENANT_ID, 'Dev Workspace', 'dev', 'pro', '{}']);

    console.log('  Tenant created: Dev Workspace (plan: pro)');

    // Seed dev user (upsert)
    await sql.unsafe(`
      INSERT INTO users (id, tenant_id, external_id, email, name, role)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        name = EXCLUDED.name,
        role = EXCLUDED.role,
        updated_at = NOW()
    `, [DEV_USER_ID, DEV_TENANT_ID, 'dev-user-1', 'admin@r360.dev', 'Dev Admin', 'owner']);

    console.log('  User created: admin@r360.dev (role: owner)');

    console.log('\nSeed complete! Dev credentials:');
    console.log('  Email:     admin@r360.dev');
    console.log('  Password:  (any -- dev mode accepts all)');
    console.log('  Tenant ID: ' + DEV_TENANT_ID);
    console.log('  User ID:   ' + DEV_USER_ID);

  } catch (err) {
    console.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

seed();
