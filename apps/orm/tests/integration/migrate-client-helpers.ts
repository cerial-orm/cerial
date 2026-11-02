/**
 * Shared setup for the generated-client migration specs: generating a client from a schema, scratch databases,
 * and a spy on every query a client sends.
 */

import { expect } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { generateSingleSchema } from '../../src/cli/generate';
import type { ConnectionConfig } from '../../src/types';

type Query = (...args: unknown[]) => Promise<unknown>;

export interface ProbeClient {
  connect(config: ConnectionConfig): Promise<unknown>;
  disconnect(): Promise<void>;
  migrate(): Promise<void>;
  migrateModel(name: string): Promise<void>;
  resetMigrationState(): void;
  query(text: string): Promise<unknown>;
  getSurreal(): { query: Query } | null;
  getTransactionSurreal(): { query: Query } | null;
  ClientUser: { findMany(args?: object): Promise<unknown[]>; create(args: object): Promise<unknown> };
  ClientPost: { findMany(args?: object): Promise<unknown[]>; create(args: object): Promise<unknown> };
}
export type ClientClass = new () => ProbeClient;

export const URL = 'http://127.0.0.1:8000';
export const SCHEMA = `model ClientUser {
  id Record @id
  name String
}

model ClientPost {
  id Record @id
  slug String @unique
  title String
}
`;

export function configFor(database: string): ConnectionConfig {
  return { url: URL, namespace: 'main', database, auth: { username: 'root', password: 'root' } };
}

export async function admin(database?: string): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, {
    namespace: 'main',
    ...(database ? { database } : {}),
    authentication: { username: 'root', password: 'root' },
  });

  return db;
}

export interface Harness {
  readonly databases: string[];
  readonly opened: ProbeClient[];
  generate(name: string, schema: string): Promise<ClientClass>;
  scratch(label: string): Promise<string>;
  start(Client: ClientClass, database: string): Promise<ProbeClient>;
  cleanup(): Promise<void>;
}

export async function createHarness(prefix: string): Promise<Harness> {
  const base = await mkdtemp(join(import.meta.dir, `${prefix}-`));
  const databases: string[] = [];
  const opened: ProbeClient[] = [];

  return {
    databases,
    opened,
    async generate(name, schema) {
      await Bun.write(join(base, name, 'schemas', 'a.cerial'), schema);
      const result = await generateSingleSchema({
        schemaPath: join(base, name, 'schemas'),
        outputDir: join(base, name, 'out'),
        logLevel: 'minimal',
      });
      expect(result.success).toBe(true);

      return ((await import(join(base, name, 'out', 'index.ts'))) as { CerialClient: ClientClass }).CerialClient;
    },
    async scratch(label) {
      const name = `${prefix}_${label}_${process.pid}_${Date.now().toString(36)}`;
      const root = await admin();
      try {
        await root.query(`DEFINE DATABASE ${name}`).collect();
      } finally {
        await root.close();
      }
      databases.push(name);

      return name;
    },
    async start(Client, database) {
      const client = new Client();
      await client.connect(configFor(database));
      opened.push(client);

      return client;
    },
    async cleanup() {
      for (const client of opened) await client.disconnect().catch(() => {});
      const root = await admin();
      try {
        for (const name of databases) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
      } finally {
        await root.close();
      }
      await rm(base, { recursive: true, force: true });
    },
  };
}

/** Records the text of every query sent while it is installed, on every socket the client uses. */
export function watch(clients: ProbeClient[]): { texts: string[]; stop(): void } {
  const sockets = [...new Set(clients.flatMap((c) => [c.getSurreal(), c.getTransactionSurreal()]).filter((s) => !!s))];
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

/** The state tables' own bootstrap is not model DDL. */
export const modelDdl = (texts: string[]): string[] =>
  texts.filter((text) => text.includes('DEFINE') && !text.includes('IF NOT EXISTS _cerial_migration'));
