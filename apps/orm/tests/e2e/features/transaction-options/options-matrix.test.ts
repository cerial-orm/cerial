/**
 * E2E Transactions: every mode by every begin option. A transaction that is not read-only commits its
 * writes under each isolation level; a read-only one runs reads. Each write case pairs with a read case.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  type CerialClient,
} from '../../test-helper';
import { BEGIN_OPTIONS, MODES, newUser, runIn } from './helpers';

describe('E2E Transaction options: mode by option', () => {
  let client: CerialClient;

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
  });

  const writable = BEGIN_OPTIONS.filter(([, o]) => !o?.readOnly);
  const readOnly = BEGIN_OPTIONS.filter(([, o]) => o?.readOnly);

  describe.each(MODES)('%s mode', (mode) => {
    test.each(writable)('positive: %s commits a write and the row is visible afterwards', async (_label, options) => {
      const data = newUser('write');

      const [created] = await runIn(client, mode, options, [(db) => db.BasicsUser.create({ data })]);

      expect(created).toMatchObject({ email: data.email, name: 'write' });
      expect(await client.db.BasicsUser.count()).toBe(1);
    });

    test.each(writable)('positive: %s reads what it wrote in the same transaction', async (_label, options) => {
      const data = newUser('rw');

      const [, found] = await runIn(client, mode, options, [
        (db) => db.BasicsUser.create({ data }),
        (db) => db.BasicsUser.findOne({ where: { email: data.email } }),
      ]);

      expect(found).toMatchObject({ email: data.email });
    });

    test.each(readOnly)('positive: %s runs reads over committed rows', async (_label, options) => {
      const data = newUser('seed');
      await client.db.BasicsUser.create({ data });

      const [found, count, exists] = await runIn(client, mode, options, [
        (db) => db.BasicsUser.findMany(),
        (db) => db.BasicsUser.count(),
        (db) => db.BasicsUser.exists({ email: data.email }),
      ]);

      expect(found).toHaveLength(1);
      expect(count).toBe(1);
      expect(exists).toBe(true);
    });

    test.each(readOnly)('negative: %s leaves the table as it was after a read-only run', async (_label, options) => {
      await client.db.BasicsUser.create({ data: newUser('seed') });

      await runIn(client, mode, options, [(db) => db.BasicsUser.findMany()]);

      expect(await client.db.BasicsUser.count()).toBe(1);
    });

    test('positive: readOnly false is the same as omitting it', async () => {
      await runIn(client, mode, { readOnly: false }, [(db) => db.BasicsUser.create({ data: newUser('a') })]);
      await runIn(client, mode, undefined, [(db) => db.BasicsUser.create({ data: newUser('b') })]);

      expect(await client.db.BasicsUser.count()).toBe(2);
    });
  });

  describe('array mode: function items and prevResults under options', () => {
    test.each(BEGIN_OPTIONS.filter(([, o]) => !o?.readOnly))(
      'positive: %s passes earlier results to a function item',
      async (_label, options) => {
        const data = newUser('prev');

        const [user, post] = await client.$transaction(
          [
            client.db.BasicsUser.create({ data }),
            (prev) => client.db.BasicsPost.create({ data: { title: 'from prev', authorId: prev[0].id } }),
          ],
          options,
        );

        expect(user.email).toBe(data.email);
        expect(post).toHaveProperty('title', 'from prev');
        expect(await client.db.BasicsPost.count()).toBe(1);
      },
    );

    test.each(BEGIN_OPTIONS.filter(([, o]) => o?.readOnly))(
      'positive: %s passes a read result to a function item that returns a plain value',
      async (_label, options) => {
        await client.db.BasicsUser.create({ data: newUser('seed') });

        const [users, derived] = await client.$transaction(
          [client.db.BasicsUser.findMany(), (prev) => (prev[0] as unknown[]).length * 10],
          options,
        );

        expect(users).toHaveLength(1);
        expect(derived).toBe(10);
      },
    );
  });

  describe('manual mode: await using', () => {
    test.each(BEGIN_OPTIONS.filter(([, o]) => !o?.readOnly))(
      'positive: %s commits through await using when commit() is called',
      async (_label, options) => {
        {
          await using tx = await client.$transaction(options);
          await tx.BasicsUser.create({ data: newUser('using') });
          await tx.commit();
        }

        expect(await client.db.BasicsUser.count()).toBe(1);
      },
    );

    test.each(BEGIN_OPTIONS.filter(([, o]) => !o?.readOnly))(
      'negative: %s cancels on scope exit when commit() is not called',
      async (_label, options) => {
        {
          await using tx = await client.$transaction(options);
          await tx.BasicsUser.create({ data: newUser('dropped') });
        }

        expect(await client.db.BasicsUser.count()).toBe(0);
      },
    );

    test.each(BEGIN_OPTIONS.filter(([, o]) => o?.readOnly))(
      'positive: %s reads through await using and commits without writing',
      async (_label, options) => {
        await client.db.BasicsUser.create({ data: newUser('seed') });
        {
          await using tx = await client.$transaction(options);
          expect(await tx.BasicsUser.count()).toBe(1);
          await tx.commit();
        }

        expect(await client.db.BasicsUser.count()).toBe(1);
      },
    );
  });
});
