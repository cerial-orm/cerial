import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { CerialDuration } from 'cerial';

const DURATION_TABLES = tables.duration;

describe('E2E Duration: Where', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, DURATION_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, DURATION_TABLES);
    await client.db.DurationBasic.create({ data: { name: 'short', ttl: '30m', cooldown: null } });
    await client.db.DurationBasic.create({ data: { name: 'medium', ttl: '2h', cooldown: '5m' } });
    await client.db.DurationBasic.create({ data: { name: 'long', ttl: '24h', cooldown: null } });
  });

  test('eq with string', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { ttl: '2h' } });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('medium');
  });

  test('eq with CerialDuration', async () => {
    const dur = CerialDuration.from('30m');
    const results = await client.db.DurationBasic.findMany({ where: { ttl: dur } });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('short');
  });

  test('neq operator', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { ttl: { neq: '2h' } } });

    expect(results).toHaveLength(2);
  });

  test('gt operator', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { ttl: { gt: '1h' } } });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name).sort()).toEqual(['long', 'medium']);
  });

  test('gte operator', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { ttl: { gte: '2h' } } });

    expect(results).toHaveLength(2);
  });

  test('lt operator', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { ttl: { lt: '2h' } } });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('short');
  });

  test('lte operator', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { ttl: { lte: '2h' } } });

    expect(results).toHaveLength(2);
  });

  test('in operator', async () => {
    const results = await client.db.DurationBasic.findMany({
      where: { ttl: { in: ['30m', '24h'] } },
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name).sort()).toEqual(['long', 'short']);
  });

  test('notIn operator', async () => {
    const results = await client.db.DurationBasic.findMany({
      where: { ttl: { notIn: ['30m', '24h'] } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('medium');
  });

  test('nullable field filter with null', async () => {
    const results = await client.db.DurationBasic.findMany({ where: { cooldown: null } });

    expect(results).toHaveLength(2);
  });

  test('between operator', async () => {
    const results = await client.db.DurationBasic.findMany({
      where: { ttl: { between: ['1h', '12h'] } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('medium');
  });

  test('combined operators', async () => {
    const results = await client.db.DurationBasic.findMany({
      where: { ttl: { gte: '30m', lte: '2h' } },
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name).sort()).toEqual(['medium', 'short']);
  });
});
