/**
 * E2E Tests for lazy migration of dependent models on delete
 *
 * Cascade, SetNull and Restrict statements name the dependent table in
 * FROM/UPDATE position, and SurrealDB errors on SELECT/UPDATE/DELETE against an
 * undefined table. A delete must therefore migrate its dependents first. Each
 * test uses a fresh client and seeds through raw queries so the dependent model
 * is never touched by the client under test.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { RecordId } from 'surrealdb';
import {
  CerialClient,
  cleanupTables,
  forgetMigrationState,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const DELETE_TABLES = [...tables.oneToOneCascade, ...tables.oneToOneSetNull, ...tables.oneToOneRestrict];

describe('lazy migration of dependent models on delete', () => {
  let client: CerialClient;
  let migrated: string[];

  beforeAll(async () => {
    const setup = new CerialClient();
    await setup.connect(testConfig);
    await cleanupTables(setup, DELETE_TABLES);
    await setup.disconnect();
  });

  beforeEach(async () => {
    migrated = [];
    client = new CerialClient({
      onMigrationEvent: (event) => {
        if (event.type === 'complete') migrated.push(event.modelName);
      },
    });
    await client.connect(testConfig);
    await forgetMigrationState(client);
    await truncateTables(client, DELETE_TABLES);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  async function seed(parentTable: string, childTable: string, extra = ''): Promise<RecordId> {
    const surreal = client.getSurreal()!;
    const [[parent]] = await surreal
      .query(`CREATE ${parentTable} SET name = 'p'${extra}`)
      .collect<[{ id: RecordId }[]]>();
    await surreal.query(`CREATE ${childTable} SET userId = $id, bio = 'c'`, { id: parent!.id }).collect();

    return parent!.id;
  }

  async function childRows(table: string): Promise<{ userId?: RecordId | null }[]> {
    const [rows] = await client
      .getSurreal()!
      .query(`SELECT * FROM ${table}`)
      .collect<[{ userId?: RecordId | null }[]]>();

    return rows!;
  }

  test('deleteMany migrates and deletes a Cascade dependent', async () => {
    const id = await seed('user_cascade', 'profile_cascade');

    await client.db.UserCascade.deleteMany({ where: { id } });

    expect(migrated).toContain('UserCascade');
    expect(migrated).toContain('ProfileCascade');
    expect(await childRows('profile_cascade')).toHaveLength(0);
  });

  test('deleteUnique migrates and deletes a Cascade dependent', async () => {
    const id = await seed('user_cascade', 'profile_cascade');

    await client.db.UserCascade.deleteUnique({ where: { id } });

    expect(migrated).toContain('ProfileCascade');
    expect(await childRows('profile_cascade')).toHaveLength(0);
  });

  test('deleteMany migrates and nulls a SetNull dependent', async () => {
    const id = await seed('user_set_null', 'profile_set_null', ", email = 'a@b.c'");

    await client.db.UserSetNull.deleteMany({ where: { id } });

    expect(migrated).toContain('ProfileSetNull');
    const rows = await childRows('profile_set_null');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.userId).toBeNull();
  });

  test('deleteUnique migrates a SetNull dependent', async () => {
    const id = await seed('user_set_null', 'profile_set_null', ", email = 'a@b.c'");

    await client.db.UserSetNull.deleteUnique({ where: { id } });

    expect(migrated).toContain('ProfileSetNull');
    expect((await childRows('profile_set_null'))[0]!.userId).toBeNull();
  });

  test('deleteMany migrates a Restrict dependent before its count check', async () => {
    const id = await seed('user_restrict', 'profile_restrict');

    await expect(
      (async () => {
        await client.db.UserRestrict.deleteMany({ where: { id } });
      })(),
    ).rejects.toThrow();

    expect(migrated).toContain('ProfileRestrict');
    expect(await childRows('profile_restrict')).toHaveLength(1);
  });

  test('deleteUnique migrates a Restrict dependent before its count check', async () => {
    const id = await seed('user_restrict', 'profile_restrict');

    await expect(
      (async () => {
        await client.db.UserRestrict.deleteUnique({ where: { id } });
      })(),
    ).rejects.toThrow();

    expect(migrated).toContain('ProfileRestrict');
  });

  test('a model without dependents migrates only itself', async () => {
    await client.db.ProfileCascade.deleteMany({ where: {} });

    expect(migrated).toEqual(['ProfileCascade']);
  });
});
