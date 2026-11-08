/**
 * E2E Tests: `relation: {}` on a forward to-one relation
 *
 * On a read, `relation: {}` (and every body that states no condition) means the related record exists, and
 * `relation: null` (or NOT around `{}`) none: an unset key, a stored NULL, or a key to a deleted record. A write
 * refuses `{}` and the equivalent shapes; `NOT: { relation: null }` is its explicit form. The field level stays distinct: `managerId: null` compares the stored NULL, `managerId: { isNone: true }` an unset key.
 *
 * Employees (optional nullable manager), written so that each kind of key exists:
 *   m0 unset (NONE), r1 and r2 managed by m0, r3 managed by r1, nul stored NULL, non unset (NONE),
 *   gh a key to a record that does not exist
 * Holders (optional, not nullable doc): h0 unset (NONE), hg a key to a record that does not exist, hs has a doc
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  type EmployeeSingleSidedWhere,
  type NcHolderWhere,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { type Case, idOf, type Rows, runCases } from './helpers';

const ALL_TABLES = [...tables.selfRefOneToMany, ...tables.selfRefOneToManyNoAction, ...tables.nestedCreateDecorators];
const EMP_IDS = ['m0', 'r1', 'r2', 'r3', 'nul', 'non', 'gh'] as const;
const HOLDER_IDS = ['h0', 'hg', 'hs'] as const;
const HAS_MANAGER = ['r1', 'r2', 'r3'];
const NO_MANAGER = ['m0', 'nul', 'non', 'gh'];

const docData = {
  label: 'doc',
  amount: 19.99,
  span: '1h30m',
  stamp: new Date('2024-03-04T05:06:07.000Z'),
  tags: ['a'],
};

describe('E2E forward to-one relation: {} is "has one"', () => {
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

    // Raw writes: the client stores NULL for an absent nullable key, and a key to a missing record needs no target
    await client.query(`
      CREATE employee_single_sided:m0 SET name = 'm0';
      CREATE employee_single_sided:r1 SET name = 'r1', managerId = employee_single_sided:m0;
      CREATE employee_single_sided:r2 SET name = 'r2', managerId = employee_single_sided:m0;
      CREATE employee_single_sided:r3 SET name = 'r3', managerId = employee_single_sided:r1;
      CREATE employee_single_sided:nul SET name = 'nul', managerId = NULL;
      CREATE employee_single_sided:non SET name = 'non';
      CREATE employee_single_sided:gh SET name = 'gh', managerId = employee_single_sided:ghost;
    `);

    await client.db.NcHolder.create({ data: { id: 'h0', name: 'h0' } });
    await client.db.NcHolder.create({ data: { id: 'hs', name: 'hs', doc: { create: docData } } });
    await client.query("CREATE nc_holder:hg SET name = 'hg', docId = nc_doc:ghost");
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

  const holderRows = (): Rows<NcHolderWhere> => ({
    find: async (where) => (await client.db.NcHolder.findMany({ where })).map((r) => r.name),
    count: (where) => client.db.NcHolder.count(where),
    update: async (where) => {
      await client.db.NcHolder.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () => (await client.db.NcHolder.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.NcHolder.deleteMany({ where });
    },
    survivors: async () => (await client.db.NcHolder.findMany()).map((r) => r.name),
    everything: HOLDER_IDS,
  });

  const employees: Case<EmployeeSingleSidedWhere>[] = [
    // the destructive payload that deleted rows with no manager
    {
      label: 'neq beside manager: {} touches only rows with a manager',
      where: { name: { neq: 'zz' }, manager: {} },
      expected: HAS_MANAGER,
      refusedOnWrite: true,
    },
    { label: 'manager: {}', where: { manager: {} }, expected: HAS_MANAGER, refusedOnWrite: true },
    { label: 'manager: { AND: [] }', where: { manager: { AND: [] } }, expected: HAS_MANAGER, refusedOnWrite: true },
    {
      label: 'manager: { name: undefined }',
      where: { manager: { name: undefined } },
      expected: HAS_MANAGER,
      refusedOnWrite: true,
    },
    { label: 'manager: { name: {} }', where: { manager: { name: {} } }, expected: HAS_MANAGER, refusedOnWrite: true },
    {
      label: 'manager: { AND: [{}] }',
      where: { manager: { AND: [{}] } },
      expected: HAS_MANAGER,
      refusedOnWrite: true,
    },
    { label: 'NOT manager: {}', where: { NOT: { manager: {} } }, expected: NO_MANAGER, refusedOnWrite: true },
    { label: 'name: {}', where: { name: {} }, expected: EMP_IDS, refusedOnWrite: true },
    {
      label: 'manager: { name: { eq: undefined } }',
      where: { manager: { name: { eq: undefined } } },
      expected: HAS_MANAGER,
      refusedOnWrite: true,
    },
    // depth 2
    { label: 'manager: { manager: {} }', where: { manager: { manager: {} } }, expected: ['r3'], refusedOnWrite: true },
    {
      label: 'NOT manager: { manager: {} }',
      where: { NOT: { manager: { manager: {} } } },
      expected: EMP_IDS.filter((i) => i !== 'r3'),
      refusedOnWrite: true,
    },
    // the explicit forms: allowed on writes
    { label: 'manager: null', where: { manager: null }, expected: NO_MANAGER },
    { label: 'NOT manager: null', where: { NOT: { manager: null } }, expected: HAS_MANAGER },
    { label: 'neq beside manager: null', where: { name: { neq: 'zz' }, manager: null }, expected: NO_MANAGER },
    {
      label: 'neq beside NOT manager: null',
      where: { name: { neq: 'zz' }, NOT: { manager: null } },
      expected: HAS_MANAGER,
    },
    { label: 'manager: { manager: null }', where: { manager: { manager: null } }, expected: ['r1', 'r2'] },
    {
      label: 'manager: {} or null together is every row',
      where: { OR: [{ NOT: { manager: null } }, { manager: null }] },
      expected: EMP_IDS,
    },
    { label: 'manager: { name: "m0" }', where: { manager: { name: 'm0' } }, expected: ['r1', 'r2'] },
    // field level: each hits exactly its own kind of key
    { label: 'managerId: null is the stored NULL only', where: { managerId: null }, expected: ['nul'] },
    {
      label: 'managerId isNull: true is the stored NULL only',
      where: { managerId: { isNull: true } },
      expected: ['nul'],
    },
    {
      label: 'managerId isNone: true is the unset key only',
      where: { managerId: { isNone: true } },
      expected: ['m0', 'non'],
    },
    {
      label: 'managerId equal to the missing record is the dangling row only',
      where: { managerId: 'ghost' },
      expected: ['gh'],
    },
    {
      label: 'the three field-level kinds together are the three no-record kinds',
      where: { OR: [{ managerId: null }, { managerId: { isNone: true } }, { managerId: 'ghost' }] },
      expected: NO_MANAGER,
    },
  ];

  // The generated type allows null only on a nullable key; a where built from a JSON body can still carry it
  const fromJson = (where: unknown): NcHolderWhere => where as NcHolderWhere;

  const holders: Case<NcHolderWhere>[] = [
    { label: 'doc: {}', where: { doc: {} }, expected: ['hs'], refusedOnWrite: true },
    { label: 'NOT doc: {}', where: { NOT: { doc: {} } }, expected: ['h0', 'hg'], refusedOnWrite: true },
    {
      label: 'doc: null reaches the unset and the dangling key',
      where: fromJson({ doc: null }),
      expected: ['h0', 'hg'],
    },
    { label: 'NOT doc: null', where: fromJson({ NOT: { doc: null } }), expected: ['hs'] },
    { label: 'docId isNone: true is the unset key only', where: { docId: { isNone: true } }, expected: ['h0'] },
  ];

  runCases('EmployeeSingleSided', empRows, employees);
  runCases('NcHolder', holderRows, holders);

  test('docId: null on a key that cannot hold NULL is refused, and a write touches no row', async () => {
    const where = fromJson({ docId: null });
    const run = async (call: () => unknown): Promise<void> => {
      await expect(
        (async () => {
          await call();
        })(),
      ).rejects.toThrow(/docId/);
    };
    await run(() => client.db.NcHolder.findMany({ where }));
    await run(() => client.db.NcHolder.deleteMany({ where: fromJson({ NOT: { docId: null } }) }));
    await run(() => client.db.NcHolder.updateMany({ where, data: { name: 'MARKED' } }));
    expect(await client.db.NcHolder.count()).toBe(HOLDER_IDS.length);
  });

  // The builders throw while the call is made, so the refusal is awaited through an async wrapper
  const refuses = (run: () => unknown) =>
    expect(
      (async () => {
        await run();
      })(),
    ).rejects.toThrow(/ambiguous on a write/);

  // A unique where takes the id plus the filter keys under test; the ambiguity check runs on the whole clause
  const uniqueWhere = (where: EmployeeSingleSidedWhere) => ({ id: 'r1', ...where }) as { id: string };

  describe('inside a $transaction', () => {
    const survivors = async () => (await client.db.EmployeeSingleSided.findMany()).map((r) => r.name).sort();
    const marked = async () =>
      (await client.db.EmployeeSingleSided.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)).sort();
    const intact = [...EMP_IDS].sort();

    const explicit: Array<[string, EmployeeSingleSidedWhere, readonly string[]]> = [
      ['NOT manager: null', { name: { neq: 'zz' }, NOT: { manager: null } }, HAS_MANAGER],
      ['manager: null', { manager: null }, NO_MANAGER],
    ];

    describe.each(explicit)('%s', (_label, where, expected) => {
      const remaining = EMP_IDS.filter((id) => !expected.includes(id)).sort();

      test('array mode deleteMany', async () => {
        await client.$transaction([client.db.EmployeeSingleSided.deleteMany({ where })]);

        expect(await survivors()).toEqual(remaining);
      });

      test('callback mode deleteMany', async () => {
        await client.$transaction(async (tx) => {
          await tx.EmployeeSingleSided.deleteMany({ where });
        });

        expect(await survivors()).toEqual(remaining);
      });

      test('manual mode deleteMany', async () => {
        const txn = await client.$transaction();
        await txn.EmployeeSingleSided.deleteMany({ where });
        await txn.commit();

        expect(await survivors()).toEqual(remaining);
      });

      test('array mode updateMany', async () => {
        await client.$transaction([client.db.EmployeeSingleSided.updateMany({ where, data: { name: 'MARKED' } })]);

        expect(await marked()).toEqual([...expected].sort());
      });

      test('callback mode updateMany', async () => {
        await client.$transaction(async (tx) => {
          await tx.EmployeeSingleSided.updateMany({ where, data: { name: 'MARKED' } });
        });

        expect(await marked()).toEqual([...expected].sort());
      });

      test('manual mode updateMany', async () => {
        const txn = await client.$transaction();
        await txn.EmployeeSingleSided.updateMany({ where, data: { name: 'MARKED' } });
        await txn.commit();

        expect(await marked()).toEqual([...expected].sort());
      });
    });

    describe('the destructive payload with manager: {} is refused and nothing changes', () => {
      const where: EmployeeSingleSidedWhere = { name: { neq: 'zz' }, manager: {} };

      test('array mode', async () => {
        await refuses(() => client.$transaction([client.db.EmployeeSingleSided.deleteMany({ where })]));
        expect(await survivors()).toEqual(intact);
      });

      test('callback mode', async () => {
        await refuses(() =>
          client.$transaction(async (tx) => {
            await tx.EmployeeSingleSided.deleteMany({ where });
          }),
        );
        expect(await survivors()).toEqual(intact);
      });

      test('manual mode', async () => {
        const txn = await client.$transaction();
        try {
          await refuses(() => txn.EmployeeSingleSided.updateMany({ where, data: { name: 'MARKED' } }));
        } finally {
          await txn.cancel();
        }
        expect(await marked()).toEqual([]);
        expect(await survivors()).toEqual(intact);
      });
    });
  });

  describe('the other destructive entries refuse the same shapes', () => {
    const bad: Array<[string, EmployeeSingleSidedWhere]> = [
      ['manager: {}', { manager: {} }],
      ['manager: { name: {} }', { manager: { name: {} } }],
      ['name: {}', { name: {} }],
    ];
    const survivors = async () => (await client.db.EmployeeSingleSided.findMany()).map((r) => r.name).sort();

    test.each(bad)('upsert with where %s', async (_label, where) => {
      await refuses(() =>
        client.db.EmployeeSingleSided.upsert({ where, create: { name: 'new' }, update: { name: 'MARKED' } }),
      );
      expect(await survivors()).toEqual([...EMP_IDS].sort());
    });

    test.each(bad)('updateUnique with where %s', async (_label, where) => {
      await refuses(() =>
        client.db.EmployeeSingleSided.updateUnique({ where: uniqueWhere(where), data: { name: 'MARKED' } }),
      );
      expect(await survivors()).toEqual([...EMP_IDS].sort());
    });

    test.each(bad)('deleteUnique with where %s', async (_label, where) => {
      await refuses(() => client.db.EmployeeSingleSided.deleteUnique({ where: uniqueWhere(where) }));
      expect(await survivors()).toEqual([...EMP_IDS].sort());
    });

    test('quantifier bodies with {} stay allowed on writes', async () => {
      await client.db.EmployeeNoAction.create({ data: { id: 'q0', name: 'q0' } });
      await client.db.EmployeeNoAction.create({ data: { id: 'q1', name: 'q1', managerId: 'q0' } });
      await client.db.EmployeeNoAction.updateMany({ where: { directReports: { some: {} } }, data: { name: 'MARKED' } });

      expect((await client.db.EmployeeNoAction.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id))).toEqual(
        ['q0'],
      );

      await client.db.EmployeeNoAction.deleteMany({ where: { directReports: { none: {} } } });

      expect((await client.db.EmployeeNoAction.findMany()).map((r) => idOf(r.id)).sort()).toEqual(['q0']);
    });
  });

  describe('include where', () => {
    const managerOf = async (where: EmployeeSingleSidedWhere): Promise<Record<string, string | null>> => {
      const result = await client.db.EmployeeSingleSided.findMany({
        where: { name: { in: ['r1', 'r3', 'gh'] } },
        include: { manager: { where } },
      });

      return Object.fromEntries(result.map((r) => [r.name, r.manager?.name ?? null]));
    };

    test('{} keeps a manager that has a manager', async () => {
      expect(await managerOf({ manager: {} })).toEqual({ r1: null, r3: 'r1', gh: null });
    });

    test('null keeps a manager that has none, however its key is stored', async () => {
      expect(await managerOf({ manager: null })).toEqual({ r1: 'm0', r3: null, gh: null });
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

    const rename = (from: string) =>
      client.db.EmployeeSingleSided.updateMany({ where: { name: from }, data: { name: `${from}x` } });

    test('manager: {} delivers a row with a manager and skips unset, NULL and dangling rows', async () => {
      const handle = await client.db.EmployeeSingleSided.$live({ where: { manager: {} } });
      try {
        for (const name of ['m0', 'nul', 'non', 'gh']) await rename(name);
        await rename('r1');
        const first = await next(handle);

        expect(first).not.toBe('timeout');
        expect(first === 'timeout' ? '' : idOf(first.recordId)).toBe('r1');
      } finally {
        await handle.kill();
      }
    }, 20_000);

    test('manager: null delivers unset, NULL and dangling rows and skips a row with a manager', async () => {
      const handle = await client.db.EmployeeSingleSided.$live({ where: { manager: null } });
      try {
        await rename('r1');
        await rename('gh');
        const first = await next(handle);

        expect(first).not.toBe('timeout');
        expect(first === 'timeout' ? '' : idOf(first.recordId)).toBe('gh');
      } finally {
        await handle.kill();
      }
    }, 20_000);
  });
});
