/**
 * E2E Tests: the nested-write option matrix for updateUnique and updateMany
 *
 * A write that carries a relation op takes a different code path from the same write without one,
 * and inside `$transaction` array mode a third one still (the compiled query, mapped by the executor
 * rather than the builder). Four earlier fixes held on the plain path and not in a transaction, so
 * every cell here runs the identical call through the plain path, array, callback and manual mode and
 * asserts the identical returned view and stored rows. A cell that fails in one mode is that mode
 * drifting.
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
import { assertCell, type Cell, cell, keysOf, MODES, UNTOUCHED } from './helpers';

const connect = { tags: { connect: ['t2'] } };
const bothTags = ['tag:t1', 'tag:t2'];

const cells: Cell[] = [
  cell(
    'select narrows the result and the connect still lands',
    (m) => m.User.updateUnique({ where: { id: 'ua' }, data: { age: 99, ...connect }, select: { name: true } }),
    (r) => keysOf(r),
    ['name'],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'include returns the related rows as they stand after the connect',
    (m) => m.User.updateUnique({ where: { id: 'ua' }, data: { age: 99, ...connect }, include: { tags: true } }),
    (r) => r?.tags.map((t) => t.name).sort(),
    ['t1', 't2'],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'unset clears the field alongside the connect',
    (m) => m.User.updateUnique({ where: { id: 'ua' }, data: { name: 'x', ...connect }, unset: { age: true } }),
    (r) => r && { name: r.name, age: r.age },
    { name: 'x', age: undefined },
    { ...UNTOUCHED, ua: { name: 'x', age: undefined, tags: bothTags } },
  ),
  cell(
    'a non-matching extra where key writes nothing and returns null',
    (m) => m.User.updateUnique({ where: { id: 'ua', name: 'WRONG' }, data: { age: 99, ...connect } }),
    (r) => r,
    null,
    UNTOUCHED,
  ),
  cell(
    'a matching extra where key applies the write',
    (m) => m.User.updateUnique({ where: { id: 'ua', isActive: true }, data: { age: 99, ...connect } }),
    (r) => r && { name: r.name, age: r.age },
    { name: 'a', age: 99 },
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    "return: 'before' returns the row as it was",
    (m) => m.User.updateUnique({ where: { id: 'ua' }, data: { name: 'NEW', age: 99, ...connect }, return: 'before' }),
    (r) => r && { name: r.name, age: r.age, tags: r.tagIds.map(String) },
    { name: 'a', age: 10, tags: ['tag:t1'] },
    { ...UNTOUCHED, ua: { name: 'NEW', age: 99, tags: bothTags } },
  ),
  cell(
    "return: 'before' honours select",
    (m) =>
      m.User.updateUnique({
        where: { id: 'ua' },
        data: { name: 'NEW', ...connect },
        select: { name: true },
        return: 'before',
      }),
    (r) => r && { keys: keysOf(r), name: r.name },
    { keys: ['name'], name: 'a' },
    { ...UNTOUCHED, ua: { name: 'NEW', age: 10, tags: bothTags } },
  ),
  cell(
    "return: 'before' honours include and shows the relations before the connect",
    (m) =>
      m.User.updateUnique({
        where: { id: 'ua' },
        data: { name: 'NEW', ...connect },
        include: { tags: true },
        return: 'before',
      }),
    (r) => r && { name: r.name, tags: r.tags.map((t) => t.name).sort() },
    { name: 'a', tags: ['t1'] },
    { ...UNTOUCHED, ua: { name: 'NEW', age: 10, tags: bothTags } },
  ),
  cell(
    "return: 'before' with a stale where returns null and writes nothing",
    (m) => m.User.updateUnique({ where: { id: 'ua', name: 'WRONG' }, data: { age: 99, ...connect }, return: 'before' }),
    (r) => r,
    null,
    UNTOUCHED,
  ),
  cell(
    'return: true reports the match and the connect still lands',
    (m) => m.User.updateUnique({ where: { id: 'ua' }, data: { age: 99, ...connect }, return: true }),
    (r) => r,
    true,
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'return: true with a stale where reports false and writes nothing',
    (m) => m.User.updateUnique({ where: { id: 'ua', name: 'WRONG' }, data: { age: 99, ...connect }, return: true }),
    (r) => r,
    false,
    UNTOUCHED,
  ),
  cell(
    'updateMany with two where keys updates only the rows that match both',
    (m) => m.User.updateMany({ where: { isActive: true, name: 'a' }, data: { age: 99, ...connect } }),
    (rows) => rows.map((r) => r.name),
    ['a'],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'updateMany with a filter object as the first where key',
    (m) => m.User.updateMany({ where: { age: { gt: 15 } }, data: { name: 'big', ...connect } }),
    (rows) => rows.map((r) => r.name),
    ['big'],
    { ...UNTOUCHED, ub: { name: 'big', age: 20, tags: ['tag:t2'] } },
  ),
  cell(
    'updateMany with OR as the where',
    (m) => m.User.updateMany({ where: { OR: [{ name: 'a' }, { name: 'nobody' }] }, data: { age: 99, ...connect } }),
    (rows) => rows.map((r) => r.name),
    ['a'],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'updateMany with NOT as the where',
    (m) => m.User.updateMany({ where: { NOT: { name: 'a' } }, data: { age: 99, ...connect } }),
    (rows) => rows.map((r) => r.name),
    ['b'],
    { ...UNTOUCHED, ub: { name: 'b', age: 99, tags: ['tag:t2'] } },
  ),
  cell(
    'updateMany with unset',
    (m) => m.User.updateMany({ where: { name: 'a' }, data: { name: 'x', ...connect }, unset: { age: true } }),
    (rows) => rows.map((r) => ({ name: r.name, age: r.age })),
    [{ name: 'x', age: undefined }],
    { ...UNTOUCHED, ua: { name: 'x', age: undefined, tags: bothTags } },
  ),
  cell(
    'updateMany with select',
    (m) => m.User.updateMany({ where: { name: 'a' }, data: { age: 99, ...connect }, select: { name: true } }),
    (rows) => rows.map(keysOf),
    [['name']],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
];

describe('E2E nested-write matrix: update', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.core);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.core);
  });

  describe.each(cells)('$label', (c) => {
    test.each(MODES)('%s', async (mode) => {
      const { got, stored } = await assertCell(client, mode, c);

      expect(got).toEqual(c.expected);
      expect(stored).toEqual(c.stored);
    });
  });
});
