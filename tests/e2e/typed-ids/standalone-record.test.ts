import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { CerialId } from '../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  TYPED_ID_TABLES,
  testConfig,
  truncateTables,
} from '../test-helper';

describe('E2E Typed IDs: Standalone Record', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TYPED_ID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TYPED_ID_TABLES);
  });

  test('standalone Record(int) field stores and returns CerialId<number>', async () => {
    const extRef = new RecordId('some_table', 42);
    const result = await client.db.StandaloneRefModel.create({
      data: {
        externalRef: extRef,
        externalRefs: [],
        label: 'standalone',
      },
    });

    expect(result.externalRef).toBeInstanceOf(CerialId);
    expect(result.externalRef.id).toBe(42);
    expect(typeof result.externalRef.id).toBe('number');
  });

  test('standalone Record(int)[] array field', async () => {
    const refs = [new RecordId('some_table', 1), new RecordId('some_table', 2), new RecordId('some_table', 3)];
    const result = await client.db.StandaloneRefModel.create({
      data: {
        externalRef: new RecordId('some_table', 10),
        externalRefs: refs,
        label: 'array-refs',
      },
    });

    expect(Array.isArray(result.externalRefs)).toBe(true);
    expect(result.externalRefs).toHaveLength(3);
    for (const ref of result.externalRefs) {
      expect(ref).toBeInstanceOf(CerialId);
      expect(typeof ref.id).toBe('number');
    }
  });

  test('standalone findOne round-trip', async () => {
    const created = await client.db.StandaloneRefModel.create({
      data: {
        externalRef: new RecordId('some_table', 99),
        externalRefs: [],
        label: 'findme',
      },
    });

    const found = await client.db.StandaloneRefModel.findOne({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found!.externalRef).toBeInstanceOf(CerialId);
    expect(found!.externalRef.id).toBe(99);
    expect(found!.label).toBe('findme');
  });

  test('standalone empty array defaults', async () => {
    const result = await client.db.StandaloneRefModel.create({
      data: {
        externalRef: new RecordId('some_table', 1),
        externalRefs: [],
        label: 'empty-arr',
      },
    });

    expect(result.externalRefs).toHaveLength(0);
  });
});
