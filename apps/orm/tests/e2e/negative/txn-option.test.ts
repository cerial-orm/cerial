/**
 * E2E Tests: the `txn` option of every model method refuses what is not a live Cerial transaction
 *
 * A spread request body can put any value under `txn`. The refusal is a CerialValidationError naming `txn`,
 * a write leaves its rows untouched, and a real manual transaction still works on reads and writes.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialValidationError } from 'cerial';
import {
  type CerialClient as Client,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../test-helper';

const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

const bad: [string, unknown][] = [
  ['an empty object', {}],
  ['a $raw object', { $raw: 'x' }],
  ['null', null],
  ['a string', 'txn'],
  ['a forged transaction', { _assertOpen: () => {}, _raw: {}, _track: (run: () => unknown) => run() }],
];

describe('txn option', () => {
  let client: Client;
  const User = () => client.db.BasicsUser;
  const row = (email: string, name = 'a') => ({ email, name, isActive: true });

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
    await User().create({ data: { ...row('seed@x.io', 'seed'), id: 'seed' } });
  });

  describe.each(bad)('with %s', (_name, value) => {
    const txn = value as never;
    const reads: [string, () => PromiseLike<unknown>][] = [
      ['findMany', () => User().findMany({ where: { name: 'seed' }, txn })],
      ['findOne', () => User().findOne({ where: { name: 'seed' }, txn })],
      ['findUnique', () => User().findUnique({ where: { id: 'seed' }, txn })],
      ['count', () => User().count({ name: 'seed' }, txn)],
      ['exists', () => User().exists({ name: 'seed' }, txn)],
      ['groupBy', () => User().groupBy({ by: { name: true } }, txn)],
    ];
    const writes: [string, () => PromiseLike<unknown>][] = [
      ['create', () => User().create({ data: row('new@x.io'), txn })],
      ['updateMany', () => User().updateMany({ where: { name: 'seed' }, data: { name: 'changed' }, txn })],
      ['updateUnique', () => User().updateUnique({ where: { id: 'seed' }, data: { name: 'changed' }, txn })],
      [
        'upsert',
        () =>
          User().upsert({
            where: { email: 'up@x.io' },
            create: row('up@x.io'),
            update: { name: 'changed' },
            txn,
          }),
      ],
      ['deleteMany', () => User().deleteMany({ where: { name: 'seed' }, txn })],
      ['deleteUnique', () => User().deleteUnique({ where: { id: 'seed' }, txn })],
    ];

    test.each([...reads, ...writes])('%s throws CerialValidationError naming txn', async (_op, run) => {
      const error = await caught(run);

      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).field).toBe('txn');
      expect((error as Error).message).toContain('txn');
    });

    test('no write changed a row', async () => {
      for (const [, run] of writes) await caught(run);
      const rows = await User().findMany();

      expect(rows.map((r) => r.name)).toEqual(['seed']);
    });
  });

  describe('a real manual transaction', () => {
    test('reads see the data and a write is visible after commit', async () => {
      await using txn = await client.$transaction();
      const created = await User().create({ data: { ...row('in@x.io', 'inside'), id: 'in' }, txn });
      expect(created?.name).toBe('inside');
      expect(await User().count({ name: 'inside' }, txn)).toBe(1);
      expect(await User().exists({ name: 'inside' }, txn)).toBe(true);
      expect((await User().findMany({ where: { name: 'inside' }, txn })).length).toBe(1);
      expect((await User().findOne({ where: { name: 'inside' }, txn }))?.email).toBe('in@x.io');
      expect((await User().findUnique({ where: { id: 'in' }, txn }))?.name).toBe('inside');
      expect((await User().groupBy({ by: { name: true } }, txn)).length).toBe(2);
      await User().updateMany({ where: { name: 'inside' }, data: { name: 'many' }, txn });
      await User().updateUnique({ where: { id: 'in' }, data: { name: 'unique' }, txn });
      await User().upsert({ where: { email: 'up@x.io' }, create: row('up@x.io', 'up'), update: {}, txn });
      await User().deleteUnique({ where: { id: 'seed' }, txn });
      await txn.commit();

      const names = (await User().findMany()).map((r) => r.name).sort();
      expect(names).toEqual(['unique', 'up']);
    });

    test('deleteMany in a transaction removes rows after commit', async () => {
      const txn = await client.$transaction();
      await User().deleteMany({ where: { name: 'seed' }, txn });
      await txn.commit();

      expect(await User().count()).toBe(0);
    });

    test('a cancelled transaction leaves the data as it was', async () => {
      const txn = await client.$transaction();
      await User().updateMany({ where: { name: 'seed' }, data: { name: 'gone' }, txn });
      await txn.cancel();

      expect((await User().findMany()).map((r) => r.name)).toEqual(['seed']);
    });
  });
});
