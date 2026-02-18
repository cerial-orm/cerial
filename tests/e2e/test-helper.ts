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
 *
 * Collects all table names from the `tables` registry, ROOT_TABLES, INDEX_TABLES,
 * and TYPED_ID_TABLES, deduplicates them, removes them all via REMOVE TABLE IF EXISTS,
 * then calls resetMigrationState() + migrate() to recreate everything.
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

  for (const table of ROOT_TABLES) allTables.add(table);
  for (const table of INDEX_TABLES) allTables.add(table);
  for (const table of TYPED_ID_TABLES) allTables.add(table);

  for (const table of allTables) {
    try {
      await surreal.query(`REMOVE TABLE IF EXISTS ${table};`);
    } catch {
      // Ignore errors - table may not exist
    }
  }

  // Reset migration tracking so migrate() re-runs DEFINE statements
  client.resetMigrationState();
  // Re-run migrations to recreate tables with correct schema
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
 * Tables used by root-level E2E test files
 */
export const ROOT_TABLES = ['user', 'profile', 'post', 'tag', 'array_decorator_test'];

/**
 * Tables used by composite index E2E tests
 */
export const INDEX_TABLES = ['staff', 'warehouse', 'registration', 'attendee', 'workshop'];

/**
 * Tables used by typed ID E2E tests
 */
export const TYPED_ID_TABLES = [
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
];

/**
 * Comprehensive table registry for all schema types
 * Maps schema files to their corresponding table names (snake_case)
 */
export const tables = {
  // Root-level E2E tests
  root: ['user', 'profile', 'post', 'tag', 'array_decorator_test'],

  // one-to-one-required.cerial
  oneToOneRequired: ['user_required', 'profile_required'],

  // one-to-one-optional.cerial
  oneToOneOptional: ['user_optional', 'profile_optional'],

  // one-to-one-cascade.cerial
  oneToOneCascade: ['user_cascade', 'profile_cascade'],

  // one-to-one-restrict.cerial
  oneToOneRestrict: ['user_restrict', 'profile_restrict'],

  // one-to-one-noaction.cerial
  oneToOneNoAction: ['user_no_action', 'profile_no_action'],

  // one-to-one-setnull.cerial
  oneToOneSetNull: ['user_set_null', 'profile_set_null'],

  // one-to-one-single-sided.cerial
  oneToOneSingleSided: ['user_single_sided', 'profile_single_sided'],

  // one-to-many-required.cerial
  oneToManyRequired: ['author', 'post_required'],

  // one-to-many-optional.cerial
  oneToManyOptional: ['publisher', 'book'],

  // one-to-many-cascade.cerial
  oneToManyCascade: ['team', 'member'],

  // one-to-many-restrict.cerial
  oneToManyRestrict: ['department', 'employee'],

  // one-to-many-single-sided.cerial
  oneToManySingleSided: ['article', 'comment'],

  // many-to-many.cerial
  manyToMany: ['student', 'course'],

  // many-to-one-directional.cerial
  manyToOneDirectional: ['blogger', 'label'],

  // self-ref-one-to-one.cerial
  selfRefOneToOne: ['person'],

  // self-ref-one-to-one-with-reverse.cerial
  selfRefOneToOneWithReverse: ['assistant'],

  // self-ref-one-to-many.cerial
  selfRefOneToMany: ['employee_single_sided'],

  // self-ref-one-to-many-with-reverse.cerial
  selfRefOneToManyWithReverse: ['employee_with_reports'],

  // self-ref-tree.cerial
  selfRefTree: ['category_tree'],

  // self-ref-many-to-many-symmetric.cerial
  selfRefManyToManySymmetric: ['friend'],

  // self-ref-single-sided-array.cerial
  selfRefSingleSidedArray: ['social_user'],

  // multi-relation.cerial
  multiRelation: ['writer', 'document'],

  // mixed-optionality.cerial
  mixedOptionality: ['customer', 'agent', 'order'],

  // kitchen-sink.cerial
  kitchenSink: [
    'kitchen_sink_user',
    'kitchen_sink_profile',
    'kitchen_sink_post',
    'kitchen_sink_tag',
    'kitchen_sink_settings',
    'kitchen_sink_badge',
  ],

  // test-basics.cerial (basic models)
  basics: ['user', 'profile', 'post', 'tag'],

  // objects.cerial (embedded object tests)
  objects: ['object_test_user', 'object_test_order'],

  // relation-with-objects.cerial (relations + objects combined)
  relationWithObjects: ['rel_obj_company', 'rel_obj_employee'],

  // object-decorators.cerial (object fields with decorators)
  objectDecorators: ['obj_dec_user'],

  // flexible.cerial (@flexible decorator on object fields)
  flexible: ['flex_user'],

  // readonly.cerial (@readonly decorator)
  readonly: ['readonly_test', 'readonly_record'],

  // unset.cerial (unset parameter tests)
  unset: ['unset_test'],

  // literals.cerial (literal type tests)
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

  // enums.cerial (enum type tests)
  enums: ['enum_basic', 'enum_defaults', 'enum_multiple', 'enum_with_object', 'enum_literal_ref'],

  // tuples.cerial (tuple type tests)
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

  // uuid.cerial (uuid field type tests)
  uuid: ['uuid_basic', 'uuid_decorated', 'uuid_with_object', 'uuid_with_tuple'],

  // number.cerial (number field type tests)
  number: ['number_basic', 'number_decorated', 'number_with_object', 'number_with_tuple'],

  // duration.cerial (duration field type tests)
  duration: ['duration_basic', 'duration_decorated', 'duration_with_object', 'duration_with_tuple'],

  // decimal.cerial (decimal field type tests)
  decimal: ['decimal_basic', 'decimal_decorated', 'decimal_with_object', 'decimal_with_tuple'],

  // bytes.cerial (bytes field type tests)
  bytes: ['bytes_basic', 'bytes_with_object', 'bytes_with_tuple'],

  // geometry.cerial (geometry field type tests)
  geometry: ['geometry_basic', 'geometry_with_object', 'geometry_with_tuple'],

  // any.cerial (any field type tests)
  any: ['any_basic', 'any_with_object', 'any_decorated', 'any_unique'],

  // set.cerial (@set decorator tests)
  set: ['set_basic'],

  // timestamps.cerial (timestamp decorator tests)
  timestamps: ['timestamp_test'],

  // default-always.cerial (@defaultAlways decorator tests)
  defaultAlways: ['content_item'],
};
