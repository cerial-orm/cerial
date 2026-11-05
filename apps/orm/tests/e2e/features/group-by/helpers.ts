import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

export const GROUP_BY_TABLES = tables.groupBy;

export type OrderData = Parameters<CerialClient['db']['GbOrder']['create']>[0]['data'];

/** A complete GbOrder; every test overrides only what it is about. */
export function orderData(overrides: Partial<OrderData> = {}): OrderData {
  return {
    label: 'order',
    qty: 1,
    weight: 1.5,
    amount: 10,
    price: '1.10',
    units: 1,
    paid: false,
    placed: new Date('2026-01-01T00:00:00Z'),
    ttl: '1h',
    ref: randomUUID(),
    status: 'OPEN',
    tier: 'free',
    codes: [],
    address: { city: 'Oslo' },
    tagIds: [],
    ...overrides,
  };
}

/** Connects one client for the file and empties the groupBy tables before every test. */
export function useGroupByClient(): () => CerialClient {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, GROUP_BY_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, GROUP_BY_TABLES);
  });

  return () => client;
}

/** Creates one order per entry, in order. */
export async function seedOrders(client: CerialClient, rows: Partial<OrderData>[]): Promise<void> {
  for (const row of rows) await client.db.GbOrder.create({ data: orderData(row) });
}

/**
 * The message of the error `groupBy` refuses `args` with; fails when the call succeeds. The types refuse most
 * of these arguments too (tests/e2e/typechecks/features/group-by.check.ts pins that), so they are passed as a
 * plain object here to reach the runtime validator. groupBy validates while the call is made, so the call runs
 * inside the try rather than being awaited afterwards.
 */
export async function refuse(model: CerialClient['db']['GbOrder'], args: object): Promise<string> {
  try {
    // @ts-expect-error a plain object is not assignable to the typed arguments, which is the point
    await model.groupBy(args);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }

  throw new Error('expected the query to be refused');
}

/** Two groups, `g1` (two orders) and `g2` (one order holding zeros), for the aggregate tests. */
export const AGGREGATE_ROWS: Partial<OrderData>[] = [
  {
    label: 'g1',
    qty: 2,
    weight: 1.5,
    amount: 10,
    price: '1.10',
    bonus: '0.5',
    units: 3,
    paid: true,
    placed: new Date('2026-01-01T00:00:00Z'),
    ttl: '1h',
    status: 'OPEN',
    tier: 'free',
    codes: ['a', 'b'],
  },
  {
    label: 'g1',
    qty: 4,
    weight: 2.5,
    amount: 20,
    price: '2.25',
    units: 5,
    paid: false,
    placed: new Date('2026-02-01T00:00:00Z'),
    ttl: '30m',
    status: 'SHIPPED',
    tier: 'pro',
    codes: ['b', 'c'],
  },
  {
    label: 'g2',
    qty: 0,
    weight: 0,
    amount: 5,
    price: '3.30',
    bonus: '1.5',
    units: 0,
    paid: false,
    placed: new Date('2026-03-01T00:00:00Z'),
    ttl: '2h',
    status: 'OPEN',
    tier: 'free',
    codes: [],
  },
];
