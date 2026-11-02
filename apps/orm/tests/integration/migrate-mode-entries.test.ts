/**
 * Every implicit entry that can reach a migration honours the migrations mode the same way: 'off' sends no DDL and
 * writes no state, 'auto' migrates, and 'verify' refuses an empty database at connect and connects to a matching one
 * without applying anything. Each case runs in a scratch database of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { CerialMigrationError, sql } from 'cerial';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

type Query = (...args: unknown[]) => Promise<unknown>;

interface ParentModel {
  create(args: object): Promise<{ id: unknown }>;
  findMany(args?: object): Promise<unknown[]>;
  deleteMany(args?: object): Promise<unknown>;
}
interface ProbeClient {
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  migrate(): Promise<void>;
  query(text: string): Promise<unknown>;
  $raw(fragment: unknown): PromiseLike<unknown>;
  $live(table: string): Promise<{ kill(): Promise<void> }>;
  $transaction(arg?: unknown): Promise<any>;
  EntryParent: ParentModel;
  EntryChild: { findMany(args?: object): Promise<unknown[]> };
}
type ClientClass = new (options?: { migrations?: unknown }) => ProbeClient;

const URL = 'http://127.0.0.1:8000';
const SCHEMA = `model EntryParent {
  id Record @id
  name String
  children Relation[] @model(EntryChild)
}

model EntryChild {
  id Record @id
  label String
  parentId Record
  parent Relation @field(parentId) @model(EntryParent)
}
`;

interface Entry {
  readonly name: string;
  readonly run: (client: ProbeClient) => Promise<unknown>;
}

const entries: readonly Entry[] = [
  { name: 'a model query', run: (c) => c.EntryParent.findMany() },
  {
    name: '$transaction in array mode',
    run: (c) => c.$transaction([c.EntryParent.findMany(), (_prev: unknown[]) => c.EntryChild.findMany()]),
  },
  {
    name: '$transaction in callback mode',
    run: (c) => c.$transaction(async (tx: ProbeClient) => tx.EntryParent.findMany()),
  },
  {
    name: '$transaction in manual mode',
    run: async (c) => {
      const tx = await c.$transaction();
      try {
        await (tx as unknown as ProbeClient).EntryParent.findMany();
      } finally {
        await tx.cancel();
      }
    },
  },
  { name: 'a raw statement', run: (c) => Promise.resolve(c.$raw(sql`RETURN 1`)) },
  {
    name: '$live',
    run: async (c) => {
      const handle = await c.$live('entry_parent');
      await handle.kill();
    },
  },
  {
    name: 'include',
    run: async (c) => {
      await c.EntryParent.create({ data: { name: 'p', children: { create: [{ label: 'c' }] } } });

      return c.EntryParent.findMany({ include: { children: true } });
    },
  },
  {
    name: 'a nested write',
    run: (c) => c.EntryParent.create({ data: { name: 'p', children: { create: [{ label: 'c' }] } } }),
  },
  {
    name: 'a delete cascade',
    run: async (c) => {
      await c.EntryParent.create({ data: { name: 'p', children: { create: [{ label: 'c' }] } } });
      await c.EntryParent.deleteMany({ where: { name: 'p' } });

      return c.EntryChild.findMany();
    },
  },
];

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
  const name = `entry_${label}_${process.pid}_${Date.now().toString(36)}`;
  const root = await admin();
  try {
    await root.query(`DEFINE DATABASE ${name}`).collect();
  } finally {
    await root.close();
  }
  databases.push(name);

  return name;
}

async function tablesOf(database: string): Promise<string[]> {
  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    const [info] = await root.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

    return Object.keys(info.tables);
  } finally {
    await root.close();
  }
}

/** Every query text any socket sends while `run` executes, connect() included. */
async function recording<T>(
  run: () => Promise<T>,
): Promise<{ texts: string[]; result: T | undefined; error: unknown }> {
  const texts: string[] = [];
  const original = Surreal.prototype.query;
  Surreal.prototype.query = function (this: Surreal, ...args: unknown[]) {
    if (typeof args[0] === 'string') texts.push(args[0]);

    return (original as Query).apply(this, args);
  } as typeof original;
  try {
    return { texts, result: await run(), error: undefined };
  } catch (error) {
    return { texts, result: undefined, error };
  } finally {
    Surreal.prototype.query = original;
  }
}

const schemaAccess = (texts: string[]): string[] =>
  texts.filter((text) => /\b(DEFINE|REMOVE|ALTER)\b/.test(text) || text.includes('_cerial_'));

function make(mode: string): ProbeClient {
  const client = new Client({ migrations: mode });
  opened.push(client);

  return client;
}

async function migrated(label: string): Promise<string> {
  const database = await scratch(label);
  const client = make('auto');
  await client.connect(configFor(database));
  await client.migrate();
  await client.disconnect();

  return database;
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'mode-entries-'));
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

for (const entry of entries) {
  describe(`migrations modes through ${entry.name}`, () => {
    test("'off' sends no DDL and creates no migration state table", async () => {
      const database = await scratch('off');
      const client = make('off');
      await client.connect(configFor(database));
      // The entry may fail, since no table exists; what it must not do is define one.
      const { texts } = await recording(() => entry.run(client).catch(() => undefined));

      expect(schemaAccess(texts)).toEqual([]);
      expect((await tablesOf(database)).filter((table) => table.includes('_cerial_'))).toEqual([]);
    });

    test("'auto' migrates an empty database", async () => {
      const database = await scratch('auto');
      const client = make('auto');
      await client.connect(configFor(database));
      const { texts, error } = await recording(() => entry.run(client));

      expect(error).toBeUndefined();
      expect(schemaAccess(texts).length).toBeGreaterThan(0);
      expect(await tablesOf(database)).toContain('entry_parent');
    });

    test("'verify' refuses an empty database at connect and sends no DDL", async () => {
      const database = await scratch('verifyempty');
      const client = make('verify');
      const { texts, error } = await recording(() => client.connect(configFor(database)));

      expect(error).toBeInstanceOf(CerialMigrationError);
      expect(schemaAccess(texts)).toEqual([]);
      expect(await tablesOf(database)).toEqual([]);
    });

    test("'verify' connects to a matching database and runs the entry with no DDL", async () => {
      const database = await migrated('verifyok');
      const before = await tablesOf(database);
      const client = make('verify');
      const { texts, error } = await recording(async () => {
        await client.connect(configFor(database));

        return entry.run(client);
      });

      expect(error).toBeUndefined();
      expect(schemaAccess(texts)).toEqual([]);
      expect(await tablesOf(database)).toEqual(before);
    });
  });
}
