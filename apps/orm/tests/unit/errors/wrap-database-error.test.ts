/**
 * Unit tests: wrapDatabaseError, the one boundary where a driver error becomes a Cerial error.
 */

import { describe, expect, test } from 'bun:test';
import { SurrealError } from 'surrealdb';
import { wrapDatabaseError } from '../../../src/client/model/wrap-database-error';
import {
  CERIAL_ERROR_CODES,
  CerialDatabaseError,
  CerialUniqueConstraintError,
  CerialValidationError,
} from '../../../src/errors';

describe('wrapDatabaseError', () => {
  test('wraps a driver error with model, operation and the raw error as cause', () => {
    const raw = new SurrealError('parse error');
    const wrapped = wrapDatabaseError(raw, 'User', 'findMany');

    expect(wrapped).toBeInstanceOf(CerialDatabaseError);
    const error = wrapped as CerialDatabaseError;
    expect(error.code).toBe(CERIAL_ERROR_CODES.DATABASE);
    expect(error.model).toBe('User');
    expect(error.operation).toBe('findMany');
    expect(error.cause).toBe(raw);
    expect(error.message).toContain('findMany on User');
    expect(error.message).toContain('parse error');
  });

  test('carries no statement unless one is passed', () => {
    expect(
      (wrapDatabaseError(new SurrealError('x'), 'User', 'create') as CerialDatabaseError).statement,
    ).toBeUndefined();
  });

  test('attaches the statement and its bound values when passed', () => {
    const statement = { text: 'CREATE user SET email = $email;', vars: { email: 'a@x.io' } };
    const error = wrapDatabaseError(new SurrealError('x'), 'User', 'create', statement) as CerialDatabaseError;

    expect(error.statement).toEqual(statement);
  });

  test('passes an already-classified CerialError through untouched', () => {
    const validation = new CerialValidationError('bad input', { model: 'User', operation: 'create' });
    const unique = new CerialUniqueConstraintError('dup', { model: 'User', operation: 'create' });

    expect(wrapDatabaseError(validation, 'User', 'create')).toBe(validation);
    expect(wrapDatabaseError(unique, 'User', 'create')).toBe(unique);
  });

  test('passes a non-driver error through so a bug surfaces as itself', () => {
    const bug = new TypeError('undefined is not a function');

    expect(wrapDatabaseError(bug, 'User', 'create')).toBe(bug);
    expect(wrapDatabaseError('a string', 'User', 'create')).toBe('a string');
  });

  test('control characters in the server message are shown as escapes', () => {
    const raw = new SurrealError('bad value \u001b[2J\u001b]52;c;cHduZWQ\u0007\r\nforged: line');
    const message = (wrapDatabaseError(raw, 'User', 'create') as CerialDatabaseError).message;

    // oxlint-disable-next-line no-control-regex -- the point is that none remain
    expect(message).not.toMatch(/[\u0000-\u001f\u007f]/);
    expect(message).toContain('bad value \\u{1b}[2J\\u{1b}]52;c;cHduZWQ\\u{7}\\r\\nforged: line');
  });
});
