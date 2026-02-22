import { afterAll, beforeAll, beforeEach } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../test-helper';

export function setupDataTypeTests(tableNames: string[]): {
  getClient: () => CerialClient;
} {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tableNames);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tableNames);
  });

  return {
    getClient: () => client,
  };
}
