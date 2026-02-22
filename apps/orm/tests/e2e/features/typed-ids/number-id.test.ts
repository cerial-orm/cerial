import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Typed IDs: Number ID', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.typedIds);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.typedIds);
  });

  test('create with integer number id', async () => {
    const result = await client.db.NumberIdModel.create({
      data: { id: 100, label: 'hundred' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBe(100);
    expect(typeof result.id.id).toBe('number');
  });

  test('findOne by number id', async () => {
    await client.db.NumberIdModel.create({
      data: { id: 200, label: 'two-hundred' },
    });

    const found = await client.db.NumberIdModel.findOne({
      where: { id: 200 },
    });

    expect(found).not.toBeNull();
    expect(found!.id.id).toBe(200);
    expect(found!.label).toBe('two-hundred');
  });

  test('updateMany by number id', async () => {
    await client.db.NumberIdModel.create({
      data: { id: 100, label: 'before' },
    });

    const updated = await client.db.NumberIdModel.updateMany({
      where: { id: 100 },
      data: { label: 'after' },
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]!.id.id).toBe(100);
    expect(updated[0]!.label).toBe('after');
  });

  test('deleteMany by number id', async () => {
    await client.db.NumberIdModel.create({
      data: { id: 300, label: 'deleteme' },
    });

    const count = await client.db.NumberIdModel.deleteMany({
      where: { id: 300 },
    });

    expect(count).toBe(1);

    const found = await client.db.NumberIdModel.findOne({ where: { id: 300 } });
    expect(found).toBeNull();
  });

  test('create with zero number id', async () => {
    const result = await client.db.NumberIdModel.create({
      data: { id: 0, label: 'zero' },
    });

    expect(result.id.id).toBe(0);
  });

  test('create with negative number id', async () => {
    const result = await client.db.NumberIdModel.create({
      data: { id: -10, label: 'negative' },
    });

    expect(result.id.id).toBe(-10);
  });
});
