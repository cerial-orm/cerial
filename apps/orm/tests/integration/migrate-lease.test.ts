/**
 * The migration lease against the shared instance, each case in a scratch database of its own.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import { acquireLease, bootstrapStateTables, MIGRATION_LEASE_TABLE, withLease } from '../../src/migrations';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

async function connect(database?: string): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, {
    namespace: 'main',
    ...(database ? { database } : {}),
    authentication: { username: 'root', password: 'root' },
  });
  opened.push(db);

  return db;
}

async function scratch(label: string): Promise<{ db: Surreal; name: string }> {
  const name = `ls_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await connect();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);
  await bootstrapStateTables(db);

  return { db, name };
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const FAST = { leaseMs: 5000, waitMs: 30_000, pollMs: 20 };

async function leaseRows(db: Surreal): Promise<{ holder: string }[]> {
  const [rows] = await db.query(`SELECT holder FROM ${MIGRATION_LEASE_TABLE}`).collect<[{ holder: string }[]]>();

  return rows;
}

afterAll(async () => {
  const root = await connect();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
});

describe('migration lease', () => {
  test('12 concurrent acquirers: one holds at a time and each proceeds after release', async () => {
    const { name } = await scratch('conc');
    const conns = await Promise.all(Array.from({ length: 12 }, () => connect(name)));
    let inside = 0;
    let maxInside = 0;
    let done = 0;

    await Promise.all(
      conns.map((conn) =>
        withLease(
          conn,
          async () => {
            inside++;
            maxInside = Math.max(maxInside, inside);
            await sleep(15);
            inside--;
            done++;
          },
          FAST,
        ),
      ),
    );

    expect(maxInside).toBe(1);
    expect(done).toBe(12);
    expect(await leaseRows(conns[0]!)).toEqual([]);
  });

  test('a dead holder is reclaimed without a manual step and the reclaim is logged', async () => {
    const { db } = await scratch('dead');
    await db
      .query(`CREATE ${MIGRATION_LEASE_TABLE}:migrate SET holder = 'dead-holder', expiresAt = time::now() - 1s`)
      .collect();
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const lease = await acquireLease(db, FAST);
      expect((await leaseRows(db))[0]?.holder).toBe(lease.holder);
      expect(warn.mock.calls.some((call) => String(call[0]).includes('dead-holder'))).toBe(true);
      await lease.release();
    } finally {
      warn.mockRestore();
    }
  });

  test('a live holder is not stolen; a second acquirer times out naming the holder', async () => {
    const { db, name } = await scratch('live');
    const other = await connect(name);
    const first = await acquireLease(db, FAST);

    const error = await acquireLease(other, { leaseMs: 5000, waitMs: 200, pollMs: 20 }).catch((e) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as Error).message).toContain(first.holder);
    expect((error as Error).message).toContain('Waited');
    expect((await leaseRows(db))[0]?.holder).toBe(first.holder);
    await first.release();
  });

  test('the lease is released when the work throws', async () => {
    const { db } = await scratch('throw');

    await expect(
      withLease(
        db,
        async () => {
          throw new Error('apply failed');
        },
        FAST,
      ),
    ).rejects.toThrow('apply failed');

    expect(await leaseRows(db)).toEqual([]);
  });

  test('withLease renews during long work so a waiter is not let in', async () => {
    const { db, name } = await scratch('renew');
    const other = await connect(name);
    let stolen = false;

    await withLease(
      db,
      async () => {
        await sleep(700);
        stolen = await acquireLease(other, { leaseMs: 300, waitMs: 50, pollMs: 10 }).then(
          () => true,
          () => false,
        );
      },
      { leaseMs: 300, renewMs: 100, waitMs: 5000, pollMs: 20 },
    );

    expect(stolen).toBe(false);
  });

  test('a holder paused past expiry loses the lease: late release, renew and holder check', async () => {
    const { db, name } = await scratch('paused');
    const otherDb = await connect(name);
    const paused = await acquireLease(db, { leaseMs: 300, waitMs: 5000, pollMs: 20 });
    await sleep(500);
    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    const successor = await acquireLease(otherDb, FAST);
    warn.mockRestore();

    await paused.release();
    expect((await leaseRows(db))[0]?.holder).toBe(successor.holder);
    await expect(paused.renew()).rejects.toBeInstanceOf(CerialMigrationError);

    await db.query('DEFINE TABLE lease_probe SCHEMALESS').collect();
    const { query, bindings } = paused.holderCheck();
    const lost = await db
      .query(`BEGIN; CREATE lease_probe:1 SET x = 1; ${query}; COMMIT;`, bindings)
      .responses()
      .then((responses) => responses.some((r) => !r.success))
      .catch(() => true);
    expect(lost).toBe(true);
    const [probe] = await db.query('SELECT * FROM lease_probe').collect<[unknown[]]>();
    expect(probe).toEqual([]);

    const ok = successor.holderCheck();
    const responses = await db
      .query(`BEGIN; CREATE lease_probe:2 SET x = 1; ${ok.query}; COMMIT;`, ok.bindings)
      .responses();
    expect(responses.every((r) => r.success)).toBe(true);
    const [rows] = await db.query('SELECT * FROM lease_probe').collect<[unknown[]]>();
    expect(rows).toHaveLength(1);
    await successor.release();
  });
});

describe('a holder name taken from the database', () => {
  const HOSTILE = 'evil\u001b]0;pwned\u0007\nSECOND LINE';
  const bindings = { holder: HOSTILE };

  test('is rendered without raw control characters in the reclaim log', async () => {
    const { db } = await scratch('esc_reclaim');
    await db
      .query(`CREATE ${MIGRATION_LEASE_TABLE}:migrate SET holder = $holder, expiresAt = time::now() - 1s`, bindings)
      .collect();
    const warn = spyOn(console, 'warn').mockImplementation(() => {});

    try {
      const lease = await acquireLease(db, FAST);
      const logged = warn.mock.calls.map((call) => String(call[0])).find((text) => text.includes('Reclaimed'));
      expect(logged).toBeDefined();
      expect(logged).not.toMatch(/\p{Cc}/u);
      expect(logged).toContain('evil');
      await lease.release();
    } finally {
      warn.mockRestore();
    }
  });

  test('is rendered without raw control characters in the timeout error', async () => {
    const { db } = await scratch('esc_timeout');
    await db
      .query(`CREATE ${MIGRATION_LEASE_TABLE}:migrate SET holder = $holder, expiresAt = time::now() + 1h`, bindings)
      .collect();

    const error = await acquireLease(db, { leaseMs: 5000, waitMs: 60, pollMs: 10 }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialMigrationError);
    expect((error as Error).message).not.toMatch(/\p{Cc}/u);
    expect((error as Error).message).toContain('evil');
  });
});
