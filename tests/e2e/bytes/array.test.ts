import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { CerialBytes } from 'cerial';

const BYTES_TABLES = tables.bytes;

describe('E2E Bytes: Array Operations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, BYTES_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, BYTES_TABLES);
  });

  test('push single element to array', async () => {
    const result = await client.db.BytesBasic.create({
      data: { name: 'push', payload: new Uint8Array([0]), tag: null, chunks: [new Uint8Array([1])] },
    });

    const updated = await client.db.BytesBasic.updateUnique({
      where: { id: result.id },
      data: { chunks: { push: new Uint8Array([2]) } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.chunks).toHaveLength(2);
    expect(updated!.chunks[0]!.toUint8Array()).toEqual(new Uint8Array([1]));
    expect(updated!.chunks[1]!.toUint8Array()).toEqual(new Uint8Array([2]));
  });

  test('push multiple elements to array', async () => {
    const result = await client.db.BytesBasic.create({
      data: { name: 'push-multi', payload: new Uint8Array([0]), tag: null },
    });

    const updated = await client.db.BytesBasic.updateUnique({
      where: { id: result.id },
      data: { chunks: { push: [new Uint8Array([1]), new Uint8Array([2])] } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.chunks).toHaveLength(2);
  });

  test('full replace array', async () => {
    const result = await client.db.BytesBasic.create({
      data: { name: 'replace', payload: new Uint8Array([0]), tag: null, chunks: [new Uint8Array([1])] },
    });

    const newChunks = [new Uint8Array([10]), new Uint8Array([20]), new Uint8Array([30])];
    const updated = await client.db.BytesBasic.updateUnique({
      where: { id: result.id },
      data: { chunks: newChunks },
    });

    expect(updated).not.toBeNull();
    expect(updated!.chunks).toHaveLength(3);
    expect(updated!.chunks.map((c: CerialBytes) => c.toUint8Array())).toEqual(newChunks.map((c) => new Uint8Array(c)));
  });

  test('array elements are CerialBytes on output', async () => {
    const result = await client.db.BytesBasic.create({
      data: { name: 'output-type', payload: new Uint8Array([0]), tag: null, chunks: [new Uint8Array([1, 2, 3])] },
    });

    expect(result.chunks).toHaveLength(1);
    expect(CerialBytes.is(result.chunks[0])).toBe(true);
  });

  test('create with base64 strings in array', async () => {
    const data1 = new Uint8Array([1, 2]);
    const data2 = new Uint8Array([3, 4]);
    const b64_1 = Buffer.from(data1).toString('base64');
    const b64_2 = Buffer.from(data2).toString('base64');

    const result = await client.db.BytesBasic.create({
      data: { name: 'b64-arr', payload: new Uint8Array([0]), tag: null, chunks: [b64_1, b64_2] },
    });

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]!.toUint8Array()).toEqual(data1);
    expect(result.chunks[1]!.toUint8Array()).toEqual(data2);
  });
});
