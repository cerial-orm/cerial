import { describe, expect, test } from 'bun:test';
import { CerialDuration } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Duration: Negative / Edge Cases', () => {
  const { getClient } = setupDataTypeTests(tables.duration);

  test('rejects invalid duration string', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DurationBasic.create({
          data: { name: 'bad-dur', ttl: 'not-a-duration', cooldown: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('empty string as duration produces zero-duration', async () => {
    const client = getClient();

    const result = await client.db.DurationBasic.create({
      data: { name: 'empty-dur', ttl: '', cooldown: null },
    });

    expect(result.id).toBeDefined();
    expect(CerialDuration.is(result.ttl)).toBe(true);
    expect(result.ttl.milliseconds).toBe(0);
  });

  test('rejects number as duration value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DurationBasic.create({
          // @ts-expect-error — intentionally passing number instead of CerialDurationInput
          data: { name: 'num-dur', ttl: 3600, cooldown: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects duration string with invalid units', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DurationBasic.create({
          data: { name: 'bad-unit', ttl: '10x', cooldown: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects duration string with only text', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.DurationBasic.create({
          data: { name: 'text-dur', ttl: 'hours', cooldown: null },
        });
      })(),
    ).rejects.toThrow();
  });
});
