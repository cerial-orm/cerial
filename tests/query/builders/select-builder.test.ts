/**
 * Select builder tests
 */

import { describe, expect, test } from 'bun:test';
import { buildFindOneQuery, buildOrderBy, buildSelectFields, buildSelectQuery } from '../../../src/query/builders';
import type { FindOptions, ModelMetadata } from '../../../src/types';

const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
    { name: 'name', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
    { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
    { name: 'age', type: 'int', isId: false, isUnique: false, hasNowDefault: false, isRequired: false },
  ],
};

describe('select builder', () => {
  test('builds simple SELECT query', () => {
    const options: FindOptions = {};
    const result = buildSelectQuery(userModel, options);

    expect(result.text).toContain('SELECT * FROM user');
  });

  test('builds SELECT with specific fields', () => {
    const options: FindOptions = {
      select: { id: true, name: true },
    };
    const result = buildSelectQuery(userModel, options);

    expect(result.text).toContain('SELECT id, name FROM user');
  });

  test('builds SELECT with WHERE clause', () => {
    const options: FindOptions = {
      where: { age: { gt: 18 } },
    };
    const result = buildSelectQuery(userModel, options);

    expect(result.text).toContain('SELECT * FROM user WHERE');
    expect(result.text).toContain('age >');
    expect(Object.values(result.vars).length).toBeGreaterThan(0);
  });

  test('builds SELECT with ORDER BY', () => {
    const options: FindOptions = {
      orderBy: { name: 'asc', age: 'desc' },
    };
    const result = buildSelectQuery(userModel, options);

    expect(result.text).toContain('ORDER BY');
    expect(result.text).toContain('name ASC');
    expect(result.text).toContain('age DESC');
  });

  test('builds SELECT with LIMIT', () => {
    const options: FindOptions = {
      limit: 10,
    };
    const result = buildSelectQuery(userModel, options);

    expect(result.text).toContain('LIMIT 10');
  });

  test('builds SELECT with OFFSET', () => {
    const options: FindOptions = {
      offset: 20,
    };
    const result = buildSelectQuery(userModel, options);

    expect(result.text).toContain('START 20');
  });

  test('buildFindOneQuery adds LIMIT 1', () => {
    const options: FindOptions = {};
    const result = buildFindOneQuery(userModel, options);

    expect(result.text).toContain('LIMIT 1');
  });

  test('buildSelectFields returns * for no select', () => {
    const result = buildSelectFields(undefined, userModel);
    expect(result).toBe('*');
  });

  test('buildOrderBy returns empty for no orderBy', () => {
    const result = buildOrderBy(undefined);
    expect(result).toBe('');
  });
});
