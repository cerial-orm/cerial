import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../../src/utils/cerial-id';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  TYPED_ID_TABLES,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Typed IDs: Union ID', () => {
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

  test('UnionIdModel create with string value', async () => {
    const result = await client.db.UnionIdModel.create({
      data: { id: 'abc', label: 'string-id' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBe('abc');
    expect(typeof result.id.id).toBe('string');
  });

  test('UnionIdModel create with int value', async () => {
    const result = await client.db.UnionIdModel.create({
      data: { id: 42, label: 'int-id' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBe(42);
    expect(typeof result.id.id).toBe('number');
  });

  test('UnionIdModel create without id (optional — string in union)', async () => {
    const result = await client.db.UnionIdModel.create({
      data: { label: 'auto-id' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBeDefined();
  });

  test('UnionIdModel findOne by string id', async () => {
    await client.db.UnionIdModel.create({
      data: { id: 'find-str', label: 'found' },
    });

    const found = await client.db.UnionIdModel.findOne({
      where: { id: 'find-str' },
    });

    expect(found).not.toBeNull();
    expect(found!.label).toBe('found');
  });

  test('UnionIdModel findOne by int id', async () => {
    await client.db.UnionIdModel.create({
      data: { id: 99, label: 'found-int' },
    });

    const found = await client.db.UnionIdModel.findOne({
      where: { id: 99 },
    });

    expect(found).not.toBeNull();
    expect(found!.label).toBe('found-int');
  });

  test('IntUnionIdModel create with int value', async () => {
    const result = await client.db.IntUnionIdModel.create({
      data: { id: 77, label: 'int-union' },
    });

    expect(result.id).toBeInstanceOf(CerialId);
    expect(result.id.id).toBe(77);
  });

  test('IntUnionIdModel findOne by int id', async () => {
    await client.db.IntUnionIdModel.create({
      data: { id: 77, label: 'find-int-union' },
    });

    const found = await client.db.IntUnionIdModel.findOne({
      where: { id: 77 },
    });

    expect(found).not.toBeNull();
    expect(found!.id.id).toBe(77);
    expect(found!.label).toBe('find-int-union');
  });

  test('deleteMany union id', async () => {
    await client.db.UnionIdModel.create({
      data: { id: 'del-union', label: 'bye' },
    });

    const count = await client.db.UnionIdModel.deleteMany({
      where: { id: 'del-union' },
    });

    expect(count).toBe(1);
  });
});
