import { describe, expect, test } from 'bun:test';
import { CerialDuration, isCerialId } from 'cerial';
import { Duration } from 'surrealdb';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Duration: Create', () => {
  const { getClient } = setupDataTypeTests(tables.duration);

  test('create with explicit duration string', async () => {
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '2h30m', cooldown: null },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('test');
    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.toString()).toBe('2h30m');
  });

  test('create with CerialDuration input', async () => {
    const client = getClient();
    const input = CerialDuration.from('1h15m');
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: input, cooldown: null },
    });

    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.equals(input)).toBe(true);
  });

  test('create with SDK Duration input', async () => {
    const client = getClient();
    const native = new Duration('45m');
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: native, cooldown: null },
    });

    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.toString()).toBe('45m');
  });

  test('optional duration field omitted → undefined', async () => {
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    expect(result.timeout).toBeUndefined();
  });

  test('optional duration field provided', async () => {
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', timeout: '30s', cooldown: null },
    });

    expect(CerialDuration.is(result.timeout!)).toBe(true);
    expect(result.timeout!.toString()).toBe('30s');
  });

  test('nullable duration field with null', async () => {
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    expect(result.cooldown).toBeNull();
  });

  test('nullable duration field with value', async () => {
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: '5m' },
    });

    expect(CerialDuration.is(result.cooldown!)).toBe(true);
    expect(result.cooldown!.toString()).toBe('5m');
  });

  test('duration array field', async () => {
    const client = getClient();
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
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '1h', cooldown: null },
    });

    expect(result.intervals).toEqual([]);
  });

  test('CerialDuration accessor methods', async () => {
    const client = getClient();
    const result = await client.db.DurationBasic.create({
      data: { name: 'test', ttl: '2h30m15s', cooldown: null },
    });

    expect(result.ttl.hours).toBe(2);
    expect(result.ttl.minutes).toBe(150);
    expect(result.ttl.seconds).toBe(9015);
  });

  test('findMany returns CerialDuration instances', async () => {
    const client = getClient();
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
    const client = getClient();
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
