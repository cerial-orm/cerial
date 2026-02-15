import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';

const UUID_TABLES = tables.uuid;
const UUID_A = '00000000-0000-4000-8000-000000000001';
const UUID_B = '00000000-0000-4000-8000-000000000002';
const UUID_C = '00000000-0000-4000-8000-000000000003';

describe('E2E UUID: Where Filters', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, UUID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, UUID_TABLES);
    await client.db.UuidBasic.create({ data: { name: 'A', token: UUID_A } });
    await client.db.UuidBasic.create({ data: { name: 'B', token: UUID_B } });
    await client.db.UuidBasic.create({ data: { name: 'C', token: UUID_C } });
  });

  test('filter by direct UUID value (equals shorthand)', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: UUID_A },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('A');
  });

  test('filter by eq operator', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: { eq: UUID_B } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('B');
  });

  test('filter by neq operator', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: { neq: UUID_A } },
    });

    expect(results).toHaveLength(2);
    expect(results.every((r) => r.name !== 'A')).toBe(true);
  });

  test('filter by in operator', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: { in: [UUID_A, UUID_C] } },
    });

    expect(results).toHaveLength(2);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(['A', 'C']);
  });

  test('filter by notIn operator', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: { notIn: [UUID_A, UUID_B] } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('C');
  });

  test('filter by gt operator', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: { gt: UUID_A } },
    });

    expect(results).toHaveLength(2);
  });

  test('filter by lt operator', async () => {
    const results = await client.db.UuidBasic.findMany({
      where: { token: { lt: UUID_C } },
    });

    expect(results).toHaveLength(2);
  });

  test('count with UUID filter', async () => {
    const count = await client.db.UuidBasic.count({ token: UUID_B });

    expect(count).toBe(1);
  });

  test('exists with UUID filter', async () => {
    const exists = await client.db.UuidBasic.exists({ token: UUID_A });
    const notExists = await client.db.UuidBasic.exists({ token: '99999999-9999-4999-8999-999999999999' });

    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });
});
