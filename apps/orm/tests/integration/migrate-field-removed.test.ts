/**
 * Under 'auto' a field dropped from the schema stays live, since auto never removes anything. The apply that follows
 * the schema change must still succeed and the model must keep answering queries.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { admin, createHarness, SCHEMA, type ClientClass, type Harness } from './migrate-client-helpers';

const WITH_LEGACY = SCHEMA.replace('  name String\n', '  name String\n  legacy String?\n');

let harness: Harness;
let Before: ClientClass;
let After: ClientClass;

beforeAll(async () => {
  harness = await createHarness('fr');
  Before = await harness.generate('before', WITH_LEGACY);
  After = await harness.generate('after', SCHEMA);
});

afterAll(() => harness.cleanup());

describe('a field removed from the schema under auto', () => {
  test('the next client applies, records the model as applied and keeps querying it', async () => {
    const database = await harness.scratch('removed');
    const first = await harness.start(Before, database);
    await first.ClientUser.create({ data: { name: 'a', legacy: 'kept' } });
    await first.disconnect();

    const second = await harness.start(After, database);
    await second.ClientUser.create({ data: { name: 'b' } });
    expect(await second.ClientUser.findMany()).toHaveLength(2);
    expect(await second.ClientUser.findMany()).toHaveLength(2);

    const root = await admin(database);
    try {
      const [info] = await root.query('INFO FOR TABLE client_user').collect<[{ fields: Record<string, string> }]>();
      expect(Object.keys(info.fields)).toContain('legacy');
      const [rows] = await root
        .query("SELECT status FROM _cerial_migrations WHERE id = _cerial_migrations:['CerialClient', 'ClientUser']")
        .collect<[{ status: string }[]]>();
      expect(rows[0]?.status).toBe('applied');
    } finally {
      await root.close();
    }
  });
});
