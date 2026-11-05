/**
 * Facts behind routing queries into a transaction through an async context, on SurrealDB 4.0,
 * memory backend, SDK 2.2.1, Bun: whether `AsyncLocalStorage` survives the SDK's WebSocket calls and
 * the ways a lazy thenable gets awaited, and how one client-driven transaction behaves under
 * concurrent statements, after it ends, and when it ends while a statement is still executing.
 * The routing itself is Cerial's; here it is a three-line stand-in (`route`), so a failure means a
 * premise moved, not that the ORM changed.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { afterAll, describe, expect, test } from 'bun:test';
import { createRemoteEngines, type Engines, RpcEngine, Surreal, type SurrealTransaction } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

interface Store {
  readonly tag: string;
  readonly owner?: Surreal;
  readonly txn?: SurrealTransaction;
}

const als = new AsyncLocalStorage<Store>();
const scratch: ScratchDatabase[] = [];
const closers: (() => Promise<void>)[] = [];

afterAll(async () => {
  await Promise.all(closers.map((close) => close()));
  await Promise.all(scratch.map((db) => db.remove()));
});

async function fresh(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  scratch.push(db);
  await run(db, 'DEFINE TABLE t SCHEMALESS;');

  return db;
}

async function connect(db: ScratchDatabase, engines?: Engines): Promise<Surreal> {
  const surreal = new Surreal(engines ? { engines } : undefined);
  await surreal.connect('ws://127.0.0.1:8000/rpc');
  await surreal.signin({ username: 'root', password: 'root' });
  await surreal.use({ namespace: 'main', database: db.name });
  closers.push(async () => {
    await surreal.close();
  });

  return surreal;
}

async function ids(db: ScratchDatabase): Promise<string[]> {
  const [result] = await run(db, 'SELECT VALUE <string> id FROM t ORDER BY id;');

  return result!.result as string[];
}

/** The stand-in for Cerial's rule: a query on the instance that began the active transaction runs on it. */
function route(surreal: Surreal): Surreal | SurrealTransaction {
  const store = als.getStore();

  return store?.owner === surreal && store.txn ? store.txn : surreal;
}

async function outcome(work: Promise<unknown>): Promise<string> {
  try {
    await work;

    return 'ok';
  } catch (error) {
    return `${(error as Error).constructor.name}: ${(error as Error).message}`;
  }
}

/** A lazy thenable like CerialQueryPromise: it reads the context when then() is called, not when built. */
const thenable: PromiseLike<string | undefined> = {
  then(onfulfilled, onrejected) {
    return Promise.resolve(als.getStore()?.tag).then(onfulfilled, onrejected);
  },
};

describe('AsyncLocalStorage in Bun across the SDK', () => {
  test('the context survives SDK WebSocket calls and await chains, inside and outside a client-driven transaction', async () => {
    const surreal = await connect(await fresh('txctx_await'));

    const seen = await als.run({ tag: 'A' }, async () => {
      await surreal.query('RETURN 1;').collect();
      const afterQuery = als.getStore()?.tag;
      const txn = await surreal.beginTransaction();
      await txn.query('RETURN 1;').collect();
      const afterTxnQuery = als.getStore()?.tag;
      await txn.cancel();

      return [afterQuery, afterTxnQuery, als.getStore()?.tag];
    });

    expect(seen).toEqual(['A', 'A', 'A']);
  });

  test('a connection opened inside a context does not leak it to code that awaits the socket later', async () => {
    const db = await fresh('txctx_leak');
    const surreal = await als.run({ tag: 'opener' }, () => connect(db));

    await surreal.query('RETURN 1;').collect();

    expect(als.getStore()).toBeUndefined();
  });

  test("a thenable's then() sees the context when awaited inside it, returned from an async function, or in Promise.all", async () => {
    expect(await als.run({ tag: 'awaited' }, async () => await thenable)).toBe('awaited');
    expect(await als.run({ tag: 'returned' }, async () => thenable)).toBe('returned');
    expect(await als.run({ tag: 'all' }, () => Promise.all([thenable, thenable]))).toEqual(['all', 'all']);
  });

  test('a thenable returned synchronously and awaited outside the context does not see it', async () => {
    const returned = als.run({ tag: 'built-inside' }, () => thenable);

    expect(await returned).toBeUndefined();
  });

  test('a callback scheduled inside the context still sees it after the scope has returned', async () => {
    const later = await new Promise<string | undefined>((resolve) => {
      als.run({ tag: 'scheduled' }, () => {
        setTimeout(() => resolve(als.getStore()?.tag), 5);
      });
    });

    expect(later).toBe('scheduled');
  });

  test('a nested run gives each attempt its own store, and a straggler from an earlier attempt sees its own', async () => {
    const stragglers: Promise<string | undefined>[] = [];

    await als.run({ tag: 'outer' }, async () => {
      for (const attempt of ['attempt-0', 'attempt-1']) {
        await als.run({ tag: attempt }, async () => {
          stragglers.push(new Promise((resolve) => setTimeout(() => resolve(als.getStore()?.tag), 10)));
        });
      }
    });

    expect(await Promise.all(stragglers)).toEqual(['attempt-0', 'attempt-1']);
  });
});

describe('one client-driven transaction over WebSocket', () => {
  test('concurrent statements (Promise.all) all run, overlap on the server, and commit together', async () => {
    const db = await fresh('txctx_concurrent');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const started = performance.now();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) => txn.query(`CREATE t:${i}; SLEEP 100ms;`).collect()),
    );
    const elapsed = performance.now() - started;
    await txn.commit();

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    // Serialised, five 100 ms statements take at least 500 ms; overlapping, about 100 ms
    expect(elapsed).toBeLessThan(400);
    expect(await ids(db)).toEqual(['t:0', 't:1', 't:2', 't:3', 't:4']);
  });

  test('a statement that fails among concurrent ones does not end the transaction, and commit keeps the rest', async () => {
    const db = await fresh('txctx_one_fails');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const results = await Promise.all([
      outcome(txn.query('CREATE t:a;').collect()),
      outcome(txn.query('THROW "boom";').collect()),
      outcome(txn.query('CREATE t:b;').collect()),
    ]);
    const committed = await outcome(txn.commit());

    expect(results).toEqual(['ok', 'ThrownError: An error occurred: boom', 'ok']);
    expect(committed).toBe('ok');
    expect(await ids(db)).toEqual(['t:a', 't:b']);
  });

  test('a query after commit, or after cancel, is refused as ValidationError "Transaction not found" and writes nothing', async () => {
    const db = await fresh('txctx_after_end');
    const surreal = await connect(db);

    for (const end of ['commit', 'cancel'] as const) {
      const txn = await surreal.beginTransaction();
      await txn[end]();
      let refusal: (Error & { kind?: string }) | undefined;
      try {
        await txn.query(`CREATE t:${end};`).collect();
      } catch (error) {
        refusal = error as Error & { kind?: string };
      }

      expect(refusal?.constructor.name).toBe('ValidationError');
      expect(refusal?.kind).toBe('Validation');
      expect(refusal?.message).toBe('Transaction not found');
    }
    expect(await ids(db)).toEqual([]);
  });

  test("commit sent while a multi-statement query is executing succeeds at once and keeps that query's earlier writes", async () => {
    const db = await fresh('txctx_torn_commit');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const query = outcome(txn.query('CREATE t:first; SLEEP 200ms; CREATE t:second;').collect());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const committed = await outcome(txn.commit());

    expect(committed).toBe('ok');
    expect(await query).toBe(
      "QueryError: There was a problem with the key-value store: Couldn't update a finished transaction",
    );
    // A torn write: the statement before the commit landed, the one after it did not
    expect(await ids(db)).toEqual(['t:first']);
  });

  test('cancel sent while a query is executing discards it, and the query fails', async () => {
    const db = await fresh('txctx_torn_cancel');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const query = outcome(txn.query('CREATE t:first; SLEEP 200ms; CREATE t:second;').collect());
    await new Promise((resolve) => setTimeout(resolve, 50));
    const cancelled = await outcome(txn.cancel());

    expect(cancelled).toBe('ok');
    expect(await query).toBe(
      "QueryError: There was a problem with the key-value store: Couldn't update a finished transaction",
    );
    expect(await ids(db)).toEqual([]);
  });

  test('a read-only transaction refuses a write routed to it through the context', async () => {
    const db = await fresh('txctx_read_only');
    const readOnly: Engines = Object.fromEntries(
      Object.entries(createRemoteEngines()).map(([scheme, factory]) => [
        scheme,
        (context: Parameters<typeof factory>[0]) => {
          const engine = factory(context);
          if (!(engine instanceof RpcEngine)) return engine;
          engine.begin = async (session) => {
            const reply = await engine.send<'begin', unknown[], { id: never }>({
              method: 'begin',
              params: [{ read_only: true }],
              session,
            });

            return reply.id;
          };

          return engine;
        },
      ]),
    );
    const surreal = await connect(db, readOnly);
    const txn = await surreal.beginTransaction();

    const write = await als.run({ tag: 'tx', owner: surreal, txn }, () =>
      outcome(route(surreal).query('CREATE t:routed;').collect()),
    );
    await txn.commit();

    expect(write).toBe('InternalError: Invalid statement: Cannot run CREATE on a read only transaction');
    expect(await ids(db)).toEqual([]);
  });

  test('a second Surreal instance used inside the context is a separate session: its write survives the cancel', async () => {
    const db = await fresh('txctx_second_instance');
    const surreal = await connect(db);
    const other = await connect(db);
    const txn = await surreal.beginTransaction();

    await als.run({ tag: 'tx', owner: surreal, txn }, async () => {
      await route(surreal).query('CREATE t:routed;').collect();
      await route(other).query('CREATE t:other;').collect();
    });
    await txn.cancel();

    expect(await ids(db)).toEqual(['t:other']);
  });
});
