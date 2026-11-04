/**
 * E2E Tests: $transaction outcomes when a statement fails or two transactions collide
 *
 * A failing statement inside a client-driven SurrealDB transaction does not cancel it, so each mode must
 * roll back itself. Each case pairs the failing path with a passing one, and retries are proved against a
 * real write conflict.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, type CerialId, isTransactionConflict, sql } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

describe('E2E Transactions: failure and conflict outcomes', () => {
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

  const newUser = (name: string) => ({ email: uniqueEmail(name), name, isActive: true });

  describe('rollback when a statement fails', () => {
    test('array mode: a failing item undoes the earlier write', async () => {
      const taken = newUser('taken');
      await client.db.BasicsUser.create({ data: taken });

      await expect(
        (async () => {
          await client.$transaction([
            client.db.BasicsUser.create({ data: newUser('before') }),
            client.db.BasicsUser.create({ data: { ...taken, name: 'clash' } }),
          ]);
        })(),
      ).rejects.toThrow();

      expect(await client.db.BasicsUser.count()).toBe(1);
    });

    test('array mode: the same items without the clash commit both', async () => {
      await client.$transaction([
        client.db.BasicsUser.create({ data: newUser('one') }),
        client.db.BasicsUser.create({ data: newUser('two') }),
      ]);

      expect(await client.db.BasicsUser.count()).toBe(2);
    });

    test('callback mode: a failing statement undoes the earlier write and rejects', async () => {
      const taken = newUser('taken');
      await client.db.BasicsUser.create({ data: taken });

      await expect(
        (async () => {
          await client.$transaction(async (tx) => {
            await tx.BasicsUser.create({ data: newUser('before') });
            await tx.BasicsUser.create({ data: { ...taken, name: 'clash' } });
          });
        })(),
      ).rejects.toThrow();

      expect(await client.db.BasicsUser.count()).toBe(1);
    });

    test('callback mode: a callback that returns commits', async () => {
      await client.$transaction(async (tx) => {
        await tx.BasicsUser.create({ data: newUser('one') });
        await tx.BasicsUser.create({ data: newUser('two') });
      });

      expect(await client.db.BasicsUser.count()).toBe(2);
    });

    test('manual mode: cancel after a failing statement leaves nothing of the transaction', async () => {
      const taken = newUser('taken');
      await client.db.BasicsUser.create({ data: taken });
      const txn = await client.$transaction();

      await txn.BasicsUser.create({ data: newUser('before') });
      await expect(
        (async () => {
          await txn.BasicsUser.create({ data: { ...taken, name: 'clash' } });
        })(),
      ).rejects.toThrow();
      await txn.cancel();

      expect(txn.state).toBe('cancelled');
      expect(await client.db.BasicsUser.count()).toBe(1);
    });

    test('manual mode: commit with no failure keeps the writes', async () => {
      const txn = await client.$transaction();
      await txn.BasicsUser.create({ data: newUser('one') });
      await txn.commit();

      expect(await client.db.BasicsUser.count()).toBe(1);
    });
  });

  describe('raw statements', () => {
    test('a RETURN in the middle of a raw script does not end it: the last statement is the result', async () => {
      const [rows] = await client.$transaction([client.$raw<number>(sql`RETURN 1; RETURN 2`)]);

      expect(rows).toEqual([2]);
    });

    test('a raw write after a RETURN is committed with the transaction', async () => {
      await client.$transaction([
        client.$raw(
          sql`CREATE basics_user SET email = ${uniqueEmail('raw')}, name = 'Raw', isActive = true, nicknames = [], scores = [], loginDates = [], tagIds = []; RETURN 'early'; CREATE basics_tag SET name = 'after', userIds = []`,
        ),
      ]);

      expect(await client.db.BasicsUser.count()).toBe(1);
      expect(await client.db.BasicsTag.count()).toBe(1);
    });

    test('a THROW after a RETURN still undoes everything the raw statement wrote', async () => {
      await expect(
        (async () => {
          await client.$transaction([
            client.$raw(sql`CREATE basics_tag SET name = 'gone', userIds = []; RETURN 'early'; THROW 'late'`),
          ]);
        })(),
      ).rejects.toThrow(CerialDatabaseError);

      expect(await client.db.BasicsTag.count()).toBe(0);
    });
  });

  describe('write conflicts', () => {
    // Both transactions read the row and then wait for each other before writing, so the second to
    // commit meets a changed row. Only the first attempt waits: a retry starts after the other committed.
    const bump = (userId: CerialId<string>, retries: number, arrive: () => Promise<void>) => {
      let first = true;

      return client.$transaction(
        async (tx) => {
          const user = await tx.BasicsUser.findOne({ where: { id: userId } });
          if (first) {
            first = false;
            await arrive();
          }
          await tx.BasicsUser.updateMany({ where: { id: userId }, data: { age: (user?.age ?? 0) + 1 } });
        },
        { retries, backoff: () => 5 },
      );
    };

    const race = async (retries: number) => {
      const user = await client.db.BasicsUser.create({ data: { ...newUser('race'), age: 0 } });
      let arrived = 0;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const arrive = async () => {
        arrived += 1;
        if (arrived === 2) release();
        await gate;
      };

      const settled = await Promise.allSettled([bump(user.id, retries, arrive), bump(user.id, retries, arrive)]);
      const after = await client.db.BasicsUser.findOne({ where: { id: user.id } });

      return { settled, age: after?.age };
    };

    test('negative: with retries 0 the later commit fails with a conflict and its write is not applied', async () => {
      const { settled, age } = await race(0);
      const failed = settled.filter((r) => r.status === 'rejected');

      expect(failed).toHaveLength(1);
      expect(isTransactionConflict((failed[0] as PromiseRejectedResult).reason)).toBe(true);
      expect(age).toBe(1);
    });

    test('positive: with retries the conflicted transaction runs again and both increments land', async () => {
      const { settled, age } = await race(3);

      expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(age).toBe(2);
    });
  });
});
