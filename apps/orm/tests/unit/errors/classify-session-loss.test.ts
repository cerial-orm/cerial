/**
 * Unit tests: wrapDatabaseError tells a lost session from a genuine permissions refusal.
 *
 * Both are `NotAllowedError`. The lost session is the one the live database sends an unauthenticated
 * socket: a structured `Auth` > `NotAllowed` detail whose actor is `anonymous`. The live sequence is in
 * tests/integration/session-loss.test.ts.
 */

import { describe, expect, test } from 'bun:test';
import { NotAllowedError } from 'surrealdb';
import { wrapDatabaseError } from '../../../src/client/model/wrap-database-error';
import { CerialConnectionError, CerialDatabaseError, CerialSessionLostError } from '../../../src/errors';

/** The shape the server sends for an IAM refusal, with the denied actor as the only variable. */
const refusal = (actor: string): NotAllowedError =>
  new NotAllowedError({
    kind: 'NotAllowed',
    message: `${actor} access not allowed: Not enough permissions to perform this action`,
    details: {
      kind: 'Auth',
      details: { kind: 'NotAllowed', details: { actor, action: 'process', resource: 'query' } },
    },
  });

describe('session-loss classification', () => {
  test('an anonymous refusal is a CerialSessionLostError with the driver error as cause', () => {
    const raw = refusal('anonymous');
    const wrapped = wrapDatabaseError(raw, 'User', 'findMany');

    expect(wrapped).toBeInstanceOf(CerialSessionLostError);
    const error = wrapped as CerialSessionLostError;
    expect(error.code).toBe('C1002');
    expect(error.name).toBe('CerialSessionLostError');
    expect(error.model).toBe('User');
    expect(error.operation).toBe('findMany');
    expect(error.cause).toBe(raw);
  });

  test('the message names the lost session and the reconnect, and neither credentials nor permissions', () => {
    const error = wrapDatabaseError(refusal('anonymous'), 'User', 'findMany') as CerialSessionLostError;

    expect(error.message).toContain('session was lost');
    expect(error.message).toContain('re-established');
    expect(error.message).not.toMatch(/credential|permission|password|not allowed/i);
  });

  test('it is a CerialConnectionError, so a generic connection handler catches it, and not a database error', () => {
    const error = wrapDatabaseError(refusal('anonymous'), 'User', 'findMany');

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect(error).not.toBeInstanceOf(CerialDatabaseError);
  });

  test('a plain CerialConnectionError keeps C1001 and is not a session loss', () => {
    const error = new CerialConnectionError('down');

    expect(error.code).toBe('C1001');
    expect(error).not.toBeInstanceOf(CerialSessionLostError);
  });

  for (const actor of ['root', 'record', 'database user']) {
    test(`a refusal of the authenticated actor "${actor}" stays a CerialDatabaseError that says permissions`, () => {
      const raw = refusal(actor);
      const wrapped = wrapDatabaseError(raw, 'User', 'findMany');

      expect(wrapped).toBeInstanceOf(CerialDatabaseError);
      expect(wrapped).not.toBeInstanceOf(CerialSessionLostError);
      expect((wrapped as CerialDatabaseError).message).toContain('Not enough permissions');
      expect((wrapped as CerialDatabaseError).cause).toBe(raw);
    });
  }

  test('other NotAllowed refusals are never taken for a lost session', () => {
    const others = [
      { kind: 'Auth', details: { kind: 'TokenExpired' } },
      { kind: 'Auth', details: { kind: 'InvalidAuth' } },
      { kind: 'Scripting' },
      { kind: 'Method', details: { name: 'signup' } },
    ];

    for (const details of others) {
      const raw = new NotAllowedError({ kind: 'NotAllowed', message: 'refused', details });

      expect(wrapDatabaseError(raw, 'User', 'findMany')).toBeInstanceOf(CerialDatabaseError);
    }
  });

  test('a NotAllowed refusal with no details is a CerialDatabaseError', () => {
    const raw = new NotAllowedError({ kind: 'NotAllowed', message: 'refused' });

    expect(wrapDatabaseError(raw, 'User', 'findMany')).toBeInstanceOf(CerialDatabaseError);
  });
});
