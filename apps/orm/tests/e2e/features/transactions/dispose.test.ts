import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import type { CerialTransaction } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
  uniqueEmail,
} from '../../test-helper';

// Only manual mode hands the caller a transaction to put behind `using`. Array mode has no handle,
// and callback mode ends the transaction itself once the callback returns.
describe('E2E Transactions: Disposal', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  test('await using: leaving the scope cancels an active transaction', async () => {
    let txnRef!: CerialTransaction;
    const email = uniqueEmail();

    {
      await using txn = await client.$transaction();
      txnRef = txn;
      await txn.BasicsUser.create({ data: { email, name: 'Disposed', isActive: true } });
      expect(txn.state).toBe('active');
    }

    expect(txnRef.state).toBe('cancelled');
    await expect((async () => txnRef.commit())()).rejects.toThrow('Transaction already ended');
    expect(await client.db.BasicsUser.findMany()).toHaveLength(0);
  });

  test('await using: a committed transaction stays committed', async () => {
    const email = uniqueEmail();
    let txnRef!: CerialTransaction;

    {
      await using txn = await client.$transaction();
      txnRef = txn;
      await txn.BasicsUser.create({ data: { email, name: 'Kept', isActive: true } });
      await txn.commit();
    }

    expect(txnRef.state).toBe('committed');
    expect(await client.db.BasicsUser.findMany()).toHaveLength(1);
  });

  test('await using: an explicitly cancelled transaction is left alone', async () => {
    let txnRef!: CerialTransaction;

    {
      await using txn = await client.$transaction();
      txnRef = txn;
      await txn.cancel();
    }

    expect(txnRef.state).toBe('cancelled');
  });

  test('await using: an error thrown in the scope still cancels the transaction', async () => {
    let txnRef!: CerialTransaction;

    await expect(
      (async () => {
        await using txn = await client.$transaction();
        txnRef = txn;
        await txn.BasicsUser.create({ data: { email: uniqueEmail(), name: 'Doomed', isActive: true } });
        throw new Error('boom');
      })(),
    ).rejects.toThrow('boom');

    expect(txnRef.state).toBe('cancelled');
    expect(await client.db.BasicsUser.findMany()).toHaveLength(0);
  });

  test('using: synchronous disposal cancels an active transaction', async () => {
    let txnRef!: CerialTransaction;

    {
      using txn = await client.$transaction();
      txnRef = txn;
      await txn.BasicsUser.create({ data: { email: uniqueEmail(), name: 'Sync', isActive: true } });
    }

    expect(txnRef.state).toBe('cancelled');
    await expect((async () => txnRef.commit())()).rejects.toThrow('Transaction already ended');
    expect(await client.db.BasicsUser.findMany()).toHaveLength(0);
  });
});
