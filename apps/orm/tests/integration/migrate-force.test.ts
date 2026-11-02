/**
 * The public migrate() applies every model whatever the client or the persisted state holds, and leaves state for
 * later clients; resetMigrationState() makes the next apply ignore persisted state. Each case runs in a scratch
 * database of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { CerialDatabaseError } from 'cerial';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

type Query = (...args: unknown[]) => Promise<unknown>;

interface ProbeClient {
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  migrate(): Promise<void>;
  resetMigrationState(): void;
  query(text: string): Promise<unknown>;
  $raw(fragment: unknown): PromiseLike<unknown>;
  $live(table: string): Promise<{ kill(): Promise<void> }>;
  $transaction(arg?: unknown): Promise<any>;
  getSurreal(): { query: Query } | null;
  getTransactionSurreal(): { query: Query } | null;
  SecondAlpha: { findMany(args?: object): Promise<unknown[]>; create(args: object): Promise<unknown> };
  SecondBeta: { findMany(args?: object): Promise<unknown[]> };
}
type ClientClass = new () => ProbeClient;

const URL = 'http://127.0.0.1:8000';
const BASE = `model SecondAlpha {
  id Record @id
  name String
}

model SecondBeta {
  id Record @id
  title String
}
`;

let base: string;
let V1: ClientClass;
const databases: string[] = [];
const opened: ProbeClient[] = [];

function configFor(database: string): ConnectionConfig {
  return { url: URL, namespace: 'main', database, auth: { username: 'root', password: 'root' } };
}

async function generateClient(name: string, schema: string): Promise<ClientClass> {
  await Bun.write(join(base, name, 'schemas', 'a.cerial'), schema);
  const result = await generateSingleSchema({
    schemaPath: join(base, name, 'schemas'),
    outputDir: join(base, name, 'out'),
    logLevel: 'minimal',
  });
  expect(result.success).toBe(true);

  return ((await import(join(base, name, 'out', 'index.ts'))) as { CerialClient: ClientClass }).CerialClient;
}

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });

  return db;
}

async function scratch(label: string): Promise<string> {
  const name = `ss_${label}_${process.pid}_${Date.now().toString(36)}`;
  const root = await admin();
  try {
    await root.query(`DEFINE DATABASE ${name}`).collect();
  } finally {
    await root.close();
  }
  databases.push(name);

  return name;
}

async function start(Client: ClientClass, database: string): Promise<ProbeClient> {
  const client = new Client();
  await client.connect(configFor(database));
  opened.push(client);

  return client;
}

/** Records the text of every query sent while it is installed, on every socket the clients use (pooled clients share one). */
function watch(clients: ProbeClient[]): { texts: string[]; stop(): void } {
  const sockets = [...new Set(clients.flatMap((c) => [c.getSurreal(), c.getTransactionSurreal()]).filter((s) => !!s))];
  const texts: string[] = [];
  const originals = sockets.map((s) => s!.query);
  sockets.forEach((socket, i) => {
    socket!.query = ((...args: unknown[]) => {
      if (typeof args[0] === 'string') texts.push(args[0]);

      return originals[i]!.apply(socket, args);
    }) as Query;
  });

  return {
    texts,
    stop: () => sockets.forEach((socket, i) => (socket!.query = originals[i]!)),
  };
}

// The state tables' own bootstrap is not model DDL.
const modelDdl = (texts: string[]): string[] =>
  texts.filter((text) => text.includes('DEFINE') && !text.includes('IF NOT EXISTS _cerial_migration'));

/** Migrates the whole schema with a first client, the way an earlier process would have. */
async function prime(Client: ClientClass, database: string): Promise<void> {
  const first = await start(Client, database);
  await first.query('RETURN 1');
  await first.disconnect();
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'migrate-force-'));
  V1 = await generateClient('v1', BASE);
});

afterAll(async () => {
  for (const client of opened) await client.disconnect().catch(() => {});
  const root = await admin();
  try {
    for (const name of databases) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  } finally {
    await root.close();
  }
  await rm(base, { recursive: true, force: true });
});

async function tableNames(database: string): Promise<string[]> {
  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    const [info] = await root.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

    return Object.keys(info.tables);
  } finally {
    await root.close();
  }
}

async function dropTable(database: string, table: string): Promise<void> {
  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    await root.query(`REMOVE TABLE ${table}`).collect();
  } finally {
    await root.close();
  }
}

async function stateRows(database: string): Promise<Array<{ id: unknown; fingerprint: string; kind: string }>> {
  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    const [rows] = await root
      .query('SELECT id, kind, fingerprint FROM _cerial_migrations')
      .collect<[Array<{ id: unknown; fingerprint: string; kind: string }>]>();

    return rows;
  } finally {
    await root.close();
  }
}

/** A client that has already read the state and skipped by it. */
async function trusting(database: string): Promise<ProbeClient> {
  await prime(V1, database);
  const client = await start(V1, database);
  const watcher = watch([client]);
  try {
    await client.SecondAlpha.findMany();
  } finally {
    watcher.stop();
  }
  expect(modelDdl(watcher.texts)).toEqual([]);

  return client;
}

describe('migrate() forces', () => {
  test('recreates a dropped table on a client that had skipped by state, with state intact', async () => {
    const database = await scratch('force');
    const client = await trusting(database);
    const before = await stateRows(database);

    await dropTable(database, 'second_alpha');
    expect(await tableNames(database)).not.toContain('second_alpha');

    await client.migrate();

    expect(await tableNames(database)).toContain('second_alpha');
    expect(await client.SecondAlpha.findMany()).toEqual([]);
    const after = await stateRows(database);
    expect(after.filter((row) => row.kind === 'model')).toHaveLength(2);
    expect(
      after
        .filter((row) => row.kind === 'model')
        .map((row) => row.fingerprint)
        .sort(),
    ).toEqual(
      before
        .filter((row) => row.kind === 'model')
        .map((row) => row.fingerprint)
        .sort(),
    );
  });

  test('applies again on the same client when nothing changed, as one batch', async () => {
    const database = await scratch('again');
    const client = await start(V1, database);
    await client.migrate();

    const watcher = watch([client]);
    try {
      await client.migrate();
    } finally {
      watcher.stop();
    }

    expect(modelDdl(watcher.texts).length).toBeGreaterThan(0);
  });

  test('writes the real schema fingerprint, the same on every database, which a lazy start leaves empty', async () => {
    const lazy = await scratch('lazyfp');
    await prime(V1, lazy);
    const forced = await scratch('forcedfp');
    await (await start(V1, forced)).migrate();
    const forcedAgain = await scratch('forcedfp2');
    await (await start(V1, forcedAgain)).migrate();

    const schemaFingerprint = async (database: string) =>
      (await stateRows(database)).find((row) => row.kind === 'schema')?.fingerprint;

    expect(await schemaFingerprint(lazy)).toBe('');
    expect(await schemaFingerprint(forced)).toMatch(/^[0-9a-f]{64}$/);
    expect(await schemaFingerprint(forced)).toBe(await schemaFingerprint(forcedAgain));
  });

  test('a new client sends no DDL after migrate()', async () => {
    const database = await scratch('after');
    await (await start(V1, database)).migrate();

    const next = await start(V1, database);
    const watcher = watch([next]);
    try {
      await next.SecondAlpha.findMany();
      await next.SecondBeta.findMany();
    } finally {
      watcher.stop();
    }

    expect(modelDdl(watcher.texts)).toEqual([]);
  });
});

describe('resetMigrationState() bypasses persisted state', () => {
  test('lazy access with a matching state row re-applies a dropped table', async () => {
    const database = await scratch('reset');
    const client = await trusting(database);

    await dropTable(database, 'second_alpha');
    client.resetMigrationState();

    expect(await client.SecondAlpha.findMany()).toEqual([]);
    expect(await tableNames(database)).toContain('second_alpha');
  });

  test('without a reset the same client fails on the dropped table', async () => {
    const database = await scratch('noreset');
    const client = await trusting(database);

    await dropTable(database, 'second_alpha');

    expect(await client.SecondAlpha.findMany().catch((e: unknown) => e)).toBeInstanceOf(CerialDatabaseError);
  });
});
