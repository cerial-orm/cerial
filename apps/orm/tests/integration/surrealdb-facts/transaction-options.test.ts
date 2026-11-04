/**
 * Facts about transaction isolation levels and read-only transactions on SurrealDB 4.0, memory
 * backend: what `BEGIN ISOLATION LEVEL ...` and `BEGIN READ ONLY` accept and refuse in a script,
 * what the `begin` RPC accepts as options, which anomalies `SNAPSHOT` allows and `SERIALIZABLE`
 * refuses, and how far SDK 2.2.1 reaches them. Another backend was not measured.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { createRemoteEngines, type Engines, RpcEngine, Surreal } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const scratch: ScratchDatabase[] = [];
const closers: (() => Promise<void> | void)[] = [];

async function fresh(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  scratch.push(db);
  await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE int; CREATE t:1 SET v = 1; CREATE t:2 SET v = 1;');

  return db;
}

afterAll(async () => {
  await Promise.all(closers.map((close) => close()));
  await Promise.all(scratch.map((db) => db.remove()));
});

async function rows(db: ScratchDatabase): Promise<unknown> {
  const [result] = await run(db, 'SELECT id, v FROM t ORDER BY id;');

  return result!.result;
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

async function catchError(work: () => Promise<unknown>): Promise<{
  constructor: { name: string };
  kind?: string;
  message: string;
  details?: unknown;
  isTransactionConflict?: boolean;
}> {
  try {
    await work();
  } catch (error) {
    return error as {
      constructor: { name: string };
      kind?: string;
      message: string;
      details?: unknown;
      isTransactionConflict?: boolean;
    };
  }

  throw new Error('expected the call to throw');
}

interface RpcError {
  readonly kind: string;
  readonly message: string;
  readonly details?: { kind: string };
}

interface RpcReply<T = unknown> {
  readonly result?: T;
  readonly error?: RpcError;
}

interface StatementReply {
  readonly status: string;
  readonly result: unknown;
  readonly kind?: string;
}

interface BeginResult {
  readonly id: string;
  readonly isolation: string;
  readonly snapshot?: { readonly age: string; readonly position: unknown; readonly stale: boolean };
}

interface RawSocket {
  send<T = unknown>(method: string, params?: unknown[], extra?: Record<string, unknown>): Promise<RpcReply<T>>;
  /** `begin` with options; the transaction id whatever shape the reply takes. */
  begin(options?: Record<string, unknown>): Promise<string>;
  query(text: string, txn?: string): Promise<StatementReply[]>;
}

/**
 * A JSON-RPC socket of its own, because SDK 2.2.1's `beginTransaction()` sends `begin` with no
 * params and so cannot pass isolation or read-only.
 */
async function rawSocket(db: ScratchDatabase): Promise<RawSocket> {
  const ws = new WebSocket('ws://127.0.0.1:8000/rpc', 'json');
  await new Promise<void>((resolve, reject) => {
    ws.onopen = () => resolve();
    ws.onerror = () => reject(new Error('websocket failed to open'));
  });
  closers.push(() => ws.close());
  let next = 0;
  const pending = new Map<number, (reply: RpcReply) => void>();
  ws.onmessage = (event) => {
    const reply = JSON.parse(String(event.data)) as RpcReply & { id: number };
    pending.get(reply.id)?.(reply);
    pending.delete(reply.id);
  };

  const send = <T>(method: string, params?: unknown[], extra: Record<string, unknown> = {}): Promise<RpcReply<T>> =>
    new Promise((resolve) => {
      const id = ++next;
      pending.set(id, resolve as (reply: RpcReply) => void);
      ws.send(JSON.stringify({ id, method, ...(params ? { params } : {}), ...extra }));
    });

  await send('signin', [{ user: 'root', pass: 'root' }]);
  await send('use', ['main', db.name]);

  return {
    send,
    async begin(options) {
      const reply = await send<string | BeginResult>('begin', options ? [options] : undefined);
      if (reply.error) throw new Error(`begin refused: ${reply.error.message}`);

      return typeof reply.result === 'string' ? reply.result : reply.result!.id;
    },
    async query(text, txn) {
      const reply = await send<StatementReply[]>('query', [text], txn ? { txn } : {});
      if (reply.error) throw new Error(`query refused: ${reply.error.message}`);

      return reply.result!;
    },
  };
}

describe('BEGIN with an isolation level or READ ONLY in a script', () => {
  test('SNAPSHOT and SERIALIZABLE are both accepted on the memory backend and commit', async () => {
    const db = await fresh('script_levels');
    const snapshot = await run(db, 'BEGIN ISOLATION LEVEL SNAPSHOT; CREATE t:3 SET v = 3; COMMIT;');
    const serializable = await run(db, 'BEGIN ISOLATION LEVEL SERIALIZABLE; CREATE t:4 SET v = 4; COMMIT;');

    expect(snapshot.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);
    expect(serializable.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 1 },
      { id: 't:2', v: 1 },
      { id: 't:3', v: 3 },
      { id: 't:4', v: 4 },
    ]);
  });

  test('READ ONLY refuses a CREATE, aborts the script and writes nothing', async () => {
    const db = await fresh('script_ro_create');
    const results = await run(db, 'BEGIN READ ONLY; CREATE t:3 SET v = 3; COMMIT;');

    expect(results.map((r) => r.status)).toEqual(['OK', 'ERR', 'ERR']);
    expect(results[1]!.result).toBe('Invalid statement: Cannot run CREATE on a read only transaction');
    expect(results[2]!.result).toBe('Cannot COMMIT: the transaction was aborted due to a prior error');
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 1 },
      { id: 't:2', v: 1 },
    ]);
  });

  test('READ ONLY BEGIN returns a snapshot descriptor and a read runs', async () => {
    const db = await fresh('script_ro_read');
    const results = await run(db, 'BEGIN READ ONLY; SELECT v FROM t:1; COMMIT;');

    expect(results.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);
    expect(results[0]!.result).toEqual({ age: '0ns', position: null, stale: false });
    expect(results[1]!.result).toEqual([{ v: 1 }]);
  });

  test('READ ONLY names UPDATE and DELETE the same way, and refuses DDL from the key-value store', async () => {
    const db = await fresh('script_ro_others');
    const update = await run(db, 'BEGIN READ ONLY; UPDATE t:1 SET v = 5; COMMIT;');
    const remove = await run(db, 'BEGIN READ ONLY; DELETE t:1; COMMIT;');
    const ddl = await run(db, 'BEGIN READ ONLY; DEFINE TABLE other; COMMIT;');

    expect(update[1]!.result).toBe('Invalid statement: Cannot run UPDATE on a read only transaction');
    expect(remove[1]!.result).toBe('Invalid statement: Cannot run DELETE on a read only transaction');
    expect(ddl[1]!.result).toBe(
      "There was a problem with the key-value store: Couldn't write to a read only transaction",
    );
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 1 },
      { id: 't:2', v: 1 },
    ]);
  });

  test('the two clauses combine in either order', async () => {
    const db = await fresh('script_combined');
    const first = await run(db, 'BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE READ ONLY; SELECT v FROM t:1; COMMIT;');
    const second = await run(db, 'BEGIN READ ONLY ISOLATION LEVEL SERIALIZABLE; SELECT v FROM t:1; COMMIT;');

    expect(first.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);
    expect(second.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);
  });

  test('a SQL level name and READ WRITE are parse errors in SurrealQL', async () => {
    const db = await fresh('script_parse');
    const level = await catchError(() => run(db, 'BEGIN ISOLATION LEVEL READ COMMITTED; COMMIT;'));
    const readWrite = await catchError(() => run(db, 'BEGIN READ WRITE; COMMIT;'));

    expect(level.message).toContain('expected `SNAPSHOT` or `SERIALIZABLE`');
    expect(readWrite.message).toContain('expected `ONLY`');
  });
});

describe('a BEGIN statement through the SDK', () => {
  test('does not span requests: a READ ONLY BEGIN sent alone leaves the next request free to write', async () => {
    const db = await fresh('sdk_begin_alone');
    const surreal = await connect(db);

    await surreal.query('BEGIN READ ONLY;').collect();
    await surreal.query('CREATE t:3 SET v = 3;').collect();
    const commit = await catchError(() => surreal.query('COMMIT;').collect());

    expect(commit.message).toBe('Invalid statement: Cannot COMMIT without starting a transaction');
    expect(await rows(db)).toContainEqual({ id: 't:3', v: 3 });
  });

  test('is refused inside beginTransaction(), so a level cannot be set by text there', async () => {
    const db = await fresh('sdk_begin_nested');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const nested = await catchError(() => txn.query('BEGIN ISOLATION LEVEL SERIALIZABLE;').collect());
    await txn.cancel();

    expect(nested.constructor.name).toBe('InternalError');
    expect(nested.message).toBe('Invalid statement: Cannot BEGIN a transaction within a transaction');
  });

  test('is refused by the SDK transaction() helper before anything is sent', async () => {
    const db = await fresh('sdk_atomic_begin');
    const surreal = await connect(db);

    const refused = await catchError(() => surreal.transaction(['BEGIN READ ONLY', 'SELECT 1']));

    expect(refused.message).toContain('contains a BEGIN statement');
  });

  test('a READ ONLY refusal in a script reaches the SDK as InternalError, a refused DDL as QueryError', async () => {
    const db = await fresh('sdk_ro_classes');
    const surreal = await connect(db);

    const write = await catchError(() => surreal.query('BEGIN READ ONLY; CREATE t:3 SET v = 3; COMMIT;').collect());
    const ddl = await catchError(() => surreal.query('BEGIN READ ONLY; DEFINE TABLE other; COMMIT;').collect());

    expect(write.constructor.name).toBe('InternalError');
    expect(write.kind).toBe('Internal');
    expect(write.details).toBeUndefined();
    expect(ddl.constructor.name).toBe('QueryError');
    expect(ddl.kind).toBe('Query');
  });
});

describe('the begin RPC options', () => {
  test('no params, or an empty object, return a bare transaction id', async () => {
    const db = await fresh('rpc_plain');
    const socket = await rawSocket(db);

    const none = await socket.send('begin');
    const empty = await socket.send('begin', [{}]);

    expect(typeof none.result).toBe('string');
    expect(typeof empty.result).toBe('string');
    await socket.send('cancel', [none.result]);
    await socket.send('cancel', [empty.result]);
  });

  test('isolation and read_only are accepted and the reply becomes an object carrying the id', async () => {
    const db = await fresh('rpc_object');
    const socket = await rawSocket(db);

    const serializable = await socket.send<BeginResult>('begin', [{ isolation: 'serializable' }]);
    const readOnly = await socket.send<BeginResult>('begin', [{ read_only: true }]);
    const both = await socket.send<BeginResult>('begin', [{ isolation: 'SERIALIZABLE', read_only: true }]);
    const readWrite = await socket.send('begin', [{ read_only: false }]);

    expect(serializable.result).toEqual({ id: expect.any(String), isolation: 'serializable' });
    expect(readOnly.result).toEqual({
      id: expect.any(String),
      isolation: 'snapshot',
      snapshot: { age: '0ns', position: null, stale: false },
    });
    expect(both.result!.isolation).toBe('serializable');
    expect(both.result!.snapshot).toBeDefined();
    expect(typeof readWrite.result).toBe('string');
    for (const reply of [serializable, readOnly, both]) await socket.send('cancel', [reply.result!.id]);
    await socket.send('cancel', [readWrite.result]);
  });

  test('SQL level names are accepted and silently become snapshot', async () => {
    const db = await fresh('rpc_sql_names');
    const socket = await rawSocket(db);

    for (const isolation of ['read committed', 'repeatable read', 'read uncommitted', 'Snapshot']) {
      const reply = await socket.send<BeginResult>('begin', [{ isolation }]);

      expect(reply.result!.isolation).toBe('snapshot');
      await socket.send('cancel', [reply.result!.id]);
    }
  });

  test('an unknown option, an unknown level, a non-boolean read_only and a non-object are refused as InvalidParams', async () => {
    const db = await fresh('rpc_refused');
    const socket = await rawSocket(db);

    const unknownKey = await socket.send('begin', [{ isolation: 'serializable', foo: 1 }]);
    const staleness = await socket.send('begin', [{ max_staleness: '1s' }]);
    const unknownLevel = await socket.send('begin', [{ isolation: 'bogus' }]);
    const notBoolean = await socket.send('begin', [{ read_only: 'yes' }]);
    const notObject = await socket.send('begin', ['serializable']);

    for (const reply of [unknownKey, staleness, unknownLevel, notBoolean, notObject]) {
      expect(reply.error?.kind).toBe('Validation');
      expect(reply.error?.details).toEqual({ kind: 'InvalidParams' });
    }
    expect(unknownKey.error!.message).toBe('Unknown query option `foo`');
    expect(staleness.error!.message).toBe('Unknown query option `max_staleness`');
    expect(unknownLevel.error!.message).toBe(
      'Expected isolation to be `snapshot`, `serializable` or a SQL isolation level, got `bogus`',
    );
    expect(notBoolean.error!.message).toContain('read_only');
  });

  test('a read-only transaction refuses each write statement but stays open, and commit() succeeds', async () => {
    const db = await fresh('rpc_ro_writes');
    const socket = await rawSocket(db);
    const txn = await socket.begin({ read_only: true });

    const [create] = await socket.query('CREATE t:3 SET v = 3;', txn);
    const [update] = await socket.query('UPDATE t:1 SET v = 5;', txn);
    const [remove] = await socket.query('DELETE t:1;', txn);
    const [ddl] = await socket.query('DEFINE TABLE other;', txn);
    const [read] = await socket.query('SELECT v FROM t:1;', txn);
    const commit = await socket.send('commit', [txn]);

    expect(create).toMatchObject({ status: 'ERR', kind: 'Internal' });
    expect(create!.result).toBe('Invalid statement: Cannot run CREATE on a read only transaction');
    expect(update!.result).toBe('Invalid statement: Cannot run UPDATE on a read only transaction');
    expect(remove!.result).toBe('Invalid statement: Cannot run DELETE on a read only transaction');
    expect(ddl).toMatchObject({ status: 'ERR', kind: 'Query' });
    expect(read).toMatchObject({ status: 'OK', result: [{ v: 1 }] });
    expect(commit.error).toBeUndefined();
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 1 },
      { id: 't:2', v: 1 },
    ]);
  });
});

describe('SNAPSHOT against SERIALIZABLE between two client-driven transactions', () => {
  async function pair(name: string): Promise<{ db: ScratchDatabase; one: RawSocket; two: RawSocket }> {
    const db = await fresh(name);

    return { db, one: await rawSocket(db), two: await rawSocket(db) };
  }

  test('write skew (each reads both rows, each writes a different one): SNAPSHOT commits both', async () => {
    const { db, one, two } = await pair('skew_snapshot');
    const first = await one.begin({ isolation: 'snapshot' });
    const second = await two.begin({ isolation: 'snapshot' });

    await one.query('SELECT * FROM t;', first);
    await two.query('SELECT * FROM t;', second);
    await one.query('UPDATE t:1 SET v = 0;', first);
    await two.query('UPDATE t:2 SET v = 0;', second);

    expect((await one.send('commit', [first])).error).toBeUndefined();
    expect((await two.send('commit', [second])).error).toBeUndefined();
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 0 },
      { id: 't:2', v: 0 },
    ]);
  });

  test('write skew: SERIALIZABLE refuses the later commit with a retryable read conflict', async () => {
    const { db, one, two } = await pair('skew_serializable');
    const first = await one.begin({ isolation: 'serializable' });
    const second = await two.begin({ isolation: 'serializable' });

    await one.query('SELECT * FROM t;', first);
    await two.query('SELECT * FROM t;', second);
    const [write] = await one.query('UPDATE t:1 SET v = 0;', first);
    const [otherWrite] = await two.query('UPDATE t:2 SET v = 0;', second);
    const firstCommit = await one.send('commit', [first]);
    const secondCommit = await two.send('commit', [second]);

    expect(write!.status).toBe('OK');
    expect(otherWrite!.status).toBe('OK');
    expect(firstCommit.error).toBeUndefined();
    expect(secondCommit.error).toMatchObject({ kind: 'Query', details: { kind: 'TransactionConflict' } });
    expect(secondCommit.error!.message).toContain('Read conflict, retry the transaction');
    expect(secondCommit.error!.message).toContain('This transaction can be retried');
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 0 },
      { id: 't:2', v: 1 },
    ]);
  });

  test('a record read, then changed by a standalone write, then a write elsewhere: only SERIALIZABLE refuses', async () => {
    const outcomes: Record<string, RpcError | undefined> = {};
    for (const isolation of ['snapshot', 'serializable']) {
      const { one, two } = await pair(`stale_${isolation}`);
      const txn = await one.begin({ isolation });

      await one.query('SELECT * FROM t:1;', txn);
      await two.query('UPDATE t:1 SET v = 7;');
      await one.query('UPDATE t:2 SET v = 9;', txn);
      outcomes[isolation] = (await one.send('commit', [txn])).error;
    }

    expect(outcomes['snapshot']).toBeUndefined();
    expect(outcomes['serializable']).toMatchObject({ details: { kind: 'TransactionConflict' } });
    expect(outcomes['serializable']!.message).toContain('Read conflict');
  });

  test('a range read, then a matching row created elsewhere (phantom), then a write: only SERIALIZABLE refuses', async () => {
    const outcomes: Record<string, RpcError | undefined> = {};
    for (const isolation of ['snapshot', 'serializable']) {
      const { one, two } = await pair(`phantom_${isolation}`);
      const txn = await one.begin({ isolation });

      await one.query('SELECT * FROM t WHERE v > 0;', txn);
      await two.query('CREATE t:3 SET v = 5;');
      await one.query('UPDATE t:2 SET v = 9;', txn);
      outcomes[isolation] = (await one.send('commit', [txn])).error;
    }

    expect(outcomes['snapshot']).toBeUndefined();
    expect(outcomes['serializable']).toMatchObject({ details: { kind: 'TransactionConflict' } });
  });

  test('SERIALIZABLE does not refuse when nothing it read was changed', async () => {
    const { db, one, two } = await pair('serializable_clean');
    const txn = await one.begin({ isolation: 'serializable' });

    await one.query('SELECT * FROM t:1;', txn);
    await two.query('CREATE u:1 SET v = 1;');
    await one.query('UPDATE t:2 SET v = 9;', txn);

    expect((await one.send('commit', [txn])).error).toBeUndefined();
    expect(await rows(db)).toContainEqual({ id: 't:2', v: 9 });
  });

  test('a SERIALIZABLE transaction that only reads commits after its read set changed', async () => {
    const { one, two } = await pair('serializable_reader');
    const txn = await one.begin({ isolation: 'serializable' });

    await one.query('SELECT * FROM t;', txn);
    await two.query('UPDATE t:1 SET v = 7;');

    expect((await one.send('commit', [txn])).error).toBeUndefined();
  });

  test('a read-only SERIALIZABLE transaction keeps its snapshot and never conflicts', async () => {
    const { one, two } = await pair('serializable_ro');
    const txn = await one.begin({ isolation: 'serializable', read_only: true });

    const [before] = await one.query('SELECT v FROM t:1;', txn);
    await two.query('UPDATE t:1 SET v = 7;');
    const [after] = await one.query('SELECT v FROM t:1;', txn);

    expect(before!.result).toEqual([{ v: 1 }]);
    expect(after!.result).toEqual([{ v: 1 }]);
    expect((await one.send('commit', [txn])).error).toBeUndefined();
  });

  test('two writes to one record conflict at either level, as a write conflict, and the first commit stands', async () => {
    for (const isolation of ['snapshot', 'serializable']) {
      const { db, one, two } = await pair(`ww_${isolation}`);
      const first = await one.begin({ isolation });
      const second = await two.begin({ isolation });

      await one.query('UPDATE t:1 SET v = 10;', first);
      const [secondWrite] = await two.query('UPDATE t:1 SET v = 20;', second);
      const firstCommit = await one.send('commit', [first]);
      const secondCommit = await two.send('commit', [second]);

      expect(secondWrite!.status).toBe('OK');
      expect(firstCommit.error).toBeUndefined();
      expect(secondCommit.error).toMatchObject({ details: { kind: 'TransactionConflict' } });
      expect(secondCommit.error!.message).toContain('Write conflict');
      expect(await rows(db)).toContainEqual({ id: 't:1', v: 10 });
    }
  });
});

describe('SDK 2.2.1 and the begin options', () => {
  /**
   * The SDK's own `begin` sends no params. A wrapped engine (public `createRemoteEngines` and
   * `RpcEngine.send`) can send them; this pins what that route depends on.
   */
  function enginesWith(options: () => Record<string, unknown> | undefined): Engines {
    return Object.fromEntries(
      Object.entries(createRemoteEngines()).map(([scheme, factory]) => [
        scheme,
        (context: Parameters<typeof factory>[0]) => {
          const engine = factory(context);
          if (!(engine instanceof RpcEngine)) return engine;
          const plainBegin = engine.begin.bind(engine);
          engine.begin = async (session) => {
            const params = options();
            if (!params) return plainBegin(session);
            const reply = await engine.send<'begin', unknown[], { id: Awaited<ReturnType<typeof plainBegin>> }>({
              method: 'begin',
              params: [params],
              session,
            });

            return reply.id;
          };

          return engine;
        },
      ]),
    );
  }

  test('through a wrapped engine, a read-only beginTransaction() refuses a write with InternalError', async () => {
    const db = await fresh('sdk_engine_ro');
    const surreal = await connect(
      db,
      enginesWith(() => ({ read_only: true })),
    );
    const txn = await surreal.beginTransaction();

    const write = await catchError(() => txn.query('CREATE t:3 SET v = 3;').collect());
    const [read] = await txn.query('SELECT v FROM t:1;').collect();
    await txn.commit();

    expect(write.constructor.name).toBe('InternalError');
    expect(write.message).toBe('Invalid statement: Cannot run CREATE on a read only transaction');
    expect(read).toEqual([{ v: 1 }]);
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 1 },
      { id: 't:2', v: 1 },
    ]);
  });

  test('through a wrapped engine, a SERIALIZABLE read conflict is a QueryError the SDK calls retryable', async () => {
    const db = await fresh('sdk_engine_serializable');
    const surreal = await connect(
      db,
      enginesWith(() => ({ isolation: 'serializable' })),
    );
    const txn = await surreal.beginTransaction();

    await txn.query('SELECT * FROM t:1;').collect();
    await run(db, 'UPDATE t:1 SET v = 2;');
    await txn.query('UPDATE t:2 SET v = 8;').collect();
    const conflict = await catchError(() => txn.commit());

    expect(conflict.constructor.name).toBe('QueryError');
    expect(conflict.isTransactionConflict).toBe(true);
    expect(conflict.message).toContain('Read conflict');
    expect(await rows(db)).toEqual([
      { id: 't:1', v: 2 },
      { id: 't:2', v: 1 },
    ]);
  });
});
