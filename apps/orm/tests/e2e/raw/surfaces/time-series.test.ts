/**
 * E2E Tests: time series through the raw hatch
 *
 * The tables are private (`rawsf_reading` and the view `rawsf_hourly`), created and removed by this file,
 * because a view cannot be declared in a schema. Refusals first: a `GROUP BY` smuggled into a compute has no
 * typed position and errors, and a hostile sensor name is bound as data. Then a bucketed `GROUP BY` as a whole
 * statement, a bound record-id range that leaves out the other sensor and the rows outside the window, and a
 * `DEFINE TABLE ... AS SELECT` view that keeps aggregating as rows arrive.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, sql } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const TABLES = [...tables.core];
const READING = 'rawsf_reading';
const VIEW = 'rawsf_hourly';
const HOUR = 3_600_000;
const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const at = (minutes: number): Date => new Date(T0 + minutes * 60_000);

// sensor, minutes after T0, value
const READINGS: Array<[string, number, number]> = [
  ['a', 5, 1],
  ['a', 20, 2],
  ['a', 65, 4],
  ['a', 130, 8],
  ['b', 10, 100],
];

describe('E2E raw surface: time series', () => {
  let client: CerialClient;

  const record = (sensor: string, minutes: number, value: number) =>
    client.$raw(sql`CREATE rawsf_reading:[${sensor}, ${at(minutes)}] SET value = ${value}`);

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(VIEW)}`);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(READING)}`);
    await client.$raw(sql`DEFINE TABLE ${sql.ident(READING)} SCHEMALESS`);
    await client.$raw(
      sql`DEFINE TABLE ${sql.ident(VIEW)} AS SELECT time::floor(id[1], 1h) AS bucket, math::sum(value) AS total, count() AS n FROM ${sql.ident(READING)} WHERE id[0] = 'a' GROUP BY bucket`,
    );
  });

  afterAll(async () => {
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(VIEW)}`);
    await client.$raw(sql`REMOVE TABLE IF EXISTS ${sql.ident(READING)}`);
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await client.$raw(sql`DELETE ${sql.ident(READING)}`);
    for (const [sensor, minutes, value] of READINGS) await record(sensor, minutes, value);
    await client.db.User.create({ data: { email: 'u@x.test', name: 'U', isActive: true } });
  });

  describe('refusals', () => {
    test('a GROUP BY inside a compute has no typed position and errors', async () => {
      await expect(
        (async () => {
          await client.db.User.findMany({ compute: { n: sql<number>`count() GROUP BY name` } });
        })(),
      ).rejects.toThrow(CerialDatabaseError);
      expect(await client.db.User.count()).toBe(1);
    });

    test('a hostile sensor name is bound as data, matches nothing and deletes nothing', async () => {
      const rows = await client.$raw(
        sql`SELECT * FROM rawsf_reading:[${"a'; DELETE user; --"}, ${at(0)}]..[${"a'; DELETE user; --"}, ${at(600)}]`,
      );

      expect(rows).toEqual([]);
      expect(await client.db.User.count()).toBe(1);
    });
  });

  describe('bucketed GROUP BY as a whole statement', () => {
    test('sums each hour of one sensor and leaves the other sensor out', async () => {
      const rows = await client.$raw<{ bucket: Date; total: number }>(
        sql`SELECT time::floor(id[1], 1h) AS bucket, math::sum(value) AS total FROM ${sql.ident(READING)} WHERE id[0] = ${'a'} GROUP BY bucket ORDER BY bucket`,
      );

      expect(rows.map((r) => [new Date(r.bucket).getTime() - T0, r.total])).toEqual([
        [0, 3],
        [HOUR, 4],
        [2 * HOUR, 8],
      ]);
    });
  });

  describe('a bound record range', () => {
    test('returns only the window of the named sensor', async () => {
      const rows = await client.$raw<{ value: number }>(
        sql`SELECT * FROM rawsf_reading:[${'a'}, ${at(0)}]..[${'a'}, ${at(70)}]`,
      );

      expect(rows.map((r) => r.value).sort()).toEqual([1, 2, 4]);
    });

    test('excludes rows outside the window', async () => {
      const rows = await client.$raw<{ value: number }>(
        sql`SELECT * FROM rawsf_reading:[${'a'}, ${at(60)}]..[${'a'}, ${at(120)}]`,
      );

      expect(rows.map((r) => r.value)).toEqual([4]);
    });
  });

  describe('a table view', () => {
    test('aggregates the existing rows of its sensor only', async () => {
      const rows = await client.$raw<{ bucket: Date; total: number; n: number }>(
        sql`SELECT bucket, total, n FROM ${sql.ident(VIEW)} ORDER BY bucket`,
      );

      expect(rows.map((r) => [r.total, r.n])).toEqual([
        [3, 2],
        [4, 1],
        [8, 1],
      ]);
    });

    test('keeps aggregating as rows arrive and ignores the other sensor', async () => {
      await record('a', 30, 16);
      await record('b', 31, 1000);
      const rows = await client.$raw<{ bucket: Date; total: number }>(
        sql`SELECT bucket, total FROM ${sql.ident(VIEW)} ORDER BY bucket`,
      );

      expect(rows.map((r) => r.total)).toEqual([19, 4, 8]);
    });
  });
});
