/**
 * E2E Transactions: SNAPSHOT against SERIALIZABLE under real contention. Write skew (two transactions
 * read both rows, each writes a different one) commits under SNAPSHOT and is refused at the later commit
 * under SERIALIZABLE; `retries` recovers it, and every retry keeps the isolation level. A read-only
 * transaction never conflicts, so `retries` beside `readOnly` is allowed and does nothing.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { type CerialId, isTransactionConflict, type TransactionOptions } from 'cerial';
import {
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  type CerialClient,
} from '../../test-helper';
import { caught, newUser } from './helpers';

describe('E2E Transaction options: isolation under contention', () => {
  let client: CerialClient;
  let first: CerialId<string>;
  let second: CerialId<string>;
  /**
   * A separate connection standing for another process. A client query made inside a callback or function
   * item runs in that transaction, so interference from outside it has to come from a different connection
   * (a second Cerial client with the same config would share this client's pooled socket).
   */
  let outside: Surreal;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
    outside = new Surreal();
    await outside.connect('ws://127.0.0.1:8000/rpc', {
      namespace: testConfig.namespace,
      database: testConfig.database,
      authentication: testConfig.auth,
    });
  });

  afterAll(async () => {
    await outside.close();
    await client.disconnect();
  });

  const rename = async (id: CerialId<string>, name: string): Promise<void> => {
    await outside.query('UPDATE type::record($id) SET name = $name', { id: String(id), name }).collect();
  };

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
    first = (await client.db.BasicsUser.create({ data: newUser('first') })).id;
    second = (await client.db.BasicsUser.create({ data: newUser('second') })).id;
  });

  const activeCount = () => client.db.BasicsUser.count({ isActive: true });

  /** Resolves once `parties` callers have arrived, so both transactions have read before either writes. */
  const gate = (parties: number) => {
    let arrived = 0;
    let release: () => void = () => {};
    const open = new Promise<void>((resolve) => {
      release = resolve;
    });

    return async () => {
      arrived += 1;
      if (arrived === parties) release();
      await open;
    };
  };

  /**
   * On-call write skew: turn yourself off only while both users are on. Only the first attempt waits at
   * the gate: a retry starts after the other transaction committed.
   */
  const standDown = (mine: CerialId<string>, options: TransactionOptions, arrive: () => Promise<void>) => {
    let firstAttempt = true;

    return client.$transaction(async (tx) => {
      const on = await tx.BasicsUser.findMany({ where: { isActive: true } });
      if (firstAttempt) {
        firstAttempt = false;
        await arrive();
      }
      if (on.length < 2) return 'skipped';
      await tx.BasicsUser.updateMany({ where: { id: mine }, data: { isActive: false } });

      return 'off';
    }, options);
  };

  const skew = async (options: TransactionOptions) => {
    const arrive = gate(2);
    const settled = await Promise.allSettled([standDown(first, options, arrive), standDown(second, options, arrive)]);

    return { settled, on: await activeCount() };
  };

  describe('callback mode: write skew', () => {
    test.each([
      ['default', {}],
      ["isolation 'snapshot'", { isolation: 'snapshot' as const }],
    ])('positive: %s commits both and the invariant breaks', async (_label, options) => {
      const { settled, on } = await skew(options);

      expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(on).toBe(0);
    });

    test('negative: serializable without retries refuses the later commit as a transaction conflict', async () => {
      const { settled, on } = await skew({ isolation: 'serializable' });
      const failed = settled.filter((r) => r.status === 'rejected');

      expect(failed).toHaveLength(1);
      expect(isTransactionConflict((failed[0] as PromiseRejectedResult).reason)).toBe(true);
      expect(settled.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(on).toBe(1);
    });

    test('positive: serializable with retries retries, re-reads, and the invariant holds', async () => {
      const { settled, on } = await skew({ isolation: 'serializable', retries: 3, backoff: () => 1 });
      const results = settled.map((r) => (r.status === 'fulfilled' ? r.value : 'rejected'));

      expect(results.sort()).toEqual(['off', 'skipped']);
      expect(on).toBe(1);
    });

    test('negative: serializable with retries 0 explicitly does not retry', async () => {
      const { settled } = await skew({ isolation: 'serializable', retries: 0 });

      expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });
  });

  describe('array mode: write skew with function items', () => {
    const standDownArray = (mine: CerialId<string>, options: TransactionOptions, arrive: () => Promise<void>) => {
      let firstAttempt = true;

      return client.$transaction(
        [
          client.db.BasicsUser.findMany({ where: { isActive: true } }),
          async (prev) => {
            if (firstAttempt) {
              firstAttempt = false;
              await arrive();
            }

            return (prev[0] as unknown[]).length;
          },
          client.db.BasicsUser.updateMany({ where: { id: mine }, data: { isActive: false } }),
        ],
        options,
      );
    };

    const arraySkew = async (options: TransactionOptions) => {
      const arrive = gate(2);
      const settled = await Promise.allSettled([
        standDownArray(first, options, arrive),
        standDownArray(second, options, arrive),
      ]);

      return { settled, on: await activeCount() };
    };

    test('positive: snapshot commits both', async () => {
      const { settled, on } = await arraySkew({ isolation: 'snapshot' });

      expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
      expect(on).toBe(0);
    });

    test('negative: serializable refuses the later commit as a transaction conflict', async () => {
      const { settled, on } = await arraySkew({ isolation: 'serializable' });
      const failed = settled.filter((r) => r.status === 'rejected');

      expect(failed).toHaveLength(1);
      // Array mode wraps the driver error after its retry loop; the conflict is its cause
      const reason = (failed[0] as PromiseRejectedResult).reason as { cause?: unknown };
      expect(isTransactionConflict(reason.cause)).toBe(true);
      expect(on).toBe(1);
    });

    test('positive: serializable with retries recovers; the retry re-runs the read', async () => {
      const { settled, on } = await arraySkew({ isolation: 'serializable', retries: 3, backoff: () => 1 });

      expect(settled.every((r) => r.status === 'fulfilled')).toBe(true);
      // The retried write ran after the other commit and still turned its own user off: the array's
      // update does not branch on the read, so both end up off. What changed is that nothing was refused.
      expect(on).toBe(0);
    });
  });

  describe('manual mode: write skew', () => {
    const skewManual = async (options: { isolation?: 'snapshot' | 'serializable' }) => {
      const a = await client.$transaction(options);
      const b = await client.$transaction(options);
      await a.BasicsUser.findMany({ where: { isActive: true } });
      await b.BasicsUser.findMany({ where: { isActive: true } });
      await a.BasicsUser.updateMany({ where: { id: first }, data: { isActive: false } });
      await b.BasicsUser.updateMany({ where: { id: second }, data: { isActive: false } });
      const committedFirst = await caught(() => a.commit());
      const committedSecond = await caught(() => b.commit());

      return { committedFirst, committedSecond, on: await activeCount() };
    };

    test('positive: snapshot commits both', async () => {
      const { committedFirst, committedSecond, on } = await skewManual({ isolation: 'snapshot' });

      expect(committedFirst).toBeUndefined();
      expect(committedSecond).toBeUndefined();
      expect(on).toBe(0);
    });

    test('negative: serializable refuses the later commit and the first commit stands', async () => {
      const { committedFirst, committedSecond, on } = await skewManual({ isolation: 'serializable' });

      expect(committedFirst).toBeUndefined();
      expect(committedSecond).toBeDefined();
      expect(isTransactionConflict(committedSecond) || (committedSecond as Error).cause !== undefined).toBe(true);
      expect(on).toBe(1);
    });

    test('negative: a read-then-concurrent-change is refused at commit under serializable, not under snapshot', async () => {
      const run = async (isolation: 'snapshot' | 'serializable') => {
        const tx = await client.$transaction({ isolation });
        await tx.BasicsUser.findOne({ where: { id: first } });
        await client.db.BasicsUser.updateMany({ where: { id: first }, data: { name: `changed-${isolation}` } });
        await tx.BasicsUser.updateMany({ where: { id: second }, data: { name: `written-${isolation}` } });

        return caught(() => tx.commit());
      };

      expect(await run('snapshot')).toBeUndefined();
      expect(await run('serializable')).toBeDefined();
      const rows = await client.db.BasicsUser.findMany({ where: { id: second } });
      expect(rows[0]?.name).toBe('written-snapshot');
    });
  });

  describe('retries keep the isolation level on every attempt', () => {
    /** Changes the row the transaction read, once per attempt, so a SERIALIZABLE commit always conflicts. */
    const interfere = (counter: { attempts: number }) => async () => {
      counter.attempts += 1;
      await rename(first, `bumped-${counter.attempts}`);
    };

    test('negative: serializable + retries 2 + interference every attempt runs 3 attempts and rejects with a conflict', async () => {
      const counter = { attempts: 0 };

      const error = await caught(() =>
        client.$transaction(
          async (tx) => {
            await tx.BasicsUser.findOne({ where: { id: first } });
            await interfere(counter)();
            await tx.BasicsUser.updateMany({ where: { id: second }, data: { name: 'written' } });
          },
          { isolation: 'serializable', retries: 2, backoff: () => 1 },
        ),
      );

      expect(isTransactionConflict(error)).toBe(true);
      expect(counter.attempts).toBe(3);
      expect((await client.db.BasicsUser.findOne({ where: { id: second } }))?.name).toBe('second');
    });

    test('positive: snapshot + retries 2 + the same interference commits on the first attempt', async () => {
      const counter = { attempts: 0 };

      await client.$transaction(
        async (tx) => {
          await tx.BasicsUser.findOne({ where: { id: first } });
          await interfere(counter)();
          await tx.BasicsUser.updateMany({ where: { id: second }, data: { name: 'written' } });
        },
        { isolation: 'snapshot', retries: 2, backoff: () => 1 },
      );

      expect(counter.attempts).toBe(1);
      expect((await client.db.BasicsUser.findOne({ where: { id: second } }))?.name).toBe('written');
    });

    test('negative: array mode, serializable + retries 2 + interference every attempt runs 3 attempts and rejects', async () => {
      const counter = { attempts: 0 };

      const error = await caught(() =>
        client.$transaction(
          [
            client.db.BasicsUser.findOne({ where: { id: first } }),
            async () => {
              await interfere(counter)();

              return counter.attempts;
            },
            client.db.BasicsUser.updateMany({ where: { id: second }, data: { name: 'written' } }),
          ],
          { isolation: 'serializable', retries: 2, backoff: () => 1 },
        ),
      );

      expect(isTransactionConflict((error as { cause?: unknown }).cause)).toBe(true);
      expect(counter.attempts).toBe(3);
    });

    test('positive: array mode, snapshot + retries 2 + the same interference commits on the first attempt', async () => {
      const counter = { attempts: 0 };

      await client.$transaction(
        [
          client.db.BasicsUser.findOne({ where: { id: first } }),
          async () => {
            await interfere(counter)();

            return counter.attempts;
          },
          client.db.BasicsUser.updateMany({ where: { id: second }, data: { name: 'written' } }),
        ],
        { isolation: 'snapshot', retries: 2, backoff: () => 1 },
      );

      expect(counter.attempts).toBe(1);
    });

    test('positive: serializable that interference does not touch commits first time, retries unused', async () => {
      const counter = { attempts: 0 };

      await client.$transaction(
        async (tx) => {
          counter.attempts += 1;
          await tx.BasicsUser.findOne({ where: { id: second } });
          await rename(first, 'elsewhere');
          await tx.BasicsUser.updateMany({ where: { id: second }, data: { name: 'written' } });
        },
        { isolation: 'serializable', retries: 2, backoff: () => 1 },
      );

      expect(counter.attempts).toBe(1);
    });
  });

  describe('readOnly with retries: allowed and inert', () => {
    test.each(['snapshot', 'serializable'] as const)(
      'positive: %s + readOnly + retries never conflicts and runs once, in callback mode',
      async (isolation) => {
        let attempts = 0;

        const seen = await client.$transaction(
          async (tx) => {
            attempts += 1;
            await tx.BasicsUser.findMany();
            await rename(first, `moved-${isolation}`);

            return tx.BasicsUser.count();
          },
          { isolation, readOnly: true, retries: 3, backoff: () => 1 },
        );

        expect(attempts).toBe(1);
        expect(seen).toBe(2);
      },
    );

    test.each(['snapshot', 'serializable'] as const)(
      'positive: %s + readOnly + retries returns the transaction-start state in array mode',
      async (isolation) => {
        const [before, , after] = await client.$transaction(
          [
            client.db.BasicsUser.findOne({ where: { id: first } }),
            async () => {
              await rename(first, 'moved');

              return 1;
            },
            client.db.BasicsUser.findOne({ where: { id: first } }),
          ],
          { isolation, readOnly: true, retries: 3, backoff: () => 1 },
        );

        expect(before?.name).toBe('first');
        expect(after?.name).toBe('first');
      },
    );

    test('negative: readOnly + retries still refuses a write, and a refusal is not retried', async () => {
      let attempts = 0;

      const error = await caught(() =>
        client.$transaction(
          async (tx) => {
            attempts += 1;
            await tx.BasicsUser.create({ data: newUser('refused') });
          },
          { readOnly: true, retries: 3, backoff: () => 1 },
        ),
      );

      expect(error).toBeDefined();
      expect(attempts).toBe(1);
    });
  });

  describe('serializable that has nothing to refuse', () => {
    test('positive: an unrelated concurrent write does not refuse a serializable commit', async () => {
      const result = await client.$transaction(
        async (tx) => {
          await tx.BasicsUser.findOne({ where: { id: first } });
          await client.db.BasicsUser.updateMany({ where: { id: second }, data: { name: 'unrelated' } });
          await tx.BasicsUser.updateMany({ where: { id: first }, data: { name: 'mine' } });

          return 'ok';
        },
        { isolation: 'serializable' },
      );

      expect(result).toBe('ok');
      expect((await client.db.BasicsUser.findOne({ where: { id: first } }))?.name).toBe('mine');
    });
  });
});
