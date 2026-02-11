/**
 * Transactions Test Helper
 *
 * Provides utilities for testing $transaction operations.
 * All models from all schema files are available via the generated client.
 */

import { CerialClient } from '../generated/client';

// Re-export everything from generated client
export { CerialClient } from '../generated/client';
export * from '../generated/models';

// Test database configuration - matches CLAUDE.md settings
export const testConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: {
    username: 'root',
    password: 'root',
  },
};

// Factory function to create a new client instance
export function createTestClient(): CerialClient {
  return new CerialClient();
}

/**
 * Clean up specific tables by name.
 * Uses REMOVE TABLE to completely drop tables, then runs migrations to recreate
 * them with the correct schema. This is necessary because DEFINE FIELD OVERWRITE
 * doesn't remove fields that were previously defined but are no longer in the schema.
 */
export async function cleanupTables(client: CerialClient, tables: string[]): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of tables) {
    try {
      // Use REMOVE TABLE to completely drop the table and its schema
      await surreal.query(`REMOVE TABLE ${table};`);
    } catch {
      // Ignore errors - table may not exist
    }
  }

  // Run all migrations to ensure tables are recreated with correct schema
  // This is needed because lazy migrations only run for the queried model,
  // not for related models used in includes
  await client.migrate();
}

// Table groups for different schema types (table names use snake_case)
export const tables = {
  // test-basics.cerial (basic models)
  basics: ['user', 'profile', 'post', 'tag'],

  // one-to-one-required.cerial
  oneToOneRequired: ['user_required', 'profile_required'],

  // one-to-many-required.cerial
  oneToManyRequired: ['author', 'post_required'],

  // many-to-many.cerial
  manyToMany: ['student', 'course'],

  // one-to-one-cascade.cerial
  oneToOneCascade: ['user_cascade', 'profile_cascade'],

  // mixed-optionality.cerial
  mixedOptionality: ['customer', 'agent', 'order'],
};

/**
 * Generate a unique ID suffix for test isolation
 */
export function uniqueId(): string {
  return Math.random().toString(36).substring(2, 8);
}

/**
 * Create a unique email for testing
 */
export function uniqueEmail(prefix = 'test'): string {
  return `${prefix}-${uniqueId()}@example.com`;
}
