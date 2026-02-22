import { describe, expect, test } from 'bun:test';
import { CerialBytes } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

describe('E2E Bytes: Where', () => {
  const { getClient } = setupDataTypeTests(tables.bytes);

  test('filter by direct equality with Uint8Array', async () => {
    const client = getClient();
    const target = new Uint8Array([1, 2, 3]);
    await client.db.BytesBasic.create({ data: { name: 'a', payload: target, tag: null } });
    await client.db.BytesBasic.create({ data: { name: 'b', payload: new Uint8Array([4, 5]), tag: null } });

    const found = await client.db.BytesBasic.findMany({
      where: { payload: target },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('a');
  });

  test('filter by direct equality with CerialBytes', async () => {
    const client = getClient();
    const target = new Uint8Array([10, 20]);
    await client.db.BytesBasic.create({ data: { name: 'match', payload: target, tag: null } });
    await client.db.BytesBasic.create({ data: { name: 'other', payload: new Uint8Array([30]), tag: null } });

    const found = await client.db.BytesBasic.findMany({
      where: { payload: CerialBytes.from(target) },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('match');
  });

  test('filter by eq operator', async () => {
    const client = getClient();
    const target = new Uint8Array([5, 6, 7]);
    await client.db.BytesBasic.create({ data: { name: 'eq-match', payload: target, tag: null } });

    const found = await client.db.BytesBasic.findMany({
      where: { payload: { eq: target } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('eq-match');
  });

  test('filter by neq operator', async () => {
    const client = getClient();
    const a = new Uint8Array([1]);
    const b = new Uint8Array([2]);
    await client.db.BytesBasic.create({ data: { name: 'a', payload: a, tag: null } });
    await client.db.BytesBasic.create({ data: { name: 'b', payload: b, tag: null } });

    const found = await client.db.BytesBasic.findMany({
      where: { payload: { neq: a } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('b');
  });

  test('filter nullable field by null', async () => {
    const client = getClient();
    await client.db.BytesBasic.create({ data: { name: 'null-tag', payload: new Uint8Array([1]), tag: null } });
    await client.db.BytesBasic.create({
      data: { name: 'has-tag', payload: new Uint8Array([1]), tag: new Uint8Array([9]) },
    });

    const found = await client.db.BytesBasic.findMany({
      where: { tag: null },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('null-tag');
  });

  test('filter array field with has operator', async () => {
    const client = getClient();
    const chunk = new Uint8Array([42]);
    await client.db.BytesBasic.create({
      data: { name: 'has-chunk', payload: new Uint8Array([1]), tag: null, chunks: [chunk, new Uint8Array([99])] },
    });
    await client.db.BytesBasic.create({
      data: { name: 'no-chunk', payload: new Uint8Array([1]), tag: null, chunks: [new Uint8Array([99])] },
    });

    const found = await client.db.BytesBasic.findMany({
      where: { chunks: { has: chunk } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('has-chunk');
  });

  test('filter array field with isEmpty', async () => {
    const client = getClient();
    await client.db.BytesBasic.create({
      data: { name: 'empty', payload: new Uint8Array([1]), tag: null, chunks: [] },
    });
    await client.db.BytesBasic.create({
      data: { name: 'not-empty', payload: new Uint8Array([1]), tag: null, chunks: [new Uint8Array([1])] },
    });

    const found = await client.db.BytesBasic.findMany({
      where: { chunks: { isEmpty: true } },
    });

    expect(found).toHaveLength(1);
    expect(found[0]!.name).toBe('empty');
  });
});
