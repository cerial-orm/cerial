/**
 * Runtime helpers for multi-schema tests: generate several schema entries from a
 * fixture into a temp directory, import each generated client and talk to the
 * shared SurrealDB instance through it.
 */

import { join } from 'node:path';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { generateMultiSchema, type MultiGenerateResult } from '../../../src/cli/generate';
import type { ConnectionConfig } from '../../../src/types/metadata.types';
import { cleanupTempDir, createTempOutputDir, getFixturePath } from '../../fixtures/multi-schema/helpers';

export const SHARED_URL = 'http://127.0.0.1:8000';

export const connectionFor = (database: string) => ({
  url: SHARED_URL,
  namespace: 'main',
  database,
  auth: { username: 'root', password: 'root' },
});

export type Row = Record<string, unknown>;

/** The slice of a generated model delegate these tests use. */
export interface ModelDelegate {
  create(args: { data: Row }): Promise<Row>;
  findMany(args?: { where?: Row }): Promise<Row[]>;
  findOne(args: { where: Row }): Promise<Row | null>;
  count(where?: Row): Promise<number>;
  deleteMany(args: { where: Row }): Promise<number>;
}

/** The slice of a generated client class these tests use. */
export interface RuntimeClient {
  db: Record<string, ModelDelegate>;
  connect(config?: ConnectionConfig): Promise<void>;
  disconnect(): Promise<void>;
  migrate(): Promise<void>;
  resetMigrationState(): void;
  readonly isMigrated: boolean;
  getSurreal(): { query(sql: string): Promise<unknown> } | undefined;
}

export type RuntimeClientClass = new () => RuntimeClient;

export interface GeneratedFixture {
  tempDir: string;
  result: MultiGenerateResult;
  /** Output directory per schema entry name */
  outputs: Record<string, string>;
  cleanup(): Promise<void>;
}

/** Generate every entry of a fixture's config into a fresh temp directory. */
export async function generateFixture(fixture: string): Promise<GeneratedFixture> {
  const tempDir = await createTempOutputDir();
  const fixtureDir = getFixturePath(fixture);
  const config = await loadConfig(join(fixtureDir, 'cerial.config.ts'));
  const entries = resolveConfig(config!, fixtureDir).map((entry) => ({ ...entry, output: join(tempDir, entry.name) }));
  const result = await generateMultiSchema(entries, { logLevel: 'minimal' });
  const outputs = Object.fromEntries(entries.map((entry) => [entry.name, entry.output]));

  return { tempDir, result, outputs, cleanup: () => cleanupTempDir(tempDir) };
}

/** Import the generated client class of one schema entry. */
export async function importClient(outputDir: string, className: string): Promise<RuntimeClientClass> {
  const mod = (await import(join(outputDir, 'client'))) as Record<string, RuntimeClientClass>;
  const ctor = mod[className];
  if (!ctor) throw new Error(`Generated client '${className}' not found in ${outputDir}`);

  return ctor;
}

/** Run raw SurrealQL against a namespace and database on the shared instance. */
export async function rawQuery(sql: string, database = 'main'): Promise<unknown> {
  const res = await fetch(`${SHARED_URL}/sql`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'surreal-ns': 'main',
      'surreal-db': database,
      Authorization: `Basic ${btoa('root:root')}`,
    },
    body: sql,
  });

  return res.json();
}

/** Row-level cleanup, the same `DELETE FROM` the shared cleanupTables helper issues. */
export async function clearTables(client: RuntimeClient, tableNames: string[]): Promise<void> {
  const surreal = client.getSurreal();
  if (!surreal) return;

  for (const table of tableNames) {
    try {
      await surreal.query(`DELETE FROM ${table};`);
    } catch {
      // The table is not defined until a client migrates it
    }
  }
}
