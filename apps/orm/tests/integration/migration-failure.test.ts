/**
 * A migration that fails permanently is recorded and not re-attempted on later queries.
 *
 * Generates a real client into a scratch folder and uses a UNIQUE index over duplicate rows, which
 * SurrealDB refuses to build. Needs the shared SurrealDB on 127.0.0.1:8000.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { CerialMigrationError } from 'cerial';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

const TABLE = 'mig_fail_probe';
const config: ConnectionConfig = {
  url: 'http://127.0.0.1:8000',
  namespace: 'main',
  database: 'main',
  auth: { username: 'root', password: 'root' },
};
const SCHEMA = `model MigFailProbe {
  id Record @id
  email String @unique
}
`;

interface ProbeClient {
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  resetMigrationState(): void;
  isModelMigrated(name: string): boolean;
  getSurreal(): { query: (...args: unknown[]) => Promise<unknown> } | null;
  MigFailProbe: { findMany(args?: object): Promise<unknown[]>; create(args: object): Promise<unknown> };
}

let base: string;
let Client: new () => ProbeClient;

/** Counts the DDL statements sent for the probe table while `run` executes. */
async function countDdl(client: ProbeClient, run: () => Promise<void>): Promise<number> {
  const surreal = client.getSurreal();
  if (!surreal) throw new Error('client is not connected');
  const original = surreal.query;
  let count = 0;
  surreal.query = ((...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('DEFINE')) count++;

    return original.apply(surreal, args);
  }) as typeof surreal.query;
  try {
    await run();
  } finally {
    surreal.query = original;
  }

  return count;
}

async function raw(client: ProbeClient, sql: string): Promise<void> {
  await client.getSurreal()?.query(sql);
}

beforeAll(async () => {
  base = await mkdtemp(join(import.meta.dir, 'migfail-'));
  await Bun.write(join(base, 'schemas', 'a.cerial'), SCHEMA);
  const result = await generateSingleSchema({
    schemaPath: join(base, 'schemas'),
    outputDir: join(base, 'out'),
    logLevel: 'minimal',
  });
  expect(result.success).toBe(true);
  ({ CerialClient: Client } = (await import(join(base, 'out', 'index.ts'))) as { CerialClient: new () => ProbeClient });
});

afterAll(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('migration failure handling', () => {
  test('a migration that succeeds migrates once and serves queries', async () => {
    const client = new Client();
    await client.connect(config);
    await raw(client, `REMOVE TABLE IF EXISTS ${TABLE};`);
    try {
      const first = await countDdl(client, async () => {
        expect(await client.MigFailProbe.findMany()).toEqual([]);
      });
      const second = await countDdl(client, async () => {
        expect(await client.MigFailProbe.findMany()).toEqual([]);
      });

      expect(first).toBe(1);
      expect(second).toBe(0);
      expect(client.isModelMigrated('MigFailProbe')).toBe(true);
    } finally {
      await raw(client, `REMOVE TABLE IF EXISTS ${TABLE};`);
      await client.disconnect();
    }
  });

  test('a migration that fails is recorded and its DDL is not re-run', async () => {
    const client = new Client();
    await client.connect(config);
    await raw(
      client,
      `REMOVE TABLE IF EXISTS ${TABLE}; CREATE ${TABLE}:a SET email = 'dup'; CREATE ${TABLE}:b SET email = 'dup';`,
    );
    try {
      let firstError: unknown;
      const first = await countDdl(client, async () => {
        firstError = await client.MigFailProbe.findMany().catch((e: unknown) => e);
      });
      let secondError: unknown;
      const second = await countDdl(client, async () => {
        secondError = await client.MigFailProbe.findMany().catch((e: unknown) => e);
      });

      expect(firstError).toBeInstanceOf(Error);
      expect(first).toBe(1);
      expect(second).toBe(0);
      expect(secondError).toBe(firstError);
      expect(client.isModelMigrated('MigFailProbe')).toBe(false);

      // Recovery within the process: fix the data, reset the migration state, query again.
      await raw(client, `DELETE ${TABLE}:b;`);
      client.resetMigrationState();
      expect(await client.MigFailProbe.findMany()).toHaveLength(1);
      expect(client.isModelMigrated('MigFailProbe')).toBe(true);
    } finally {
      await raw(client, `REMOVE TABLE IF EXISTS ${TABLE};`);
      await client.disconnect();
    }
  });

  test('a failed migration reaches the caller as a migration error, a failed query does not', async () => {
    const client = new Client();
    await client.connect(config);
    await raw(
      client,
      `REMOVE TABLE IF EXISTS ${TABLE}; CREATE ${TABLE}:a SET email = 'dup'; CREATE ${TABLE}:b SET email = 'dup';`,
    );
    try {
      const error = await client.MigFailProbe.findMany().catch((e: unknown) => e);

      expect(error).toBeInstanceOf(CerialMigrationError);
      const migration = error as CerialMigrationError;
      expect(migration.model).toBe('MigFailProbe');
      expect(migration.operation).toBe('migrate');
      expect(migration.statement?.text).toContain(`DEFINE INDEX`);
      expect(migration.statement?.text).toContain(TABLE);
      expect(migration.cause).toBeInstanceOf(Error);
    } finally {
      await raw(client, `REMOVE TABLE IF EXISTS ${TABLE};`);
      await client.disconnect();
    }

    // Negative half: once the table migrates cleanly, a query failure is not a migration error.
    const healthy = new Client();
    await healthy.connect(config);
    await raw(healthy, `REMOVE TABLE IF EXISTS ${TABLE};`);
    try {
      await healthy.MigFailProbe.findMany();
      await healthy.MigFailProbe.create({ data: { email: 'dup' } });
      const queryError = await healthy.MigFailProbe.create({ data: { email: 'dup' } }).catch((e: unknown) => e);

      expect(queryError).toBeInstanceOf(Error);
      expect(queryError).not.toBeInstanceOf(CerialMigrationError);
    } finally {
      await raw(healthy, `REMOVE TABLE IF EXISTS ${TABLE};`);
      await healthy.disconnect();
    }
  });
});
