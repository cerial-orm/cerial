/**
 * E2E Tests: orderBy on a relation field
 *
 * Schema: one-to-many-optional.cerial (Publisher <-> Book)
 * SurrealDB does not sort on `link.field`, so the builder projects the linked value to an alias.
 * Every case asserts the actual row order.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { ids, seedBooks } from './helpers';

describe('E2E orderBy on a relation field', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.oneToManyOptional);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.oneToManyOptional);
    await seedBooks(client);
  });

  test('ascending sorts by the related field, not by insertion order', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'asc' },
    });

    // Alpha (six, two) -> Birch (three) -> Cedar (one)
    expect(rows.map((r) => r.title)).toEqual(['six', 'two', 'three', 'one']);
  });

  test('descending reverses the related order', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'desc' }, title: 'asc' },
    });

    expect(rows.map((r) => r.title)).toEqual(['one', 'three', 'six', 'two']);
  });

  test('rows come back in their normal shape with no sort alias', async () => {
    const rows = await client.db.Book.findMany({ orderBy: { publisher: { name: 'asc' } } });

    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(
        row.publisherId === undefined ? ['id', 'isbn', 'title'] : ['id', 'isbn', 'publisherId', 'title'],
      );
    }
  });

  test('rows with a null or unset relation sort first ascending, in a stable order', async () => {
    const asc = await client.db.Book.findMany({ orderBy: { publisher: { name: 'asc' }, title: 'asc' } });

    // NONE (four) and null (five) both sort before any name; the title key breaks the tie
    expect(asc.map((r) => r.title)).toEqual(['five', 'four', 'six', 'two', 'three', 'one']);

    for (let i = 0; i < 3; i++) {
      const again = await client.db.Book.findMany({ orderBy: { publisher: { name: 'asc' }, title: 'asc' } });
      expect(ids(again)).toEqual(ids(asc));
    }
  });

  test('rows with a null or unset relation sort last descending', async () => {
    const desc = await client.db.Book.findMany({ orderBy: { publisher: { name: 'desc' }, title: 'asc' } });

    expect(desc.map((r) => r.title)).toEqual(['one', 'three', 'six', 'two', 'five', 'four']);
  });

  test('ties on the related value keep a stable order without a second key', async () => {
    const first = await client.db.Book.findMany({ orderBy: { publisher: { name: 'asc' } } });
    const second = await client.db.Book.findMany({ orderBy: { publisher: { name: 'asc' } } });

    expect(ids(second)).toEqual(ids(first));
    // The two Alpha books are adjacent
    const titles = first.map((r) => r.title);
    expect(Math.abs(titles.indexOf('two') - titles.indexOf('six'))).toBe(1);
  });

  test('explicit select returns only the requested fields and no alias', async () => {
    const rows = await client.db.Book.findMany({
      select: { title: true },
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'asc' },
    });

    expect(rows.map((r) => r.title)).toEqual(['six', 'two', 'three', 'one']);
    expect(rows.flatMap((r) => Object.keys(r)).filter((k) => k.startsWith('__'))).toEqual([]);
    // Only the selected field and the mapper's null fill for an unselected nullable field
    expect(rows.flatMap((r) => Object.keys(r)).every((k) => k === 'title' || k === 'publisherId')).toBe(true);
  });

  test('limit applies after sorting', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'asc' },
      limit: 2,
    });

    expect(rows.map((r) => r.title)).toEqual(['six', 'two']);
  });

  test('offset and limit page through the sorted result', async () => {
    const orderBy = { publisher: { name: 'asc' as const }, title: 'asc' as const };
    const where = { publisherId: { not: null } };

    const page2 = await client.db.Book.findMany({ where, orderBy, limit: 2, offset: 2 });
    const page3 = await client.db.Book.findMany({ where, orderBy, limit: 2, offset: 4 });

    expect(page2.map((r) => r.title)).toEqual(['three', 'one']);
    expect(page3).toEqual([]);
  });

  test('offset with select and descending order pages the sorted rows', async () => {
    const rows = await client.db.Book.findMany({
      select: { title: true },
      orderBy: { publisher: { name: 'desc' }, title: 'asc' },
      limit: 3,
      offset: 1,
    });

    expect(rows.map((r) => r.title)).toEqual(['three', 'six', 'two']);
  });

  test('where filters before sorting and paging', async () => {
    const rows = await client.db.Book.findMany({
      where: { title: { in: ['one', 'two', 'three'] } },
      orderBy: { publisher: { name: 'asc' } },
      limit: 1,
    });

    expect(rows.map((r) => r.title)).toEqual(['two']);
  });

  test('findOne returns the first row of the sorted result', async () => {
    const first = await client.db.Book.findOne({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'asc' },
    });
    const last = await client.db.Book.findOne({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'desc' } },
    });

    expect(first?.title).toBe('six');
    expect(last?.title).toBe('one');
    expect(first && 'id' in first).toBe(true);
  });

  test('findOne returns null when nothing matches', async () => {
    const none = await client.db.Book.findOne({ where: { title: 'nope' }, orderBy: { publisher: { name: 'asc' } } });

    expect(none).toBeNull();
  });

  test('findOne with select returns only the requested fields', async () => {
    const row = await client.db.Book.findOne({
      select: { title: true },
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'desc' },
    });

    expect(row?.title).toBe('two');
    expect(Object.keys(row ?? {}).filter((k) => k.startsWith('__'))).toEqual([]);
  });

  test('declared key order wins: own field first, relation second', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { title: 'desc', publisher: { name: 'asc' } },
    });

    expect(rows.map((r) => r.title)).toEqual(['two', 'three', 'six', 'one']);
  });

  test('declared key order wins: relation first, own field second', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'desc' },
    });

    expect(rows.map((r) => r.title)).toEqual(['two', 'six', 'three', 'one']);
  });

  test('several keys under one relation sort in order', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc', id: 'desc' }, title: 'asc' },
    });

    expect(rows.map((r) => r.title)).toEqual(['six', 'two', 'three', 'one']);
  });

  test('works together with include, which keeps its own subquery', async () => {
    const rows = await client.db.Book.findMany({
      where: { publisherId: { not: null } },
      orderBy: { publisher: { name: 'asc' }, title: 'asc' },
      include: { publisher: true },
    });

    expect(rows.map((r) => r.publisher?.name)).toEqual(['Alpha', 'Alpha', 'Birch', 'Cedar']);
    expect(rows.every((r) => !('__cerial_ord_0' in r))).toBe(true);
  });

  test('orderBy inside include still sorts the included rows', async () => {
    const alpha = await client.db.Publisher.findOne({
      where: { name: 'Alpha' },
      include: { books: { orderBy: { title: 'desc' } } },
    });

    expect(alpha?.books.map((b) => b.title)).toEqual(['two', 'six']);
  });

  test('no relation key leaves the plain query path untouched', async () => {
    const rows = await client.db.Book.findMany({ orderBy: { title: 'asc' }, limit: 2 });

    expect(rows.map((r) => r.title)).toEqual(['five', 'four']);
  });
});
