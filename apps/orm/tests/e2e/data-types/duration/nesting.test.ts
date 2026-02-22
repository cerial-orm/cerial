import { describe, expect, test } from 'bun:test';
import { CerialDuration } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Duration: Nesting', () => {
  const { getClient } = setupDataTypeTests(tables.duration);

  test('duration in object field', async () => {
    const client = getClient();
    const result = await client.db.DurationWithObject.create({
      data: { name: 'test', timing: { expires: '24h' } },
    });

    expect(CerialDuration.is(result.timing.expires)).toBe(true);
    expect(result.timing.expires.toString()).toBe('1d');
    expect(result.timing.grace).toBeUndefined();
  });

  test('duration in object with optional subfield', async () => {
    const client = getClient();
    const result = await client.db.DurationWithObject.create({
      data: { name: 'test', timing: { expires: '1h', grace: '15m' } },
    });

    expect(CerialDuration.is(result.timing.grace!)).toBe(true);
    expect(result.timing.grace!.toString()).toBe('15m');
  });

  test('duration in tuple field', async () => {
    const client = getClient();
    const result = await client.db.DurationWithTuple.create({
      data: { name: 'test', pair: ['1h', '30m'] },
    });

    expect(CerialDuration.is(result.pair[0])).toBe(true);
    expect(result.pair[0].toString()).toBe('1h');
    expect(result.pair[1]).not.toBeNull();
    expect(CerialDuration.is(result.pair[1]!)).toBe(true);
  });

  test('duration tuple with undefined optional element', async () => {
    const client = getClient();
    const result = await client.db.DurationWithTuple.create({
      data: { name: 'test', pair: ['1h', null] },
    });

    expect(CerialDuration.is(result.pair[0])).toBe(true);
    expect(result.pair[1]).toBeNull();
  });

  test('object duration where filter', async () => {
    const client = getClient();
    await client.db.DurationWithObject.create({
      data: { name: 'fast', timing: { expires: '30m' } },
    });
    await client.db.DurationWithObject.create({
      data: { name: 'slow', timing: { expires: '24h' } },
    });

    const results = await client.db.DurationWithObject.findMany({
      where: { timing: { expires: { gt: '1h' } } },
    });

    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('slow');
  });

  test('update object duration field', async () => {
    const client = getClient();
    const created = await client.db.DurationWithObject.create({
      data: { name: 'test', timing: { expires: '1h' } },
    });

    const updated = await client.db.DurationWithObject.updateUnique({
      where: { id: created.id },
      data: { timing: { expires: '2h' } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.timing.expires.toString()).toBe('2h');
  });
});
