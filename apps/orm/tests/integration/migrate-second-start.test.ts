/**
 * A client that starts on a database an earlier client migrated trusts the persisted state: it sends no model DDL,
 * on every entry that used to migrate. Each case runs in a scratch database of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { CerialDatabaseError, sql } from 'cerial';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

type Query = (...args: unknown[]) => Promise<unknown>;

interface ProbeClient {
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  migrate(): Promise<void>;
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
const CHANGED = BASE.replace('title String', 'title String\n  extra String?');

let base: string;
let V1: ClientClass;
let V2: ClientClass;
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

async function expectNoDdl(Client: ClientClass, label: string, run: (client: ProbeClient) => Promise<unknown>) {
  const database = await scratch(label);
  await prime(Client, database);

  const second = await start(Client, database);
  const watcher = watch([second]);
  try {
    await run(second);
  } finally {
    watcher.stop();
  }

  expect(modelDdl(watcher.texts)).toEqual([]);
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'second-start-'));
  V1 = await generateClient('v1', BASE);
  V2 = await generateClient('v2', CHANGED);
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

describe('a second client on a migrated database sends no model DDL', () => {
  test('through a model query', () => expectNoDdl(V1, 'model', (c) => c.SecondAlpha.findMany()));

  test('through query', () => expectNoDdl(V1, 'query', (c) => c.query('RETURN 1')));

  test('through $raw', () => expectNoDdl(V1, 'raw', (c) => Promise.resolve(c.$raw(sql`RETURN 1`))));

  test('through $live', () =>
    expectNoDdl(V1, 'live', async (c) => {
      const handle = await c.$live('second_alpha');
      await handle.kill();
    }));

  test('through $transaction in array mode', () =>
    expectNoDdl(V1, 'txarray', (c) =>
      c.$transaction([c.SecondAlpha.findMany(), (_prev: unknown[]) => c.SecondBeta.findMany()]),
    ));

  test('through $transaction in callback mode', () =>
    expectNoDdl(V1, 'txcb', (c) => c.$transaction(async (tx: ProbeClient) => tx.SecondAlpha.findMany())));

  test('through $transaction in manual mode', () =>
    expectNoDdl(V1, 'txmanual', async (c) => {
      const tx = await c.$transaction();
      await (tx as unknown as ProbeClient).SecondAlpha.findMany();
      await tx.commit();
    }));

  test('and does send DDL when the database was never migrated (the spy can fail)', async () => {
    const database = await scratch('fresh');
    const client = await start(V1, database);
    const watcher = watch([client]);
    try {
      await client.SecondAlpha.findMany();
    } finally {
      watcher.stop();
    }

    expect(modelDdl(watcher.texts).length).toBeGreaterThan(0);
  });
});

describe('a schema change', () => {
  test('applies only the changed model', async () => {
    const database = await scratch('change');
    await prime(V1, database);

    const client = await start(V2, database);
    const watcher = watch([client]);
    try {
      await client.query('RETURN 1');
    } finally {
      watcher.stop();
    }

    const ddl = modelDdl(watcher.texts).join('\n');
    expect(ddl).toContain('second_beta');
    expect(ddl).not.toContain('second_alpha');

    const root = await admin();
    try {
      await root.use({ namespace: 'main', database });
      const [info] = await root.query('INFO FOR TABLE second_beta').collect<[{ fields: Record<string, string> }]>();
      expect(Object.keys(info.fields)).toContain('extra');
    } finally {
      await root.close();
    }
  });

  test('applies nothing once the changed model has been applied', async () => {
    const database = await scratch('changedtwice');
    await prime(V1, database);
    await prime(V2, database);

    await expectNoDdlOn(V2, database);
  });
});

async function expectNoDdlOn(Client: ClientClass, database: string): Promise<void> {
  const client = await start(Client, database);
  const watcher = watch([client]);
  try {
    await client.query('RETURN 1');
  } finally {
    watcher.stop();
  }

  expect(modelDdl(watcher.texts)).toEqual([]);
}

describe('clients starting at once', () => {
  test('issue the DDL once', async () => {
    const database = await scratch('race');
    const clients = await Promise.all([start(V1, database), start(V1, database), start(V1, database)]);
    const watcher = watch(clients);
    try {
      await Promise.all(clients.map((c) => c.query('RETURN 1')));
    } finally {
      watcher.stop();
    }

    expect(modelDdl(watcher.texts)).toHaveLength(1);
  });
});

describe('a table dropped by hand with its state intact', () => {
  test('fails on the query as a database error, and migrate() repairs it', async () => {
    const database = await scratch('dropped');
    await prime(V1, database);

    const root = await admin();
    try {
      await root.use({ namespace: 'main', database });
      await root.query('REMOVE TABLE second_alpha').collect();

      const trusting = await start(V1, database);
      const error = await trusting.SecondAlpha.findMany().catch((e: unknown) => e);
      expect(error).toBeInstanceOf(CerialDatabaseError);

      // A client that has not skipped anything yet: forcing a client that already trusted the state is not covered here.
      const repairing = await start(V1, database);
      await repairing.migrate();
      expect(await repairing.SecondAlpha.findMany()).toEqual([]);

      const [info] = await root.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
      expect(Object.keys(info.tables)).toContain('second_alpha');
    } finally {
      await root.close();
    }
  });
});
