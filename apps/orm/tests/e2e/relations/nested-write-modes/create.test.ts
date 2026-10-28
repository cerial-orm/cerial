/**
 * E2E Tests: the nested-write option matrix for create
 *
 * Same call, four paths: plain, `$transaction` array mode (compiled query), callback and manual.
 * Every cell asserts one returned view and the rows stored afterwards, identically in each mode.
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

const data = { id: 'uc', email: 'c@x.io', name: 'c', isActive: true, age: 5, tags: { connect: ['t1', 't2'] } };
const created = { name: 'c', age: 5, tags: ['tag:t1', 'tag:t2'] };

const cells: Cell[] = [
  cell(
    'a nested connect returns the row and links both tags',
    (m) => m.User.create({ data }),
    (r) => ({ name: r.name, tagIds: r.tagIds.map(String).sort() }),
    { name: 'c', tagIds: ['tag:t1', 'tag:t2'] },
    { ...UNTOUCHED, uc: created },
  ),
  cell(
    'select narrows the result',
    (m) => m.User.create({ data, select: { name: true } }),
    (r) => ({ keys: keysOf(r), name: r.name }),
    { keys: ['name'], name: 'c' },
    { ...UNTOUCHED, uc: created },
  ),
  cell(
    'include returns the related rows the connect just linked',
    (m) => m.User.create({ data, include: { tags: true } }),
    (r) => r.tags.map((t) => t.name).sort(),
    ['t1', 't2'],
    { ...UNTOUCHED, uc: created },
  ),
  cell(
    'select and include together keep the included relation beside the selected field',
    (m) => m.User.create({ data, select: { name: true }, include: { tags: true } }),
    (r) => keysOf(r),
    ['name', 'tags'],
    { ...UNTOUCHED, uc: created },
  ),
];

describe('E2E nested-write matrix: create', () => {
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
