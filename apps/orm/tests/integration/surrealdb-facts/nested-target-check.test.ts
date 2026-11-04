/**
 * Facts about checking, inside a write's own transaction, that the records a nested `connect` or `set`
 * links to exist, on SurrealDB 4.0 (memory backend) through SDK 2.2.1: how a `THROW` from the check
 * reaches the caller over WebSocket and HTTP, in a `BEGIN ... COMMIT` script and in an SDK transaction,
 * and how a check with no failing statement (the writes guarded by `IF`, the first missing position
 * returned) behaves in both. Nothing here imports from `src/`: a failure after a SurrealDB upgrade must
 * mean a premise moved, not that the ORM changed.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { QueryError, Surreal, ThrownError, UnsupportedFeatureError, ValidationError } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

const scratch: ScratchDatabase[] = [];
const sockets: Surreal[] = [];

type Transport = 'ws' | 'http';
const ENDPOINTS: Record<Transport, string> = { ws: 'ws://127.0.0.1:8000/rpc', http: 'http://127.0.0.1:8000/rpc' };

async function fresh(name: string): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(`ntc_${name}`);
  scratch.push(db);
  await run(
    db,
    `DEFINE TABLE u SCHEMAFULL; DEFINE FIELD n ON u TYPE int;
     DEFINE TABLE t SCHEMAFULL; DEFINE FIELD v ON t TYPE int; DEFINE FIELD owner ON t TYPE option<record<u>>;
     CREATE u:1 SET n = 1; CREATE u:2 SET n = 2;`,
  );

  return db;
}

async function connect(db: ScratchDatabase, transport: Transport): Promise<Surreal> {
  const surreal = new Surreal();
  await surreal.connect(ENDPOINTS[transport]);
  await surreal.signin({ username: 'root', password: 'root' });
  await surreal.use({ namespace: 'main', database: db.name });
  sockets.push(surreal);

  return surreal;
}

afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
  await Promise.all(scratch.map((db) => db.remove()));
});

async function rows(db: ScratchDatabase): Promise<string[]> {
  const [result] = await run(db, 'SELECT id FROM t ORDER BY id;');

  return (result!.result as { id: string }[]).map((r) => r.id);
}

async function owner(db: ScratchDatabase): Promise<number> {
  const [result] = await run(db, 'SELECT VALUE n FROM ONLY u:1;');

  return result!.result as number;
}

async function rejection(work: () => Promise<unknown>): Promise<unknown> {
  try {
    await work();
  } catch (error) {
    return error;
  }

  throw new Error('expected the call to throw');
}

/** What each statement of `.responses()` reported: its error class and kind, or success. */
function outline(responses: { success: boolean; error?: unknown }[]): string[] {
  return responses.map((r) => {
    if (r.success) return 'ok';
    const error = r.error as QueryError | ThrownError;
    const detail = error instanceof QueryError ? error.details?.kind : undefined;

    return `${error.constructor.name}${detail ? `:${detail}` : ''}`;
  });
}

const THROWN = [
  { shape: 'a string', value: `'missing'`, text: 'An error occurred: missing' },
  { shape: 'an object', value: `{ field: 'owner', at: 0 }`, text: "An error occurred: { at: 0, field: 'owner' }" },
  { shape: 'an array', value: `['owner', 0]`, text: "An error occurred: ['owner', 0]" },
];

const throwScript = (value: string): string =>
  `BEGIN; LET $found = (SELECT id FROM ONLY u:404); IF $found IS NONE { THROW ${value} }; CREATE t:1 SET v = 1; COMMIT;`;

describe.each(['ws', 'http'] as const)(
  'a THROW from the check inside a BEGIN ... COMMIT script, over %s',
  (transport) => {
    test.each(THROWN)(
      'collect() rejects with a ThrownError for $shape, the value only in the text',
      async ({ value, text }) => {
        const db = await fresh(`throw_collect_${transport}`);
        const surreal = await connect(db, transport);

        const error = await rejection(() => surreal.query(throwScript(value)).collect());

        expect(error).toBeInstanceOf(ThrownError);
        expect((error as ThrownError).kind).toBe('Thrown');
        expect((error as ThrownError).details).toBeUndefined();
        expect((error as ThrownError).message).toBe(text);
        expect(await rows(db)).toEqual([]);
      },
    );

    test.each(THROWN)(
      'responses() puts the ThrownError at the IF statement for $shape; the others are NotExecuted or Cancelled',
      async ({ value }) => {
        const db = await fresh(`throw_responses_${transport}`);
        const surreal = await connect(db, transport);

        const responses = await surreal.query(throwScript(value)).responses();

        // BEGIN, LET, IF (the THROW), CREATE, COMMIT
        expect(outline(responses)).toEqual([
          'ok',
          'QueryError:NotExecuted',
          'ThrownError',
          'QueryError:Cancelled',
          'QueryError:NotExecuted',
        ]);
        expect(await rows(db)).toEqual([]);
      },
    );

    test('contrast: with the target present nothing throws and the write lands', async () => {
      const db = await fresh(`throw_present_${transport}`);
      const surreal = await connect(db, transport);

      await surreal
        .query(
          `BEGIN; LET $found = (SELECT id FROM ONLY u:1); IF $found IS NONE { THROW 'missing' }; CREATE t:1 SET v = 1; COMMIT;`,
        )
        .collect();

      expect(await rows(db)).toEqual(['t:1']);
    });
  },
);

describe('a THROW from the check inside an SDK transaction', () => {
  const checkThenWrite = `LET $found = (SELECT id FROM ONLY u:404); IF $found IS NONE { THROW 'missing' }; CREATE t:1 SET v = 1;`;

  test('collect() rejects with the ThrownError, yet the CREATE after it in the same query runs', async () => {
    const db = await fresh('sdk_throw_runs_on');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    const error = await rejection(() => txn.query(checkThenWrite).collect());
    const responses = await txn.query(checkThenWrite.replace('t:1', 't:9')).responses();
    await txn.cancel();

    expect(error).toBeInstanceOf(ThrownError);
    expect((error as ThrownError).details).toBeUndefined();
    // LET, IF (the THROW), CREATE: the CREATE succeeds
    expect(outline(responses)).toEqual(['ok', 'ThrownError', 'ok']);
  });

  test('the caller can catch it, run another statement and commit: the half-written CREATE is kept', async () => {
    const db = await fresh('sdk_throw_commit');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    await rejection(() => txn.query(checkThenWrite).collect());
    await txn.query('CREATE t:2 SET v = 2').collect();
    await txn.commit();

    expect(await rows(db)).toEqual(['t:1', 't:2']);
  });

  test('cancel() after catching it discards the half-written CREATE', async () => {
    const db = await fresh('sdk_throw_cancel');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    await rejection(() => txn.query(checkThenWrite).collect());
    await txn.cancel();

    expect(await rows(db)).toEqual([]);
  });

  test('over HTTP the SDK refuses to begin a transaction at all', async () => {
    const db = await fresh('sdk_http');
    const surreal = await connect(db, 'http');

    expect(await rejection(() => surreal.beginTransaction())).toBeInstanceOf(UnsupportedFeatureError);
  });
});

/**
 * The guarded check: one existence read per id in request order, the position of the first missing one
 * returned as its own statement, and every write (and the final RETURN) inside one `IF` block that runs
 * only when nothing is missing. Nothing fails, so nothing depends on how a failure is reported.
 */
function guarded(
  ids: readonly string[],
  body = `LET $row = (CREATE t:1 SET v = 1, owner = u:1); UPDATE u:1 SET n = 9; RETURN $row;`,
) {
  const reads = ids.map((id) => `(SELECT VALUE id FROM ONLY ${id})`).join(', ');

  return `LET $missing = [${reads}].find_index(NONE); RETURN $missing; IF $missing IS NONE { ${body} };`;
}

describe.each(['ws', 'http'] as const)('a guarded check with no failing statement, over %s', (transport) => {
  test.each([
    { name: 'the only id missing', ids: ['u:404'], first: 0 },
    { name: 'one of three missing', ids: ['u:1', 'u:404', 'u:2'], first: 1 },
    { name: 'two of three missing', ids: ['u:1', 'u:404', 'u:405'], first: 1 },
    { name: 'all of three missing', ids: ['u:403', 'u:404', 'u:405'], first: 0 },
  ])(
    '$name: collect() resolves, the RETURN holds the first missing position and nothing is written',
    async ({ ids, first }) => {
      const db = await fresh(`guard_missing_${transport}`);
      const surreal = await connect(db, transport);

      const results = await surreal.query(`BEGIN; ${guarded(ids)} COMMIT;`).collect();

      // BEGIN, LET, RETURN $missing, IF, COMMIT
      expect(results).toHaveLength(5);
      expect(results[2]).toBe(first);
      expect(results[3] ?? null).toBeNull();
      expect(await rows(db)).toEqual([]);
      expect(await owner(db)).toBe(1);
    },
  );

  test('every id present: the RETURN is NONE, every write in the block lands and the block yields its RETURN', async () => {
    const db = await fresh(`guard_present_${transport}`);
    const surreal = await connect(db, transport);

    const results = await surreal.query(`BEGIN; ${guarded(['u:1', 'u:2'])} COMMIT;`).collect();

    expect(results[2] ?? null).toBeNull();
    expect(results[3]).toEqual([{ id: expect.anything(), v: 1, owner: expect.anything() }]);
    expect(await rows(db)).toEqual(['t:1']);
    expect(await owner(db)).toBe(9);
  });

  test('a LET inside the IF block is scoped to it: a RETURN after the block does not see it', async () => {
    const db = await fresh(`guard_scope_${transport}`);
    const surreal = await connect(db, transport);

    const results = await surreal
      .query(`BEGIN; LET $row = 'outer'; IF true { LET $row = (CREATE t:1 SET v = 1); }; RETURN $row; COMMIT;`)
      .collect();

    expect(results[3]).toBe('outer');
    expect(await rows(db)).toEqual(['t:1']);
  });

  test('a RETURN inside the block does not end the transaction: a statement after the block still runs', async () => {
    const db = await fresh(`guard_return_${transport}`);
    const surreal = await connect(db, transport);

    await surreal
      .query(`BEGIN; IF true { CREATE t:1 SET v = 1; RETURN 'early'; }; CREATE t:2 SET v = 2; COMMIT;`)
      .collect();

    expect(await rows(db)).toEqual(['t:1', 't:2']);
  });

  test('another failure inside the block still cancels the script and collect() rejects with that cause', async () => {
    const db = await fresh(`guard_cause_${transport}`);
    const surreal = await connect(db, transport);

    const error = await rejection(() =>
      surreal
        .query(
          `BEGIN; ${guarded(['u:1'], `CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; UPDATE u:1 SET n = 9;`)} COMMIT;`,
        )
        .collect(),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(await rows(db)).toEqual([]);
    expect(await owner(db)).toBe(1);
  });

  test('without BEGIN it is the same: the guard alone keeps every write from running', async () => {
    const db = await fresh(`guard_nobegin_${transport}`);
    const surreal = await connect(db, transport);

    const results = await surreal.query(guarded(['u:1', 'u:404'])).collect();

    expect(results[1]).toBe(1);
    expect(await rows(db)).toEqual([]);
  });
});

describe('a guarded check inside an SDK transaction', () => {
  test('a missing target writes nothing, the caller runs another statement and commit() keeps only that', async () => {
    const db = await fresh('sdk_guard_missing');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    const results = await txn.query(guarded(['u:1', 'u:404'])).collect();
    await txn.query('CREATE t:2 SET v = 2').collect();
    await txn.commit();

    // LET, RETURN $missing, IF
    expect(results[1]).toBe(1);
    expect(await rows(db)).toEqual(['t:2']);
    expect(await owner(db)).toBe(1);
  });

  test('every target present: the writes land on commit()', async () => {
    const db = await fresh('sdk_guard_present');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    const results = await txn.query(guarded(['u:1'])).collect();
    await txn.commit();

    expect(results[1] ?? null).toBeNull();
    expect(await rows(db)).toEqual(['t:1']);
    expect(await owner(db)).toBe(9);
  });

  test('the check reads the transaction snapshot: a target created earlier in the transaction counts as present', async () => {
    const db = await fresh('sdk_guard_snapshot');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    await txn.query('CREATE u:7 SET n = 7').collect();
    const results = await txn.query(guarded(['u:7'])).collect();
    await txn.commit();

    expect(results[1] ?? null).toBeNull();
    expect(await rows(db)).toEqual(['t:1']);
  });

  test('a block that fails after writing part of its change makes commit() refuse, and nothing is kept', async () => {
    const db = await fresh('sdk_guard_partial');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    const error = await rejection(() =>
      txn
        .query(
          `IF true { CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; CREATE t:3 SET v = 3; }; CREATE t:4 SET v = 4;`,
        )
        .collect(),
    );
    await txn.query('CREATE t:9 SET v = 9').collect();
    const refusal = await rejection(() => txn.commit());

    expect(error).toBeInstanceOf(ValidationError);
    expect(refusal).toBeInstanceOf(QueryError);
    expect((refusal as QueryError).details).toEqual({ kind: 'NotExecuted' });
    expect((refusal as QueryError).message).toBe(
      'A statement failed after writing part of its change, so the transaction cannot commit',
    );
    expect(await rows(db)).toEqual([]);
  });

  test('a block that fails before writing anything leaves the transaction committable', async () => {
    const db = await fresh('sdk_guard_clean');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    const error = await rejection(() =>
      txn.query(`IF true { CREATE t:2 SET v = 'bad'; CREATE t:3 SET v = 3; }; CREATE t:4 SET v = 4;`).collect(),
    );
    await txn.commit();

    expect(error).toBeInstanceOf(ValidationError);
    expect(await rows(db)).toEqual(['t:4']);
  });

  test('contrast: the same failure as flat statements keeps the write before it and commit() succeeds', async () => {
    const db = await fresh('sdk_flat_partial');
    const surreal = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    await rejection(() => txn.query(`CREATE t:1 SET v = 1; CREATE t:2 SET v = 'bad'; CREATE t:4 SET v = 4;`).collect());
    await txn.commit();

    expect(await rows(db)).toEqual(['t:1', 't:4']);
  });
});

describe('a guarded check whose ids depend on a branch (an upsert choosing its half in the database)', () => {
  // Update half checks u:1 and u:404, create half checks u:1; the half not taken fills its slots with `true`
  const branched = (target: string): string =>
    `BEGIN; LET $exists = (SELECT id FROM ONLY ${target});
     LET $missing = (IF $exists { [(SELECT VALUE id FROM ONLY u:1), (SELECT VALUE id FROM ONLY u:404), true] }
       ELSE { [true, true, (SELECT VALUE id FROM ONLY u:1)] }).find_index(NONE);
     RETURN $missing;
     IF $missing IS NONE { LET $result = IF $exists { (UPDATE t:1 SET v = 5) } ELSE { (CREATE t:2 SET v = 6) }; RETURN $result; };
     COMMIT;`;

  test('the taken half has a missing id: its position is returned and nothing is written', async () => {
    const db = await fresh('branch_missing');
    await run(db, 'CREATE t:1 SET v = 0;');
    const surreal = await connect(db, 'ws');

    const results = await surreal.query(branched('t:1')).collect();
    const [stored] = await run(db, 'SELECT VALUE v FROM ONLY t:1;');

    // BEGIN, LET, LET, RETURN $missing, IF, COMMIT
    expect(results[3]).toBe(1);
    expect(stored!.result).toBe(0);
  });

  test('the other half has none missing: NONE is returned and that half writes', async () => {
    const db = await fresh('branch_present');
    const surreal = await connect(db, 'ws');

    const results = await surreal.query(branched('t:1')).collect();

    expect(results[3] ?? null).toBeNull();
    expect(await rows(db)).toEqual(['t:2']);
  });

  test('an empty list of checks finds nothing missing', async () => {
    const db = await fresh('branch_empty');
    const surreal = await connect(db, 'ws');

    const [found] = await surreal.query('RETURN [].find_index(NONE);').collect();

    expect(found ?? null).toBeNull();
  });
});

describe('a target deleted by another connection while the check runs in an SDK transaction', () => {
  test('the check reads the snapshot, so the link is written and commit() succeeds: no conflict is raised', async () => {
    const db = await fresh('race_delete');
    const surreal = await connect(db, 'ws');
    const other = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    await txn.query('SELECT id FROM u:1').collect();
    await other.query('DELETE u:1').collect();
    const results = await txn.query(guarded(['u:1'], 'CREATE t:1 SET v = 1, owner = u:1;')).collect();
    await txn.commit();
    const [linked] = await run(db, 'SELECT VALUE owner FROM ONLY t:1;');
    const [gone] = await run(db, 'SELECT id FROM u:1;');

    expect(results[1] ?? null).toBeNull();
    expect(String(linked!.result)).toBe('u:1');
    expect(gone!.result).toEqual([]);
  });

  test('contrast: when the write also touches the deleted target (a two-sided link), the transaction conflicts', async () => {
    const db = await fresh('race_conflict');
    const surreal = await connect(db, 'ws');
    const other = await connect(db, 'ws');
    const txn = await surreal.beginTransaction();

    await txn.query('SELECT id FROM u:1').collect();
    await other.query('DELETE u:1').collect();
    const conflict = await rejection(async () => {
      await txn.query(guarded(['u:1'])).collect();
      await txn.commit();
    });
    // The server may have ended it already; the cancel only releases the handle
    await txn.cancel().catch(() => undefined);
    const [gone] = await run(db, 'SELECT id FROM u:1;');

    expect(conflict).toBeInstanceOf(QueryError);
    expect((conflict as QueryError).details).toEqual({ kind: 'TransactionConflict' });
    expect(await rows(db)).toEqual([]);
    expect(gone!.result).toEqual([]);
  });
});
