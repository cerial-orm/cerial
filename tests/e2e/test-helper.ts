/**
 * Unified E2E Test Helper
 *
 * Single source of truth for all E2E test infrastructure.
 * Combines the best implementations from all domain-specific helpers.
 *
 * Provides:
 * - Client factory and configuration
 * - Table cleanup and truncation utilities
 * - Unique ID and email generators
 * - Comprehensive table registry for all schema types
 */

import { CerialClient } from './generated/client';

// Re-export client class and all generated models
export { CerialClient } from './generated/client';
export * from './generated/models';

/**
 * Test database configuration
 * Matches CLAUDE.md settings for local SurrealDB instance
 */
export const testConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: {
    username: 'root',
    password: 'root',
  },
};

/**
 * Factory function to create a new client instance
 */
export function createTestClient(): CerialClient {
  return new CerialClient();
}

/**
 * Clean up specific tables by deleting all rows.
 * Schema setup is handled globally by preload via globalCleanup().
 * This is a lightweight per-file cleanup — preserves schema, just clears data.
 *
 * Use in `beforeAll` for test suite setup.
 * Requires explicit table list to prevent accidental data loss.
 */
export async function cleanupTables(client: CerialClient, tables: string[]): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of tables) {
    try {
      await surreal.query(`DELETE FROM ${table};`);
    } catch {
      // Ignore errors - table may not exist
    }
  }
}

/**
 * Global cleanup — removes ALL known tables, resets migration state, and re-runs migrations.
 * Called once during preload to set up the database schema before any test files run.
 */
export async function globalCleanup(client: CerialClient): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  const allTables = new Set<string>();

  for (const tableList of Object.values(tables)) {
    for (const table of tableList) {
      allTables.add(table);
    }
  }

  for (const table of allTables) {
    try {
      await surreal.query(`REMOVE TABLE IF EXISTS ${table};`);
    } catch {
      // Ignore errors - table may not exist
    }
  }

  client.resetMigrationState();
  await client.migrate();
}

/**
 * Truncate specific tables by deleting all rows.
 * Lightweight alternative to cleanupTables — preserves schema, just clears data.
 * Use in `beforeEach` for fast per-test cleanup.
 */
export async function truncateTables(client: CerialClient, tablesToTruncate: string[]): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of tablesToTruncate) {
    try {
      await surreal.query(`DELETE FROM ${table};`);
    } catch {
      // Ignore errors - table may not exist yet
    }
  }
}

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

/**
 * Comprehensive table registry for all schema types
 * Maps schema files to their corresponding table names (snake_case)
 */
export const tables = {
  // ── Core ──
  core: ['user', 'profile', 'post', 'tag', 'array_decorator_test'],
  basics: ['user', 'profile', 'post', 'tag'],

  // ── Relations ──
  oneToOneRequired: ['user_required', 'profile_required'],
  oneToOneOptional: ['user_optional', 'profile_optional'],
  oneToOneSingleSided: ['user_single_sided', 'profile_single_sided'],
  oneToManyRequired: ['author', 'post_required'],
  oneToManyOptional: ['publisher', 'book'],
  oneToManySingleSided: ['article', 'comment'],
  manyToMany: ['student', 'course'],
  manyToOneDirectional: ['blogger', 'label'],
  selfRefOneToOne: ['person'],
  selfRefOneToOneWithReverse: ['assistant'],
  selfRefOneToMany: ['employee_single_sided'],
  selfRefOneToManyWithReverse: ['employee_with_reports'],
  selfRefTree: ['category_tree'],
  selfRefManyToManySymmetric: ['friend'],
  selfRefSingleSidedArray: ['social_user'],
  multiRelation: ['writer', 'document'],
  mixedOptionality: ['customer', 'agent', 'order'],
  kitchenSink: [
    'kitchen_sink_user',
    'kitchen_sink_profile',
    'kitchen_sink_post',
    'kitchen_sink_tag',
    'kitchen_sink_settings',
    'kitchen_sink_badge',
  ],
  relationWithObjects: ['rel_obj_company', 'rel_obj_employee'],

  // ── Decorators ──
  oneToOneCascade: ['user_cascade', 'profile_cascade'],
  oneToOneRestrict: ['user_restrict', 'profile_restrict'],
  oneToOneNoAction: ['user_no_action', 'profile_no_action'],
  oneToOneSetNull: ['user_set_null', 'profile_set_null'],
  oneToManyCascade: ['team', 'member'],
  oneToManyRestrict: ['department', 'employee'],
  readonly: ['readonly_test', 'readonly_record'],
  timestamps: ['timestamp_test'],
  defaultAlways: ['content_item'],
  set: ['set_basic'],
  indexes: ['staff', 'warehouse', 'registration', 'attendee', 'workshop'],
  flexible: ['flex_user'],

  // ── Complex Types ──
  objects: ['object_test_user', 'object_test_order'],
  objectDecorators: ['obj_dec_user'],
  tuples: [
    'tuple_basic',
    'tuple_nested',
    'tuple_obj_in_tuple',
    'tuple_in_obj',
    'tuple_with_relation',
    'tuple_related_post',
    'tuple_deep_nest',
    'tuple_nullable',
  ],
  literals: [
    'literal_basic',
    'literal_defaults',
    'literal_broad',
    'literal_extended',
    'literal_numeric',
    'literal_with_object',
    'literal_with_tuple',
    'literal_with_object_variant',
    'literal_with_both',
    'literal_with_object_opt',
  ],
  enums: ['enum_basic', 'enum_defaults', 'enum_multiple', 'enum_with_object', 'enum_literal_ref'],

  // ── Data Types ──
  uuid: ['uuid_basic', 'uuid_decorated', 'uuid_with_object', 'uuid_with_tuple'],
  number: ['number_basic', 'number_decorated', 'number_with_object', 'number_with_tuple'],
  duration: ['duration_basic', 'duration_decorated', 'duration_with_object', 'duration_with_tuple'],
  decimal: ['decimal_basic', 'decimal_decorated', 'decimal_with_object', 'decimal_with_tuple'],
  bytes: ['bytes_basic', 'bytes_with_object', 'bytes_with_tuple'],
  geometry: ['geometry_basic', 'geometry_with_object', 'geometry_with_tuple'],
  any: ['any_basic', 'any_with_object', 'any_decorated', 'any_unique'],

  // ── Features ──
  typedIds: [
    'int_id_model',
    'number_id_model',
    'string_id_model',
    'uuid_id_model',
    'tuple_id_model',
    'object_id_model',
    'union_id_model',
    'int_union_id_model',
    'fk_target_int_id',
    'fk_child_model',
    'standalone_ref_model',
  ],
  unset: ['unset_test'],
};
