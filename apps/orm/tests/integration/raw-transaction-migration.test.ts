/**
 * Integration test: a metadata-less raw item migrates an empty database
 *
 * The e2e suites run against a database the preload already migrated, so they cannot tell whether an array
 * `$transaction` holding only a client-level `$raw` item migrates on its own. This one runs against a
 * throwaway database that has no tables at all, created and removed here.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { sql } from 'cerial';
import { Surreal } from 'surrealdb';
import { CerialClient } from '../e2e/generated/client';

const URL = 'http://127.0.0.1:8000';
const NAMESPACE = 'main';
const DATABASE = `cerial_raw_migration_${Date.now()}`;

describe('array $transaction with only a client-level $raw item', () => {
  const admin = new Surreal();

  beforeAll(async () => {
    await admin.connect(`${URL}/rpc`);
    await admin.signin({ username: 'root', password: 'root' });
    await admin.use({ namespace: NAMESPACE });
    await admin.query(`DEFINE DATABASE ${DATABASE};`);
  });

  afterAll(async () => {
    try {
      await admin.query(`REMOVE DATABASE IF EXISTS ${DATABASE};`);
    } finally {
      await admin.close();
    }
  });

  test('migrates the schema before the raw statement runs', async () => {
    const client = new CerialClient();
    await client.connect({
      url: URL,
      namespace: NAMESPACE,
      database: DATABASE,
      auth: { username: 'root', password: 'root' },
    });

    try {
      const [before] = await client.getSurreal()!.query<[{ tables: Record<string, string> }]>('INFO FOR DB;');
      expect(Object.keys(before!.tables)).not.toContain('user');

      const [rows] = await client.$transaction([client.$raw<string>(sql`SELECT VALUE name FROM user`)]);

      expect(rows).toEqual([]);
      const [after] = await client.getSurreal()!.query<[{ tables: Record<string, string> }]>('INFO FOR DB;');
      expect(Object.keys(after!.tables)).toContain('user');
    } finally {
      await client.disconnect();
    }
  });
});
