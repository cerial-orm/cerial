/**
 * Unit tests: the CerialError base class and every subclass in the taxonomy.
 *
 * A new subclass needs a row in `helpers.ts`, which is what keeps the code-uniqueness and
 * sibling-mismatch checks below exhaustive.
 */

import { describe, expect, test } from 'bun:test';
import { CERIAL_ERROR_CODES, CerialError, CerialValidationError } from '../../../src/errors';
import { ERROR_CLASSES } from './helpers';

describe('CerialError', () => {
  test('is an Error with the code, message and context it was given', () => {
    const error = new CerialError('C3000', 'bad input', { model: 'User', operation: 'create', field: 'email' });

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CerialError);
    expect(error.code).toBe('C3000');
    expect(error.message).toBe('bad input');
    expect(error.model).toBe('User');
    expect(error.operation).toBe('create');
    expect(error.field).toBe('email');
    expect(error.name).toBe('CerialError');
  });

  test('context is optional and absent when not given', () => {
    const error = new CerialError('C6001', 'boom');

    expect(error.model).toBeUndefined();
    expect(error.operation).toBeUndefined();
    expect(error.field).toBeUndefined();
    expect('cause' in error).toBe(false);
  });

  test('keeps the cause so the raw database error is not lost', () => {
    const raw = new Error('Database index `u` already contains a value');
    const error = new CerialError('C6001', 'create on User failed', { cause: raw });

    expect(error.cause).toBe(raw);
  });

  test('carries a stack trace that includes the message', () => {
    expect(new CerialError('C6001', 'boom').stack).toContain('boom');
  });
});

describe('error codes', () => {
  test('every code is a letter and four digits, the Prisma register', () => {
    for (const code of Object.values(CERIAL_ERROR_CODES)) expect(code).toMatch(/^C\d{4}$/);
  });

  test('no two error kinds share a code', () => {
    const codes = Object.values(CERIAL_ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);
  });

  test('every code belongs to exactly one subclass', () => {
    expect(ERROR_CLASSES.map((c) => c.code).sort()).toEqual(Object.values(CERIAL_ERROR_CODES).sort());
  });
});

describe.each(ERROR_CLASSES)('$name', ({ name, ctor, code }) => {
  test('is a CerialError and an Error', () => {
    const error = new ctor('msg');

    expect(error).toBeInstanceOf(ctor);
    expect(error).toBeInstanceOf(CerialError);
    expect(error).toBeInstanceOf(Error);
  });

  test('carries its own code and name', () => {
    const error = new ctor('msg') as CerialError;

    expect(error.code).toBe(code);
    expect(error.name).toBe(name);
  });

  test('carries the model, operation, field and cause it was given', () => {
    const raw = new Error('raw');
    const error = new ctor('msg', {
      model: 'Post',
      operation: 'updateUnique',
      field: 'slug',
      cause: raw,
    }) as CerialError;

    expect(error.model).toBe('Post');
    expect(error.operation).toBe('updateUnique');
    expect(error.field).toBe('slug');
    expect(error.cause).toBe(raw);
  });

  test('does not match any sibling class', () => {
    const error = new ctor('msg');

    for (const sibling of ERROR_CLASSES) {
      if (sibling.ctor === ctor) continue;
      expect(error instanceof sibling.ctor).toBe(false);
    }
  });

  test('is not matched by an unrelated Error or by a bare CerialError', () => {
    expect(new Error('msg') instanceof ctor).toBe(false);
    expect(new CerialError(code, 'msg') instanceof ctor).toBe(false);
  });

  test('can be thrown and caught by class, not by prose', () => {
    const attempt = (): never => {
      throw new ctor('wording that may change', { model: 'User' });
    };

    try {
      attempt();
      throw new Error('unreachable');
    } catch (e) {
      expect(e instanceof ctor).toBe(true);
      expect(e instanceof CerialValidationError).toBe(ctor === CerialValidationError);
    }
  });
});
