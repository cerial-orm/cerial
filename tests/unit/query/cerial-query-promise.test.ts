/**
 * Unit Tests: CerialQueryPromise
 *
 * Tests the thenable query descriptor that auto-executes when awaited
 * and can be collected into $transaction for batched execution.
 */

import { describe, expect, test } from 'bun:test';
import { CerialQueryPromise } from '../../../src/query/cerial-query-promise';
import type { CompiledQuery } from '../../../src/query/compile/types';
import type { ModelMetadata } from '../../../src/types';

const mockQuery: CompiledQuery = { text: 'SELECT * FROM user', vars: {} };
const mockMetadata: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [],
};

describe('CerialQueryPromise', () => {
  test('is a PromiseLike (thenable)', () => {
    const promise = new CerialQueryPromise(() => Promise.resolve([]), mockQuery, mockMetadata, 'array');

    expect(typeof promise.then).toBe('function');
  });

  test('auto-executes when awaited', async () => {
    const expected = [{ id: '1', name: 'Alice' }];
    const promise = new CerialQueryPromise(() => Promise.resolve(expected), mockQuery, mockMetadata, 'array');

    const result = await promise;

    expect(result).toEqual(expected);
  });

  test('isCerialQueryPromise returns true for instance', () => {
    const promise = new CerialQueryPromise(() => Promise.resolve(null), mockQuery, mockMetadata, 'single');

    expect(CerialQueryPromise.isCerialQueryPromise(promise)).toBe(true);
  });

  test('isCerialQueryPromise returns false for plain Promise', () => {
    const plain = Promise.resolve('hello');

    expect(CerialQueryPromise.isCerialQueryPromise(plain)).toBe(false);
  });

  test('isCerialQueryPromise returns false for null/undefined', () => {
    expect(CerialQueryPromise.isCerialQueryPromise(null)).toBe(false);
    expect(CerialQueryPromise.isCerialQueryPromise(undefined)).toBe(false);
  });

  test('exposes compiledQuery getter', () => {
    const query: CompiledQuery = { text: 'SELECT * FROM post WHERE $name_eq_0', vars: { name_eq_0: 'test' } };
    const promise = new CerialQueryPromise(() => Promise.resolve([]), query, mockMetadata, 'array');

    expect(promise.compiledQuery).toBe(query);
    expect(promise.compiledQuery.text).toBe('SELECT * FROM post WHERE $name_eq_0');
    expect(promise.compiledQuery.vars).toEqual({ name_eq_0: 'test' });
  });

  test('exposes metadata getter', () => {
    const promise = new CerialQueryPromise(() => Promise.resolve(null), mockQuery, mockMetadata, 'single');

    expect(promise.metadata).toBe(mockMetadata);
    expect(promise.metadata.name).toBe('User');
    expect(promise.metadata.tableName).toBe('user');
  });

  test('exposes resultType getter', () => {
    const promise = new CerialQueryPromise(() => Promise.resolve(0), mockQuery, mockMetadata, 'count');

    expect(promise.resultType).toBe('count');
  });

  // Bug regression: 'void' result type was added for deleteUnique (default return).
  // Without it, deleteUnique operations in $transaction would not map correctly.
  test('supports void result type for deleteUnique', () => {
    const promise = new CerialQueryPromise(() => Promise.resolve(true as never), mockQuery, mockMetadata, 'void');

    expect(promise.resultType).toBe('void');
  });

  test('executor errors propagate through then', async () => {
    const error = new Error('query failed');
    const promise = new CerialQueryPromise(() => Promise.reject(error), mockQuery, mockMetadata, 'single');

    let caught: unknown;
    await promise.then(
      () => {
        throw new Error('should not resolve');
      },
      (err) => {
        caught = err;
      },
    );

    expect(caught).toBe(error);
  });

  test('catch works', async () => {
    const error = new Error('execution error');
    const promise = new CerialQueryPromise(() => Promise.reject(error), mockQuery, mockMetadata, 'array');

    const caught = await promise.catch((err) => err);

    expect(caught).toBe(error);
  });

  test('finally works', async () => {
    let finallyCalled = false;

    // Test finally on success
    const successPromise = new CerialQueryPromise(() => Promise.resolve('ok'), mockQuery, mockMetadata, 'single');

    await successPromise.finally(() => {
      finallyCalled = true;
    });

    expect(finallyCalled).toBe(true);

    // Test finally on failure
    let finallyCalledOnError = false;
    const failPromise = new CerialQueryPromise(
      () => Promise.reject(new Error('fail')),
      mockQuery,
      mockMetadata,
      'single',
    );

    await failPromise
      .finally(() => {
        finallyCalledOnError = true;
      })
      .catch(() => {});

    expect(finallyCalledOnError).toBe(true);
  });
});
