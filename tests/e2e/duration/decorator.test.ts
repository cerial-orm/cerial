import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDuration } from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const DURATION_TABLES = tables.duration;

describe('E2E Duration: Decorators', () => {
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
  });

  test('@default fills duration when omitted', async () => {
    const result = await client.db.DurationDecorated.create({
      data: { name: 'test' },
    });

    expect(CerialDuration.is(result.defaultTtl)).toBe(true);
    expect(result.defaultTtl.toString()).toBe('1h');
  });

  test('@default overridden when provided', async () => {
    const result = await client.db.DurationDecorated.create({
      data: { name: 'test', defaultTtl: '2h' },
    });

    expect(CerialDuration.is(result.defaultTtl)).toBe(true);
    expect(result.defaultTtl.toString()).toBe('2h');
  });

  test('@defaultAlways fills duration when omitted', async () => {
    const result = await client.db.DurationDecorated.create({
      data: { name: 'test' },
    });

    expect(result.alwaysTtl).toBeDefined();
    expect(CerialDuration.is(result.alwaysTtl!)).toBe(true);
    expect(result.alwaysTtl!.toString()).toBe('30m');
  });

  test('@defaultAlways resets on update when field omitted', async () => {
    const created = await client.db.DurationDecorated.create({
      data: { name: 'test', alwaysTtl: '5h' },
    });

    expect(created.alwaysTtl).toBeDefined();
    expect(created.alwaysTtl!.toString()).toBe('5h');

    const updated = await client.db.DurationDecorated.updateUnique({
      where: { id: created.id },
      data: { name: 'updated' },
    });

    expect(updated).not.toBeNull();
    expect(updated!.alwaysTtl).toBeDefined();
    expect(updated!.alwaysTtl!.toString()).toBe('30m');
  });

  test('@defaultAlways overridden when provided on update', async () => {
    const created = await client.db.DurationDecorated.create({
      data: { name: 'test' },
    });

    const updated = await client.db.DurationDecorated.updateUnique({
      where: { id: created.id },
      data: { alwaysTtl: '10m' },
    });

    expect(updated).not.toBeNull();
    expect(updated!.alwaysTtl).toBeDefined();
    expect(updated!.alwaysTtl!.toString()).toBe('10m');
  });

  test('select on decorated model', async () => {
    await client.db.DurationDecorated.create({ data: { name: 'test' } });

    const results = await client.db.DurationDecorated.findMany({
      select: { name: true, defaultTtl: true },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('test');
    expect(CerialDuration.is(results[0]!.defaultTtl)).toBe(true);
  });
});
