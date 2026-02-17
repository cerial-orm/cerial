import { CerialClient } from '../generated/client';

export { CerialClient } from '../generated/client';
export * from '../generated/models';

export const testConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: {
    username: 'root',
    password: 'root',
  },
};

export function createTestClient(): CerialClient {
  return new CerialClient();
}

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

export async function cleanupTables(client: CerialClient, tableList: string[]): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of tableList) {
    try {
      await surreal.query(`REMOVE TABLE ${table};`);
    } catch {
      // Ignore errors
    }
  }

  client.resetMigrationState();
  await client.migrate();
}

export async function truncateTables(client: CerialClient, tableList: string[]): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of tableList) {
    try {
      await surreal.query(`DELETE FROM ${table};`);
    } catch {
      // Ignore errors
    }
  }
}
