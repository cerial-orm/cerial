/**
 * resetMigrationState() says the database changed behind the client. Each model stays untrusted until it has itself
 * been applied, and a disconnect says nothing about the database at all.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  admin,
  createHarness,
  modelDdl,
  SCHEMA,
  watch,
  type ClientClass,
  type Harness,
} from './migrate-client-helpers';

let harness: Harness;
let Client: ClientClass;

beforeAll(async () => {
  harness = await createHarness('rb');
  Client = await harness.generate('v1', SCHEMA);
});

afterAll(() => harness.cleanup());

describe('after resetMigrationState()', () => {
  test('a model first touched after another was re-applied is still re-applied', async () => {
    const database = await harness.scratch('partial');
    const client = await harness.start(Client, database);
    await client.query('RETURN 1');

    const root = await admin(database);
    try {
      await root.query('REMOVE TABLE client_user; REMOVE TABLE client_post;').collect();
      client.resetMigrationState();

      // Re-applies only ClientUser; ClientPost must not inherit that apply's "state is stale" verdict.
      await client.ClientUser.findMany();
      await client.ClientPost.create({ data: { slug: 'a', title: 'one' } });

      const [info] = await root
        .query('INFO FOR TABLE client_post')
        .collect<[{ fields: Record<string, string>; indexes: Record<string, string> }]>();
      expect(Object.keys(info.fields)).toContain('title');
      expect(Object.values(info.indexes).join(' ')).toContain('UNIQUE');

      const refused = await client.ClientPost.create({ data: { slug: 'a', title: 'two' } }).catch((e: unknown) => e);
      expect(refused).toBeInstanceOf(Error);
      expect(await client.ClientPost.findMany()).toHaveLength(1);
    } finally {
      await root.close();
    }
  });
});

describe('disconnect and connect again', () => {
  test('a matching state row still skips the DDL', async () => {
    const database = await harness.scratch('reconnect');
    const client = await harness.start(Client, database);
    await client.query('RETURN 1');
    await client.disconnect();

    await client.connect({
      url: 'http://127.0.0.1:8000',
      namespace: 'main',
      database,
      auth: { username: 'root', password: 'root' },
    });
    const watcher = watch([client]);
    try {
      await client.ClientUser.findMany();
      await client.ClientPost.findMany();
    } finally {
      watcher.stop();
    }

    expect(modelDdl(watcher.texts)).toEqual([]);
  });
});
