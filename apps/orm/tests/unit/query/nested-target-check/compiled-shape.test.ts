/**
 * The guarded text of a standalone nested write: one read per linked record, the write in an IF block
 * that runs only when none is missing, and a side table mapping each read's position to its record.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
} from '../../../../src/query/builders/nested-builder';
import { registry, userModel } from './helpers';

const data = { email: 'a@b.co', name: 'A' };

describe('guarded nested create', () => {
  test('one connect id: one read, the write inside the block, the RETURN before COMMIT', () => {
    const query = buildCreateWithNestedTransaction(
      userModel,
      data,
      new Map([['profile', { connect: 'profile:a' }]]),
      registry,
    );

    expect(query.text.split('\n')).toEqual([
      'BEGIN TRANSACTION;',
      'LET $target_missing = [(SELECT VALUE id FROM ONLY $validate_0_0)].find_index(NONE);',
      'RETURN $target_missing;',
      'IF $target_missing IS NONE {',
      'LET $result = CREATE ONLY user CONTENT $content_main_0;',
      'LET $resultId = $result.id;',
      'RETURN $result;',
      '};',
      'COMMIT TRANSACTION;',
    ]);
    expect(query.targetCheck).toEqual({
      at: 2,
      model: 'User',
      operation: 'create',
      entries: [{ field: 'profile', verb: 'connect', targetModel: 'Profile', id: 'profile:a' }],
    });
    expect(String(query.vars.validate_0_0)).toBe('profile:a');
  });

  test('N ids: one read per id in request order, one entry per read', () => {
    const query = buildCreateWithNestedTransaction(
      userModel,
      data,
      new Map([['tags', { connect: ['tag:c', 'tag:a', 'tag:b'] }]]),
      registry,
    );

    expect(query.text).toContain(
      'LET $target_missing = [(SELECT VALUE id FROM ONLY $validate_0_0), (SELECT VALUE id FROM ONLY $validate_0_1), (SELECT VALUE id FROM ONLY $validate_0_2)].find_index(NONE);',
    );
    expect(query.targetCheck?.entries.map((entry) => entry.id)).toEqual(['tag:c', 'tag:a', 'tag:b']);
    expect(query.targetCheck?.entries.every((entry) => entry.field === 'tags' && entry.targetModel === 'Tag')).toBe(
      true,
    );
  });

  test('fields follow nestedOps order', () => {
    const ops = new Map([
      ['tags', { connect: ['tag:a'] }],
      ['profile', { connect: 'profile:i' }],
    ]);
    const query = buildCreateWithNestedTransaction(userModel, data, ops, registry);

    expect(query.targetCheck?.entries.map((entry) => entry.field)).toEqual(['tags', 'profile']);
  });

  test('the position points at the RETURN of the check', () => {
    const query = buildCreateWithNestedTransaction(
      userModel,
      data,
      new Map([['profile', { connect: 'profile:a' }]]),
      registry,
    );
    // BEGIN is statement 0, the LET 1, the RETURN 2
    const statements = query.text.split('\n');

    expect(statements[query.targetCheck!.at]).toBe('RETURN $target_missing;');
  });

  test('a create-only nested op issues no guard and keeps COMMIT before the RETURN', () => {
    const query = buildCreateWithNestedTransaction(
      userModel,
      data,
      new Map([['profile', { create: { bio: 'x' } }]]),
      registry,
    );

    expect(query.targetCheck).toBeUndefined();
    expect(query.text).not.toContain('target_missing');
    expect(query.text.split('\n').slice(-2)).toEqual(['COMMIT TRANSACTION;', 'RETURN $result;']);
  });

  test('transactionMode emits no check at all: the caller hoists it', () => {
    const query = buildCreateWithNestedTransaction(
      userModel,
      data,
      new Map([['profile', { connect: 'profile:a' }]]),
      registry,
      {
        transactionMode: true,
      },
    );

    expect(query.targetCheck).toBeUndefined();
    expect(query.text).not.toContain('THROW');
    expect(query.text).not.toContain('target_missing');
  });
});

describe('guarded nested update', () => {
  const where = { id: 'user:1' };

  test('connect before set within a field, then the next field, ids in request order', () => {
    const ops = new Map([
      ['tags', { set: ['tag:e', 'tag:d'], connect: ['tag:b', 'tag:a'] }],
      ['profile', { connect: 'profile:g' }],
    ]);
    const query = buildUpdateWithNestedTransaction(userModel, where, {}, ops, registry, { operation: 'updateUnique' });

    expect(query.targetCheck?.operation).toBe('updateUnique');
    expect(query.targetCheck?.entries).toEqual([
      { field: 'tags', verb: 'connect', targetModel: 'Tag', id: 'tag:b' },
      { field: 'tags', verb: 'connect', targetModel: 'Tag', id: 'tag:a' },
      { field: 'tags', verb: 'set', targetModel: 'Tag', id: 'tag:e' },
      { field: 'tags', verb: 'set', targetModel: 'Tag', id: 'tag:d' },
      { field: 'profile', verb: 'connect', targetModel: 'Profile', id: 'profile:g' },
    ]);
  });

  test('the whole write sits in the block and the RETURN moves inside it', () => {
    const query = buildUpdateWithNestedTransaction(
      userModel,
      where,
      {},
      new Map([['profile', { connect: 'profile:a' }]]),
      registry,
    );
    const lines = query.text.split('\n');

    expect(lines.slice(0, 4)).toEqual([
      'BEGIN TRANSACTION;',
      'LET $target_missing = [(SELECT VALUE id FROM ONLY $validate_0_0)].find_index(NONE);',
      'RETURN $target_missing;',
      'IF $target_missing IS NONE {',
    ]);
    expect(lines.slice(-3)).toEqual(['RETURN $result;', '};', 'COMMIT TRANSACTION;']);
    expect(query.targetCheck?.operation).toBe('updateMany');
  });

  test('disconnect, an empty set and an empty connect issue no check', () => {
    for (const op of [{ disconnect: ['tag:a'] }, { set: [] }, { connect: [] }]) {
      const query = buildUpdateWithNestedTransaction(userModel, where, {}, new Map([['tags', op]]), registry);

      expect(query.targetCheck).toBeUndefined();
      expect(query.text).not.toContain('target_missing');
    }
  });
});

describe('guarded nested update with return: before', () => {
  // SurrealDB 4.0 refuses `LET $before` inside the guard's IF block ("'before' is a protected variable")
  test('the prior row is held in a variable the block may set, and the block returns it', () => {
    const query = buildUpdateWithNestedTransaction(
      userModel,
      { id: 'user:1' },
      {},
      new Map([['profile', { connect: 'profile:a' }]]),
      registry,
      { returnBefore: true },
    );
    const lines = query.text.split('\n');
    const open = lines.indexOf('IF $target_missing IS NONE {');

    expect(query.text).not.toContain('$before');
    expect(lines.findIndex((line) => line.startsWith('LET $prior = '))).toBeGreaterThan(open);
    expect(lines.slice(-3)).toEqual(['RETURN $prior;', '};', 'COMMIT TRANSACTION;']);
  });
});
