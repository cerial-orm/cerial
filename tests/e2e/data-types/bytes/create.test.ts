import { describe, expect, test } from 'bun:test';
import { CerialBytes, isCerialId } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Bytes: Create', () => {
  const { getClient } = setupDataTypeTests(tables.bytes);

  test('create with Uint8Array input', async () => {
    const client = getClient();
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload, tag: null },
    });

    expect(isCerialId(result.id)).toBe(true);
    expect(result.name).toBe('test');
    expect(CerialBytes.is(result.payload)).toBe(true);
    expect(result.payload.toUint8Array()).toEqual(payload);
  });

  test('create with base64 string input', async () => {
    const client = getClient();
    const data = new Uint8Array([10, 20, 30]);
    const b64 = Buffer.from(data).toString('base64');
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: b64, tag: null },
    });

    expect(CerialBytes.is(result.payload)).toBe(true);
    expect(result.payload.toUint8Array()).toEqual(data);
  });

  test('create with CerialBytes input', async () => {
    const client = getClient();
    const input = CerialBytes.from(new Uint8Array([100, 200]));
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: input, tag: null },
    });

    expect(CerialBytes.is(result.payload)).toBe(true);
    expect(result.payload.equals(input)).toBe(true);
  });

  test('create with Buffer input', async () => {
    const client = getClient();
    const buf = Buffer.from([7, 8, 9]);
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: buf, tag: null },
    });

    expect(CerialBytes.is(result.payload)).toBe(true);
    expect(result.payload.toUint8Array()).toEqual(new Uint8Array([7, 8, 9]));
  });

  test('create with optional field present', async () => {
    const client = getClient();
    const meta = new Uint8Array([11, 22]);
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: new Uint8Array([1]), metadata: meta, tag: null },
    });

    expect(CerialBytes.is(result.metadata!)).toBe(true);
    expect(result.metadata!.toUint8Array()).toEqual(meta);
  });

  test('create with optional field absent', async () => {
    const client = getClient();
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: new Uint8Array([1]), tag: null },
    });

    expect(result.metadata).toBeUndefined();
  });

  test('create with nullable field set to null', async () => {
    const client = getClient();
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: new Uint8Array([1]), tag: null },
    });

    expect(result.tag).toBeNull();
  });

  test('create with nullable field set to value', async () => {
    const client = getClient();
    const tagData = new Uint8Array([99]);
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: new Uint8Array([1]), tag: tagData },
    });

    expect(CerialBytes.is(result.tag!)).toBe(true);
    expect(result.tag!.toUint8Array()).toEqual(tagData);
  });

  test('create with array field', async () => {
    const client = getClient();
    const c1 = new Uint8Array([1, 2]);
    const c2 = new Uint8Array([3, 4]);
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: new Uint8Array([0]), tag: null, chunks: [c1, c2] },
    });

    expect(result.chunks).toHaveLength(2);
    expect(CerialBytes.is(result.chunks[0])).toBe(true);
    expect(result.chunks[0]!.toUint8Array()).toEqual(c1);
    expect(result.chunks[1]!.toUint8Array()).toEqual(c2);
  });

  test('create with empty array field', async () => {
    const client = getClient();
    const result = await client.db.BytesBasic.create({
      data: { name: 'test', payload: new Uint8Array([0]), tag: null },
    });

    expect(result.chunks).toEqual([]);
  });

  test('create and findMany roundtrip', async () => {
    const client = getClient();
    const payload = new Uint8Array([50, 100, 150, 200, 250]);
    await client.db.BytesBasic.create({
      data: { name: 'roundtrip', payload, tag: null },
    });

    const found = await client.db.BytesBasic.findMany({
      where: { name: 'roundtrip' },
    });

    expect(found).toHaveLength(1);
    expect(CerialBytes.is(found[0]!.payload)).toBe(true);
    expect(found[0]!.payload.toUint8Array()).toEqual(payload);
  });
});
