import { describe, expect, test } from 'bun:test';
import { InternalError, QueryError, type Surreal } from 'surrealdb';
import { CerialDatabaseError, CerialTransactionError, CerialValidationError } from '../../../src/errors';
import { beginTransaction, createSurreal, validateBeginOptions, wrapDatabaseError } from '../../../src/client';
import { executeClientTransaction } from '../../../src/query/executor';

function messageOf(work: () => unknown): string {
  try {
    work();
  } catch (error) {
    expect(error).toBeInstanceOf(CerialValidationError);

    return (error as Error).message;
  }

  throw new Error('expected the call to throw');
}

describe('validateBeginOptions', () => {
  test.each([
    ['undefined', undefined],
    ['empty', {}],
    ['snapshot', { isolation: 'snapshot' }],
    ['serializable', { isolation: 'serializable' }],
    ['readOnly true', { readOnly: true }],
    ['readOnly false', { readOnly: false }],
    ['both', { isolation: 'serializable', readOnly: true }],
    ['array-mode keys', { timeout: 5, retries: 2, backoff: () => 0, isolation: 'snapshot' }],
  ])('accepts %s', (_name, options) => {
    expect(() => validateBeginOptions(options)).not.toThrow();
  });

  test.each([
    ['read committed', 'read committed'],
    ['bogus', 'bogus'],
    ['upper case', 'SNAPSHOT'],
    ['empty string', ''],
    ['a number', 1],
    ['null', null],
  ])('refuses isolation %s, naming the option', (_name, isolation) => {
    expect(messageOf(() => validateBeginOptions({ isolation }))).toContain('"isolation"');
  });

  test.each([
    ['a string', 'true'],
    ['a number', 1],
    ['null', null],
  ])('refuses readOnly as %s, naming the option', (_name, readOnly) => {
    expect(messageOf(() => validateBeginOptions({ readOnly }))).toContain('"readOnly"');
  });

  test.each([
    ['null', null],
    ['an array', []],
    ['a string', 'snapshot'],
  ])('refuses options that are %s', (_name, options) => {
    expect(() => validateBeginOptions(options)).toThrow(CerialValidationError);
  });

  test('strict mode refuses a key that is not a begin option, lenient mode lets it pass', () => {
    expect(messageOf(() => validateBeginOptions({ retries: 3 }, true))).toContain('"retries"');
    expect(messageOf(() => validateBeginOptions({ isolation: 'snapshot', foo: 1 }, true))).toContain('"foo"');
    expect(() => validateBeginOptions({ retries: 3 })).not.toThrow();
    expect(() => validateBeginOptions({ isolation: 'serializable', readOnly: true }, true)).not.toThrow();
  });
});

describe('beginTransaction', () => {
  function fakeSurreal(): { surreal: Surreal; begins: number } {
    const state = { begins: 0, surreal: undefined as unknown as Surreal };
    state.surreal = {
      beginTransaction: async () => {
        state.begins++;

        return {};
      },
    } as unknown as Surreal;

    return state;
  }

  test('a bad value throws before the driver is touched', async () => {
    const fake = fakeSurreal();

    await expect(beginTransaction(fake.surreal, { isolation: 'bogus' as 'snapshot' })).rejects.toThrow(
      CerialValidationError,
    );
    await expect(beginTransaction(fake.surreal, { readOnly: 'yes' as unknown as boolean })).rejects.toThrow(
      CerialValidationError,
    );
    expect(fake.begins).toBe(0);
  });

  test('no options on a foreign instance begins plainly', async () => {
    const fake = fakeSurreal();
    await beginTransaction(fake.surreal);
    await beginTransaction(fake.surreal, { readOnly: false });

    expect(fake.begins).toBe(2);
  });

  test('options on an instance Cerial did not open are refused instead of dropped', async () => {
    const fake = fakeSurreal();

    await expect(beginTransaction(fake.surreal, { readOnly: true })).rejects.toThrow(CerialTransactionError);
    expect(fake.begins).toBe(0);
  });

  test('an instance Cerial opens is accepted for begin options', () => {
    expect(createSurreal().status).toBe('disconnected');
  });
});

describe('executeClientTransaction', () => {
  test('a bad option throws before a transaction begins', async () => {
    let begins = 0;
    const surreal = {
      beginTransaction: async () => {
        begins++;

        return {};
      },
    } as unknown as Surreal;
    const item = { compiledQuery: { text: 'RETURN 1', vars: {} } } as never;

    await expect(executeClientTransaction(surreal, [item], { isolation: 'nope' as 'snapshot' })).rejects.toThrow(
      CerialValidationError,
    );
    expect(begins).toBe(0);
  });
});

describe('wrapDatabaseError, read-only refusals', () => {
  test('a refused statement is a CerialTransactionError carrying the driver error', () => {
    const cause = new InternalError({
      kind: 'Internal',
      message: 'Invalid statement: Cannot run CREATE on a read only transaction',
    });
    const wrapped = wrapDatabaseError(cause, 'User', 'create');

    expect(wrapped).toBeInstanceOf(CerialTransactionError);
    expect((wrapped as CerialTransactionError).cause).toBe(cause);
    expect((wrapped as CerialTransactionError).operation).toBe('create');
    expect((wrapped as CerialTransactionError).model).toBe('User');
  });

  test('refused DDL, a QueryError, is classified the same way', () => {
    const wrapped = wrapDatabaseError(
      new QueryError({
        kind: 'Query',
        message: "There was a problem with the key-value store: Couldn't write to a read only transaction",
      }),
      undefined,
      '$raw',
    );

    expect(wrapped).toBeInstanceOf(CerialTransactionError);
  });

  test('another database error stays a CerialDatabaseError', () => {
    const wrapped = wrapDatabaseError(new InternalError({ kind: 'Internal', message: 'boom' }), 'User', 'create');

    expect(wrapped).toBeInstanceOf(CerialDatabaseError);
    expect(wrapped).not.toBeInstanceOf(CerialTransactionError);
  });
});
