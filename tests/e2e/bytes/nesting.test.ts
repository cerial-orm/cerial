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

describe('E2E Bytes: Object Nesting', () => {
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

  test('create with bytes in object', async () => {
    const content = new Uint8Array([1, 2, 3]);
    const result = await client.db.BytesWithObject.create({
      data: { name: 'obj-test', details: { content } },
    });

    expect(CerialBytes.is(result.details.content)).toBe(true);
    expect(result.details.content.toUint8Array()).toEqual(content);
    expect(result.details.extra).toBeUndefined();
  });

  test('create with optional bytes in object', async () => {
    const content = new Uint8Array([1]);
    const extra = new Uint8Array([2, 3]);
    const result = await client.db.BytesWithObject.create({
      data: { name: 'obj-extra', details: { content, extra } },
    });

    expect(CerialBytes.is(result.details.extra!)).toBe(true);
    expect(result.details.extra!.toUint8Array()).toEqual(extra);
  });

  test('update bytes in object', async () => {
    const result = await client.db.BytesWithObject.create({
      data: { name: 'upd', details: { content: new Uint8Array([1]) } },
    });

    const newContent = new Uint8Array([10, 20, 30]);
    const updated = await client.db.BytesWithObject.updateUnique({
      where: { id: result.id },
      data: { details: { content: newContent } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.details.content.toUint8Array()).toEqual(newContent);
  });

  test('findMany with bytes in object roundtrip', async () => {
    const content = new Uint8Array([77, 88, 99]);
    await client.db.BytesWithObject.create({
      data: { name: 'find-obj', details: { content } },
    });

    const found = await client.db.BytesWithObject.findMany({
      where: { name: 'find-obj' },
    });

    expect(found).toHaveLength(1);
    expect(CerialBytes.is(found[0]!.details.content)).toBe(true);
    expect(found[0]!.details.content.toUint8Array()).toEqual(content);
  });
});

describe('E2E Bytes: Tuple Nesting', () => {
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

  test('create with bytes in tuple', async () => {
    const first = new Uint8Array([1, 2]);
    const result = await client.db.BytesWithTuple.create({
      data: { name: 'tup-test', pair: [first, null] },
    });

    expect(CerialBytes.is(result.pair[0])).toBe(true);
    expect(result.pair[0].toUint8Array()).toEqual(first);
    expect(result.pair[1]).toBeNull();
  });

  test('create with both tuple elements', async () => {
    const first = new Uint8Array([10]);
    const second = new Uint8Array([20]);
    const result = await client.db.BytesWithTuple.create({
      data: { name: 'tup-both', pair: [first, second] },
    });

    expect(CerialBytes.is(result.pair[0])).toBe(true);
    expect(result.pair[0].toUint8Array()).toEqual(first);
    expect(CerialBytes.is(result.pair[1]!)).toBe(true);
    expect(result.pair[1]!.toUint8Array()).toEqual(second);
  });

  test('update bytes in tuple (full replace)', async () => {
    const result = await client.db.BytesWithTuple.create({
      data: { name: 'upd-tup', pair: [new Uint8Array([1]), undefined] },
    });

    const newFirst = new Uint8Array([99]);
    const updated = await client.db.BytesWithTuple.updateUnique({
      where: { id: result.id },
      data: { pair: { 0: Buffer.from(newFirst).toString('base64') } },
    });

    expect(updated).not.toBeNull();
    expect(updated!.pair[0].toUint8Array()).toEqual(newFirst);
  });

  test('findMany with bytes in tuple roundtrip', async () => {
    const first = new Uint8Array([55, 66]);
    await client.db.BytesWithTuple.create({
      data: { name: 'find-tup', pair: [first, undefined] },
    });

    const found = await client.db.BytesWithTuple.findMany({
      where: { name: 'find-tup' },
    });

    expect(found).toHaveLength(1);
    expect(CerialBytes.is(found[0]!.pair[0])).toBe(true);
    expect(found[0]!.pair[0].toUint8Array()).toEqual(first);
  });
});
