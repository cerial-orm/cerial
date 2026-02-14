/**
 * Relations Test Helper
 *
 * Provides utilities for testing relation operations.
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

  // tuples.cerial (tuple type tests)
  tuples: [
    'tuple_basic',
    'tuple_nested',
    'tuple_obj_in_tuple',
    'tuple_in_obj',
    'tuple_with_relation',
    'tuple_related_post',
    'tuple_deep_nest',
  ],
};

/**
 * Helper to wait for a condition to be true
 */
export async function waitFor(condition: () => Promise<boolean>, timeout = 5000, interval = 100): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) return;
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error('Timeout waiting for condition');
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
