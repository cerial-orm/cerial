/**
 * Integration tests: queries made through the client inside an array-mode function item run in its
 * transaction, commit and cancel wait for running queries, and a query that starts after the end is
 * refused. Callback mode shares the same primitives and is exercised through the generated client in
 * the transaction-context e2e suite. Uses the throwaway database `cerial_txn_context` in the shared instance,
 * removed afterwards.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import {
  createCerialTransactionProxy,
  createClientRawStatement,
  createConnectionManager,
  createSurreal,
  refuseNestedTransaction,
  runInTransactionScope,
  wrapDatabaseError,
} from '../../src/client';
import { Model } from '../../src/client/model/model';
import { CerialTransactionError } from '../../src/errors';
import { sql } from '../../src/query/compile';
import { executeClientTransaction } from '../../src/query/executor';
import { parseModelRegistry } from '../test-helpers';

const NAMESPACE = 'main';
const DATABASE = 'cerial_txn_context';
const registry = parseModelRegistry(`
model User {
  id Record @id
  name String
}
`);

let db: Surreal;
let other: Surreal;

const user = (surreal: Surreal): Model => new Model(surreal, registry.User!, registry);
const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function names(): Promise<string[]> {
  const [rows] = await db.query<[{ name: string }[]]>('SELECT name FROM user ORDER BY name').collect();

  return rows!.map((row) => row.name);
}

async function connect(): Promise<Surreal> {
  const surreal = createSurreal();
  await surreal.connect('ws://127.0.0.1:8000/rpc', {
    namespace: NAMESPACE,
    authentication: { username: 'root', password: 'root' },
  });
  await surreal.use({ namespace: NAMESPACE, database: DATABASE });

  return surreal;
}

beforeAll(async () => {
  db = createSurreal();
  await db.connect('ws://127.0.0.1:8000/rpc', {
    namespace: NAMESPACE,
    authentication: { username: 'root', password: 'root' },
  });
  await db.query(`DEFINE DATABASE IF NOT EXISTS ${DATABASE}`).collect();
  await db.use({ namespace: NAMESPACE, database: DATABASE });
  await db.query('DEFINE TABLE user SCHEMALESS').collect();
  other = await connect();
});

afterAll(async () => {
  await db.query(`REMOVE DATABASE IF EXISTS ${DATABASE}`).collect();
  await other.close();
  await db.close();
});

beforeEach(async () => {
  await db.query('DELETE user').collect();
});

describe('array mode, a function item', () => {
  test('an async item writes in the transaction: a later failure rolls it back', async () => {
    await expect(
      executeClientTransaction(db, [
        async () => user(db).create({ data: { name: 'a' } }),
        () => {
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');

    expect(await names()).toEqual([]);
  });

  test('the same writes commit when every item succeeds', async () => {
    await executeClientTransaction(db, [
      async () => user(db).create({ data: { name: 'a' } }),
      async () => {
        await user(db).create({ data: { name: 'b' } });
        await createClientRawStatement(sql`CREATE user SET name = 'c'`, async () => db);
      },
    ]);

    expect(await names()).toEqual(['a', 'b', 'c']);
  });

  test('Promise.all inside an item writes in the transaction and rolls back together', async () => {
    await expect(
      executeClientTransaction(db, [
        async () => {
          await Promise.all([user(db).create({ data: { name: 'a' } }), user(db).create({ data: { name: 'b' } })]);
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');

    expect(await names()).toEqual([]);
  });

  test('a query on a second Surreal instance is a separate session and survives the rollback', async () => {
    await expect(
      executeClientTransaction(db, [
        async () => {
          await user(other).create({ data: { name: 'outside' } });
          await user(db).create({ data: { name: 'inside' } });
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');

    expect(await names()).toEqual(['outside']);
  });

  test('a read inside the item sees the transaction own earlier write, a standalone read does not', async () => {
    let inside: number | undefined;
    let outside: number | undefined;
    await executeClientTransaction(db, [
      async () => {
        await user(db).create({ data: { name: 'a' } });
        inside = (await user(db).findMany()).length;
        const [rows] = await other.query<[unknown[]]>('SELECT * FROM user').collect();
        outside = rows!.length;
      },
    ]);

    expect(inside).toBe(1);
    expect(outside).toBe(0);
  });

  test('readOnly refuses a routed write as CerialTransactionError and writes nothing', async () => {
    const error = await caught(() =>
      executeClientTransaction(db, [async () => user(db).create({ data: { name: 'a' } })], { readOnly: true }).catch(
        (e: unknown) => {
          throw wrapDatabaseError(e, undefined, '$transaction');
        },
      ),
    );

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect(await names()).toEqual([]);
  });

  test('without readOnly the same write is accepted', async () => {
    await executeClientTransaction(db, [async () => user(db).create({ data: { name: 'a' } })], { readOnly: false });

    expect(await names()).toEqual(['a']);
  });

  test('an un-awaited query that finishes after the item is waited for, not lost', async () => {
    await executeClientTransaction(db, [
      () => {
        void user(db)
          .$raw(sql`CREATE user SET name = 'a'; SLEEP 100ms; CREATE user SET name = 'b'; RETURN 1;`)
          .then(
            () => undefined,
            () => undefined,
          );
      },
    ]);
    await wait(250);

    // Either the query was registered before the commit and both rows landed together, or it started after
    // the end and was refused: never one row without the other.
    const written = await names();
    expect(written.length === 0 || written.length === 2).toBe(true);
  });

  test('a query that starts after the item ended is refused and writes nothing', async () => {
    let late: Promise<unknown> | undefined;
    await executeClientTransaction(db, [
      () => {
        late = wait(50).then(() => user(db).create({ data: { name: 'late' } }));
      },
    ]);
    const error = await caught(() => late!);

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect((error as CerialTransactionError).message).toBe(
      'User.create ran after its transaction was committed: await every query inside the $transaction callback or function item',
    );
    expect(await names()).toEqual([]);
  });

  test('after a failed item the late query says cancelled', async () => {
    let late: Promise<unknown> | undefined;
    await expect(
      executeClientTransaction(db, [
        () => {
          late = wait(50).then(() => user(db).create({ data: { name: 'late' } }));
          throw new Error('boom');
        },
      ]),
    ).rejects.toThrow('boom');
    const error = await caught(() => late!);

    expect((error as CerialTransactionError).message).toContain('was cancelled');
    expect(await names()).toEqual([]);
  });
});

describe('commit and cancel against a running multi-statement query', () => {
  const slowWrite = sql`CREATE user SET name = 'a'; SLEEP 300ms; CREATE user SET name = 'b'; RETURN 1;`;

  test('commit waits: both statements are written and the query succeeds, with no torn write', async () => {
    const tx = createCerialTransactionProxy(await db.beginTransaction(), registry);
    const running = (tx as unknown as Record<'User', Model>).User.$raw(slowWrite);
    const outcome = running.then(
      () => 'done',
      (e: unknown) => e,
    );
    await wait(100);
    await tx.commit();

    expect(await outcome).toBe('done');
    expect(await names()).toEqual(['a', 'b']);
    expect(tx.state).toBe('committed');
  });

  test('cancel waits and discards both statements', async () => {
    const tx = createCerialTransactionProxy(await db.beginTransaction(), registry);
    const running = (tx as unknown as Record<'User', Model>).User.$raw(slowWrite);
    const outcome = running.then(
      () => 'done',
      (e: unknown) => e,
    );
    await wait(100);
    await tx.cancel();

    expect(await outcome).toBe('done');
    expect(await names()).toEqual([]);
    expect(tx.state).toBe('cancelled');
  });

  test('a routed query running at the end of an item is waited for', async () => {
    await executeClientTransaction(db, [
      async () => {
        const pending = user(db).$raw(slowWrite);
        void pending.then(
          () => undefined,
          () => undefined,
        );
        await wait(100);
      },
    ]);

    expect(await names()).toEqual(['a', 'b']);
  });

  test('a query sent on a transaction after it ended is classified as CerialTransactionError', async () => {
    const txn = await db.beginTransaction();
    await txn.commit();
    const driverError = await caught(() => txn.query('SELECT 1').collect());

    expect(driverError).toBeDefined();
    const wrapped = wrapDatabaseError(driverError, 'User', 'findMany');
    expect(wrapped).toBeInstanceOf(CerialTransactionError);
    expect((wrapped as CerialTransactionError).cause).toBe(driverError);
  });
});

describe('an explicit transaction inside a scope', () => {
  test('keeps its own transaction and is not re-routed', async () => {
    const own = createCerialTransactionProxy(await db.beginTransaction(), registry);
    await executeClientTransaction(db, [
      async () => {
        await user(db).create({ data: { name: 'explicit' }, txn: own });
        throw new Error('boom');
      },
    ]).catch(() => undefined);
    // The item's own transaction rolled back, the explicit one is still open and holds its row
    expect((await names()).length).toBe(0);
    await own.commit();

    expect(await names()).toEqual(['explicit']);
  });

  test('a scope opened by hand routes only its owner', async () => {
    const tx = createCerialTransactionProxy(await db.beginTransaction(), registry);
    await runInTransactionScope({ owner: db, txn: tx }, async () => {
      await user(db).create({ data: { name: 'in' } });
      await user(other).create({ data: { name: 'out' } });
    });
    await tx.cancel();

    expect(await names()).toEqual(['out']);
  });
});

describe('two clients on one pooled socket', () => {
  const config = {
    url: 'ws://127.0.0.1:8000',
    namespace: NAMESPACE,
    database: DATABASE,
    auth: { username: 'root', password: 'root' },
  };
  const first = createConnectionManager(registry, config);
  const second = createConnectionManager(registry, config);
  let firstDb: Record<'User', Model>;
  let secondDb: Record<'User', Model>;

  beforeAll(async () => {
    firstDb = (await first.connect()) as unknown as Record<'User', Model>;
    secondDb = (await second.connect()) as unknown as Record<'User', Model>;
  });

  afterAll(async () => {
    await first.disconnectAll();
    await second.disconnectAll();
  });

  const run = (items: Parameters<typeof executeClientTransaction>[1]): Promise<unknown[]> =>
    executeClientTransaction(first.getTransactionSurreal()!, items, {}, first.getRouteOwner());

  test('the premise: both clients hold the same Surreal instance and different owners', () => {
    expect(first.getTransactionSurreal()).toBe(second.getTransactionSurreal());
    expect(first.getRouteOwner()).not.toBe(second.getRouteOwner());
  });

  test("the first client's write inside its own scope is rolled back with it", async () => {
    await run([
      async () => {
        await firstDb.User.create({ data: { name: 'first' } });
        throw new Error('boom');
      },
    ]).catch(() => undefined);

    expect(await names()).toEqual([]);
  });

  test("the second client's write inside the first's scope is not routed and survives the rollback", async () => {
    await run([
      async () => {
        await firstDb.User.create({ data: { name: 'first' } });
        await secondDb.User.create({ data: { name: 'second' } });
        throw new Error('boom');
      },
    ]).catch(() => undefined);

    expect(await names()).toEqual(['second']);
  });

  test("the second client's raw statement inside the first's scope is not routed", async () => {
    await run([
      async () => {
        await createClientRawStatement(
          sql`CREATE user SET name = 'raw'`,
          async () => second.getQuerySurreal()!,
          false,
          () => second.getRouteOwner(),
        );
        throw new Error('boom');
      },
    ]).catch(() => undefined);

    expect(await names()).toEqual(['raw']);
  });

  test('a nested $transaction is refused for the scope owner and allowed for the other client', async () => {
    let own: unknown;
    let foreign: unknown;
    await run([
      async () => {
        own = await caught(async () => refuseNestedTransaction(first.getRouteOwner()));
        foreign = await caught(async () => refuseNestedTransaction(second.getRouteOwner()));
      },
    ]);

    expect(own).toBeInstanceOf(CerialTransactionError);
    expect(foreign).toBeUndefined();
  });
});
