import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../src/utils/cerial-id';
import { createTestClient, testConfig, TYPED_ID_TABLES, CerialClient, cleanupTables, truncateTables } from '../test-helper';

describe('E2E Typed IDs: Union WHERE', () => {
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

  // ─── UnionIdModel: Record(string, int) @id ─────────────────────────────────

  test('direct string value in where', async () => {
    await client.db.UnionIdModel.create({ data: { id: 'abc', label: 'str' } });
    await client.db.UnionIdModel.create({ data: { id: 42, label: 'int' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: 'abc' },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id.id).toBe('abc');
    expect(results[0]!.label).toBe('str');
  });

  test('direct int value in where', async () => {
    await client.db.UnionIdModel.create({ data: { id: 'abc', label: 'str' } });
    await client.db.UnionIdModel.create({ data: { id: 42, label: 'int' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: 42 },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id.id).toBe(42);
    expect(results[0]!.label).toBe('int');
  });

  test('eq operator with string value', async () => {
    await client.db.UnionIdModel.create({ data: { id: 'target', label: 'found' } });
    await client.db.UnionIdModel.create({ data: { id: 'other', label: 'skip' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: { eq: 'target' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('found');
  });

  test('eq operator with int value', async () => {
    await client.db.UnionIdModel.create({ data: { id: 10, label: 'ten' } });
    await client.db.UnionIdModel.create({ data: { id: 20, label: 'twenty' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: { eq: 10 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('ten');
  });

  test('neq operator with int value', async () => {
    await client.db.UnionIdModel.create({ data: { id: 10, label: 'ten' } });
    await client.db.UnionIdModel.create({ data: { id: 20, label: 'twenty' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: { neq: 10 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('twenty');
  });

  test('in operator with string values', async () => {
    await client.db.UnionIdModel.create({ data: { id: 'a', label: 'la' } });
    await client.db.UnionIdModel.create({ data: { id: 'b', label: 'lb' } });
    await client.db.UnionIdModel.create({ data: { id: 'c', label: 'lc' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: { in: ['a', 'b'] } },
    });

    expect(results).toHaveLength(2);
    const labels = results.map((r) => r.label).sort();
    expect(labels).toEqual(['la', 'lb']);
  });

  test('notIn operator with int values', async () => {
    await client.db.UnionIdModel.create({ data: { id: 1, label: 'one' } });
    await client.db.UnionIdModel.create({ data: { id: 2, label: 'two' } });
    await client.db.UnionIdModel.create({ data: { id: 3, label: 'three' } });

    const results = await client.db.UnionIdModel.findMany({
      where: { id: { notIn: [1, 3] } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.label).toBe('two');
  });

  test('findOne with CerialId wrapper on union id', async () => {
    const created = await client.db.UnionIdModel.create({
      data: { id: 'wrap-test', label: 'wrapped' },
    });

    const found = await client.db.UnionIdModel.findOne({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found!.label).toBe('wrapped');
  });

  test('deleteMany with eq on union string id', async () => {
    await client.db.UnionIdModel.create({ data: { id: 'del-me', label: 'bye' } });
    await client.db.UnionIdModel.create({ data: { id: 'keep-me', label: 'stay' } });

    const count = await client.db.UnionIdModel.deleteMany({
      where: { id: { eq: 'del-me' } },
    });

    expect(count).toBe(1);

    const remaining = await client.db.UnionIdModel.findMany();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.label).toBe('stay');
  });
});
