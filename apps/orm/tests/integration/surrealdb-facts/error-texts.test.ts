/**
 * Facts about the error texts and error classes SurrealDB 4.0 sends, the ones the classifiers read:
 * the unique-index prose behind `wrapDatabaseError`, the record-exists signal, the filler texts of an
 * aborted `BEGIN ... COMMIT` script, the not-found and anonymous-actor details, and which record is
 * named when several fail in one statement. Nothing here imports from `src/`: a failure after an
 * upgrade must mean the server's wording moved.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Surreal, Table } from 'surrealdb';
import { run, withScratchDatabase, type ScratchDatabase } from './helpers';

interface Thrown {
  readonly constructor: { readonly name: string };
  readonly kind?: string;
  readonly message: string;
  readonly details?: unknown;
  readonly recordId?: { toString(): string };
  readonly databaseName?: string;
  readonly namespaceName?: string;
  readonly cause?: Thrown;
}

const scratch: ScratchDatabase[] = [];
const sockets: Surreal[] = [];

async function open(name: string, surql = ''): Promise<ScratchDatabase> {
  const db = await withScratchDatabase(name);
  scratch.push(db);
  if (surql) for (const result of await run(db, surql)) expect(result.status).toBe('OK');

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

async function caught(work: () => Promise<unknown>): Promise<Thrown> {
  try {
    await work();
  } catch (error) {
    return error as Thrown;
  }

  throw new Error('expected the call to throw');
}

/** The message of the one failing statement; the script must have failed. */
async function failure(db: ScratchDatabase, surql: string): Promise<string> {
  const results = await run(db, surql);
  const failed = results.find((result) => result.status === 'ERR');
  if (!failed) throw new Error(`expected a failure from: ${surql.slice(0, 80)}`);

  return failed.result as string;
}

afterAll(async () => {
  await Promise.all(sockets.map((s) => s.close()));
  await Promise.all(scratch.map((db) => db.remove()));
});

describe('a unique-index violation', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open(
      'unique',
      `DEFINE TABLE w SCHEMAFULL;
       DEFINE FIELD s ON w TYPE string;
       DEFINE FIELD n ON w TYPE int;
       DEFINE INDEX us ON w FIELDS s UNIQUE;
       DEFINE INDEX un ON w FIELDS n UNIQUE;
       DEFINE TABLE w2 SCHEMAFULL;
       DEFINE FIELD a ON w2 TYPE string;
       DEFINE FIELD b ON w2 TYPE int;
       DEFINE INDEX uab ON w2 FIELDS a, b UNIQUE;`,
    );
  });

  test('is prose: index, the value as SurrealQL, then the record, backticked', async () => {
    await run(db, "CREATE w:1 SET s = 'x@y.z', n = 1;");

    expect(await failure(db, "CREATE w:2 SET s = 'x@y.z', n = 2;")).toBe(
      "Database index `us` already contains 'x@y.z', with record `w:1`",
    );
  });

  test('prints a number bare and a composite value as an array literal', async () => {
    await run(db, 'CREATE w:10 SET s = "n", n = 5; CREATE w2:1 SET a = "k", b = 1;');

    expect(await failure(db, 'CREATE w:11 SET s = "m", n = 5;')).toBe(
      'Database index `un` already contains 5, with record `w:10`',
    );
    expect(await failure(db, 'CREATE w2:2 SET a = "k", b = 1;')).toBe(
      "Database index `uab` already contains ['k', 1], with record `w2:1`",
    );
  });

  test('picks the quote that the value needs and escapes the other', async () => {
    await run(db, `CREATE w:20 SET s = "it's", n = 20; CREATE w:21 SET s = '"dq"', n = 21;`);

    expect(await failure(db, `CREATE w:22 SET s = "it's", n = 22;`)).toBe(
      `Database index \`us\` already contains "it's", with record \`w:20\``,
    );
    expect(await failure(db, `CREATE w:23 SET s = '"dq"', n = 23;`)).toBe(
      `Database index \`us\` already contains '"dq"', with record \`w:21\``,
    );
  });

  test('keeps a record id that needs escaping whole, backticks inside the closing one', async () => {
    await run(db, "CREATE w:`u-a` SET s = 'esc', n = 30;");

    expect(await failure(db, "CREATE w:31 SET s = 'esc', n = 31;")).toBe(
      "Database index `us` already contains 'esc', with record `w:`u-a``",
    );
  });

  test('keeps a value that itself holds the record phrase, so the last phrase is the record', async () => {
    await run(db, "CREATE w:40 SET s = 'a, with record `x`', n = 40;");

    expect(await failure(db, "CREATE w:41 SET s = 'a, with record `x`', n = 41;")).toBe(
      "Database index `us` already contains 'a, with record `x`', with record `w:40`",
    );
  });

  test('reaches the SDK as an InternalError of kind Internal with no details', async () => {
    await run(db, "CREATE w:50 SET s = 'sdk', n = 50;");
    const surreal = await connect(db);

    const error = await caught(() => surreal.query("CREATE w:51 SET s = 'sdk', n = 51").collect());

    expect(error.constructor.name).toBe('InternalError');
    expect(error.kind).toBe('Internal');
    expect(error.message).toBe("Database index `us` already contains 'sdk', with record `w:50`");
    expect(error.details).toBeUndefined();
  });

  test('is not what an ASSERT failure, a coercion failure or a missing field says', async () => {
    const other = await open(
      'not_unique',
      `DEFINE TABLE m SCHEMAFULL;
       DEFINE FIELD k ON m TYPE int ASSERT $value > 0;
       DEFINE FIELD e ON m TYPE string;`,
    );
    const texts = [
      await failure(other, 'CREATE m:1 SET k = 0, e = "a";'),
      await failure(other, 'CREATE m:2 SET k = 1, e = 5;'),
      await failure(other, 'CREATE m:3 SET k = 1;'),
    ];

    expect(texts[0]).toBe('Found 0 for field `k`, with record `m:1`, but field must conform to: $value > 0');
    expect(texts[1]).toBe("Couldn't coerce value for field `e` of `m:2`: Expected `string` but found `5`");
    expect(texts[2]).toBe("Couldn't coerce value for field `e` of `m:3`: Expected `string` but found `NONE`");
    for (const text of texts) expect(text).not.toContain('already contains');
  });
});

describe('a record id that is taken', () => {
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open(
      'record_exists',
      `DEFINE TABLE u SCHEMAFULL;
       DEFINE FIELD e ON u TYPE string;
       CREATE u:a SET e = 'one';`,
    );
  });

  test('CREATE, CREATE ONLY and INSERT each say "Database record ... already exists"', async () => {
    const expected = 'Database record `u:a` already exists';

    expect(await failure(db, "CREATE u:a SET e = 'two';")).toBe(expected);
    expect(await failure(db, "CREATE ONLY u:a SET e = 'two';")).toBe(expected);
    expect(await failure(db, "INSERT INTO u { id: u:a, e: 'two' };")).toBe(expected);
  });

  test('reaches the SDK as an AlreadyExistsError that carries the record id and a Record detail', async () => {
    const surreal = await connect(db);

    for (const surql of ["CREATE u:a SET e = 'x'", "INSERT INTO u { id: u:a, e: 'x' }"]) {
      const error = await caught(() => surreal.query(surql).collect());

      expect(error.constructor.name).toBe('AlreadyExistsError');
      expect(error.kind).toBe('AlreadyExists');
      expect(error.recordId?.toString()).toBe('u:a');
      expect(error.details).toEqual({ kind: 'Record', details: { id: 'u:a' } });
    }
  });

  test('a table that exists is also AlreadyExists but has no record id, so it is not a unique conflict', async () => {
    const surreal = await connect(db);

    const error = await caught(() => surreal.query('DEFINE TABLE u SCHEMAFULL').collect());

    expect(error.constructor.name).toBe('AlreadyExistsError');
    expect(error.message).toBe("The table 'u' already exists");
    expect(error.recordId).toBeUndefined();
    expect(error.details).toEqual({ kind: 'Table', details: { name: 'u' } });
  });

  test('an index that exists is not AlreadyExists at all: it is an InternalError', async () => {
    const surreal = await connect(db);
    await surreal.query('DEFINE INDEX ix ON u FIELDS e').collect();

    const error = await caught(() => surreal.query('DEFINE INDEX ix ON u FIELDS e').collect());

    expect(error.constructor.name).toBe('InternalError');
    expect(error.message).toBe("The index 'ix' already exists");
    expect(error.recordId).toBeUndefined();
  });

  test('a duplicate id never says "already contains", and a unique violation never says "Database record"', async () => {
    const both = await open(
      'both',
      `DEFINE TABLE v SCHEMAFULL; DEFINE FIELD e ON v TYPE string; DEFINE INDEX ve ON v FIELDS e UNIQUE;
       CREATE v:a SET e = 'one';`,
    );

    expect(await failure(both, "CREATE v:a SET e = 'two';")).not.toContain('already contains');
    expect(await failure(both, "CREATE v:b SET e = 'one';")).not.toContain('Database record');
  });

  test('a missing required field is checked before the id clash', async () => {
    const message = await failure(db, 'CREATE u:a SET f = 1;');

    expect(message).toBe("Couldn't coerce value for field `e` of `u:a`: Expected `string` but found `NONE`");
  });
});

describe('which error is reported when several records fail in one statement', () => {
  const ROWS = 600;
  const RUNS = 10;
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open(
      'several',
      `DEFINE TABLE a SCHEMAFULL;
       DEFINE FIELD k ON a TYPE int ASSERT $value > 0;
       DEFINE FIELD e ON a TYPE string;
       DEFINE TABLE b SCHEMAFULL;
       DEFINE FIELD e ON b TYPE string;
       DEFINE INDEX be ON b FIELDS e UNIQUE;`,
    );
  });

  const rows = (table: string, make: (i: number) => string): string =>
    `INSERT INTO ${table} [${Array.from({ length: ROWS }, (_, i) => `{ id: ${table}:${i}, ${make(i)} }`).join(', ')}];`;

  test('many ASSERT failures report one record from the failing set, every run', async () => {
    const seen = new Set<string>();

    for (let run_ = 0; run_ < RUNS; run_++) {
      const message = await failure(
        db,
        rows('a', (i) => `k: -1, e: '${i}'`),
      );
      const match = /^Found -1 for field `k`, with record `a:(\d+)`, but field must conform to: \$value > 0$/.exec(
        message,
      );

      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeLessThan(ROWS);
      seen.add(match![1]!);
    }
    expect(seen.size).toBeGreaterThanOrEqual(1);
  });

  test('many unique violations name an indexed value and a record that holds it', async () => {
    for (let run_ = 0; run_ < RUNS; run_++) {
      const message = await failure(
        db,
        rows('b', () => "e: 'same'"),
      );
      const match = /^Database index `be` already contains 'same', with record `b:(\d+)`$/.exec(message);

      expect(match).not.toBeNull();
      expect(Number(match![1])).toBeLessThan(ROWS);
      await run(db, 'DELETE b;');
    }
  });

  test('an UPDATE that breaks the same unique index on every row reports one of those rows', async () => {
    await run(
      db,
      rows('b', (i) => `e: 'row${i}'`),
    );

    const message = await failure(db, "UPDATE b SET e = 'same';");

    expect(message).toMatch(/^Database index `be` already contains 'same', with record `b:\d+`$/);
    expect(Number(/`b:(\d+)`$/.exec(message)![1])).toBeLessThan(ROWS);
  });

  test('a statement whose rows all pass reports no error', async () => {
    await run(db, 'DELETE a;');
    const results = await run(
      db,
      rows('a', (i) => `k: 1, e: '${i}'`),
    );

    expect(results.map((r) => r.status)).toEqual(['OK']);
  });
});

describe('the filler texts of an aborted BEGIN ... COMMIT script', () => {
  const FAILED = 'The query was not executed due to a failed transaction';
  const CANCELLED = 'The query was not executed due to a cancelled transaction';
  const COMMIT = 'Cannot COMMIT: the transaction was aborted due to a prior error';
  let db: ScratchDatabase;

  beforeAll(async () => {
    db = await open('aborted', 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD e ON t TYPE string;');
  });

  test('earlier statements say "failed", later ones "cancelled", COMMIT its own, and only one carries the cause', async () => {
    const results = await run(
      db,
      `BEGIN;
       CREATE t:1 SET e = 'ok';
       CREATE t:2 SET e = 5;
       CREATE t:3 SET e = 'ok';
       COMMIT;`,
    );

    expect(results.map((r) => r.result)).toEqual([
      null,
      FAILED,
      "Couldn't coerce value for field `e` of `t:2`: Expected `string` but found `5`",
      CANCELLED,
      COMMIT,
    ]);
    expect(results.map((r) => r.status)).toEqual(['OK', 'ERR', 'ERR', 'ERR', 'ERR']);
  });

  test('a THROW is the cause in the same position, worded "An error occurred: ..."', async () => {
    const results = await run(db, "BEGIN; CREATE t:4 SET e = 'ok'; THROW 'boom'; COMMIT;");

    expect(results.map((r) => r.result)).toEqual([null, FAILED, 'An error occurred: boom', COMMIT]);
  });

  test('the cause is the one text that matches neither filler pattern', async () => {
    const results = await run(db, "BEGIN; CREATE t:5 SET e = 5; CREATE t:6 SET e = 'ok'; COMMIT;");
    const filler = /not executed due to a (?:failed|cancelled) transaction|Cannot COMMIT: the transaction was aborted/i;
    const causes = results.filter((r) => r.status === 'ERR' && !filler.test(r.result as string));

    expect(causes).toHaveLength(1);
    expect(causes[0]!.result).toContain('Expected `string` but found `5`');
  });

  test('a script that succeeds leaves no row of the failed one behind, and its statements all pass', async () => {
    const [counted] = await run(db, 'SELECT * FROM t;');
    expect(counted!.result).toEqual([]);

    const ok = await run(db, "BEGIN; CREATE t:7 SET e = 'ok'; COMMIT;");
    expect(ok.map((r) => r.status)).toEqual(['OK', 'OK', 'OK']);
  });
});

describe('a THROW reaching the SDK', () => {
  test('is a ThrownError of kind Thrown whose value is in the message only', async () => {
    const db = await open('thrown');
    const surreal = await connect(db);

    const error = await caught(() => surreal.query("THROW 'plain'").collect());

    expect(error.constructor.name).toBe('ThrownError');
    expect(error.kind).toBe('Thrown');
    expect(error.message).toBe('An error occurred: plain');
    expect(error.details).toBeUndefined();
  });

  test('contrast: a coercion failure is a ValidationError with an InvalidRequest detail', async () => {
    const db = await open('thrown_contrast', 'DEFINE TABLE t SCHEMAFULL; DEFINE FIELD e ON t TYPE string;');
    const surreal = await connect(db);

    const error = await caught(() => surreal.query('CREATE t:1 SET e = 5').collect());

    expect(error.constructor.name).toBe('ValidationError');
    expect(error.details).toEqual({ kind: 'InvalidRequest' });
  });
});

describe('write conflicts between standalone statements', () => {
  test('twenty connections creating the same unique value get one success and nineteen unique violations, never a conflict', async () => {
    const db = await open(
      'race',
      'DEFINE TABLE c SCHEMAFULL; DEFINE FIELD e ON c TYPE string; DEFINE INDEX cu ON c FIELDS e UNIQUE;',
    );
    const connections = await Promise.all(Array.from({ length: 20 }, () => connect(db)));

    const settled = await Promise.allSettled(
      connections.map((c, i) => c.query(`CREATE c:r${i} SET e = 'same'`).collect()),
    );
    const failures = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(settled.length - failures.length).toBe(1);
    expect(failures).toHaveLength(19);
    for (const { reason } of failures) {
      const error = reason as Thrown;

      expect(error.constructor.name).toBe('InternalError');
      expect(error.message).toMatch(/^Database index `cu` already contains 'same', with record `c:r\d+`$/);
      expect(error.message).not.toMatch(/conflict|retry/i);
    }
  });

  test('a lease-style CREATE ONLY on a taken id says "already exists" and never "conflict" or "retry"', async () => {
    const db = await open(
      'lease',
      'DEFINE TABLE l SCHEMAFULL; DEFINE FIELD holder ON l TYPE string; CREATE l:migrate SET holder = "a";',
    );

    const message = await failure(db, 'CREATE ONLY l:migrate SET holder = "b" RETURN NONE;');

    expect(message).toMatch(/already exists/i);
    expect(message).not.toMatch(/conflict|retry/i);
  });
});

describe('not found', () => {
  test('a missing table is a NotFoundError with a Table detail', async () => {
    const db = await open('nf_table');
    const surreal = await connect(db);

    const error = await caught(() => surreal.query('SELECT * FROM nosuchtable').collect());

    expect(error.constructor.name).toBe('NotFoundError');
    expect(error.message).toBe("The table 'nosuchtable' does not exist");
    expect(error.details).toEqual({ kind: 'Table', details: { name: 'nosuchtable' } });
  });

  test('a missing database over HTTP carries databaseName, and so does a missing namespace its own name', async () => {
    const http = new Surreal();
    sockets.push(http);
    const auth = { username: 'root', password: 'root' };

    await http.connect('http://127.0.0.1:8000', {
      namespace: 'main',
      database: 'facts_nf_missing_db',
      authentication: auth,
    });
    const dbError = await caught(() => http.query('INFO FOR DB').collect());
    await http.connect('http://127.0.0.1:8000', {
      namespace: 'facts_nf_missing_ns',
      database: 'x',
      authentication: auth,
    });
    const nsError = await caught(() => http.query('INFO FOR DB').collect());

    expect(dbError.constructor.name).toBe('NotFoundError');
    expect(dbError.databaseName).toBe('facts_nf_missing_db');
    expect(dbError.message).toBe("The database 'facts_nf_missing_db' does not exist");
    expect(nsError.constructor.name).toBe('NotFoundError');
    expect(nsError.namespaceName).toBe('facts_nf_missing_ns');
    expect(nsError.databaseName).toBeUndefined();
  });

  test('a socket connected with the database in its options reports the miss as a response error and defines nothing', async () => {
    const ws = new Surreal();
    sockets.push(ws);
    await ws.connect('ws://127.0.0.1:8000/rpc', {
      namespace: 'main',
      database: 'facts_nf_ws_options',
      authentication: { username: 'root', password: 'root' },
    });

    const [response] = await ws.query('INFO FOR DB').responses();
    const [info] = await run(await scratchHandle(), 'INFO FOR NS;');
    const databases = Object.keys((info!.result as { databases: Record<string, string> }).databases);

    expect(response!.success).toBe(false);
    const error = (response as { error: Thrown }).error;
    expect(error.constructor.name).toBe('NotFoundError');
    expect(error.databaseName).toBe('facts_nf_ws_options');
    expect(databases).not.toContain('facts_nf_ws_options');
  });

  test('contrast: use() on a socket defines the missing database, so INFO FOR DB then succeeds', async () => {
    const name = `facts_nf_use_${Date.now().toString(36)}`;
    const ws = new Surreal();
    sockets.push(ws);
    await ws.connect('ws://127.0.0.1:8000/rpc');
    await ws.signin({ username: 'root', password: 'root' });

    await ws.use({ namespace: 'main', database: name });
    const [info] = await ws.query('INFO FOR DB').collect();
    const handle = await scratchHandle();
    const [ns] = await run(handle, 'INFO FOR NS;');
    const defined = name in (ns!.result as { databases: Record<string, string> }).databases;
    await run(handle, `REMOVE DATABASE IF EXISTS ${name};`);

    expect(info).toBeDefined();
    expect(defined).toBe(true);
  });

  test('a live query on a missing table fails with a LiveSubscriptionError whose cause is the NotFoundError', async () => {
    const db = await open('nf_live');
    const surreal = await connect(db);

    const error = await caught(() => surreal.live(new Table('nosuchlive')));

    expect(error.constructor.name).toBe('LiveSubscriptionError');
    expect(error.cause?.constructor.name).toBe('NotFoundError');
    expect(error.cause?.details).toEqual({ kind: 'Table', details: { name: 'nosuchlive' } });
  });
});

describe('a refused actor', () => {
  test('an unauthenticated socket is NotAllowed with the actor named anonymous', async () => {
    const db = await open('anon', 'DEFINE TABLE t SCHEMAFULL;');
    const anonymous = new Surreal();
    sockets.push(anonymous);
    await anonymous.connect('ws://127.0.0.1:8000/rpc');
    await anonymous.use({ namespace: 'main', database: db.name });

    const error = await caught(() => anonymous.query('SELECT * FROM t').collect());

    expect(error.constructor.name).toBe('NotAllowedError');
    expect(error.details).toEqual({
      kind: 'Auth',
      details: { kind: 'NotAllowed', details: { action: 'process', actor: 'anonymous', resource: 'query' } },
    });
  });

  test('an authenticated user who lacks the right is NotAllowed with its own name as the actor, not anonymous', async () => {
    const db = await open('viewer', "DEFINE USER viewer ON DATABASE PASSWORD 'pw-not-real' ROLES VIEWER;");
    const viewer = new Surreal();
    sockets.push(viewer);
    await viewer.connect('ws://127.0.0.1:8000/rpc');
    await viewer.signin({ namespace: 'main', database: db.name, username: 'viewer', password: 'pw-not-real' });
    await viewer.use({ namespace: 'main', database: db.name });

    const error = await caught(() => viewer.query('DEFINE TABLE denied').collect());

    expect(error.constructor.name).toBe('NotAllowedError');
    const actor = JSON.stringify(error.details);
    expect(actor).toContain('viewer');
    expect(actor).not.toContain('anonymous');
  });
});

describe('a syntax error', () => {
  test('is a ValidationError whose message starts with "Parse error:" and carries no details', async () => {
    const db = await open('syntax');
    const surreal = await connect(db);

    const error = await caught(() => surreal.query('SELEC nope').collect());

    expect(error.constructor.name).toBe('ValidationError');
    expect(error.message).toStartWith('Parse error: ');
    expect(error.details).toBeUndefined();
  });
});

async function scratchHandle(): Promise<ScratchDatabase> {
  const handle = await open('handle');

  return handle;
}
