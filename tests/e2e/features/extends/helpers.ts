/**
 * Shared helpers for extends E2E tests
 */

import { tables } from '../../test-helper';

export {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
  uniqueId,
} from '../../test-helper';

export const MODEL_TABLES = [...tables.extendsModel];

export const MULTI_LEVEL_TABLES = [...tables.extendsMultiLevel];

export const RELATION_TABLES = [...tables.extendsRelations];

/**
 * All extends tables combined for cross-test cleanup
 */
export const ALL_EXTENDS_TABLES = [...MODEL_TABLES, ...MULTI_LEVEL_TABLES, ...RELATION_TABLES];
