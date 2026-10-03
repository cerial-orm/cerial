/**
 * E2E Tests: a transaction used after it ended is a CerialTransactionError
 *
 * Every way of touching a manual transaction after commit() or cancel() throws the named class, from
 * the 'cerial' package entry. This slice only names the errors; what an ended transaction does to the
 * pooled connection is a lifecycle matter and is not asserted here.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { CerialConnectionError, CerialDatabaseError, CerialTransactionError } from 'cerial';
import { type CerialClient as Client, cleanupTables, createTestClient, tables, testConfig } from '../test-helper';

const caught = async (run: () => unknown): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

describe('Transaction-state errors', () => {
  let client: Client;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  const data = { email: 'txn@x.io', name: 'a', isActive: true };

  for (const end of ['commit', 'cancel'] as const) {
    describe(`after ${end}()`, () => {
      test('a model call on the transaction throws the class', async () => {
        const txn = await client.$transaction();
        await txn[end]();
        const error = await caught(() => txn.BasicsUser.findMany());

        expect(error).toBeInstanceOf(CerialTransactionError);
        expect((error as CerialTransactionError).code).toBe('C5000');
      });

      test('commit() again throws the class', async () => {
        const txn = await client.$transaction();
        await txn[end]();
        const error = await caught(() => txn.commit());

        expect(error).toBeInstanceOf(CerialTransactionError);
        expect(error).not.toBeInstanceOf(CerialDatabaseError);
      });

      test('cancel() again throws the class', async () => {
        const txn = await client.$transaction();
        await txn[end]();
        const error = await caught(() => txn.cancel());

        expect(error).toBeInstanceOf(CerialTransactionError);
      });

      test('passing it as txn to a model call throws the class and writes nothing', async () => {
        const txn = await client.$transaction();
        await txn[end]();
        const error = await caught(() => client.db.BasicsUser.create({ data, txn }));

        expect(error).toBeInstanceOf(CerialTransactionError);
        expect(await client.db.BasicsUser.findMany({ where: { email: data.email } })).toHaveLength(0);
      });
    });
  }

  test('control: an active transaction works and ends cleanly', async () => {
    const txn = await client.$transaction();
    await txn.BasicsUser.findMany();

    expect(await caught(() => txn.commit())).toBeUndefined();
  });

  test('control: the state error is not a connection or database error', async () => {
    const txn = await client.$transaction();
    await txn.cancel();
    const error = await caught(() => txn.BasicsUser.findMany());

    expect(error).not.toBeInstanceOf(CerialConnectionError);
    expect(error).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a transaction callback that outlives its timeout and a nested transaction are the same class', async () => {
    const timeout = await caught(() =>
      client.$transaction(async () => new Promise((resolve) => setTimeout(resolve, 200)), { timeout: 20 }),
    );
    const nested = await caught(() =>
      client.$transaction(async (tx) => {
        // @ts-expect-error $transaction is excluded from TypedDb, testing the runtime guard
        tx.$transaction;
      }),
    );

    expect(timeout).toBeInstanceOf(CerialTransactionError);
    expect(nested).toBeInstanceOf(CerialTransactionError);
  });
});
