/**
 * Integration test: the first touch of a cascade chain is the delete
 *
 * The e2e suites run against a database the preload already migrated, so they cannot tell whether a delete
 * that reaches grandchildren migrates their tables first. This one runs against a throwaway database that
 * has no tables at all, created and removed here. A transitive statement over an undefined table fails with
 * `NotFound: The table '...' does not exist`.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialClient } from '../e2e/generated/client';

const URL = 'http://127.0.0.1:8000';
const NAMESPACE = 'main';
const DATABASE = `cerial_cascade_first_touch_${Date.now()}`;

const tableNames = async (client: CerialClient): Promise<string[]> => {
  const [info] = await client.getSurreal()!.query<[{ tables: Record<string, string> }]>('INFO FOR DB;');

  return Object.keys(info!.tables);
};

describe('a delete is the first operation on an unmigrated database', () => {
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

  const connect = async (): Promise<CerialClient> => {
    const client = new CerialClient();
    await client.connect({
      url: URL,
      namespace: NAMESPACE,
      database: DATABASE,
      auth: { username: 'root', password: 'root' },
    });

    return client;
  };

  test('deleting the root of a three-model chain migrates the grandchildren before the statement touches them', async () => {
    const client = await connect();

    try {
      expect(await tableNames(client)).not.toContain('od_child');

      const deleted = await client.db.OdGrandparent.deleteMany({ where: { name: 'nobody' } });

      expect(deleted).toBe(0);
      const after = await tableNames(client);
      expect(after).toEqual(expect.arrayContaining(['od_grandparent', 'od_parent', 'od_child']));
    } finally {
      await client.disconnect();
    }
  });

  test('deleteUnique on a chain whose deeper tables do not exist yet does not fail with NotFound', async () => {
    const client = await connect();

    try {
      const outcome = await client.db.DdRoot.deleteUnique({ where: { code: 'absent' }, return: true });

      expect(outcome).toBe(false);
      expect(await tableNames(client)).toEqual(
        expect.arrayContaining(['dd_root', 'dd_one', 'dd_two', 'dd_at_three_cascade']),
      );
    } finally {
      await client.disconnect();
    }
  });
});
