/**
 * The executor reads the guard's position and raises today's CerialValidationError; anything else at
 * that position, or any error, is not this check's and reaches wrapDatabaseError unchanged.
 */

import { describe, expect, test } from 'bun:test';
import { QueryError } from 'surrealdb';
import { wrapDatabaseError } from '../../../../src/client/model/wrap-database-error';
import { CerialError, CerialValidationError } from '../../../../src/errors';
import { executeQuery, executeQuerySingle } from '../../../../src/query/executor';
import { buildUpdateWithNestedTransaction } from '../../../../src/query/builders/nested-builder';
import { existsRead, fakeDb, missingAt, registry, userBuilder, userModel, userRow, written } from './helpers';

const createData = { email: 'a@b.co', name: 'A' };

async function failure(call: () => Promise<unknown>): Promise<unknown> {
  try {
    await call();
  } catch (error) {
    return error;
  }
  throw new Error('expected the call to reject');
}

function expectMissing(error: unknown, message: string, operation: string, field: string): void {
  expect(error).toBeInstanceOf(CerialValidationError);
  expect((error as CerialValidationError).message).toBe(message);
  expect(error).toMatchObject({ model: 'User', field, operation });
}

describe('error mapping per operation', () => {
  test('create names the record and reports one round trip', async () => {
    const { db, sent } = fakeDb(missingAt(0));
    const error = await failure(() =>
      userBuilder(db).create({ data: { ...createData, profile: { connect: 'profile:i' } } }),
    );

    expectMissing(
      error,
      'Field "profile" on model "User": cannot connect Profile record "profile:i" because it does not exist',
      'create',
      'profile',
    );
    expect(sent).toHaveLength(1);
  });

  test('updateMany reports one round trip', async () => {
    const { db, sent } = fakeDb(missingAt(1));
    const error = await failure(() =>
      userBuilder(db).updateMany({ where: { name: 'A' }, data: { tags: { connect: ['tag:a', 'tag:b'] } } }),
    );

    expectMissing(
      error,
      'Field "tags" on model "User": cannot connect Tag record "tag:b" because it does not exist',
      'updateMany',
      'tags',
    );
    expect(sent).toHaveLength(1);
  });

  test('updateUnique reports one round trip', async () => {
    const { db, sent } = fakeDb(missingAt(0));
    const error = await failure(() =>
      userBuilder(db).updateUnique({ where: { id: 'user:1' }, data: { tags: { set: ['tag:h'] } } }),
    );

    expectMissing(
      error,
      'Field "tags" on model "User": cannot set Tag record "tag:h" because it does not exist',
      'updateUnique',
      'tags',
    );
    expect(sent).toHaveLength(1);
  });

  test('upsert, create half: two round trips (exists read, guarded write)', async () => {
    const { db, sent } = fakeDb([[]], missingAt(0));
    const error = await failure(() =>
      userBuilder(db).upsert({
        where: { id: 'user:1' },
        create: { ...createData, profile: { connect: 'profile:i' } },
        update: {},
      }),
    );

    expectMissing(
      error,
      'Field "profile" on model "User": cannot connect Profile record "profile:i" because it does not exist',
      'upsert',
      'profile',
    );
    expect(sent).toHaveLength(2);
  });

  test('upsert, update half: two round trips', async () => {
    const { db, sent } = fakeDb(existsRead, missingAt(0));
    const error = await failure(() =>
      userBuilder(db).upsert({
        where: { id: 'user:1' },
        create: createData,
        update: { tags: { connect: ['tag:f'] } },
      }),
    );

    expectMissing(
      error,
      'Field "tags" on model "User": cannot connect Tag record "tag:f" because it does not exist',
      'upsert',
      'tags',
    );
    expect(sent).toHaveLength(2);
  });
});

describe('present targets', () => {
  test('create with every target present returns the row from the block', async () => {
    const { db, sent } = fakeDb(written);
    const row = await userBuilder(db).create({ data: { ...createData, profile: { connect: 'profile:a' } } });

    expect(row).toMatchObject({ email: 'a@b.co', name: 'A' });
    expect(sent).toHaveLength(1);
  });

  test('upsert update half with every target present: two round trips', async () => {
    const { db, sent } = fakeDb(existsRead, [null, null, null, [existsRead[0]], null]);
    await userBuilder(db).upsert({
      where: { id: 'user:1' },
      create: createData,
      update: { tags: { connect: ['tag:a'] } },
    });

    expect(sent).toHaveLength(2);
  });
});

describe('missing targets of N', () => {
  const data = { email: 'a@b.co', name: 'A', tags: { connect: ['tag:a', 'tag:b', 'tag:c'] } };

  test('one missing of three reports that one', async () => {
    const { db } = fakeDb(missingAt(1));
    const error = await failure(() => userBuilder(db).create({ data }));

    expect((error as CerialValidationError).message).toContain('Tag record "tag:b"');
  });

  test('two missing of three report the first in request order (the server returns that position)', async () => {
    // The server answers find_index: with tag:b and tag:c both gone, the position is 1
    const { db } = fakeDb(missingAt(1));
    const error = await failure(() => userBuilder(db).create({ data }));

    expect((error as CerialValidationError).message).toContain('Tag record "tag:b"');
    expect((error as CerialValidationError).message).not.toContain('tag:c');
  });

  test('all missing reports the first', async () => {
    const { db } = fakeDb(missingAt(0));
    const error = await failure(() => userBuilder(db).create({ data }));

    expect((error as CerialValidationError).message).toContain('Tag record "tag:a"');
  });
});

describe('a value that is not a mapped position', () => {
  const query = buildUpdateWithNestedTransaction(
    userModel,
    { id: 'user:1' },
    {},
    new Map([['tags', { connect: ['tag:a'] }]]),
    registry,
  );

  test('a number past the side table is not a CerialError and wrapDatabaseError leaves it unchanged', async () => {
    const error = await failure(() => executeQuery(fakeDb(missingAt(7)).db, query));

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(CerialError);
    expect(wrapDatabaseError(error, 'User', 'updateMany')).toBe(error);
  });

  test('a negative or fractional number is unmapped too', async () => {
    for (const value of [-1, 0.5]) {
      const error = await failure(() => executeQuerySingle(fakeDb(missingAt(value)).db, query));

      expect(error).not.toBeInstanceOf(CerialValidationError);
    }
  });

  test('a string or object at the position goes through unchanged', async () => {
    for (const value of ['0', { at: 0 }, [0], true]) {
      const error = await failure(() => executeQuery(fakeDb([null, null, value, null, null]).db, query));

      expect(error).not.toBeInstanceOf(CerialValidationError);
      expect(wrapDatabaseError(error, 'User', 'updateMany')).toBe(error);
    }
  });

  test('NONE or null at the position runs the normal result walk', async () => {
    expect(await executeQuery(fakeDb(written).db, query)).toEqual([expect.objectContaining({ name: 'A' })]);
    expect(await executeQuery(fakeDb([null, null, undefined, [], null]).db, query)).toEqual([]);
  });

  test('a database error is not caught: the caller sees the driver error itself', async () => {
    const driver = new QueryError({ kind: 'Query', message: 'boom', details: { kind: 'TimedOut' } });
    const db = {
      query: () => ({
        collect: async () => {
          throw driver;
        },
      }),
    } as unknown as Parameters<typeof executeQuery>[0];

    expect(await failure(() => executeQuery(db, query))).toBe(driver);
  });
});

describe('inside an SDK transaction', () => {
  test('the stripped BEGIN moves the position up by one', async () => {
    const { SurrealTransaction } = await import('surrealdb');
    const txn = Object.create(SurrealTransaction.prototype) as InstanceType<typeof SurrealTransaction>;
    // LET, RETURN $target_missing, IF: the BEGIN has no result
    Object.assign(txn, { query: () => ({ collect: async () => [null, 1, null] }) });
    const query = buildUpdateWithNestedTransaction(
      userModel,
      { id: 'user:1' },
      {},
      new Map([['tags', { connect: ['tag:a', 'tag:b'] }]]),
      registry,
    );

    const error = await failure(() => executeQuery(txn as unknown as Parameters<typeof executeQuery>[0], query));

    expect((error as CerialValidationError).message).toContain('Tag record "tag:b"');
  });
});

describe('return: before with a nested connect', () => {
  test('updateUnique reads the prior row from the block and reports one round trip', async () => {
    const { db, sent } = fakeDb([null, null, null, [userRow], null]);
    const row = await userBuilder(db).updateUnique({
      where: { id: 'user:1' },
      data: { tags: { connect: ['tag:a'] } },
      return: 'before',
    });

    expect(row).toMatchObject({ email: 'a@b.co' });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain('RETURN $prior;');
  });

  test('a missing target still raises the typed error', async () => {
    const error = await failure(() =>
      userBuilder(fakeDb(missingAt(0)).db).updateUnique({
        where: { id: 'user:1' },
        data: { tags: { connect: ['tag:a'] } },
        return: 'before',
      }),
    );

    expect(error).toBeInstanceOf(CerialValidationError);
  });
});
