/**
 * Facts about transactions on SurrealDB 4.0, memory backend: what a failing statement does to a
 * `BEGIN ... COMMIT` script and to a client-driven (SDK) transaction, what `RETURN` and `LET` do
 * inside one, how a thrown value reaches the SDK, and who retries a write conflict.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const scratch: ScratchDatabase[] = [];
const sockets: Surreal[] = [];

async function fresh(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  scratch.push(db);
  await run(db, 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE int;');

  return db;
}

async function connect(db: ScratchDatabase): Promise<Surreal> {
  const surreal = new Surreal();
  await surreal.connect('ws://127.0.0.1:8000/rpc');
  await surreal.signin({ username: 'root', password: 'root' });
  await surreal.use({ namespace: 'main', database: db.name });
  sockets.push(surreal);

  return surreal;
}

afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
  await Promise.all(scratch.map((db) => db.remove()));
});

async function ids(db: ScratchDatabase): Promise<string[]> {
  const [rows] = await run(db, 'SELECT id FROM t ORDER BY id;');

  return (rows!.result as { id: string }[]).map((r) => r.id);
}

async function catchError(work: () => Promise<unknown>): Promise<{
  kind?: string;
  message: string;
  details?: unknown;
}> {
  try {
    await work();
  } catch (error) {
    return error as { kind?: string; message: string; details?: unknown };
  }

  throw new Error('expected the call to throw');
}

describe('a failing statement inside a BEGIN ... COMMIT script', () => {
  test('cancels the transaction: earlier writes are discarded and COMMIT is refused', async () => {
    const db = await fresh('script_cancel');
    const results = await run(
      db,
      `BEGIN; CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; CREATE t:3 SET v = 3; COMMIT;`,
    );
    const texts = results.map((r) => String(r.result));

    expect(results.filter((r) => r.status === 'ERR').length).toBeGreaterThanOrEqual(3);
    expect(texts.some((t) => t.includes("Expected `int` but found `'bad'`"))).toBe(true);
    expect(texts.some((t) => t.includes('not executed due to a cancelled transaction'))).toBe(true);
    expect(texts.some((t) => t.includes('Cannot COMMIT: the transaction was aborted'))).toBe(true);
    expect(await ids(db)).toEqual([]);
  });

  test('the same statements without BEGIN are independent: the good rows land', async () => {
    const db = await fresh('script_nobegin');
    const results = await run(db, `CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; CREATE t:3 SET v = 3;`);

    expect(results.map((r) => r.status)).toEqual(['OK', 'ERR', 'OK']);
    expect(await ids(db)).toEqual(['t:1', 't:3']);
  });

  test('a THROW cancels it the same way and nothing after it runs', async () => {
    const db = await fresh('script_throw');
    const results = await run(db, `BEGIN; CREATE t:1 SET v = 1; THROW 'boom'; CREATE t:2 SET v = 2; COMMIT;`);

    expect(results.some((r) => String(r.result).includes('An error occurred: boom'))).toBe(true);
    expect(await ids(db)).toEqual([]);
  });

  test('CANCEL discards the writes without an error on the statements before it', async () => {
    const db = await fresh('script_cancel_stmt');
    const results = await run(db, `BEGIN; CREATE t:1 SET v = 1; CANCEL;`);

    expect(results.some((r) => String(r.result).includes('cancelled transaction'))).toBe(true);
    expect(await ids(db)).toEqual([]);
  });
});

describe('LET inside a transaction', () => {
  test('is visible after COMMIT when the transaction succeeds', async () => {
    const db = await fresh('let_ok');
    const results = await run(db, `BEGIN; LET $a = 5; CREATE t:1 SET v = $a; COMMIT; RETURN $a;`);

    expect(results.at(-1)).toEqual({ status: 'OK', result: 5 });
    expect(await ids(db)).toEqual(['t:1']);
  });

  test('is discarded when the transaction fails', async () => {
    const db = await fresh('let_failed');
    const results = await run(db, `BEGIN; LET $a = 5; CREATE t:1 SET v = 'bad'; COMMIT; RETURN $a;`);

    expect(results.at(-1)).toEqual({ status: 'OK', result: null });
    expect(await ids(db)).toEqual([]);
  });

  test('outside a transaction a failed statement does not discard it', async () => {
    const db = await fresh('let_nobegin');
    const results = await run(db, `LET $a = 5; CREATE t:1 SET v = 'bad'; RETURN $a;`);

    expect(results.at(-1)).toEqual({ status: 'OK', result: 5 });
  });
});

describe('RETURN inside a transaction', () => {
  test('does not end it: statements after RETURN run and are committed', async () => {
    const db = await fresh('return_continues');
    const results = await run(db, `BEGIN; CREATE t:1 SET v = 1; RETURN 'early'; CREATE t:2 SET v = 2; COMMIT;`);

    expect(results.every((r) => r.status === 'OK')).toBe(true);
    expect(results.some((r) => r.result === 'early')).toBe(true);
    expect(await ids(db)).toEqual(['t:1', 't:2']);
  });

  test('each RETURN yields its own result, in order', async () => {
    const db = await fresh('return_order');
    const results = await run(db, `BEGIN; RETURN 1; RETURN 2; COMMIT;`);

    expect(results.map((r) => r.result).filter((r) => typeof r === 'number')).toEqual([1, 2]);
  });

  test('a THROW after a RETURN still cancels what came before the RETURN', async () => {
    const db = await fresh('return_then_throw');
    await run(db, `BEGIN; CREATE t:1 SET v = 1; RETURN 'early'; THROW 'late'; COMMIT;`);

    expect(await ids(db)).toEqual([]);
  });
});

describe('a failing statement inside a client-driven (SDK) transaction', () => {
  test('does not cancel it: later statements run and commit() keeps every successful write', async () => {
    const db = await fresh('sdk_continues');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    await txn.query('CREATE t:1 SET v = 1').collect();
    const failure = await catchError(() => txn.query(`CREATE t:2 SET v = 'bad'`).collect());
    const [later] = await txn.query('CREATE t:3 SET v = 3').collect();
    await txn.commit();

    expect(failure.kind).toBe('Validation');
    expect(later).toEqual([{ id: expect.anything(), v: 3 }]);
    expect(await ids(db)).toEqual(['t:1', 't:3']);
  });

  test('inside one multi-statement query the statements after the failure still run', async () => {
    const db = await fresh('sdk_multi');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const failure = await catchError(() =>
      txn.query(`CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; CREATE t:3 SET v = 3;`).collect(),
    );
    await txn.commit();

    expect(failure.message).toContain("Expected `int` but found `'bad'`");
    expect(await ids(db)).toEqual(['t:1', 't:3']);
  });

  test('cancel() after the failure discards every write of the transaction', async () => {
    const db = await fresh('sdk_cancel');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    await txn.query('CREATE t:1 SET v = 1').collect();
    await catchError(() => txn.query(`CREATE t:2 SET v = 'bad'`).collect());
    await txn.cancel();

    expect(await ids(db)).toEqual([]);
  });

  test('contrast: the same failure in a BEGIN script sent as one request cancels everything', async () => {
    const db = await fresh('sdk_contrast');
    await run(db, `BEGIN; CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; COMMIT;`);

    expect(await ids(db)).toEqual([]);
  });

  test('LET set in one query of the transaction is not visible to the next query', async () => {
    const db = await fresh('sdk_let');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const [, first] = await txn.query('LET $a = 5; RETURN $a;').collect();
    const [second] = await txn.query('RETURN $a;').collect();
    await txn.cancel();

    expect(first).toBe(5);
    expect(second ?? null).toBeNull();
  });
});

describe('a thrown value reaching the SDK', () => {
  test('arrives as a ThrownError whose value is only in the message, details is undefined', async () => {
    const db = await fresh('throw_details');
    const surreal = await connect(db);

    const thrown = await catchError(() => surreal.query(`THROW { code: 7, msg: 'x' };`).collect());

    expect(thrown.kind).toBe('Thrown');
    expect(thrown.message).toBe("An error occurred: { code: 7, msg: 'x' }");
    expect(thrown.details).toBeUndefined();
  });

  test('a plain string is the same and carries no details inside a transaction either', async () => {
    const db = await fresh('throw_plain');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const thrown = await catchError(() => txn.query(`THROW 'plain';`).collect());
    await txn.cancel();

    expect(thrown.kind).toBe('Thrown');
    expect(thrown.message).toBe('An error occurred: plain');
    expect(thrown.details).toBeUndefined();
  });

  test('contrast: other error kinds do carry a details object', async () => {
    const db = await fresh('throw_contrast');
    const surreal = await connect(db);

    const failure = await catchError(() => surreal.query(`CREATE t:1 SET v = 'bad'`).collect());

    expect(failure.kind).toBe('Validation');
    expect(failure.details).toEqual({ kind: 'InvalidRequest' });
  });
});

describe('write conflicts', () => {
  test('standalone statements racing on one record are retried by the server and none fails', async () => {
    const db = await fresh('conflict_standalone');
    await run(db, 'CREATE t:1 SET v = 0;');
    const sockets30 = await Promise.all(Array.from({ length: 30 }, () => connect(db)));

    const settled = await Promise.allSettled(sockets30.map((s) => s.query('UPDATE t:1 SET v += 1').collect()));
    const [row] = await run(db, 'SELECT v FROM t:1;');

    expect(settled.filter((r) => r.status === 'rejected')).toHaveLength(0);
    expect(row!.result).toEqual([{ v: 30 }]);
  });

  test('client-driven transactions are not retried: the later commit fails with a retryable conflict', async () => {
    const db = await fresh('conflict_txn');
    await run(db, 'CREATE t:1 SET v = 0;');
    const [one, two] = await Promise.all([connect(db), connect(db)]);
    const first = await one.beginTransaction();
    const second = await two.beginTransaction();

    await first.query('UPDATE t:1 SET v = 10').collect();
    await second.query('UPDATE t:1 SET v = 20').collect();
    await first.commit();
    const conflict = await catchError(() => second.commit());
    const [row] = await run(db, 'SELECT v FROM t:1;');

    expect(conflict.kind).toBe('Query');
    expect(conflict.details).toEqual({ kind: 'TransactionConflict' });
    expect(conflict.message).toContain('This transaction can be retried');
    expect(row!.result).toEqual([{ v: 10 }]);
  });

  test('a transaction that only reads never conflicts', async () => {
    const db = await fresh('conflict_readonly');
    await run(db, 'CREATE t:1 SET v = 0;');
    const [one, two] = await Promise.all([connect(db), connect(db)]);
    const reader = await one.beginTransaction();

    await reader.query('SELECT v FROM t:1').collect();
    await two.query('UPDATE t:1 SET v = 5').collect();

    await expect(reader.commit()).resolves.toBeUndefined();
  });
});

describe('default isolation', () => {
  test('a transaction reads from its own snapshot while another connection commits', async () => {
    const db = await fresh('isolation_snapshot');
    await run(db, 'CREATE t:1 SET v = 1;');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    const [before] = await txn.query('SELECT v FROM t:1').collect();
    await run(db, 'UPDATE t:1 SET v = 2;');
    const [during] = await txn.query('SELECT v FROM t:1').collect();
    await txn.cancel();

    expect(before).toEqual([{ v: 1 }]);
    expect(during).toEqual([{ v: 1 }]);
  });

  test('contrast: a read outside the transaction sees the committed change', async () => {
    const db = await fresh('isolation_outside');
    await run(db, 'CREATE t:1 SET v = 1;');
    const surreal = await connect(db);
    const txn = await surreal.beginTransaction();

    await txn.query('SELECT v FROM t:1').collect();
    await run(db, 'UPDATE t:1 SET v = 2;');
    const [outside] = await surreal.query('SELECT v FROM t:1').collect();
    await txn.cancel();

    expect(outside).toEqual([{ v: 2 }]);
  });
});
