import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDuration, isCerialId } from 'cerial';
import { Duration } from 'surrealdb';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig, truncateTables } from '../test-helper';

const DURATION_TABLES = tables.duration;

describe('E2E Duration: Create', () => {
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

  test('create with explicit duration string', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '2h30m', cooldown: null },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('test');
    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.toString()).toBe('2h30m');
  });

  test('create with CerialDuration input', async () => {
    const input = CerialDuration.from('1h15m');
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: input, cooldown: null },
    });

    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.equals(input)).toBe(true);
  });

  test('create with SDK Duration input', async () => {
    const native = new Duration('45m');
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: native, cooldown: null },
    });

    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.toString()).toBe('45m');
  });

  test('optional duration field omitted → undefined', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    expect(result.timeout).toBeUndefined();
  });

  test('optional duration field provided', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', timeout: '30s', cooldown: null },
    });

    expect(CerialDuration.is(result.timeout!)).toBe(true);
    expect(result.timeout!.toString()).toBe('30s');
  });

  test('nullable duration field with null', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    expect(result.cooldown).toBeNull();
  });

  test('nullable duration field with value', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: '5m' },
    });

    expect(CerialDuration.is(result.cooldown!)).toBe(true);
    expect(result.cooldown!.toString()).toBe('5m');
  });

  test('duration array field', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null, intervals: ['10s', '30s', '1m'] },
    });

    expect(result.intervals).toHaveLength(3);
    expect(result.intervals.every((d) => CerialDuration.is(d))).toBe(true);
    expect(result.intervals[0]!.toString()).toBe('10s');
    expect(result.intervals[1]!.toString()).toBe('30s');
    expect(result.intervals[2]!.toString()).toBe('1m');
  });

  test('duration array field empty', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    expect(result.intervals).toEqual([]);
  });

  test('CerialDuration accessor methods', async () => {
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '2h30m15s', cooldown: null },
    });

    expect(result.ttl.hours).toBe(2);
    expect(result.ttl.minutes).toBe(150);
    expect(result.ttl.seconds).toBe(9015);
  });

  test('findMany returns CerialDuration instances', async () => {
    await client.db.DurationBasic.create({
      data: { name: 'a', ttl: '1h', cooldown: null },
    });
    await client.db.DurationBasic.create({
      data: { name: 'b', ttl: '2h', cooldown: null },
    });

    const results = await client.db.DurationBasic.findMany({});

    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(CerialDuration.is(r.ttl)).toBe(true);
    }
  });

  test('updateUnique preserves duration type', async () => {
    const created = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    const updated = await client.db.DurationBasic.updateUnique({
      where: { id: created.id },
      data: { ttl: '3h' },
    });

    expect(updated).not.toBeNull();
    expect(CerialDuration.is(updated!.ttl)).toBe(true);
    expect(updated!.ttl.toString()).toBe('3h');
  });
});
