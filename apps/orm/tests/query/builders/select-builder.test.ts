/**
 * Select builder tests
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCountQuery,
  buildFindOneQuery,
  buildOrderBy,
  buildSelectFields,
  buildSelectQuery,
} from '../../../src/query/builders';
import type { FindOptions } from '../../../src/types';
import { parseModelRegistry } from '../../test-helpers';

const dsl = `
model User {
  id Record @id
  name String
  email Email @unique
  age Int?
}
`;
const registry = parseModelRegistry(dsl);

const userModel = registry.User!;

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

  describe('buildCountQuery', () => {
    test('builds count query without where', () => {
      const result = buildCountQuery(userModel, undefined);

      expect(result.text).toBe('SELECT count() FROM user GROUP ALL');
      expect(Object.keys(result.vars)).toHaveLength(0);
    });

    test('builds count query with where clause', () => {
      const result = buildCountQuery(userModel, { age: { gt: 18 } });

      expect(result.text).toContain('SELECT count() FROM user WHERE');
      expect(result.text).toContain('age >');
      expect(result.text).toContain('GROUP ALL');
      expect(Object.values(result.vars).length).toBeGreaterThan(0);
    });

    test('builds count query with equality where', () => {
      const result = buildCountQuery(userModel, { name: 'Alice' });

      expect(result.text).toContain('SELECT count() FROM user WHERE');
      expect(result.text).toContain('GROUP ALL');
      expect(Object.values(result.vars)).toContain('Alice');
    });

    test('builds count query with empty where object', () => {
      const result = buildCountQuery(userModel, {});

      expect(result.text).toBe('SELECT count() FROM user GROUP ALL');
      expect(Object.keys(result.vars)).toHaveLength(0);
    });
  });
});
