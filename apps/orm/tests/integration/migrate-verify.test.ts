/**
 * Under migrations: 'verify' connect() compares the live schema with the generated one, applies nothing and refuses
 * a difference by naming it. Each case runs in a scratch database of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { CerialMigrationError, sql } from 'cerial';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

type Query = (...args: unknown[]) => Promise<unknown>;

interface ProbeClient {
  readonly isConnected: boolean;
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  migrate(): Promise<void>;
  query(text: string): Promise<unknown>;
  $raw(fragment: unknown): PromiseLike<unknown>;
  $live(table: string): Promise<{ kill(): Promise<void> }>;
  $transaction(arg?: unknown): Promise<any>;
  VerAlpha: { findMany(args?: object): Promise<unknown[]>; create(args: object): Promise<unknown> };
  VerBeta: { findMany(args?: object): Promise<unknown[]> };
}
type ClientClass = new (options?: { migrations?: unknown }) => ProbeClient;

const URL = 'http://127.0.0.1:8000';
const SCHEMA = `model VerAlpha {
  id Record @id
  name String
}

model VerBeta {
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
  const name = `ver_${label}_${process.pid}_${Date.now().toString(36)}`;
  const root = await admin();
  try {
    await root.query(`DEFINE DATABASE ${name}`).collect();
  } finally {
    await root.close();
  }
  databases.push(name);

  return name;
}

/** Runs SurrealQL against a scratch database as the operator would, outside any client. */
async function sh(database: string, text: string): Promise<void> {
  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    await root.query(text).collect();
  } finally {
    await root.close();
  }
}

/** Everything the database defines, as the server reports it: tables, then each table's fields and indexes. */
async function snapshot(database: string): Promise<unknown> {
  const root = await admin();
  try {
    await root.use({ namespace: 'main', database });
    const [info] = await root.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
    const tables: Record<string, unknown> = {};
    for (const name of Object.keys(info.tables)) {
      const [table] = await root.query(`INFO FOR TABLE ${name}`).collect<[unknown]>();
      tables[name] = table;
    }

    return { info, tables };
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

const writes = (texts: string[]): string[] =>
  texts.filter(
    (text) =>
      /\b(DEFINE|REMOVE|ALTER)\b/.test(text) || /\b(CREATE|UPSERT|UPDATE|INSERT|DELETE)\b[^;]*_cerial_/.test(text),
  );

async function start(mode: string | undefined, database: string): Promise<ProbeClient> {
  const client = new Client(mode === undefined ? undefined : { migrations: mode });
  opened.push(client);
  await client.connect(configFor(database));

  return client;
}

/** The refusal connect() throws for a database that differs, and the recording of what it sent. */
async function refusal(
  database: string,
): Promise<{ error: CerialMigrationError; texts: string[]; client: ProbeClient }> {
  const client = new Client({ migrations: 'verify' });
  opened.push(client);
  const { texts, error } = await recording(() => client.connect(configFor(database)));
  expect(error).toBeInstanceOf(CerialMigrationError);

  return { error: error as CerialMigrationError, texts, client };
}

async function migrated(label: string): Promise<string> {
  const database = await scratch(label);
  const client = await start('auto', database);
  await client.migrate();
  await client.disconnect();

  return database;
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'verify-mode-'));
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

describe("migrations: 'verify' over a database that matches", () => {
  test('connects and every implicit entry proceeds with no DDL and no state write', async () => {
    const database = await migrated('insync');
    const before = await snapshot(database);

    const client = new Client({ migrations: 'verify' });
    opened.push(client);
    const { texts, error } = await recording(async () => {
      await client.connect(configFor(database));
      await client.VerAlpha.create({ data: { name: 'a' } });
      expect(await client.VerAlpha.findMany()).toHaveLength(1);
      await client.VerBeta.findMany();
      await client.query('RETURN 1');
      await client.$raw(sql`RETURN 1`);
      const live = await client.$live('ver_alpha');
      await live.kill();
      await client.$transaction([client.VerAlpha.findMany(), (_prev: unknown[]) => client.VerBeta.findMany()]);
      await client.$transaction(async (tx: ProbeClient) => tx.VerAlpha.findMany());
      const tx = await client.$transaction();
      try {
        await (tx as unknown as ProbeClient).VerAlpha.findMany();
      } finally {
        await tx.cancel();
      }
    });

    expect(error).toBeUndefined();
    expect(writes(texts)).toEqual([]);
    expect(await snapshot(database)).toEqual(before);
  });

  test('an unmanaged event and an unmanaged table do not refuse', async () => {
    const database = await migrated('unmanaged');
    await sh(database, 'DEFINE EVENT ver_audit ON TABLE ver_alpha WHEN true THEN (RETURN 1)');
    await sh(database, 'DEFINE TABLE ver_foreign SCHEMALESS');

    const client = await start('verify', database);

    expect(client.isConnected).toBe(true);
  });
});

describe("migrations: 'verify' over a database that differs", () => {
  test('a missing table is refused by name, with the plan, and nothing is written', async () => {
    const database = await scratch('notable');
    const before = await snapshot(database);

    const { error, texts } = await refusal(database);

    expect(error.message).toContain('ver_alpha');
    expect(error.message).toContain('ver_beta');
    expect(error.message).toContain('additive');
    expect(error.plan?.some((item) => item.statement?.startsWith('DEFINE TABLE') && item.table === 'ver_alpha')).toBe(
      true,
    );
    expect(writes(texts)).toEqual([]);
    expect(await snapshot(database)).toEqual(before);
  });

  test('a missing field is refused naming table, field and class', async () => {
    const database = await migrated('nofield');
    await sh(database, 'REMOVE FIELD title ON TABLE ver_beta');
    const before = await snapshot(database);

    const { error, texts } = await refusal(database);

    expect(error.message).toContain('field `title` on table `ver_beta`');
    expect(error.message).toContain('[destructive]');
    expect(error.message).not.toContain('ver_alpha');
    expect(error.plan?.map((item) => item.statement)).toEqual([
      expect.stringContaining('DEFINE FIELD OVERWRITE title ON TABLE ver_beta'),
    ]);
    expect(writes(texts)).toEqual([]);
    expect(await snapshot(database)).toEqual(before);
  });

  test('a hand-added field is refused too', async () => {
    const database = await migrated('extrafield');
    await sh(database, 'DEFINE FIELD nickname ON TABLE ver_alpha TYPE string');
    const before = await snapshot(database);

    const { error, texts } = await refusal(database);

    expect(error.message).toContain('nickname');
    expect(error.message).toContain('ver_alpha');
    expect(writes(texts)).toEqual([]);
    expect(await snapshot(database)).toEqual(before);
  });

  test('a changed field type is refused', async () => {
    const database = await migrated('changed');
    await sh(database, 'DEFINE FIELD OVERWRITE name ON TABLE ver_alpha TYPE int');

    const { error } = await refusal(database);

    expect(error.message).toContain('name');
    expect(error.message).toContain('ver_alpha');
  });

  test('the refused client is not left connected, and connects once the schema is fixed', async () => {
    const database = await migrated('recover');
    await sh(database, 'REMOVE FIELD title ON TABLE ver_beta');
    const { client } = await refusal(database);

    expect(client.isConnected).toBe(false);
    await sh(database, 'DEFINE FIELD title ON TABLE ver_beta TYPE string');
    // The generated definition is OVERWRITE with the same type; an equal definition is what the differ accepts.
    const fixed = await start('auto', database);
    await fixed.migrate();
    await fixed.disconnect();
    await client.connect(configFor(database));

    expect(client.isConnected).toBe(true);
    expect(await client.VerBeta.findMany()).toEqual([]);
  });
});

describe("migrations: 'auto' meets the same cases and migrates", () => {
  test('an empty database is migrated on first use', async () => {
    const database = await scratch('autoempty');
    const client = await start('auto', database);
    const { texts } = await recording(() => client.VerAlpha.findMany());

    expect(writes(texts).length).toBeGreaterThan(0);
    expect(Object.keys(((await snapshot(database)) as { tables: object }).tables)).toContain('ver_alpha');
  });

  test('a removed field is defined again on first use', async () => {
    const database = await migrated('autofield');
    await sh(database, 'REMOVE FIELD title ON TABLE ver_beta');
    const client = await start('auto', database);
    await client.migrate();

    await expect(start('verify', database)).resolves.toBeDefined();
  });
});
