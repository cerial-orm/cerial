/**
 * Unit tests: wrapDatabaseError classifies a unique-index violation, and only that.
 *
 * The database sends prose with no structured field, so the text is parsed once, at this boundary.
 * The texts below are the ones SurrealDB 3.3.0 sends, probed live.
 */

import { describe, expect, test } from 'bun:test';
import { AlreadyExistsError, InternalError, SurrealError, ThrownError } from 'surrealdb';
import { wrapDatabaseError } from '../../../src/client/model/wrap-database-error';
import { CerialDatabaseError, CerialUniqueConstraintError } from '../../../src/errors';

const internal = (message: string): InternalError => new InternalError({ kind: 'Internal', message });

describe('unique-constraint classification', () => {
  test('a unique-index violation carries the model, operation, index, value and record', () => {
    const raw = internal("Database index `uq` already contains 'x@y.z', with record `sbx_uq:a`");
    const wrapped = wrapDatabaseError(raw, 'User', 'create');

    expect(wrapped).toBeInstanceOf(CerialUniqueConstraintError);
    const error = wrapped as CerialUniqueConstraintError;
    expect(error.code).toBe('C6000');
    expect(error.model).toBe('User');
    expect(error.operation).toBe('create');
    expect(error.index).toBe('uq');
    expect(error.value).toBe("'x@y.z'");
    expect(error.record).toBe('sbx_uq:a');
    expect(error.cause).toBe(raw);
    expect(error.message).toContain('create on User');
    expect(error.statement).toBeUndefined();
  });

  test('a numeric value, a value holding a quote and a composite value are kept as the database wrote them', () => {
    const value = (message: string) =>
      (wrapDatabaseError(internal(message), 'User', 'create') as CerialUniqueConstraintError).value;

    expect(value('Database index `uq` already contains 5, with record `t:c`')).toBe('5');
    expect(value('Database index `uq` already contains "it\'s", with record `t:e`')).toBe('"it\'s"');
    expect(value("Database index `uq` already contains ['a', 1], with record `t:f`")).toBe("['a', 1]");
  });

  test('a record id that needs escaping, and so holds backticks, is kept whole', () => {
    const raw = internal("Database index `user_email_unique` already contains 'a@x.io', with record `user:`u-a``");
    const error = wrapDatabaseError(raw, 'User', 'updateUnique') as CerialUniqueConstraintError;

    expect(error).toBeInstanceOf(CerialUniqueConstraintError);
    expect(error.index).toBe('user_email_unique');
    expect(error.record).toBe('user:`u-a`');
  });

  test('a value that itself contains the record phrase still splits on the last one', () => {
    const raw = internal("Database index `uq` already contains 'a, with record `x`', with record `t:a`");
    const error = wrapDatabaseError(raw, 'User', 'create') as CerialUniqueConstraintError;

    expect(error.value).toBe("'a, with record `x`'");
    expect(error.record).toBe('t:a');
  });

  test('the statement is attached only when one is passed', () => {
    const raw = internal("Database index `uq` already contains 'a', with record `t:a`");
    const statement = { text: 'CREATE user', vars: { email: 'a' } };

    expect((wrapDatabaseError(raw, 'User', 'create', statement) as CerialUniqueConstraintError).statement).toBe(
      statement,
    );
  });

  test('a duplicate record id is the same class, told apart by conflict, with no index or value', () => {
    const raw = new AlreadyExistsError({
      kind: 'AlreadyExists',
      message: 'Database record `sbx_uq:a` already exists',
      details: { kind: 'Record', details: { id: 'sbx_uq:a' } },
    });
    const wrapped = wrapDatabaseError(raw, 'User', 'create');

    expect(wrapped).toBeInstanceOf(CerialUniqueConstraintError);
    const error = wrapped as CerialUniqueConstraintError;
    expect(error.conflict).toBe('record');
    expect(error.record).toBe('sbx_uq:a');
    expect(error.index).toBeUndefined();
    expect(error.value).toBeUndefined();
    expect(error.model).toBe('User');
    expect(error.operation).toBe('create');
    expect(error.cause).toBe(raw);
  });

  test('an index violation has conflict index', () => {
    const raw = internal("Database index `uq` already contains 'a', with record `t:a`");

    expect((wrapDatabaseError(raw, 'User', 'create') as CerialUniqueConstraintError).conflict).toBe('index');
  });

  test('an AlreadyExistsError that is not about a record is not a unique conflict', () => {
    const table = new AlreadyExistsError({
      kind: 'AlreadyExists',
      message: "The table 'user' already exists",
      details: { kind: 'Table', details: { name: 'user' } },
    });
    const bare = new AlreadyExistsError({ kind: 'AlreadyExists', message: 'Database record `t:a` already exists' });

    for (const raw of [table, bare]) {
      const wrapped = wrapDatabaseError(raw, 'User', 'create');

      expect(wrapped).toBeInstanceOf(CerialDatabaseError);
      expect(wrapped).not.toBeInstanceOf(CerialUniqueConstraintError);
    }
  });

  test('similar-looking messages are not violations', () => {
    const lookalikes: Error[] = [
      internal('Database index `uq` already contains'),
      internal("Database index uq already contains 'a', with record t:a"),
      internal("The Database index `uq` already contains 'a', with record `t:a`"),
      internal("Database index `uq` already contains 'a', with record `t:a` and more"),
      internal('Found NONE for field `email`, with record `t:a`, but expected a string'),
      // A THROW from SurrealQL is kind Thrown; only an Internal error is a violation.
      new ThrownError({ kind: 'Thrown', message: "Database index `uq` already contains 'a', with record `t:a`" }),
      // The same text as a THROW or a bare driver error, for the duplicate-id wording.
      new ThrownError({ kind: 'Thrown', message: 'Database record `t:a` already exists' }),
      new SurrealError('Database record `t:a` already exists'),
      // A bare driver error has no kind at all.
      new SurrealError("Database index `uq` already contains 'a', with record `t:a`"),
    ];

    for (const raw of lookalikes) {
      const wrapped = wrapDatabaseError(raw, 'User', 'create');

      expect(wrapped).toBeInstanceOf(CerialDatabaseError);
      expect(wrapped).not.toBeInstanceOf(CerialUniqueConstraintError);
    }
  });

  test('an error already classified keeps its class, a non-driver error surfaces as itself', () => {
    const unique = new CerialUniqueConstraintError('dup', { index: 'uq' });
    const bug = new TypeError("Database index `uq` already contains 'a', with record `t:a`");

    expect(wrapDatabaseError(unique, 'User', 'create')).toBe(unique);
    expect(wrapDatabaseError(bug, 'User', 'create')).toBe(bug);
  });
});
