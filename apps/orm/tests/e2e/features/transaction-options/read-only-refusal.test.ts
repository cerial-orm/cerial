/**
 * E2E Transactions: a read-only transaction refuses every kind of write as CerialTransactionError, in
 * every mode, and nothing is written. Each refused write pairs with the same write succeeding when the
 * transaction is not read-only, so a refusal cannot pass by the write being broken.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, type CerialId, CerialTransactionError, sql } from 'cerial';
import {
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  type CerialClient,
} from '../../test-helper';
import { caught, MODES, newUser, runIn, type Op } from './helpers';

describe('E2E Transaction options: read-only refusal', () => {
  let client: CerialClient;
  let seeded: { id: CerialId<string>; email: string };

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
    const data = newUser('seeded');
    const user = await client.db.BasicsUser.create({ data });
    seeded = { id: user.id, email: data.email };
  });

  const snapshot = async () => ({
    users: await client.db.BasicsUser.findMany({ orderBy: { email: 'asc' } }),
    profiles: await client.db.BasicsProfile.count(),
    posts: await client.db.BasicsPost.count(),
  });

  const writes: [string, () => Op][] = [
    ['create', () => (db) => db.BasicsUser.create({ data: newUser('refused') })],
    [
      'updateMany',
      () => (db) => db.BasicsUser.updateMany({ where: { email: seeded.email }, data: { name: 'changed' } }),
    ],
    ['updateUnique', () => (db) => db.BasicsUser.updateUnique({ where: { id: seeded.id }, data: { name: 'changed' } })],
    ['deleteMany', () => (db) => db.BasicsUser.deleteMany({ where: { email: seeded.email } })],
    ['deleteUnique', () => (db) => db.BasicsUser.deleteUnique({ where: { id: seeded.id } })],
    [
      'upsert, create path',
      () => (db) =>
        db.BasicsUser.upsert({
          where: { email: 'nobody@example.com' },
          create: { ...newUser('upserted'), email: 'nobody@example.com' },
          update: { name: 'changed' },
        }),
    ],
    [
      'upsert, update path',
      () => (db) =>
        db.BasicsUser.upsert({
          where: { email: seeded.email },
          create: newUser('upserted'),
          update: { name: 'changed' },
        }),
    ],
    [
      'nested create',
      () => (db) => db.BasicsUser.create({ data: { ...newUser('nested'), profile: { create: { bio: 'refused' } } } }),
    ],
    [
      'nested create under an update',
      () => (db) =>
        db.BasicsUser.updateUnique({ where: { id: seeded.id }, data: { profile: { create: { bio: 'refused' } } } }),
    ],
    ['model $raw write', () => (db) => db.BasicsUser.$raw(sql`UPDATE basics_user SET name = 'raw'`)],
    ['model $raw delete', () => (db) => db.BasicsUser.$raw(sql`DELETE basics_user`)],
    ['$raw DDL', () => (db) => db.BasicsUser.$raw(sql`DEFINE TABLE tx_options_ddl_probe SCHEMALESS`)],
  ];

  describe.each(MODES)('%s mode', (mode) => {
    test.each(writes)('negative: %s is a CerialTransactionError and writes nothing', async (_name, makeOp) => {
      const before = await snapshot();

      const error = await caught(() => runIn(client, mode, { readOnly: true }, [makeOp()]));

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(error).not.toBeInstanceOf(CerialDatabaseError);
      expect((error as CerialTransactionError).message).toContain('read only transaction');
      expect(await snapshot()).toEqual(before);
    });

    test.each(writes.filter(([name]) => name !== '$raw DDL'))(
      'negative: %s under serializable + readOnly is refused the same way',
      async (_name, makeOp) => {
        const before = await snapshot();

        const error = await caught(() =>
          runIn(client, mode, { isolation: 'serializable', readOnly: true }, [makeOp()]),
        );

        expect(error).toBeInstanceOf(CerialTransactionError);
        expect(await snapshot()).toEqual(before);
      },
    );

    test.each(writes.filter(([name]) => !name.includes('$raw DDL') && !name.includes('delete')))(
      'positive: %s succeeds when readOnly is false',
      async (_name, makeOp) => {
        const error = await caught(() => runIn(client, mode, { readOnly: false }, [makeOp()]));

        expect(error).toBeUndefined();
      },
    );

    test('negative: a refused write after a successful read leaves the earlier read result unused and nothing written', async () => {
      const before = await snapshot();

      const error = await caught(() =>
        runIn(client, mode, { readOnly: true }, [
          (db) => db.BasicsUser.findMany(),
          (db) => db.BasicsUser.create({ data: newUser('late') }),
        ]),
      );

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(await snapshot()).toEqual(before);
    });

    test('negative: the error names the transaction operation, not a database fault', async () => {
      const error = (await caught(() =>
        runIn(client, mode, { readOnly: true }, [(db) => db.BasicsUser.create({ data: newUser('named') })]),
      )) as CerialTransactionError;

      expect(error.name).toBe('CerialTransactionError');
      expect(error.cause).toBeDefined();
    });
  });

  describe('client-level $raw', () => {
    test('array mode: a client $raw write item is refused and nothing is written', async () => {
      const before = await snapshot();

      const error = await caught(() =>
        client.$transaction([client.$raw(sql`UPDATE basics_user SET name = 'raw'`)], { readOnly: true }),
      );

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(await snapshot()).toEqual(before);
    });

    test('array mode: a client $raw read item runs in a read-only transaction', async () => {
      const [rows] = await client.$transaction([client.$raw(sql`SELECT * FROM basics_user`)], { readOnly: true });

      expect(rows).toHaveLength(1);
    });

    test('callback mode: tx.$raw write is refused, tx.$raw read runs', async () => {
      const before = await snapshot();

      const rows = await client.$transaction((tx) => tx.$raw(sql`SELECT * FROM basics_user`), { readOnly: true });
      expect(rows).toHaveLength(1);

      const error = await caught(() =>
        client.$transaction((tx) => tx.$raw(sql`UPDATE basics_user SET name = 'raw'`), { readOnly: true }),
      );
      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(await snapshot()).toEqual(before);
    });

    test('manual mode: tx.$raw write is refused and tx.$raw read still runs afterwards', async () => {
      const tx = await client.$transaction({ readOnly: true });

      const error = await caught(() => tx.$raw(sql`UPDATE basics_user SET name = 'raw'`));
      const rows = await tx.$raw(sql`SELECT * FROM basics_user`);
      await tx.commit();

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(rows).toHaveLength(1);
      expect((await client.db.BasicsUser.findMany())[0]?.name).toBe('seeded');
    });
  });

  describe('callback and array cancel; manual mode stays open', () => {
    test('callback mode: the callback does not continue past the refused write and the transaction is cancelled', async () => {
      let reachedAfter = false;
      const before = await snapshot();

      const error = await caught(() =>
        client.$transaction(
          async (tx) => {
            await tx.BasicsUser.create({ data: newUser('refused') });
            reachedAfter = true;
          },
          { readOnly: true },
        ),
      );

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(reachedAfter).toBe(false);
      expect(await snapshot()).toEqual(before);
    });

    test('callback mode: a callback that catches the refusal still commits without writing', async () => {
      const before = await snapshot();

      const count = await client.$transaction(
        async (tx) => {
          await caught(() => tx.BasicsUser.create({ data: newUser('refused') }));

          return tx.BasicsUser.count();
        },
        { readOnly: true },
      );

      expect(count).toBe(1);
      expect(await snapshot()).toEqual(before);
    });

    test('array mode: a refused write after a write-free prefix rejects the whole call, no partial results', async () => {
      const before = await snapshot();

      const error = await caught(() =>
        client.$transaction([client.db.BasicsUser.count(), client.db.BasicsUser.create({ data: newUser('refused') })], {
          readOnly: true,
        }),
      );

      expect(error).toBeInstanceOf(CerialTransactionError);
      expect(await snapshot()).toEqual(before);
    });

    test('manual mode: a refused write leaves the transaction open, reads run, commit succeeds, nothing written', async () => {
      const before = await snapshot();
      const tx = await client.$transaction({ readOnly: true });

      const first = await caught(() => tx.BasicsUser.create({ data: newUser('refused') }));
      const second = await caught(() => tx.BasicsUser.deleteMany({ where: { email: seeded.email } }));
      const count = await tx.BasicsUser.count();
      await tx.commit();

      expect(first).toBeInstanceOf(CerialTransactionError);
      expect(second).toBeInstanceOf(CerialTransactionError);
      expect(count).toBe(1);
      expect(await snapshot()).toEqual(before);
    });

    test('manual mode: after commit the handle refuses further use', async () => {
      const tx = await client.$transaction({ readOnly: true });
      await tx.commit();

      await expect(
        (async () => {
          await tx.BasicsUser.count();
        })(),
      ).rejects.toThrow();
    });

    test('manual mode: a refused write then cancel() also leaves nothing written', async () => {
      const before = await snapshot();
      const tx = await client.$transaction({ isolation: 'serializable', readOnly: true });

      await caught(() => tx.BasicsUser.create({ data: newUser('refused') }));
      await tx.cancel();

      expect(await snapshot()).toEqual(before);
    });
  });

  describe('DDL probe table', () => {
    test('negative: the refused DDL did not create its table', async () => {
      await caught(() =>
        client.$transaction([client.$raw(sql`DEFINE TABLE tx_options_ddl_probe SCHEMALESS`)], { readOnly: true }),
      );

      const [info] = await client.$transaction([client.$raw(sql`INFO FOR DB`)]);
      expect(JSON.stringify(info)).not.toContain('tx_options_ddl_probe');
    });
  });
});
