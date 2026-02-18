import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../src/utils/cerial-id';
import { createTestClient, testConfig, TYPED_ID_TABLES, CerialClient, cleanupTables, truncateTables } from '../test-helper';

describe('E2E Typed IDs: Edge Cases', () => {
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

  // ─── findUnique ────────────────────────────────────────────────────────────

  test('findUnique with typed int id', async () => {
    await client.db.IntIdModel.create({ data: { id: 42, name: 'unique' } });

    const found = await client.db.IntIdModel.findUnique({
      where: { id: 42 },
    });

    expect(found).not.toBeNull();
    expect(found!.id).toBeInstanceOf(CerialId);
    expect(found!.id.id).toBe(42);
    expect(found!.name).toBe('unique');
  });

  test('findUnique returns null for non-existent id', async () => {
    const found = await client.db.IntIdModel.findUnique({
      where: { id: 999999 },
    });

    expect(found).toBeNull();
  });

  // ─── upsert ────────────────────────────────────────────────────────────────

  test('upsert create path with typed int id', async () => {
    const result = await client.db.IntIdModel.upsert({
      where: { id: 42 },
      create: { id: 42, name: 'created' },
      update: { name: 'updated' },
    });

    expect(result).not.toBeNull();
    expect(result!.id).toBeInstanceOf(CerialId);
    expect(result!.id.id).toBe(42);
    expect(result!.name).toBe('created');
  });

  test('upsert update path with typed int id', async () => {
    await client.db.IntIdModel.create({ data: { id: 42, name: 'original' } });

    const result = await client.db.IntIdModel.upsert({
      where: { id: 42 },
      create: { id: 42, name: 'should-not-create' },
      update: { name: 'updated' },
    });

    expect(result).not.toBeNull();
    expect(result!.id.id).toBe(42);
    expect(result!.name).toBe('updated');
  });

  // ─── $transaction ──────────────────────────────────────────────────────────

  test('$transaction with typed ID models', async () => {
    const [created, found] = await client.$transaction([
      client.db.IntIdModel.create({ data: { id: 77, name: 'txn-item' } }),
      client.db.IntIdModel.findOne({ where: { id: 77 } }),
    ]);

    expect(created.id).toBeInstanceOf(CerialId);
    expect(created.id.id).toBe(77);
    expect(created.name).toBe('txn-item');
    // findOne in same transaction may or may not see the created record
    // depending on isolation — just verify it doesn't error
  });

  test('$transaction with multiple typed ID creates', async () => {
    const [a, b] = await client.$transaction([
      client.db.IntIdModel.create({ data: { id: 1, name: 'txn-a' } }),
      client.db.IntIdModel.create({ data: { id: 2, name: 'txn-b' } }),
    ]);

    expect(a.id.id).toBe(1);
    expect(b.id.id).toBe(2);

    const all = await client.db.IntIdModel.findMany();
    expect(all).toHaveLength(2);
  });

  // ─── count ─────────────────────────────────────────────────────────────────

  test('count with typed ID where', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

    const count = await client.db.IntIdModel.count({ id: 1 });
    expect(count).toBe(1);

    const countAll = await client.db.IntIdModel.count();
    expect(countAll).toBe(3);
  });

  // ─── exists ────────────────────────────────────────────────────────────────

  test('exists with typed ID where', async () => {
    await client.db.IntIdModel.create({ data: { id: 42, name: 'exists' } });

    const yes = await client.db.IntIdModel.exists({ id: 42 });
    expect(yes).toBe(true);

    const no = await client.db.IntIdModel.exists({ id: 999 });
    expect(no).toBe(false);
  });

  // ─── CerialId wrapper in where ────────────────────────────────────────────

  test('CerialId wrapper passed to where', async () => {
    const created = await client.db.IntIdModel.create({
      data: { id: 42, name: 'wrapper' },
    });

    const found = await client.db.IntIdModel.findOne({
      where: { id: created.id },
    });

    expect(found).not.toBeNull();
    expect(found!.id.id).toBe(42);
  });

  test('CerialId wrapper in eq operator', async () => {
    const created = await client.db.IntIdModel.create({
      data: { id: 42, name: 'eq-wrap' },
    });

    const results = await client.db.IntIdModel.findMany({
      where: { id: { eq: created.id } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('eq-wrap');
  });

  // ─── Logical operators ────────────────────────────────────────────────────

  test('OR with typed IDs', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

    const results = await client.db.IntIdModel.findMany({
      where: { OR: [{ id: 1 }, { id: 3 }] },
    });

    expect(results).toHaveLength(2);
    const ids = results.map((r) => r.id.id).sort();
    expect(ids).toEqual([1, 3]);
  });

  test('AND with typed IDs', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'target' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'other' } });

    const results = await client.db.IntIdModel.findMany({
      where: { AND: [{ id: 1 }, { name: 'target' }] },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id.id).toBe(1);
  });

  test('NOT with typed ID', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });

    const results = await client.db.IntIdModel.findMany({
      where: { NOT: { id: 1 } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id.id).toBe(2);
  });

  // ─── select + where ───────────────────────────────────────────────────────

  test('select with typed ID where', async () => {
    await client.db.IntIdModel.create({ data: { id: 42, name: 'selected' } });

    const results = await client.db.IntIdModel.findMany({
      where: { id: 42 },
      select: { id: true, name: true },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.id).toBeInstanceOf(CerialId);
    expect(results[0]!.name).toBe('selected');
  });

  test('select only name with typed ID where', async () => {
    await client.db.IntIdModel.create({ data: { id: 42, name: 'name-only' } });

    const results = await client.db.IntIdModel.findMany({
      where: { id: 42 },
      select: { name: true },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('name-only');
    expect((results[0] as any).id).toBeUndefined();
  });

  // ─── orderBy ───────────────────────────────────────────────────────────────

  test('orderBy with typed ID desc', async () => {
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });

    const results = await client.db.IntIdModel.findMany({
      orderBy: { id: 'desc' },
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.id.id).toBe(3);
    expect(results[1]!.id.id).toBe(2);
    expect(results[2]!.id.id).toBe(1);
  });

  test('orderBy with typed ID asc', async () => {
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });

    const results = await client.db.IntIdModel.findMany({
      orderBy: { id: 'asc' },
    });

    expect(results).toHaveLength(3);
    expect(results[0]!.id.id).toBe(1);
    expect(results[1]!.id.id).toBe(2);
    expect(results[2]!.id.id).toBe(3);
  });

  // ─── Empty results ────────────────────────────────────────────────────────

  test('findOne returns null for non-existent typed id', async () => {
    const found = await client.db.IntIdModel.findOne({
      where: { id: 999999 },
    });

    expect(found).toBeNull();
  });

  test('findMany returns empty array for non-matching where', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });

    const results = await client.db.IntIdModel.findMany({
      where: { id: { in: [999, 888] } },
    });

    expect(results).toHaveLength(0);
  });

  // ─── limit + offset with typed IDs ─────────────────────────────────────────

  test('limit with typed ID orderBy', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

    const results = await client.db.IntIdModel.findMany({
      orderBy: { id: 'asc' },
      limit: 2,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.id.id).toBe(1);
    expect(results[1]!.id.id).toBe(2);
  });

  test('offset with typed ID orderBy', async () => {
    await client.db.IntIdModel.create({ data: { id: 1, name: 'a' } });
    await client.db.IntIdModel.create({ data: { id: 2, name: 'b' } });
    await client.db.IntIdModel.create({ data: { id: 3, name: 'c' } });

    const results = await client.db.IntIdModel.findMany({
      orderBy: { id: 'asc' },
      limit: 10,
      offset: 1,
    });

    expect(results).toHaveLength(2);
    expect(results[0]!.id.id).toBe(2);
    expect(results[1]!.id.id).toBe(3);
  });
});
