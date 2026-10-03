/**
 * Unit tests: wrapDatabaseError classifies a lost or unavailable connection.
 *
 * Each driver class below is what the SDK throws when the socket is gone, is being re-opened, or the
 * HTTP transport fails. The live dropped-socket case is in tests/integration/connection-loss.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import {
  CallTerminatedError,
  ConnectionUnavailableError,
  HttpConnectionError,
  ReconnectExhaustionError,
  ReconnectIterationError,
  SurrealError,
  UnexpectedConnectionError,
} from 'surrealdb';
import { wrapDatabaseError } from '../../../src/client/model/wrap-database-error';
import {
  CerialConnectionError,
  CerialDatabaseError,
  CerialNotConnectedError,
  CerialTransactionError,
} from '../../../src/errors';

const lost: [string, SurrealError][] = [
  ['CallTerminatedError', new CallTerminatedError()],
  ['ConnectionUnavailableError', new ConnectionUnavailableError()],
  ['HttpConnectionError', new HttpConnectionError('refused', 502, 'Bad Gateway', new ArrayBuffer(0))],
  ['ReconnectExhaustionError', new ReconnectExhaustionError()],
  ['ReconnectIterationError', new ReconnectIterationError()],
  ['UnexpectedConnectionError', new UnexpectedConnectionError(new Error('reset'))],
];

describe('connection-loss classification', () => {
  for (const [name, raw] of lost) {
    test(`${name} becomes a CerialConnectionError with the raw error as cause`, () => {
      const wrapped = wrapDatabaseError(raw, 'User', 'findMany');

      expect(wrapped).toBeInstanceOf(CerialConnectionError);
      const error = wrapped as CerialConnectionError;
      expect(error.code).toBe('C1001');
      expect(error.model).toBe('User');
      expect(error.operation).toBe('findMany');
      expect(error.cause).toBe(raw);
    });
  }

  test('a call that belongs to no model names the operation alone', () => {
    const error = wrapDatabaseError(new CallTerminatedError(), undefined, 'commit') as CerialConnectionError;

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect(error.model).toBeUndefined();
    expect(error.message).toStartWith('commit failed');
  });

  test('other driver errors are not mistaken for a lost connection', () => {
    const wrapped = wrapDatabaseError(new SurrealError('parse error'), 'User', 'findMany');

    expect(wrapped).toBeInstanceOf(CerialDatabaseError);
    expect(wrapped).not.toBeInstanceOf(CerialConnectionError);
  });

  test('an error already classified keeps its class, a non-driver error surfaces as itself', () => {
    const notConnected = new CerialNotConnectedError('Not connected');
    const ended = new CerialTransactionError('Transaction already ended');
    const bug = new TypeError('x is not a function');

    expect(wrapDatabaseError(notConnected, 'User', 'findMany')).toBe(notConnected);
    expect(wrapDatabaseError(ended, 'User', 'findMany')).toBe(ended);
    expect(wrapDatabaseError(bug, 'User', 'findMany')).toBe(bug);
  });
});
