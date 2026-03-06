import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Query Audit - Static Analysis for Tenant Isolation
 *
 * This test suite performs static analysis on the database layer source code
 * to verify that all tenant-scoped queries include tenantId filtering.
 *
 * It scans:
 *   1. Store files (packages/db/src/stores/) for Drizzle ORM query patterns
 *   2. Schema files (packages/db/src/schema/) for tenantId column presence
 *   3. All .ts files under packages/db/src/ for raw query patterns
 *
 * This is a compile-time safety net that catches missing tenant isolation
 * before code reaches production.
 */

const DB_SRC_DIR = path.resolve(__dirname, '../../../../db/src');
const STORES_DIR = path.join(DB_SRC_DIR, 'stores');
const SCHEMA_DIR = path.join(DB_SRC_DIR, 'schema');

/**
 * Tables that are NOT tenant-scoped and do not require tenantId filtering.
 *
 * - tenants: The tenants table itself is the root; it has no parent tenant.
 * - migrations: Schema migration tracking is global infrastructure.
 * - execution_steps / executionSteps: Scoped via executionId FK to executions,
 *   which already carries tenantId. Direct tenantId column is not present.
 */
const EXEMPT_TABLES = ['tenants', 'migrations', 'execution-steps', 'execution_steps', 'executionSteps'];

/** File-level exemptions: files that only operate on exempt tables */
const EXEMPT_FILE_PATTERNS = [
  /tenant/i,
  /migration/i,
  /execution[_-]?step/i,
];

/** Drizzle ORM query operation patterns that indicate database reads/writes */
const QUERY_OPERATION_PATTERNS = [
  /\.select\s*\(/,
  /\.update\s*\(/,
  /\.delete\s*\(/,
  /\.selectFrom\s*\(/,
  /db\.query\./,
];

/** Drizzle insert pattern (does not need a .where() clause, but does need tenantId in values) */
const INSERT_PATTERN = /\.insert\s*\(/;

/** Patterns indicating tenantId is referenced in the file */
const TENANT_ID_PATTERNS = [
  /tenantId/,
  /tenant_id/,
];

/**
 * Recursively collects all .ts files from a directory.
 */
function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const results: string[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      results.push(fullPath);
    }
  }

  return results;
}

/**
 * Checks whether a file is exempt from tenant isolation requirements.
 */
function isExemptFile(filePath: string): boolean {
  const fileName = path.basename(filePath);
  return EXEMPT_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

/**
 * Checks whether file content contains any Drizzle query operations
 * (select, update, delete, or db.query.*).
 */
function hasQueryOperations(content: string): boolean {
  return QUERY_OPERATION_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Checks whether file content contains insert operations.
 */
function hasInsertOperations(content: string): boolean {
  return INSERT_PATTERN.test(content);
}

/**
 * Checks whether file content references tenantId in any form.
 */
function referencesTenantId(content: string): boolean {
  return TENANT_ID_PATTERNS.some((pattern) => pattern.test(content));
}

/**
 * Extracts function/method names from a TypeScript source file for
 * more informative violation messages.
 */
function extractFunctionNames(content: string): string[] {
  const names: string[] = [];
  // Match: async functionName(, function functionName(, methodName(
  const patterns = [
    /async\s+(\w+)\s*\(/g,
    /(?:export\s+)?function\s+(\w+)\s*\(/g,
    /(\w+)\s*:\s*async\s*\(/g,
    /(\w+)\s*\(\s*\)\s*\{/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1] && !['if', 'for', 'while', 'switch', 'catch', 'describe', 'it', 'expect'].includes(match[1])) {
        names.push(match[1]);
      }
    }
  }

  return [...new Set(names)];
}

describe('Query Audit - Tenant Isolation', () => {
  it('should include tenantId filtering in all tenant-scoped store queries', () => {
    if (!fs.existsSync(STORES_DIR)) {
      // No stores directory yet; nothing to audit
      return;
    }

    const storeFiles = fs.readdirSync(STORES_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

    expect(storeFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of storeFiles) {
      const filePath = path.join(STORES_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Skip exempt files (e.g., execution-step-store operates on a non-tenant-scoped table)
      if (isExemptFile(filePath)) continue;

      const hasQueries = hasQueryOperations(content);
      const hasInserts = hasInsertOperations(content);

      // If the file has no DB operations at all, skip it
      if (!hasQueries && !hasInserts) continue;

      // Verify tenantId is referenced somewhere in the file
      if (!referencesTenantId(content)) {
        const functions = extractFunctionNames(content);
        const funcList = functions.length > 0 ? ` (functions: ${functions.join(', ')})` : '';
        violations.push(
          `${file}: contains DB operations but no tenantId filtering${funcList}`
        );
        continue;
      }

      // Deeper check: for select/update/delete operations, verify tenantId
      // appears in a .where() context, not just in an insert's .values()
      if (hasQueries) {
        // Extract individual query blocks and check each one
        // Look for .select()/.update()/.delete() calls that are NOT followed
        // by tenantId before the next semicolon or closing brace
        const queryBlocks = content.split(/(?=\.select\s*\(|\.update\s*\(|\.delete\s*\()/);

        for (let i = 1; i < queryBlocks.length; i++) {
          const block = queryBlocks[i];
          if (!block) continue;

          // Find the end of the query chain (next semicolon, return, or closing brace at column 0)
          const endMatch = block.match(/;|\n\s*return\s|\n\s*\}\s*,/);
          const queryChain = endMatch
            ? block.substring(0, (endMatch.index ?? block.length) + endMatch[0].length)
            : block;

          // Check if this query chain includes a .where() with tenantId
          const hasWhere = /\.where\s*\(/.test(queryChain);
          const hasTenantInChain = referencesTenantId(queryChain);

          if (!hasWhere || !hasTenantInChain) {
            // Determine what kind of query this is
            const queryType = block.startsWith('.select') ? 'select'
              : block.startsWith('.update') ? 'update'
              : 'delete';

            // Try to find the surrounding function name for context
            const precedingContent = queryBlocks.slice(0, i).join('');
            const lastFunc = precedingContent.match(/(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{[^}]*$/);
            const funcName = lastFunc?.[1] ?? 'unknown';

            violations.push(
              `${file}: ${queryType}() in "${funcName}" missing tenantId in .where() clause`
            );
          }
        }
      }
    }

    if (violations.length > 0) {
      const message = [
        'Tenant isolation violations found in store files:',
        '',
        ...violations.map((v) => `  - ${v}`),
        '',
        'All tenant-scoped queries (select, update, delete) MUST include',
        'tenantId filtering in their .where() clause to prevent cross-tenant',
        'data access.',
      ].join('\n');

      expect(violations, message).toEqual([]);
    }
  });

  it('should have tenantId column in all tenant-scoped schema tables', () => {
    if (!fs.existsSync(SCHEMA_DIR)) return;

    const schemaFiles = fs.readdirSync(SCHEMA_DIR)
      .filter((f) => f.endsWith('.ts') && f !== 'index.ts');

    expect(schemaFiles.length).toBeGreaterThan(0);

    const violations: string[] = [];

    for (const file of schemaFiles) {
      const filePath = path.join(SCHEMA_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      // Skip exempt tables
      const isExempt = EXEMPT_TABLES.some((table) => {
        const normalizedFile = file.toLowerCase().replace(/[_-]/g, '');
        const normalizedTable = table.toLowerCase().replace(/[_-]/g, '');
        return normalizedFile.includes(normalizedTable);
      });
      if (isExempt) continue;

      // If this file defines a pgTable, it should have a tenantId column
      if (content.includes('pgTable')) {
        if (!content.includes('tenantId') && !content.includes("tenant_id")) {
          // Extract table name from the pgTable call for a clearer message
          const tableMatch = content.match(/pgTable\s*\(\s*['"](\w+)['"]/);
          const tableName = tableMatch?.[1] ?? file;
          violations.push(
            `${file}: table "${tableName}" defined without tenantId column`
          );
        }
      }
    }

    if (violations.length > 0) {
      const message = [
        'Schema tables missing tenantId column:',
        '',
        ...violations.map((v) => `  - ${v}`),
        '',
        'All tenant-scoped tables MUST include a tenantId column.',
        `Exempt tables: ${EXEMPT_TABLES.join(', ')}`,
      ].join('\n');

      expect(violations, message).toEqual([]);
    }
  });

  it('should not contain raw SQL queries without tenant_id in db source files', () => {
    const allFiles = collectTsFiles(DB_SRC_DIR);

    // Filter out test files and schema definition files (schema defines tables, not queries)
    const queryFiles = allFiles.filter((f) => {
      const rel = path.relative(DB_SRC_DIR, f);
      return !rel.startsWith('schema') &&
        !rel.startsWith('__tests__') &&
        !f.endsWith('.test.ts');
    });

    const violations: string[] = [];

    for (const filePath of queryFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.relative(DB_SRC_DIR, filePath);

      if (isExemptFile(filePath)) continue;

      // Check for raw SQL patterns: sql`SELECT ...`, sql`UPDATE ...`, sql`DELETE ...`
      const rawSqlPattern = /sql\s*`[^`]*(?:SELECT|UPDATE|DELETE)\s+(?:FROM|SET)\s+(\w+)[^`]*`/gi;
      let match: RegExpExecArray | null;

      while ((match = rawSqlPattern.exec(content)) !== null) {
        const sqlStatement = match[0];
        const tableName = match[1];

        // Skip exempt tables
        if (EXEMPT_TABLES.some((t) => t.toLowerCase() === tableName?.toLowerCase())) {
          continue;
        }

        // Check if tenant_id appears in the SQL statement
        if (!sqlStatement.includes('tenant_id') && !sqlStatement.includes('tenantId')) {
          violations.push(
            `${fileName}: raw SQL query on "${tableName}" without tenant_id filtering`
          );
        }
      }
    }

    // This test is informational for now -- raw SQL in the db package
    // is typically used for migrations and setup, which are exempt.
    // But if tenant-scoped raw queries are added, they should include tenant_id.
    expect(violations).toEqual([]);
  });

  it('should verify all store files handle tenant-scoped insert operations with tenantId', () => {
    if (!fs.existsSync(STORES_DIR)) return;

    const storeFiles = fs.readdirSync(STORES_DIR)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

    const violations: string[] = [];

    for (const file of storeFiles) {
      const filePath = path.join(STORES_DIR, file);
      const content = fs.readFileSync(filePath, 'utf-8');

      if (isExemptFile(filePath)) continue;

      // Check if file has insert operations
      if (!hasInsertOperations(content)) continue;

      // For inserts, tenantId should be included in the values
      if (!referencesTenantId(content)) {
        const functions = extractFunctionNames(content);
        const funcList = functions.length > 0 ? ` (functions: ${functions.join(', ')})` : '';
        violations.push(
          `${file}: contains insert operations but no tenantId in values${funcList}`
        );
      }
    }

    if (violations.length > 0) {
      const message = [
        'Store files with insert operations missing tenantId:',
        '',
        ...violations.map((v) => `  - ${v}`),
        '',
        'All tenant-scoped insert operations MUST include tenantId in their values.',
      ].join('\n');

      expect(violations, message).toEqual([]);
    }
  });

  it('should provide a summary of all audited files', () => {
    const summary = {
      storeFiles: 0,
      schemaFiles: 0,
      queryFiles: 0,
      exemptFiles: 0,
      auditedFiles: 0,
    };

    // Count store files
    if (fs.existsSync(STORES_DIR)) {
      const stores = fs.readdirSync(STORES_DIR)
        .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');
      summary.storeFiles = stores.length;
      summary.exemptFiles += stores.filter((f) => isExemptFile(path.join(STORES_DIR, f))).length;
    }

    // Count schema files
    if (fs.existsSync(SCHEMA_DIR)) {
      const schemas = fs.readdirSync(SCHEMA_DIR)
        .filter((f) => f.endsWith('.ts') && f !== 'index.ts');
      summary.schemaFiles = schemas.length;
    }

    // Count all query-bearing files
    const allFiles = collectTsFiles(DB_SRC_DIR);
    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, 'utf-8');
      if (hasQueryOperations(content) || hasInsertOperations(content)) {
        summary.queryFiles++;
      }
    }

    summary.auditedFiles = summary.storeFiles + summary.schemaFiles;

    // This test always passes -- it just ensures the audit is actually scanning files
    expect(summary.storeFiles + summary.schemaFiles).toBeGreaterThan(0);
  });
});
