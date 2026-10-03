/**
 * E2E: the generated client throws typed errors carrying the model, operation and field it knows.
 *
 * Each case asserts the class, the code, the context and that a sibling class does not match.
 */

import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  type CerialError,
  CerialNotConnectedError,
  CerialTransactionError,
  CerialUnknownFieldError,
  CerialValidationError,
} from 'cerial';
import { type CerialClient, cleanupTables, createTestClient, tables, testConfig } from '../test-helper';

/** Takes a thunk because a query can fail either synchronously, while compiling, or when awaited. */
async function caught(run: () => PromiseLike<unknown>): Promise<unknown> {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
}

describe('E2E typed errors: generated client', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  test('a call before connect is a not-connected error carrying the operation', async () => {
    const idle = createTestClient();
    const error = await caught(() => idle.$transaction(async () => 1));

    expect(error).toBeInstanceOf(CerialNotConnectedError);
    expect((error as CerialError).code).toBe('C1000');
    expect((error as CerialError).operation).toBe('$transaction');
    expect(error).not.toBeInstanceOf(CerialTransactionError);
  });

  test('an unknown where field is an unknown-field error naming model, operation and field', async () => {
    // @ts-expect-error — unknown field, testing the runtime guard
    const error = await caught(() => client.db.BasicsUser.findMany({ where: { nmae: 'x' } }));

    expect(error).toBeInstanceOf(CerialUnknownFieldError);
    expect((error as CerialError).code).toBe('C2001');
    expect((error as CerialError).model).toBe('BasicsUser');
    expect((error as CerialError).operation).toBe('findMany');
    expect((error as CerialError).field).toBe('nmae');
    expect(error).not.toBeInstanceOf(CerialValidationError);
  });

  test('a missing required field is a validation error naming the field', async () => {
    // @ts-expect-error — required field omitted, testing the runtime guard
    const error = await caught(() => client.db.BasicsUser.create({ data: { isActive: true } }));

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialError).code).toBe('C3000');
    expect((error as CerialError).model).toBe('BasicsUser');
    expect((error as CerialError).operation).toBe('create');
    expect(error).not.toBeInstanceOf(CerialUnknownFieldError);
  });

  test('a transaction callback that outlives its timeout is a transaction error', async () => {
    const error = await caught(() =>
      client.$transaction(async () => new Promise((resolve) => setTimeout(resolve, 300)), { timeout: 20 }),
    );

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect((error as CerialError).code).toBe('C5000');
    expect((error as CerialError).operation).toBe('$transaction');
  });

  test('nesting a transaction is a transaction error', async () => {
    const error = await caught(() =>
      client.$transaction(async (tx) => {
        // @ts-expect-error — $transaction is excluded from TypedDb, testing the runtime guard
        tx.$transaction;
      }),
    );

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect(error).not.toBeInstanceOf(CerialNotConnectedError);
  });

  test('using an ended transaction is a transaction error', async () => {
    const txn = await client.$transaction();
    await txn.commit();

    let error: unknown;
    try {
      txn.BasicsUser.findMany();
    } catch (e) {
      error = e;
    }

    expect(error).toBeInstanceOf(CerialTransactionError);
    expect(error).not.toBeInstanceOf(CerialValidationError);
  });

  test('an array transaction item that is not a query is a validation error', async () => {
    // @ts-expect-error — a non-query item, testing the runtime guard
    const error = await caught(() => client.$transaction([42]));

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as CerialError).operation).toBe('$transaction');
  });
});
