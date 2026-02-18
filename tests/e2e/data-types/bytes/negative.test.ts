import { describe, expect, test } from 'bun:test';
import { CerialBytes } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Bytes: Negative / Edge Cases', () => {
  const { getClient } = setupDataTypeTests(tables.bytes);

  test('invalid base64 string is silently accepted by Buffer.from', async () => {
    const client = getClient();

    // Buffer.from('!!!invalid!!!', 'base64') does not throw — it silently
    // ignores non-base64 characters and produces a (possibly empty) buffer.
    // SurrealDB stores whatever bytes result from the decode.
    const result = await client.db.BytesBasic.create({
      data: { name: 'bad-b64', payload: '!!!invalid!!!', tag: null },
    });

    expect(result.id).toBeDefined();
    expect(CerialBytes.is(result.payload)).toBe(true);
  });

  test('rejects number as bytes value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.BytesBasic.create({
          // @ts-expect-error — intentionally passing number instead of CerialBytesInput
          data: { name: 'num-bytes', payload: 12345, tag: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('rejects boolean as bytes value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.BytesBasic.create({
          // @ts-expect-error — intentionally passing boolean instead of CerialBytesInput
          data: { name: 'bool-bytes', payload: true, tag: null },
        });
      })(),
    ).rejects.toThrow();
  });

  test('empty string produces empty bytes', async () => {
    const client = getClient();

    // Empty string base64-decodes to an empty buffer — valid operation
    const result = await client.db.BytesBasic.create({
      data: { name: 'empty-bytes', payload: '', tag: null },
    });

    expect(result.id).toBeDefined();
    expect(CerialBytes.is(result.payload)).toBe(true);
    expect(result.payload.length).toBe(0);
  });

  test('rejects object as bytes value', async () => {
    const client = getClient();

    await expect(
      (async () => {
        await client.db.BytesBasic.create({
          // @ts-expect-error — intentionally passing object instead of CerialBytesInput
          data: { name: 'obj-bytes', payload: { data: 'test' }, tag: null },
        });
      })(),
    ).rejects.toThrow();
  });
});
