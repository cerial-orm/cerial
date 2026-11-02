/**
 * resetMigrationState() says the database changed behind the client. Each model stays untrusted until it has itself
 * been applied, and a disconnect says nothing about the database at all.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHarness, modelDdl, SCHEMA, watch, type ClientClass, type Harness } from './migrate-client-helpers';

let harness: Harness;
let Client: ClientClass;

beforeAll(async () => {
  harness = await createHarness('rb');
  Client = await harness.generate('v1', SCHEMA);
});

afterAll(() => harness.cleanup());

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
