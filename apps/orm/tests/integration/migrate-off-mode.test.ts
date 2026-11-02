/**
 * Under migrations: 'off' no implicit entry sends DDL or touches the migration state; an explicit migrate() still runs.
 * Each case runs in a scratch database of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { CerialValidationError, sql } from 'cerial';
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
  OffAlpha: { findMany(args?: object): Promise<unknown[]>; create(args: object): Promise<unknown> };
  OffBeta: { findMany(args?: object): Promise<unknown[]> };
}
type ClientClass = new (options?: { migrations?: unknown }) => ProbeClient;

const URL = 'http://127.0.0.1:8000';
const SCHEMA = `model OffAlpha {
  id Record @id
  name String
}

model OffBeta {
  id Record @id
  title String
}
`;

let base: string;
let Client: ClientClass;
const databases: string[] = [];
const opened: ProbeClient[] = [];

function configFor(database: string): ConnectionConfig {
  return { url: URL, namespace: 'main', database, auth: { username: 'root', password: 'root' } };
}

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });

  return db;
}

async function scratch(label: string): Promise<string> {
  const name = `off_${label}_${process.pid}_${Date.now().toString(36)}`;
  const root = await admin();
  try {
    await root.query(`DEFINE DATABASE ${name}`).collect();
  } finally {
    await root.close();
  }
  databases.push(name);

  return name;
}

async function start(mode: string | undefined, database: string): Promise<ProbeClient> {
  const client = new Client(mode === undefined ? undefined : { migrations: mode });
  await client.connect(configFor(database));
  opened.push(client);

  return client;
}

/** Records the text of every query sent while it is installed, on every socket the client uses. */
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

const schemaAccess = (texts: string[]): string[] =>
  texts.filter((text) => text.includes('DEFINE') || text.includes('_cerial_'));

/** Runs one entry against an empty database under 'off'; the entry may fail, since no table exists. */
async function expectUntouched(label: string, run: (client: ProbeClient) => Promise<unknown>): Promise<void> {
  const database = await scratch(label);
  const client = await start('off', database);
  const watcher = watch([client]);
  try {
    await run(client).catch(() => undefined);
  } finally {
    watcher.stop();
  }

  expect(schemaAccess(watcher.texts)).toEqual([]);

  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    const [info] = await root.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
    // A write may create its table implicitly; the state tables must not exist.
    expect(Object.keys(info.tables).filter((table) => table.includes('_cerial_'))).toEqual([]);
  } finally {
    await root.close();
  }
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'off-mode-'));
  await Bun.write(join(base, 'schemas', 'a.cerial'), SCHEMA);
  const result = await generateSingleSchema({
    schemaPath: join(base, 'schemas'),
    outputDir: join(base, 'out'),
    logLevel: 'minimal',
  });
  expect(result.success).toBe(true);
  Client = ((await import(join(base, 'out', 'index.ts'))) as { CerialClient: ClientClass }).CerialClient;
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

describe("migrations: 'off' sends no DDL and touches no state", () => {
  test('through a model query', () => expectUntouched('model', (c) => c.OffAlpha.findMany()));

  test('through a model write', () => expectUntouched('write', (c) => c.OffAlpha.create({ data: { name: 'a' } })));

  test('through query', () => expectUntouched('query', (c) => c.query('RETURN 1')));

  test('through $raw', () => expectUntouched('raw', (c) => Promise.resolve(c.$raw(sql`RETURN 1`))));

  test('through $live', () =>
    expectUntouched('live', async (c) => {
      const handle = await c.$live('off_alpha');
      await handle.kill();
    }));

  test('through $transaction in array mode', () =>
    expectUntouched('txarray', (c) =>
      c.$transaction([c.OffAlpha.findMany(), (_prev: unknown[]) => c.OffBeta.findMany()]),
    ));

  test('through $transaction in callback mode', () =>
    expectUntouched('txcb', (c) => c.$transaction(async (tx: ProbeClient) => tx.OffAlpha.findMany())));

  test('through $transaction in manual mode', () =>
    expectUntouched('txmanual', async (c) => {
      const tx = await c.$transaction();
      try {
        await (tx as unknown as ProbeClient).OffAlpha.findMany();
      } finally {
        await tx.cancel();
      }
    }));
});

describe("migrations: 'off' next to a migrated database and an explicit migrate()", () => {
  test('queries a migrated database normally', async () => {
    const database = await scratch('migrated');
    const first = await start(undefined, database);
    await first.migrate();

    const client = await start('off', database);
    const watcher = watch([client]);
    try {
      await client.OffAlpha.create({ data: { name: 'a' } });
      expect(await client.OffAlpha.findMany()).toHaveLength(1);
    } finally {
      watcher.stop();
    }

    expect(schemaAccess(watcher.texts)).toEqual([]);
  });

  test('migrate() still applies the schema', async () => {
    const database = await scratch('explicit');
    const client = await start('off', database);
    await client.migrate();

    expect(await client.OffAlpha.findMany()).toEqual([]);
    const root = await admin();
    try {
      await root.use({ namespace: 'main', database });
      const [info] = await root.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
      expect(Object.keys(info.tables)).toContain('off_alpha');
    } finally {
      await root.close();
    }
  });
});

describe('the default mode still migrates', () => {
  for (const mode of [undefined, 'auto']) {
    test(`with the option ${mode === undefined ? 'absent' : "set to 'auto'"}`, async () => {
      const database = await scratch(`default${mode ?? 'none'}`);
      const client = await start(mode, database);
      const watcher = watch([client]);
      try {
        expect(await client.OffAlpha.findMany()).toEqual([]);
      } finally {
        watcher.stop();
      }

      expect(schemaAccess(watcher.texts).length).toBeGreaterThan(0);
    });
  }
});

describe('an invalid migrations value', () => {
  for (const value of ['lazy', 'OFF', '', null, 1, true]) {
    test(`${JSON.stringify(value)} is refused by the constructor`, () => {
      let error: unknown;
      try {
        new Client({ migrations: value });
      } catch (e) {
        error = e;
      }

      expect(error).toBeInstanceOf(CerialValidationError);
      const message = (error as Error).message;
      expect(message).toContain('migrations');
      for (const allowed of ["'auto'", "'verify'", "'off'"]) expect(message).toContain(allowed);
    });
  }
});
