import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  TYPED_ID_TABLES,
  testConfig,
  truncateTables,
} from '../test-helper';

describe('E2E Typed IDs: String ID', () => {
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

  test('create with explicit string id', async () => {
    const result = await client.db.StringIdModel.create({
      data: { id: 'custom-id', value: 'hello' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBe('custom-id');
    expect(typeof result.id.id).toBe('string');
  });

  test('create without id auto-generates', async () => {
    const result = await client.db.StringIdModel.create({
      data: { value: 'auto' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(typeof result.id.id).toBe('string');
    expect(result.id.id.length).toBeGreaterThan(0);
  });

  test('findOne by string id', async () => {
    await client.db.StringIdModel.create({
      data: { id: 'findme', value: 'found' },
    });

    const found = await client.db.StringIdModel.findOne({
      where: { id: 'findme' },
    });

    expect(found).not.toBeNull();
    expect(found!.id.id).toBe('findme');
    expect(found!.value).toBe('found');
  });

  test('updateMany by string id', async () => {
    await client.db.StringIdModel.create({
      data: { id: 'update-me', value: 'before' },
    });

    const updated = await client.db.StringIdModel.updateMany({
      where: { id: 'update-me' },
      data: { value: 'after' },
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]!.value).toBe('after');
  });

  test('deleteMany by string id', async () => {
    await client.db.StringIdModel.create({
      data: { id: 'delete-me', value: 'bye' },
    });

    const count = await client.db.StringIdModel.deleteMany({
      where: { id: 'delete-me' },
    });

    expect(count).toBe(1);

    const found = await client.db.StringIdModel.findOne({ where: { id: 'delete-me' } });
    expect(found).toBeNull();
  });
});
