import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDuration } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const DURATION_TABLES = tables.duration;

describe('E2E Duration: Array', () => {
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

  test('create with duration array', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null, intervals: ['10s', '1m', '5m'] },
    });

    expect(result.intervals).toHaveLength(3);
    expect(result.intervals.every((d) => CerialDuration.is(d))).toBe(true);
  });

  test('push to duration array', async () => {
    const created = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null, intervals: ['10s'] },
    });

    const updated = await client.db.DurationBasic.updateUnique({
      where: { id: created.id },
      data: { intervals: { push: '30s' } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.intervals).toHaveLength(2);
    expect(updated!.intervals[1]!.toString()).toBe('30s');
  });

  test('push multiple to duration array', async () => {
    const created = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null, intervals: ['10s'] },
    });

    const updated = await client.db.DurationBasic.updateUnique({
      where: { id: created.id },
      data: { intervals: { push: ['1m', '5m'] } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.intervals).toHaveLength(3);
  });

  test('full replace duration array', async () => {
    const created = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null, intervals: ['10s', '30s'] },
    });

    const updated = await client.db.DurationBasic.updateUnique({
      where: { id: created.id },
      data: { intervals: ['1h', '2h', '3h'] },
    });

    expect(updated).not.toBeNull();
    expect(updated!.intervals).toHaveLength(3);
    expect(updated!.intervals[0]!.toString()).toBe('1h');
  });

  test('where filter on array field has', async () => {
    await client.db.DurationBasic.create({
      data: { name: 'a', ttl: '1h', cooldown: null, intervals: ['10s', '30s'] },
    });
    await client.db.DurationBasic.create({
      data: { name: 'b', ttl: '1h', cooldown: null, intervals: ['1m', '5m'] },
    });

    const results = await client.db.DurationBasic.findMany({
      where: { intervals: { has: '10s' } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('a');
  });
});
