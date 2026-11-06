/**
 * E2E Tests: a filter on a forward to-one relation requires the relation to be set
 *
 * The filter compiled to a dotted path on the foreign key, and with no related record that path is NONE, which
 * satisfies every negative operator: `manager: { name: { neq: 'zz' } }` matched the rows with no manager, and
 * deleteMany removed them. A relation filter now means "the relation is set, and the related record matches",
 * so a row with no relation never matches it and a NOT around the relation key does match it.
 *
 * Employees (self relation, optional nullable manager):
 *   e0 no manager (unset), e1 and e2 managed by e0, e3 managed by e1, e4 manager explicitly null
 * Dangling (NoAction self relation): n0 is deleted after n1 and n2 (managed by n0) and n3 (managed by n1) exist,
 *   so n1 and n2 keep a key to a record that is gone
 * Books (non-self, optional nullable publisher):
 *   b0 no publisher (unset), b1 Alpha, b2 Beta, b3 publisher explicitly null
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type BookWhere,
  type CerialClient,
  cleanupTables,
  createTestClient,
  type EmployeeNoActionWhere,
  type EmployeeSingleSidedWhere,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { type Case, idOf, type Rows, runCases } from './helpers';

const ALL_TABLES = [...tables.selfRefOneToMany, ...tables.selfRefOneToManyNoAction, ...tables.oneToManyOptional];
const EMP_IDS = ['e0', 'e1', 'e2', 'e3', 'e4'] as const;
const BOOK_IDS = ['b0', 'b1', 'b2', 'b3'] as const;
const MANAGER: Record<string, string | undefined> = { e1: 'e0', e2: 'e0', e3: 'e1' };

describe('E2E forward to-one relation filter requires the relation to be set', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, ALL_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, ALL_TABLES);

    for (const id of EMP_IDS) {
      const managerId = MANAGER[id];
      await client.db.EmployeeSingleSided.create({
        data: { id, name: id, ...(managerId ? { managerId } : id === 'e4' ? { managerId: null } : {}) },
      });
    }

    const alpha = await client.db.Publisher.create({ data: { name: 'Alpha' } });
    const beta = await client.db.Publisher.create({ data: { name: 'Beta' } });
    await client.db.Book.create({ data: { id: 'b0', title: 'b0', isbn: 'i0' } });
    await client.db.Book.create({ data: { id: 'b1', title: 'b1', isbn: 'i1', publisherId: alpha.id } });
    await client.db.Book.create({ data: { id: 'b2', title: 'b2', isbn: 'i2', publisherId: beta.id } });
    await client.db.Book.create({ data: { id: 'b3', title: 'b3', isbn: 'i3', publisherId: null } });

    for (const [id, managerId] of [['n0'], ['n1', 'n0'], ['n2', 'n0'], ['n3', 'n1']] as const) {
      await client.db.EmployeeNoAction.create({ data: { id, name: id, ...(managerId ? { managerId } : {}) } });
    }
  });

  const empRows = (): Rows<EmployeeSingleSidedWhere> => ({
    find: async (where) => (await client.db.EmployeeSingleSided.findMany({ where })).map((r) => r.name),
    count: (where) => client.db.EmployeeSingleSided.count(where),
    update: async (where) => {
      await client.db.EmployeeSingleSided.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () =>
      (await client.db.EmployeeSingleSided.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.EmployeeSingleSided.deleteMany({ where });
    },
    survivors: async () => (await client.db.EmployeeSingleSided.findMany()).map((r) => r.name),
    everything: EMP_IDS,
  });

  const bookRows = (): Rows<BookWhere> => ({
    find: async (where) => (await client.db.Book.findMany({ where })).map((r) => r.title),
    count: (where) => client.db.Book.count(where),
    update: async (where) => {
      await client.db.Book.updateMany({ where, data: { title: 'MARKED' } });
    },
    marked: async () => (await client.db.Book.findMany({ where: { title: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.Book.deleteMany({ where });
    },
    survivors: async () => (await client.db.Book.findMany()).map((r) => r.title),
    everything: BOOK_IDS,
  });

  const employees: Case<EmployeeSingleSidedWhere>[] = [
    {
      label: 'neq: only rows with a manager',
      where: { manager: { name: { neq: 'zz' } } },
      expected: ['e1', 'e2', 'e3'],
    },
    { label: 'NOT inside the body', where: { manager: { NOT: { name: 'zz' } } }, expected: ['e1', 'e2', 'e3'] },
    { label: 'notIn', where: { manager: { name: { notIn: ['zz'] } } }, expected: ['e1', 'e2', 'e3'] },
    { label: 'OR around neq', where: { manager: { OR: [{ name: { neq: 'zz' } }] } }, expected: ['e1', 'e2', 'e3'] },
    {
      label: 'NOT around the relation: rows without one match',
      where: { NOT: { manager: { name: { neq: 'zz' } } } },
      expected: ['e0', 'e4'],
    },
    { label: 'eq', where: { manager: { name: 'e0' } }, expected: ['e1', 'e2'] },
    { label: 'neq on a real name', where: { manager: { name: { neq: 'e0' } } }, expected: ['e3'] },
    { label: 'NOT eq on a real name', where: { NOT: { manager: { name: 'e0' } } }, expected: ['e0', 'e3', 'e4'] },
    { label: 'in', where: { manager: { name: { in: ['e0', 'e1'] } } }, expected: ['e1', 'e2', 'e3'] },
    { label: 'contains', where: { manager: { name: { contains: 'e' } } }, expected: ['e1', 'e2', 'e3'] },
    {
      label: 'nested: the manager has a manager',
      where: { manager: { manager: { name: { neq: 'zz' } } } },
      expected: ['e3'],
    },
    {
      label: 'nested under NOT',
      where: { NOT: { manager: { manager: { name: { neq: 'zz' } } } } },
      expected: ['e0', 'e1', 'e2', 'e4'],
    },
    {
      label: 'OR with a plain field keeps the guard on the relation branch',
      where: { OR: [{ manager: { name: { neq: 'zz' } } }, { name: 'e4' }] },
      expected: ['e1', 'e2', 'e3', 'e4'],
    },
    {
      label: 'set and unset together match nothing',
      where: { manager: { name: { neq: 'zz' } }, managerId: { isNone: true } },
      expected: [],
    },
    // The explicit no-relation queries: create stores NULL for an absent nullable key, so null finds every row without one
    { label: 'manager: null reaches every row without a manager', where: { manager: null }, expected: ['e0', 'e4'] },
    {
      label: 'managerId: null reaches every row without a manager',
      where: { managerId: null },
      expected: ['e0', 'e4'],
    },
    {
      label: 'managerId isNone: create stores null, so nothing is NONE',
      where: { managerId: { isNone: true } },
      expected: [],
    },
    {
      label: 'null or NONE: every row without a manager',
      where: { OR: [{ managerId: { isNone: true } }, { manager: null }] },
      expected: ['e0', 'e4'],
    },
  ];

  const books: Case<BookWhere>[] = [
    { label: 'neq: only rows with a publisher', where: { publisher: { name: { neq: 'zz' } } }, expected: ['b1', 'b2'] },
    { label: 'NOT inside the body', where: { publisher: { NOT: { name: 'zz' } } }, expected: ['b1', 'b2'] },
    { label: 'notIn', where: { publisher: { name: { notIn: ['zz'] } } }, expected: ['b1', 'b2'] },
    { label: 'OR around neq', where: { publisher: { OR: [{ name: { neq: 'zz' } }] } }, expected: ['b1', 'b2'] },
    {
      label: 'NOT around the relation: rows without one match',
      where: { NOT: { publisher: { name: { neq: 'zz' } } } },
      expected: ['b0', 'b3'],
    },
    { label: 'eq', where: { publisher: { name: 'Alpha' } }, expected: ['b1'] },
    { label: 'neq on a real name', where: { publisher: { name: { neq: 'Alpha' } } }, expected: ['b2'] },
    { label: 'NOT eq on a real name', where: { NOT: { publisher: { name: 'Alpha' } } }, expected: ['b0', 'b2', 'b3'] },
    {
      label: 'publisher: null reaches every row without a publisher',
      where: { publisher: null },
      expected: ['b0', 'b3'],
    },
    {
      label: 'publisherId isNone: create stores null, so nothing is NONE',
      where: { publisherId: { isNone: true } },
      expected: [],
    },
  ];

  runCases('Employee.manager', empRows, employees);
  runCases('Book.publisher', bookRows, books);

  // A key to a deleted record is not a related record: the filter must not match it, and a NOT must
  describe('a dangling key', () => {
    const NA_IDS = ['n1', 'n2', 'n3'] as const;

    const naRows = (): Rows<EmployeeNoActionWhere> => ({
      find: async (where) => (await client.db.EmployeeNoAction.findMany({ where })).map((r) => r.name),
      count: (where) => client.db.EmployeeNoAction.count(where),
      update: async (where) => {
        await client.db.EmployeeNoAction.updateMany({ where, data: { name: 'MARKED' } });
      },
      marked: async () =>
        (await client.db.EmployeeNoAction.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
      remove: async (where) => {
        await client.db.EmployeeNoAction.deleteMany({ where });
      },
      survivors: async () => (await client.db.EmployeeNoAction.findMany()).map((r) => r.name),
      everything: NA_IDS,
    });

    const naCases: Case<EmployeeNoActionWhere>[] = [
      {
        label: 'neq: only the row whose manager exists',
        where: { manager: { name: { neq: 'zz' } } },
        expected: ['n3'],
      },
      { label: 'NOT inside the body', where: { manager: { NOT: { name: 'zz' } } }, expected: ['n3'] },
      { label: 'notIn', where: { manager: { name: { notIn: ['zz'] } } }, expected: ['n3'] },
      { label: 'OR around neq', where: { manager: { OR: [{ name: { neq: 'zz' } }] } }, expected: ['n3'] },
      {
        label: 'NOT around the relation: dangling rows match',
        where: { NOT: { manager: { name: { neq: 'zz' } } } },
        expected: ['n1', 'n2'],
      },
      { label: 'eq on the live manager', where: { manager: { name: 'n1' } }, expected: ['n3'] },
      { label: 'NOT eq on the live manager', where: { NOT: { manager: { name: 'n1' } } }, expected: ['n1', 'n2'] },
      {
        label: 'nested: the manager has a manager that exists',
        where: { manager: { manager: { name: { neq: 'zz' } } } },
        expected: [],
      },
      {
        label: 'nested under NOT',
        where: { NOT: { manager: { manager: { name: { neq: 'zz' } } } } },
        expected: ['n1', 'n2', 'n3'],
      },
      { label: 'manager: null does not reach a dangling key', where: { manager: null }, expected: [] },
    ];

    beforeEach(async () => {
      await client.db.EmployeeNoAction.deleteMany({ where: { name: 'n0' } });
    });

    runCases('EmployeeNoAction.manager', naRows, naCases);

    describe('a raw delete of the related row', () => {
      const dangling: Case<BookWhere>[] = [
        {
          label: 'neq: only the row whose publisher exists',
          where: { publisher: { name: { neq: 'zz' } } },
          expected: ['b2'],
        },
        {
          label: 'NOT around the relation: unset, null and dangling rows match',
          where: { NOT: { publisher: { name: { neq: 'zz' } } } },
          expected: ['b0', 'b1', 'b3'],
        },
        { label: 'eq on the deleted name', where: { publisher: { name: 'Alpha' } }, expected: [] },
        {
          label: 'NOT eq on the deleted name',
          where: { NOT: { publisher: { name: 'Alpha' } } },
          expected: ['b0', 'b1', 'b2', 'b3'],
        },
      ];

      beforeEach(async () => {
        await client.query("DELETE publisher WHERE name = 'Alpha'");
      });

      runCases('Book.publisher', bookRows, dangling);
    });
  });

  describe('include where', () => {
    // The included row is the filtered one: it comes back only when its own manager is set and matches
    test('an included manager with no manager is excluded by a neq filter on its manager', async () => {
      const result = await client.db.EmployeeSingleSided.findMany({
        where: { name: { in: ['e1', 'e3'] } },
        include: { manager: { where: { manager: { name: { neq: 'zz' } } } } },
      });
      const byName: Record<string, string | null> = Object.fromEntries(
        result.map((r) => [r.name, r.manager?.name ?? null]),
      );

      expect(byName).toEqual({ e1: null, e3: 'e1' });
    });

    test('NOT around the relation key includes the manager with no manager', async () => {
      const result = await client.db.EmployeeSingleSided.findMany({
        where: { name: { in: ['e1', 'e3'] } },
        include: { manager: { where: { NOT: { manager: { name: { neq: 'zz' } } } } } },
      });
      const byName: Record<string, string | null> = Object.fromEntries(
        result.map((r) => [r.name, r.manager?.name ?? null]),
      );

      expect(byName).toEqual({ e1: 'e0', e3: null });
    });

    test('an included manager whose own manager was deleted is excluded', async () => {
      await client.db.EmployeeNoAction.deleteMany({ where: { name: 'n0' } });
      const n3 = await client.db.EmployeeNoAction.findOne({
        where: { name: 'n3' },
        include: { manager: { where: { manager: { name: { neq: 'zz' } } } } },
      });

      expect(n3?.manager).toBeNull();
    });
  });

  describe('$live where', () => {
    const next = async <T>(handle: AsyncIterator<T>): Promise<T | 'timeout'> => {
      const outcome = await Promise.race([
        handle.next(),
        new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5000)),
      ]);

      return outcome === 'timeout' ? outcome : (outcome as IteratorResult<T>).value;
    };

    test('a change to a row without a manager is not delivered, one with a matching manager is', async () => {
      const handle = await client.db.EmployeeSingleSided.$live({ where: { manager: { name: { neq: 'zz' } } } });
      try {
        // e0 has no manager and e4 a null one: neither may be delivered, so the first notification is e1's
        await client.db.EmployeeSingleSided.updateMany({ where: { name: 'e0' }, data: { name: 'e0x' } });
        await client.db.EmployeeSingleSided.updateMany({ where: { name: 'e4' }, data: { name: 'e4x' } });
        await client.db.EmployeeSingleSided.updateMany({ where: { name: 'e1' }, data: { name: 'e1x' } });
        const first = await next(handle);

        expect(first).not.toBe('timeout');
        expect(first === 'timeout' ? '' : idOf(first.recordId)).toBe('e1');
      } finally {
        await handle.kill();
      }
    }, 20_000);
  });
});
