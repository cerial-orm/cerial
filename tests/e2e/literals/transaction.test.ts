/**
 * E2E Tests: Literal in Transactions
 *
 * Tests literal fields within $transaction operations.
 * Covers: create, update, mixed operations with literals in a transaction.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../relations/test-helper';
import { isCerialId } from 'cerial';

describe('E2E Literals: Transactions', () => {
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

  test('should create multiple records with literals in a transaction', async () => {
    const [r1, r2, r3] = await client.$transaction([
      client.db.LiteralBasic.create({
        data: { name: 'T1', status: 'active', priority: 1, mixed: 'low' },
      }),
      client.db.LiteralBasic.create({
        data: { name: 'T2', status: 'inactive', priority: 2, mixed: 'high' },
      }),
      client.db.LiteralBasic.create({
        data: { name: 'T3', status: 'pending', priority: 3, mixed: true },
      }),
    ]);

    expect(isCerialId(r1.id)).toBe(true);
    expect(r1.status).toBe('active');
    expect(r2.status).toBe('inactive');
    expect(r3.status).toBe('pending');
  });

  test('should create and update literals in same transaction', async () => {
    const created = await client.db.LiteralBasic.create({
      data: { name: 'TxUpd', status: 'active', priority: 1, mixed: 'low' },
    });

    const [updated, newRecord] = await client.$transaction([
      client.db.LiteralBasic.updateUnique({
        where: { id: created.id },
        data: { status: 'inactive', priority: 3 },
      }),
      client.db.LiteralDefaults.create({
        data: { label: 'tx-default' },
      }),
    ]);

    expect(updated!.status).toBe('inactive');
    expect(updated!.priority).toBe(3);
    expect(newRecord.status).toBe('active'); // default
    expect(newRecord.priority).toBe(1); // default
  });

  test('should handle mixed model types with literals in transaction', async () => {
    const [basic, defaults, broad] = await client.$transaction([
      client.db.LiteralBasic.create({
        data: { name: 'Mixed', status: 'active', priority: 1, mixed: 'low' },
      }),
      client.db.LiteralDefaults.create({
        data: { label: 'mixed-tx' },
      }),
      client.db.LiteralBroad.create({
        data: { value: 'hello' },
      }),
    ]);

    expect(basic.status).toBe('active');
    expect(defaults.status).toBe('active');
    expect(broad.value).toBe('hello');
  });

  test('should handle literal with object in transaction', async () => {
    const [r1, r2] = await client.$transaction([
      client.db.LiteralWithObject.create({
        data: { name: 'Tx1', address: { city: 'NYC', status: 'active' } },
      }),
      client.db.LiteralWithObject.create({
        data: { name: 'Tx2', address: { city: 'LA', status: 'inactive' } },
      }),
    ]);

    expect(r1.address.status).toBe('active');
    expect(r2.address.status).toBe('inactive');
  });
});
