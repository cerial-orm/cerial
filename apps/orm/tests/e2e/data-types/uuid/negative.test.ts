import { describe, expect, test } from 'bun:test';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E UUID: Negative / Edge Cases', () => {
  const { getClient } = setupDataTypeTests(tables.uuid);

  test('rejects invalid UUID string format', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.UuidBasic.create({
          data: { name: 'bad-uuid', token: 'not-a-uuid' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects empty string as UUID', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.UuidBasic.create({
          data: { name: 'empty-uuid', token: '' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects number as UUID value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.UuidBasic.create({
          // @ts-expect-error — intentionally passing number instead of CerialUuidInput
          data: { name: 'num-uuid', token: 12345 },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects UUID-like string with wrong length', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.UuidBasic.create({
          data: { name: 'short-uuid', token: '550e8400-e29b-41d4-a716' },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects UUID with invalid hex characters', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.UuidBasic.create({
          data: {
            name: 'bad-hex',
            token: 'gggggggg-gggg-gggg-gggg-gggggggggggg',
          },
        });
      })(),
    ).rejects.toThrow();
  });
});
