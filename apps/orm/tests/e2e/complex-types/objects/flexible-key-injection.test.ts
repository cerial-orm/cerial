/**
 * E2E Tests: @flexible sub-keys cannot inject SurrealQL
 *
 * A sub-key carrying a statement terminator must be treated as a plain field
 * name on every surface that interpolates it (where, update data, select,
 * orderBy). Each injection test creates a throwaway table that the key would
 * remove, runs the call, and asserts the table survived.
 *
 * Schema: flexible (FlexUser)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const VICTIM = 'flexinj_victim';
const HOSTILE = `x'; REMOVE TABLE ${VICTIM}; --`;
const BACKTICK_HOSTILE = `x\`; REMOVE TABLE ${VICTIM}; --`;
const KEYS = [HOSTILE, BACKTICK_HOSTILE];
const LEGIT_KEYS = ['my-key', 'ключ', 'k2', '2fa', 'with space', "it's"];

const base = {
  tags: [],
  profile: { bio: 'b', metadata: { label: 'l' } },
  strictAddress: { street: 's', city: 'c' },
};

describe('E2E @flexible sub-key injection', () => {
  let client: CerialClient;

  const victimExists = async (): Promise<boolean> => {
    const [info] = await client.getSurreal()!.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

    return VICTIM in info!.tables;
  };

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.flexible);
  });

  afterAll(async () => {
    await client.getSurreal()?.query(`REMOVE TABLE IF EXISTS ${VICTIM};`);
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.flexible);
    await client
      .getSurreal()!
      .query(`REMOVE TABLE IF EXISTS ${VICTIM}; DEFINE TABLE ${VICTIM} SCHEMALESS; CREATE ${VICTIM}:1;`);
  });

  describe.each(KEYS)('hostile key %j', (key) => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: { name: 'A', address: { street: 's', city: 'c', [key]: 'y' }, ...base },
      });
    });

    test('where does not execute the key', async () => {
      const rows = await client.db.FlexUser.findMany({ where: { address: { [key]: 'y' } } });

      expect(rows).toHaveLength(1);
      expect(await victimExists()).toBe(true);
    });

    test('where operator object does not execute the key', async () => {
      const rows = await client.db.FlexUser.findMany({ where: { address: { [key]: { neq: 'z' } } } });

      expect(rows).toHaveLength(1);
      expect(await victimExists()).toBe(true);
    });

    test('update data does not execute the key and stores it as a field', async () => {
      await client.db.FlexUser.updateMany({ where: { name: 'A' }, data: { address: { [key]: 'z' } } });

      expect(await victimExists()).toBe(true);
      const rows = await client.db.FlexUser.findMany({ where: { address: { [key]: 'z' } } });
      expect(rows).toHaveLength(1);
    });

    test('update data null does not execute the key', async () => {
      await client.db.FlexUser.updateMany({ where: { name: 'A' }, data: { address: { [key]: null } } });

      expect(await victimExists()).toBe(true);
    });

    test('select does not execute the key and returns the value', async () => {
      const rows = await client.db.FlexUser.findMany({ select: { address: { [key]: true } as { street: true } } });

      expect(await victimExists()).toBe(true);
      expect(rows).toHaveLength(1);
      expect((rows[0]!.address as Record<string, unknown>)[key]).toBe('y');
    });

    test('orderBy does not execute the key', async () => {
      const rows = await client.db.FlexUser.findMany({ orderBy: { address: { [key]: 'asc' } } });

      expect(await victimExists()).toBe(true);
      expect(rows).toHaveLength(1);
    });
  });

  describe.each(LEGIT_KEYS)('legitimate key %j', (key) => {
    beforeEach(async () => {
      await client.db.FlexUser.create({
        data: { name: 'A', address: { street: 's', city: 'c', [key]: 1 }, ...base },
      });
      await client.db.FlexUser.create({
        data: { name: 'B', address: { street: 's', city: 'c', [key]: 2 }, ...base },
      });
    });

    test('where matches the row', async () => {
      const rows = await client.db.FlexUser.findMany({ where: { address: { [key]: 1 } } });

      expect(rows.map((r) => r.name)).toEqual(['A']);
    });

    test('where operator matches rows', async () => {
      const rows = await client.db.FlexUser.findMany({ where: { address: { [key]: { gt: 1 } } } });

      expect(rows.map((r) => r.name)).toEqual(['B']);
    });

    test('update data sets the key', async () => {
      await client.db.FlexUser.updateMany({ where: { name: 'A' }, data: { address: { [key]: 9 } } });
      const rows = await client.db.FlexUser.findMany({ where: { address: { [key]: 9 } } });

      expect(rows.map((r) => r.name)).toEqual(['A']);
    });

    test('select returns the key', async () => {
      const rows = await client.db.FlexUser.findMany({
        where: { name: 'A' },
        select: { address: { [key]: true } as { street: true } },
      });

      expect((rows[0]!.address as Record<string, unknown>)[key]).toBe(1);
    });

    test('orderBy orders by the key', async () => {
      const rows = await client.db.FlexUser.findMany({ orderBy: { address: { [key]: 'desc' } } });

      expect(rows.map((r) => r.name)).toEqual(['B', 'A']);
    });
  });
});
