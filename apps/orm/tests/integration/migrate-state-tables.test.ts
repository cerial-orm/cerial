/**
 * The migration state tables against the shared instance, each case in a scratch database of its own.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import {
  bootstrapStateTables,
  diffSchema,
  emitRemove,
  MIGRATION_LEASE_TABLE,
  MIGRATIONS_TABLE,
  readLiveSchema,
} from '../../src/migrations';
import type { SchemaDifference } from '../../src/migrations';
import { toSnakeCase } from '../../src/utils/string-utils';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });

  return db;
}

async function scratch(label: string): Promise<{ db: Surreal; name: string }> {
  const name = `state_${label}_${process.pid}_${Date.now().toString(36)}`;
  const root = await admin();
  await root.query(`DEFINE DATABASE ${name}`).collect();
  await root.use({ namespace: 'main', database: name });
  names.push(name);
  opened.push(root);

  return { db: root, name };
}

afterAll(async () => {
  const root = await admin();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  await root.close();
  for (const db of opened) await db.close().catch(() => {});
});

describe('bootstrapStateTables', () => {
  test('defines both tables', async () => {
    const { db } = await scratch('define');
    await bootstrapStateTables(db);

    const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
    expect(Object.keys(info.tables).sort()).toEqual([MIGRATIONS_TABLE, MIGRATION_LEASE_TABLE].sort());
  });

  test('a second run is a no-op and keeps existing rows', async () => {
    const { db } = await scratch('twice');
    await bootstrapStateTables(db);
    await db.query(`CREATE ${MIGRATIONS_TABLE}:['a', 'User'] SET fingerprint = 'f1'`).collect();
    await db.query(`CREATE ${MIGRATION_LEASE_TABLE}:migrate SET holder = 'h', expiresAt = time::now()`).collect();
    const [before] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

    await bootstrapStateTables(db);

    const [after] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
    expect(after.tables).toEqual(before.tables);
    const [rows] = await db.query(`SELECT * FROM ${MIGRATIONS_TABLE}`).collect<[{ fingerprint: string }[]]>();
    expect(rows.map((r) => r.fingerprint)).toEqual(['f1']);
    const [lease] = await db.query(`SELECT * FROM ${MIGRATION_LEASE_TABLE}`).collect<[{ holder: string }[]]>();
    expect(lease.map((r) => r.holder)).toEqual(['h']);
  });
});

describe('state tables are invisible to the schema machinery', () => {
  test('the reader reports nothing of them, and the differ proposes nothing even when listed as managed', async () => {
    const { db } = await scratch('reader');
    await bootstrapStateTables(db);
    const live = await readLiveSchema(db);

    expect(live).toEqual({ tables: [], unmanaged: [] });
    expect(diffSchema({ tables: [], unmanaged: [] }, live, { managedTables: [MIGRATIONS_TABLE] })).toEqual([]);
  });

  test('emitRemove refuses to name either table, for every removal kind', () => {
    for (const table of [MIGRATIONS_TABLE, MIGRATION_LEASE_TABLE]) {
      for (const kind of ['table-extra-managed', 'field-extra', 'index-extra'] as const) {
        const difference = {
          kind,
          construct: 'table',
          class: 'destructive',
          table,
          field: ['x'],
          index: 'ix',
          reason: '',
        } as SchemaDifference;

        expect(() => emitRemove(difference, { tables: [], unmanaged: [] })).toThrow(CerialMigrationError);
      }
    }
  });

  test('no model name snake-cases to a state table name', () => {
    // Model names are PascalCase with no underscore, so toSnakeCase never yields a leading underscore.
    for (const name of ['CerialMigrations', 'CerialMigrationLease', 'Cerial', 'A', 'AB']) {
      expect(toSnakeCase(name).startsWith('_')).toBe(false);
    }
  });
});

describe('failures', () => {
  test('a user without DDL rights gets a CerialMigrationError naming what failed', async () => {
    const { db, name } = await scratch('viewer');
    await db.query(`DEFINE USER state_viewer ON DATABASE PASSWORD 'viewer-pw' ROLES VIEWER`).collect();
    const viewer = new Surreal();
    opened.push(viewer);
    try {
      await viewer.connect(URL, {
        namespace: 'main',
        database: name,
        authentication: { namespace: 'main', database: name, username: 'state_viewer', password: 'viewer-pw' },
      });

      const error = await bootstrapStateTables(viewer).then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(CerialMigrationError);
      expect((error as CerialMigrationError).message).toContain(MIGRATIONS_TABLE);
      expect((error as CerialMigrationError).message).toContain('define tables');
      const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
      expect(Object.keys(info.tables)).toEqual([]);
    } finally {
      await db.query('REMOVE USER IF EXISTS state_viewer ON DATABASE').collect();
    }
  });
});
