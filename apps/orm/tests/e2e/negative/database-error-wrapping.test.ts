/**
 * E2E Tests: database errors are wrapped with the Cerial call that produced them
 *
 * A driver error reaches the caller as a CerialDatabaseError naming the model and the operation, with
 * the raw error as `cause`. The generated statement is carried only when the client opts in, because
 * its bound values are user data. An error Cerial already classified keeps its own class.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  CerialDatabaseError,
  CerialError,
  CerialMigrationError,
  CerialUniqueConstraintError,
  CerialValidationError,
  Model,
} from 'cerial';
import { SurrealError } from 'surrealdb';
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

describe('Database error wrapping', () => {
  let client: Client;
  let verbose: Client;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    verbose = new CerialClient({ includeStatementInErrors: true });
    await verbose.connect(testConfig);
    await cleanupTables(client, tables.basics);
  });

  afterAll(async () => {
    await verbose.disconnect();
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.basics);
  });

  const data = { email: 'dup@x.io', name: 'a', isActive: true };

  /** A model whose table name cannot parse, so SurrealDB rejects the generated statement itself. */
  const malformedModel = (db: Client) => {
    const surreal = db.getSurreal();
    if (!surreal) throw new Error('client is not connected');
    const metadata = client.db.User.getMetadata();

    return new Model(surreal, { ...metadata, tableName: 'not a table!' }, undefined, {
      includeStatementInErrors: db === verbose,
    });
  };

  test('a malformed query surfaces as a CerialDatabaseError naming the call, with the raw error as cause', async () => {
    const error = await caught(() => malformedModel(client).findMany());

    expect(error).toBeInstanceOf(CerialDatabaseError);
    const wrapped = error as CerialDatabaseError;
    expect(wrapped.model).toBe('User');
    expect(wrapped.operation).toBe('findMany');
    expect(wrapped.message).toContain('findMany on User');
    expect(wrapped.cause).toBeInstanceOf(Error);
    expect(wrapped.cause).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a constraint violation from a write is wrapped with its operation', async () => {
    await client.db.User.create({ data });
    const error = await caught(() => client.db.User.create({ data }));

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect((error as CerialUniqueConstraintError).model).toBe('User');
    expect((error as CerialUniqueConstraintError).operation).toBe('create');
    expect(((error as CerialUniqueConstraintError).cause as Error).message).toContain('already contains');
  });

  test('the statement is absent by default', async () => {
    await client.db.User.create({ data });
    const error = (await caught(() => client.db.User.create({ data }))) as CerialUniqueConstraintError;

    expect(error.statement).toBeUndefined();
    expect(JSON.stringify(error.message)).not.toContain('CREATE');
  });

  test('the statement and its bound values are attached when the client opts in', async () => {
    await verbose.db.User.create({ data });
    const error = (await caught(() => verbose.db.User.create({ data }))) as CerialUniqueConstraintError;

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(error.statement?.text).toContain('CREATE');
    expect(Object.values(error.statement?.vars ?? {}).some((v) => JSON.stringify(v).includes('dup@x.io'))).toBe(true);
  });

  test('the option reaches a malformed query on a model created through the opted-in client', async () => {
    const error = (await caught(() => malformedModel(verbose).findMany())) as CerialDatabaseError;

    expect(error.statement?.text).toContain('not a table!');
  });

  test('the option applies inside a callback transaction, and is off there by default', async () => {
    await client.db.User.create({ data });

    const withOption = await caught(() => verbose.$transaction(async (tx) => tx.User.create({ data })));
    const without = await caught(() => client.$transaction(async (tx) => tx.User.create({ data })));

    expect(withOption).toBeInstanceOf(CerialUniqueConstraintError);
    expect((withOption as CerialUniqueConstraintError).statement?.text).toContain('CREATE');
    expect(without).toBeInstanceOf(CerialUniqueConstraintError);
    expect((without as CerialUniqueConstraintError).statement).toBeUndefined();
  });

  test('a successful query is not wrapped and keeps its shape', async () => {
    const created = await client.db.User.create({ data });
    const found = await client.db.User.findMany({ where: { email: 'dup@x.io' } });

    expect(created?.email).toBe('dup@x.io');
    expect(found).toHaveLength(1);
    expect(found[0]?.id).toBeDefined();
  });

  test('an error Cerial raised while the call ran keeps its own class', async () => {
    await client.db.User.create({ data: { ...data, id: 'u1' } });
    const error = await caught(() =>
      client.db.User.updateUnique({ where: { id: 'u1' }, data: { tags: { connect: ['nosuchtag'] } } }),
    );

    expect(error).toBeInstanceOf(CerialValidationError);
    expect(error).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a validation error raised before the query keeps its own class', async () => {
    // @ts-expect-error negative test: nope is not a field of User
    const error = await caught(() => client.db.User.findMany({ where: { nope: 1 } }));

    expect(error).toBeInstanceOf(CerialError);
    expect(error).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a failed migration is a CerialMigrationError naming the model, with the raw error as cause', async () => {
    const fresh = new CerialClient();
    await fresh.connect(testConfig);
    const surreal = fresh.getSurreal();
    if (!surreal) throw new Error('client is not connected');
    const raw = new SurrealError('migration refused');
    // The pooled connection is shared with the other clients in this file, so the stub is undone at once.
    const original = surreal.query;
    surreal.query = (() => {
      throw raw;
    }) as typeof surreal.query;

    try {
      const error = await caught(() => fresh.migrateModel('User'));

      expect(error).toBeInstanceOf(CerialMigrationError);
      expect((error as CerialMigrationError).model).toBe('User');
      expect((error as CerialMigrationError).operation).toBe('migrate');
      expect((error as CerialMigrationError).cause).toBe(raw);
    } finally {
      surreal.query = original;
      await fresh.disconnect();
    }
  });
});
