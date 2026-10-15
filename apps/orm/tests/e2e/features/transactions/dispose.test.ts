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

  // Cancelling the driver transaction underneath makes the next Cerial commit or cancel reject for
  // a real reason, which is the only way to reach the catch branches without a stub.
  describe('a commit or cancel that throws', () => {
    // The return type is inferred so the generated model accessors survive; annotating it as
    // CerialTransaction narrows to the base class and loses them.
    async function brokenTransaction() {
      const txn = await client.$transaction();
      await txn._raw.cancel();

      return txn;
    }

    test('commit: the error is the wrapped database error and the state is cancelled', async () => {
      const txn = await brokenTransaction();

      const error = await (async () => txn.commit())().then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).not.toContain('Transaction already ended');
      expect(txn.state).toBe('cancelled');
    });

    test('cancel: the state is cancelled', async () => {
      const txn = await brokenTransaction();

      await expect((async () => txn.cancel())()).rejects.toThrow();
      expect(txn.state).toBe('cancelled');
    });

    test('a second commit reports the transaction as ended', async () => {
      const txn = await brokenTransaction();
      await expect((async () => txn.commit())()).rejects.toThrow();

      await expect((async () => txn.commit())()).rejects.toThrow('Transaction already ended');
    });

    test('a second cancel reports the transaction as ended', async () => {
      const txn = await brokenTransaction();
      await expect((async () => txn.commit())()).rejects.toThrow();

      await expect((async () => txn.cancel())()).rejects.toThrow('Transaction already ended');
    });

    test('a second commit after a throwing cancel reports the transaction as ended', async () => {
      const txn = await brokenTransaction();
      await expect((async () => txn.cancel())()).rejects.toThrow();

      await expect((async () => txn.commit())()).rejects.toThrow('Transaction already ended');
    });

    test('a query through the transaction reports it as ended', async () => {
      const txn = await brokenTransaction();
      await expect((async () => txn.commit())()).rejects.toThrow();

      await expect(
        (async () => {
          await txn.BasicsUser.findMany();
        })(),
      ).rejects.toThrow('Transaction already ended');
    });

    test('await using exits cleanly without a second cancel', async () => {
      let txnRef!: CerialTransaction;

      await (async () => {
        await using txn = await client.$transaction();
        txnRef = txn;
        await txn._raw.cancel();
        await expect((async () => txn.commit())()).rejects.toThrow();
      })();

      expect(txnRef.state).toBe('cancelled');
    });
  });

  describe('a commit or cancel that succeeds', () => {
    test('commit ends committed', async () => {
      const txn = await client.$transaction();
      await txn.commit();

      expect(txn.state).toBe('committed');
    });

    test('cancel ends cancelled', async () => {
      const txn = await client.$transaction();
      await txn.cancel();

      expect(txn.state).toBe('cancelled');
    });
  });
});
