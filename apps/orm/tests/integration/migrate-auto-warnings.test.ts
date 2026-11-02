/**
 * Under migrations: 'auto' a production process is told once that 'verify' is the production setting, and a model
 * whose schema changed since it was applied is announced with the plan before it is applied as always.
 * Each case runs in a scratch database of its own.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, spyOn, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { resetProductionWarning } from 'cerial';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

type Query = (...args: unknown[]) => Promise<unknown>;

interface ProbeClient {
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  query(text: string): Promise<unknown>;
  getSurreal(): { query: Query } | null;
  getTransactionSurreal(): { query: Query } | null;
  WarnAlpha: { findMany(args?: object): Promise<unknown[]> };
}
type ClientClass = new (options?: { migrations?: unknown }) => ProbeClient;

const URL = 'http://127.0.0.1:8000';
const BASE = `model WarnAlpha {
  id Record @id
  name String
}

model WarnBeta {
  id Record @id
  title String
}
`;
const CHANGED = BASE.replace('title String', 'title Int');

let base: string;
let V1: ClientClass;
let V2: ClientClass;
const databases: string[] = [];
const opened: ProbeClient[] = [];
const originalEnv = process.env.NODE_ENV;
let warn: ReturnType<typeof spyOn<Console, 'warn'>>;

const warnings = (): string[] => warn.mock.calls.map((call) => String(call[0]));
const productionWarnings = (): string[] => warnings().filter((text) => text.includes('NODE_ENV'));

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
  const name = `aw_${label}_${process.pid}_${Date.now().toString(36)}`;
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

async function prime(Client: ClientClass, database: string): Promise<void> {
  const first = await start(Client, database);
  await first.query('RETURN 1');
  await first.disconnect();
}

/** Records the text of every query sent while it is installed. */
function watch(client: ProbeClient): { texts: string[]; stop(): void } {
  const sockets = [...new Set([client.getSurreal(), client.getTransactionSurreal()].filter((s) => !!s))];
  const texts: string[] = [];
  const originals = sockets.map((s) => s!.query);
  sockets.forEach((socket, i) => {
    socket!.query = ((...args: unknown[]) => {
      if (typeof args[0] === 'string') texts.push(args[0]);

      return originals[i]!.apply(socket, args);
    }) as Query;
  });

  return { texts, stop: () => sockets.forEach((socket, i) => (socket!.query = originals[i]!)) };
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'auto-warnings-'));
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

beforeEach(() => {
  resetProductionWarning();
  warn = spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
  if (originalEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv;
  resetProductionWarning();
});

describe('the production warning', () => {
  test('fires once for two auto clients in one process and names verify', () => {
    process.env.NODE_ENV = 'production';
    new V1();
    new V1({ migrations: 'auto' });

    const found = productionWarnings();
    expect(found).toHaveLength(1);
    expect(found[0]).toContain("'verify'");
  });

  test('fires again after the record is reset', () => {
    process.env.NODE_ENV = 'production';
    new V1();
    resetProductionWarning();
    new V1();

    expect(productionWarnings()).toHaveLength(2);
  });

  test("does not fire under 'verify' or 'off'", () => {
    process.env.NODE_ENV = 'production';
    new V1({ migrations: 'verify' });
    new V1({ migrations: 'off' });

    expect(productionWarnings()).toEqual([]);
  });

  test('does not fire outside production', () => {
    process.env.NODE_ENV = 'development';
    new V1();
    process.env.NODE_ENV = 'test';
    new V1();
    delete process.env.NODE_ENV;
    new V1();

    expect(productionWarnings()).toEqual([]);
  });

  test('an invalid mode throws without the warning', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new V1({ migrations: 'bogus' })).toThrow();

    expect(productionWarnings()).toEqual([]);
  });
});

describe('the changed-schema warning', () => {
  test('a changed type under auto still applies and warns with the plan', async () => {
    const database = await scratch('changed');
    await prime(V1, database);

    const client = await start(V2, database);
    await client.query('RETURN 1');

    const found = warnings().filter((text) => text.includes('Plan:'));
    expect(found).toHaveLength(1);
    expect(found[0]).toContain('warn_beta');
    expect(found[0]).toContain('title');
    expect(found[0]).not.toContain('warn_alpha');

    const root = await admin();
    try {
      await root.use({ namespace: 'main', database });
      const [info] = await root.query('INFO FOR TABLE warn_beta').collect<[{ fields: Record<string, string> }]>();
      expect(info.fields.title).toContain('int');
    } finally {
      await root.close();
    }
  });

  test('a fresh database warns nothing', async () => {
    const database = await scratch('fresh');
    const client = await start(V1, database);
    await client.query('RETURN 1');

    expect(warnings().filter((text) => text.includes('Plan:'))).toEqual([]);
  });

  test('an unchanged fingerprint sends no INFO statement and warns nothing', async () => {
    const database = await scratch('same');
    await prime(V1, database);

    const client = await start(V1, database);
    const watcher = watch(client);
    try {
      await client.WarnAlpha.findMany();
      await client.query('RETURN 1');
    } finally {
      watcher.stop();
    }

    // The state read's own `INFO FOR DB` is the one existing statement; the diff's reads are `INFO FOR DB STRUCTURE` and table infos.
    expect(watcher.texts.filter((text) => text.includes('INFO') && text.trim() !== 'INFO FOR DB')).toEqual([]);
    expect(warnings()).toEqual([]);
  });

  test('the diff is read when a fingerprint changed (the spy can fail)', async () => {
    const database = await scratch('spy');
    await prime(V1, database);

    const client = await start(V2, database);
    const watcher = watch(client);
    try {
      await client.query('RETURN 1');
    } finally {
      watcher.stop();
    }

    expect(watcher.texts.filter((text) => text.includes('INFO FOR DB STRUCTURE')).length).toBeGreaterThan(0);
  });

  test('warnings go through console.warn only', async () => {
    const database = await scratch('channel');
    await prime(V1, database);
    const log = spyOn(console, 'log').mockImplementation(() => {});
    const error = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const client = await start(V2, database);
      await client.query('RETURN 1');

      expect(warnings().some((text) => text.includes('Plan:'))).toBe(true);
      expect(log.mock.calls.flat().join('\n')).not.toContain('Plan:');
      expect(error.mock.calls.flat().join('\n')).not.toContain('Plan:');
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });
});
