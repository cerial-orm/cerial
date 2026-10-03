import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

describe('E2E Literals: float variants and Float/Date broad types', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.literals);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.literals);
  });

  test('accepts each declared float variant', async () => {
    for (const ratio of [0.5, 1.5, 2.5] as const) {
      const result = await client.db.LiteralNumberKinds.create({ data: { ratio, amount: 1, moment: true } });
      expect(result.ratio).toBe(ratio);
    }
  });

  test('rejects a float that is not a declared variant', async () => {
    await expect(
      (async () => {
        // @ts-expect-error 3.5 is not one of 0.5, 1.5, 2.5
        await client.db.LiteralNumberKinds.create({ data: { ratio: 3.5, amount: 1, moment: true } });
      })(),
    ).rejects.toThrow();
    expect(await client.db.LiteralNumberKinds.count()).toBe(0);
  });

  test('Float broad type accepts any number and String still works', async () => {
    const a = await client.db.LiteralNumberKinds.create({ data: { ratio: 0.5, amount: 12.75, moment: false } });
    const b = await client.db.LiteralNumberKinds.create({ data: { ratio: 0.5, amount: 'text', moment: false } });

    expect(a.amount).toBe(12.75);
    expect(b.amount).toBe('text');
  });

  test('Float broad type rejects a boolean', async () => {
    await expect(
      (async () => {
        // @ts-expect-error a boolean is neither Float nor String
        await client.db.LiteralNumberKinds.create({ data: { ratio: 0.5, amount: true, moment: false } });
      })(),
    ).rejects.toThrow();
  });

  test('Date broad type round-trips and the Bool variant returns a boolean', async () => {
    const when = new Date('2024-05-06T07:08:09.000Z');
    const withDate = await client.db.LiteralNumberKinds.create({ data: { ratio: 1.5, amount: 1, moment: when } });
    const withBool = await client.db.LiteralNumberKinds.create({ data: { ratio: 1.5, amount: 1, moment: true } });

    // Inside a union the SDK hands back its own DateTime, which is not a native Date
    expect((withDate.moment as { toISOString(): string }).toISOString()).toBe(when.toISOString());
    expect(withBool.moment).toBe(true);
  });

  test('Date broad type rejects a string', async () => {
    await expect(
      (async () => {
        // @ts-expect-error a plain string is neither Date nor Bool
        await client.db.LiteralNumberKinds.create({ data: { ratio: 1.5, amount: 1, moment: 'tomorrow' } });
      })(),
    ).rejects.toThrow();
  });

  test('filters on a float variant', async () => {
    await client.db.LiteralNumberKinds.create({ data: { ratio: 0.5, amount: 1, moment: true } });
    await client.db.LiteralNumberKinds.create({ data: { ratio: 2.5, amount: 1, moment: true } });

    const found = await client.db.LiteralNumberKinds.findMany({ where: { ratio: 2.5 } });

    expect(found).toHaveLength(1);
    expect(found[0]?.ratio).toBe(2.5);
  });
});
