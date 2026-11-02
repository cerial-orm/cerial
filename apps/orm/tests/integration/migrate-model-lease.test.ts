/**
 * The public migrateModel() goes through the same path as every other apply: queued behind the client's batches,
 * under the database lease, and recorded in the persisted state.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { acquireLease, bootstrapStateTables, MIGRATIONS_TABLE } from '../../src/migrations';
import {
  admin,
  createHarness,
  modelDdl,
  SCHEMA,
  watch,
  type ClientClass,
  type Harness,
} from './migrate-client-helpers';

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

let harness: Harness;
let Client: ClientClass;

beforeAll(async () => {
  harness = await createHarness('ml');
  Client = await harness.generate('v1', SCHEMA);
});

afterAll(() => harness.cleanup());

describe('migrateModel()', () => {
  test('records the model in the persisted state', async () => {
    const database = await harness.scratch('state');
    const client = await harness.start(Client, database);
    await client.migrateModel('ClientPost');

    const root = await admin(database);
    try {
      const [rows] = await root.query(`SELECT * FROM ${MIGRATIONS_TABLE}`).collect<[{ id: unknown; kind: string }[]]>();
      expect(rows.some((row) => row.kind === 'model' && String(row.id).includes('ClientPost'))).toBe(true);
    } finally {
      await root.close();
    }
  });

  test('waits for a held lease and proceeds once it is released', async () => {
    const database = await harness.scratch('lease');
    const root = await admin(database);
    try {
      await bootstrapStateTables(root);
      const lease = await acquireLease(root);
      const client = await harness.start(Client, database);

      let settled = false;
      const run = client.migrateModel('ClientUser').then(() => (settled = true));
      await sleep(400);
      expect(settled).toBe(false);

      await lease.release();
      await run;
      expect(settled).toBe(true);
    } finally {
      await root.close();
    }
  });

  test('a lazy batch for the same model sends no second DDL', async () => {
    const database = await harness.scratch('batch');
    const client = await harness.start(Client, database);
    const watcher = watch([client]);
    try {
      await Promise.all([client.migrateModel('ClientPost'), client.ClientPost.findMany()]);
    } finally {
      watcher.stop();
    }

    expect(modelDdl(watcher.texts).filter((text) => text.includes('client_post'))).toHaveLength(1);
  });
});
