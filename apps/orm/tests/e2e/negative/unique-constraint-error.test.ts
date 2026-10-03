/**
 * E2E Tests: a unique-index violation is a CerialUniqueConstraintError naming the index and value
 *
 * Imports from 'cerial', the package entry, because instanceof across that boundary is what a consumer
 * relies on. A taken record id is the same class as a taken index value; `conflict` says which.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialDatabaseError, CerialUniqueConstraintError } from 'cerial';
import { AlreadyExistsError } from 'surrealdb';
import {
  CerialClient,
  type CerialClient as Client,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../test-helper';

const caught = async (run: () => PromiseLike<unknown>): Promise<unknown> => {
  try {
    await run();
  } catch (error) {
    return error;
  }

  return undefined;
};

describe('Unique-constraint errors', () => {
  let client: Client;

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

  const user = (email: string, extra: Record<string, unknown> = {}) => ({
    data: { email, name: 'a', isActive: true, ...extra },
  });

  test('create on a taken email names the model, operation, index, value and conflicting record', async () => {
    await client.db.User.create(user('dup@x.io', { id: 'first' }));
    const error = await caught(() => client.db.User.create(user('dup@x.io')));

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    const unique = error as CerialUniqueConstraintError;
    expect(unique.code).toBe('C6000');
    expect(unique.model).toBe('User');
    expect(unique.operation).toBe('create');
    expect(unique.index).toContain('email');
    expect(unique.value).toBe("'dup@x.io'");
    expect(unique.record).toBe('user:first');
    expect(unique.cause).toBeInstanceOf(Error);
    expect(unique.statement).toBeUndefined();
    expect(unique).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a caller branches on the properties, not on the message', async () => {
    await client.db.User.create(user('dup@x.io'));
    const error = (await caught(() => client.db.User.create(user('dup@x.io')))) as CerialUniqueConstraintError;

    expect(error.index?.includes('email')).toBe(true);
    expect(error.value).toBe("'dup@x.io'");
  });

  test('updateUnique to a taken email is the same class under its own operation', async () => {
    await client.db.User.create(user('a@x.io', { id: 'u-a' }));
    await client.db.User.create(user('b@x.io', { id: 'u-b' }));
    const error = await caught(() => client.db.User.updateUnique({ where: { id: 'u-b' }, data: { email: 'a@x.io' } }));

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect((error as CerialUniqueConstraintError).operation).toBe('updateUnique');
    expect((error as CerialUniqueConstraintError).value).toBe("'a@x.io'");
  });

  test('upsert by a unique field whose update path moves to a taken email is classified', async () => {
    await client.db.User.create(user('a@x.io'));
    await client.db.User.create(user('b@x.io'));
    const error = await caught(() =>
      client.db.User.upsert({
        where: { email: 'b@x.io' },
        create: { email: 'b@x.io', name: 'n', isActive: true },
        update: { email: 'a@x.io' },
      }),
    );

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect((error as CerialUniqueConstraintError).operation).toBe('upsert');
    expect((error as CerialUniqueConstraintError).value).toBe("'a@x.io'");
  });

  test('a different unique field on another model names its own index', async () => {
    await client.db.Tag.create({ data: { name: 'dup-tag' } });
    const error = await caught(() => client.db.Tag.create({ data: { name: 'dup-tag' } }));

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect((error as CerialUniqueConstraintError).model).toBe('Tag');
    expect((error as CerialUniqueConstraintError).index).toContain('name');
    expect((error as CerialUniqueConstraintError).value).toBe("'dup-tag'");
  });

  test('inside a callback transaction it is classified and the transaction rolls back', async () => {
    await client.db.User.create(user('dup@x.io'));
    const error = await caught(() =>
      client.$transaction(async (tx) => {
        await tx.User.create(user('fresh@x.io'));

        return tx.User.create(user('dup@x.io'));
      }),
    );

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(await client.db.User.count({ email: 'fresh@x.io' })).toBe(0);
  });

  test('the statement is attached to a unique error only when the client opts in', async () => {
    const verbose = new CerialClient({ includeStatementInErrors: true });
    await verbose.connect(testConfig);
    try {
      await verbose.db.User.create(user('dup@x.io'));
      const error = (await caught(() => verbose.db.User.create(user('dup@x.io')))) as CerialUniqueConstraintError;

      expect(error).toBeInstanceOf(CerialUniqueConstraintError);
      expect(error.statement?.text).toContain('CREATE');
    } finally {
      await verbose.disconnect();
    }
  });

  test('a duplicate record id is the same class with conflict record and no index or value', async () => {
    await client.db.User.create(user('a@x.io', { id: 'same' }));
    const error = await caught(() => client.db.User.create(user('b@x.io', { id: 'same' })));

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(error).not.toBeInstanceOf(CerialDatabaseError);
    const duplicate = error as CerialUniqueConstraintError;
    expect(duplicate.conflict).toBe('record');
    expect(duplicate.record).toBe('user:same');
    expect(duplicate.index).toBeUndefined();
    expect(duplicate.value).toBeUndefined();
    expect(duplicate.operation).toBe('create');
    expect(duplicate.cause).toBeInstanceOf(AlreadyExistsError);
  });

  test('an index conflict reports conflict index', async () => {
    await client.db.User.create(user('dup@x.io'));
    const error = (await caught(() => client.db.User.create(user('dup@x.io')))) as CerialUniqueConstraintError;

    expect(error.conflict).toBe('index');
  });

  test('one catch handles both, and conflict says which', async () => {
    await client.db.User.create(user('a@x.io', { id: 'same' }));
    const conflicts: string[] = [];
    for (const attempt of [user('a@x.io'), user('b@x.io', { id: 'same' })]) {
      const error = await caught(() => client.db.User.create(attempt));
      if (error instanceof CerialUniqueConstraintError) conflicts.push(error.conflict);
    }

    expect(conflicts).toEqual(['index', 'record']);
  });

  test('control: a stored value that reads like the violation text is not a violation', async () => {
    const phrase = "Database index `uq` already contains 'a', with record `t:a`";
    const first = await client.db.User.create(user('ok@x.io', { name: phrase }));
    const second = await client.db.User.create(user('ok2@x.io', { name: phrase }));

    expect(first?.name).toBe(phrase);
    expect(second?.name).toBe(phrase);
  });

  test('control: a successful write that does not collide is untouched', async () => {
    await client.db.User.create(user('a@x.io'));
    const second = await client.db.User.create(user('b@x.io'));

    expect(second?.email).toBe('b@x.io');
  });
});
