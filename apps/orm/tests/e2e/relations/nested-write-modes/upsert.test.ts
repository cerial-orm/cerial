/**
 * E2E Tests: the nested-write option matrix for upsert
 *
 * The runtime nested-upsert path and the compiled one differ in how they read, branch and map, and
 * were kept apart on purpose. This is what stops them drifting: both halves of the upsert (update an
 * existing row, create a missing one) with each option, through plain, array, callback and manual.
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
const create = { id: 'uc', email: 'c@x.io', name: 'c', isActive: true, age: 5, tags: { connect: ['t1'] } };
const createdRow = { name: 'c', age: 5, tags: ['tag:t1'] };
const hit = { email: 'a@x.io' };
const miss = { email: 'c@x.io' };

const cells: Cell[] = [
  cell(
    'update half: select narrows the result and the connect lands',
    (m) => m.User.upsert({ where: hit, create, update: { age: 99, ...connect }, select: { name: true } }),
    (r) => keysOf(r),
    ['name'],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'update half: include returns the related rows after the connect',
    (m) => m.User.upsert({ where: hit, create, update: { age: 99, ...connect }, include: { tags: true } }),
    (r) => r?.tags.map((t) => t.name).sort(),
    ['t1', 't2'],
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'update half: unset clears the field alongside the connect',
    (m) => m.User.upsert({ where: hit, create, update: { name: 'x', ...connect }, unset: { age: true } }),
    (r) => r && { name: r.name, age: r.age },
    { name: 'x', age: undefined },
    { ...UNTOUCHED, ua: { name: 'x', age: undefined, tags: bothTags } },
  ),
  cell(
    "update half: return: 'before' returns the row as it was",
    (m) => m.User.upsert({ where: hit, create, update: { name: 'NEW', age: 99, ...connect }, return: 'before' }),
    (r) => r && { name: r.name, age: r.age, tags: r.tagIds.map(String) },
    { name: 'a', age: 10, tags: ['tag:t1'] },
    { ...UNTOUCHED, ua: { name: 'NEW', age: 99, tags: bothTags } },
  ),
  cell(
    "update half: return: 'before' honours select",
    (m) =>
      m.User.upsert({
        where: hit,
        create,
        update: { name: 'NEW', ...connect },
        select: { name: true },
        return: 'before',
      }),
    (r) => r && { keys: keysOf(r), name: r.name },
    { keys: ['name'], name: 'a' },
    { ...UNTOUCHED, ua: { name: 'NEW', age: 10, tags: bothTags } },
  ),
  cell(
    "update half: return: 'before' honours include and shows the relations before the connect",
    (m) =>
      m.User.upsert({
        where: hit,
        create,
        update: { name: 'NEW', ...connect },
        include: { tags: true },
        return: 'before',
      }),
    (r) => r && { name: r.name, tags: r.tags.map((t) => t.name).sort() },
    { name: 'a', tags: ['t1'] },
    { ...UNTOUCHED, ua: { name: 'NEW', age: 10, tags: bothTags } },
  ),
  cell(
    'update half: the id in where selects the same row as a unique field',
    (m) => m.User.upsert({ where: { id: 'ua' }, create, update: { age: 99, ...connect } }),
    (r) => r && { name: r.name, age: r.age },
    { name: 'a', age: 99 },
    { ...UNTOUCHED, ua: { name: 'a', age: 99, tags: bothTags } },
  ),
  cell(
    'create half: the row is created, returned and linked',
    (m) => m.User.upsert({ where: miss, create, update: { age: 99 } }),
    (r) => r && { name: r.name, tagIds: r.tagIds.map(String) },
    { name: 'c', tagIds: ['tag:t1'] },
    { ...UNTOUCHED, uc: createdRow },
  ),
  cell(
    'create half: select narrows the result',
    (m) => m.User.upsert({ where: miss, create, update: { age: 99 }, select: { name: true } }),
    (r) => keysOf(r),
    ['name'],
    { ...UNTOUCHED, uc: createdRow },
  ),
  cell(
    'create half: include returns the linked rows',
    (m) => m.User.upsert({ where: miss, create, update: { age: 99 }, include: { tags: true } }),
    (r) => r?.tags.map((t) => t.name),
    ['t1'],
    { ...UNTOUCHED, uc: createdRow },
  ),
  cell(
    "create half: return: 'before' returns null because nothing existed",
    (m) => m.User.upsert({ where: miss, create, update: { age: 99 }, return: 'before' }),
    (r) => r,
    null,
    { ...UNTOUCHED, uc: createdRow },
  ),
];

describe('E2E nested-write matrix: upsert', () => {
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
