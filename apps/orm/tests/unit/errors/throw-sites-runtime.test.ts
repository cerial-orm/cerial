/**
 * Unit tests: value wrappers, connections, transactions and build-time failures throw their own class.
 *
 * Each case asserts the class and code and that no sibling class matches, since the hierarchy is flat.
 */

import { describe, expect, test } from 'bun:test';
import { Cerial } from '../../../src';
import { detectNestedConfigs } from '../../../src/cli/config/validator';
import { CerialTransaction } from '../../../src/client/cerial-transaction';
import { ConnectionManager } from '../../../src/client/connection';
import {
  CerialConnectionError,
  type CerialError,
  type CerialErrorCode,
  CerialGenerationError,
  CerialNotConnectedError,
  CerialTransactionError,
  CerialUnknownModelError,
  CerialValidationError,
} from '../../../src/errors';
import { applyFieldFilter } from '../../../src/resolver/filter';
import { CerialBytes, CerialDecimal, CerialDuration, CerialId, CerialUuid } from '../../../src/utils';
import { CerialPoint } from '../../../src/utils/cerial-geometry';
import { thrown, wrongClasses } from './helpers';

type Ctor = new (...args: never[]) => Error;

function expectClass(fn: () => unknown, ctor: Ctor, code: CerialErrorCode): CerialError {
  const error = thrown(fn);

  expect(error).toBeInstanceOf(ctor);
  expect((error as CerialError).code).toBe(code);
  for (const wrong of wrongClasses(ctor)) expect(error).not.toBeInstanceOf(wrong);

  return error as CerialError;
}

describe('value wrappers', () => {
  const cases: [string, () => unknown][] = [
    ['CerialId with a non-id type', () => new CerialId(Symbol('x') as never)],
    ['CerialId with a table mismatch', () => CerialId.parse('user:1', 'post')],
    ['CerialUuid with a malformed string', () => new CerialUuid('nope')],
    ['CerialUuid with a wrong type', () => new CerialUuid(1 as never)],
    ['CerialDecimal with an empty string', () => new CerialDecimal('')],
    ['CerialDecimal with a wrong type', () => new CerialDecimal({} as never)],
    ['CerialBytes with a wrong type', () => new CerialBytes(1 as never)],
    ['CerialDuration with a malformed string', () => new CerialDuration('nope')],
    ['CerialDuration with a wrong type', () => new CerialDuration(1 as never)],
    ['CerialPoint with a wrong shape', () => new CerialPoint('x' as never)],
  ];

  test.each(cases)('%s is a validation error', (_label, fn) => {
    expectClass(fn, CerialValidationError, 'C3000');
  });
});

describe('connections', () => {
  const manager = new ConnectionManager({});

  test('using an unknown named connection is a connection error', () => {
    expectClass(() => manager.useConnection('nope'), CerialConnectionError, 'C1001');
  });

  test('connecting with no config is a connection error', async () => {
    const error = await manager.connect().catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialConnectionError);
    expect(error).not.toBeInstanceOf(CerialNotConnectedError);
  });

  test('the legacy class reports an unknown instance as a connection error', () => {
    expectClass(() => Cerial.getInstance('nope'), CerialConnectionError, 'C1001');
  });
});

describe('transactions', () => {
  const registry = {};
  const txn = { commit: async () => {}, cancel: async () => {} } as never;

  test('using an ended transaction is a transaction error', async () => {
    const tx = new CerialTransaction(txn, registry);

    await tx.commit();
    expectClass(() => tx._ensureActive(), CerialTransactionError, 'C5000');
  });

  test('an unknown model is an unknown-model error carrying the model name', () => {
    const tx = new CerialTransaction(txn, registry);
    const error = expectClass(() => tx._getModel('Uesr'), CerialUnknownModelError, 'C2000');

    expect(error.model).toBe('Uesr');
  });
});

describe('build-time failures', () => {
  test('nested configs are a generation error', () => {
    expectClass(() => detectNestedConfigs(['a', 'a/b']), CerialGenerationError, 'C7000');
  });

  test('a filter naming a field the parent lacks is a generation error', () => {
    expectClass(
      () => applyFieldFilter([], { mode: 'pick', fields: ['ghost'] }, 'Parent'),
      CerialGenerationError,
      'C7000',
    );
  });
});
