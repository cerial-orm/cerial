/**
 * Data transformer tests
 */

import { describe, expect, test } from 'bun:test';
import { RecordId } from 'surrealdb';
import { transformData, transformRecordId, transformValue } from '../../../src/query/transformers/data-transformer';
import type { ModelMetadata } from '../../../src/types';

describe('data-transformer', () => {
  describe('transformValue', () => {
    test('transforms date string to Date object', () => {
      const dateStr = '2024-01-15T10:30:00.000Z';
      const result = transformValue(dateStr, 'date');

      expect(result).toBeInstanceOf(Date);
      expect((result as Date).toISOString()).toBe(dateStr);
    });

    test('preserves Date object for date type', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      const result = transformValue(date, 'date');

      expect(result).toBeInstanceOf(Date);
      expect(result).toBe(date);
    });

    test('transforms string to number for int type', () => {
      const result = transformValue('42', 'int');
      expect(result).toBe(42);
    });

    test('floors number for int type', () => {
      const result = transformValue(42.7, 'int');
      expect(result).toBe(42);
    });

    test('transforms string to number for float type', () => {
      const result = transformValue('3.14', 'float');
      expect(result).toBe(3.14);
    });

    test('preserves number for float type', () => {
      const result = transformValue(3.14, 'float');
      expect(result).toBe(3.14);
    });

    test('transforms string to boolean for bool type', () => {
      expect(transformValue('true', 'bool')).toBe(true);
      expect(transformValue('false', 'bool')).toBe(false);
      expect(transformValue('TRUE', 'bool')).toBe(true);
    });

    test('preserves boolean for bool type', () => {
      expect(transformValue(true, 'bool')).toBe(true);
      expect(transformValue(false, 'bool')).toBe(false);
    });

    test('converts to string for string type', () => {
      expect(transformValue(123, 'string')).toBe('123');
      expect(transformValue('hello', 'string')).toBe('hello');
    });

    test('converts to string for email type', () => {
      expect(transformValue('test@example.com', 'email')).toBe('test@example.com');
    });

    test('returns null/undefined as-is', () => {
      expect(transformValue(null, 'string')).toBeNull();
      expect(transformValue(undefined, 'string')).toBeUndefined();
    });

    test('passes through record type unchanged', () => {
      const value = 'some-id';
      expect(transformValue(value, 'record')).toBe(value);
    });
  });

  describe('transformRecordId', () => {
    test('creates RecordId with table name and string id', () => {
      const result = transformRecordId('user', 'john-doe');

      expect(result).toBeInstanceOf(RecordId);
      // .table returns a Table object, use toString() for comparison
      expect(result.table.toString()).toBe('user');
      expect(result.id).toBe('john-doe');
    });

    test('creates RecordId with numeric id as string', () => {
      const result = transformRecordId('post', '123');

      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.toString()).toBe('post');
      expect(result.id).toBe('123');
    });

    test('RecordId can be converted to string', () => {
      const result = transformRecordId('user', 'john');
      expect(result.toString()).toBe('user:john');
    });
  });

  describe('transformData', () => {
    const userModel: ModelMetadata = {
      name: 'User',
      tableName: 'user',
      fields: [
        { name: 'id', type: 'record', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
        { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
        { name: 'name', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
        { name: 'age', type: 'int', isId: false, isUnique: false, hasNowDefault: false, isRequired: false },
        { name: 'isActive', type: 'bool', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
        { name: 'createdAt', type: 'date', isId: false, isUnique: false, hasNowDefault: true, isRequired: true },
      ],
    };

    test('transforms id field to RecordId', () => {
      const data = { id: 'custom-id', name: 'John' };
      const result = transformData(data, userModel);

      expect(result.id).toBeInstanceOf(RecordId);
      // .table returns a Table object, use toString() for comparison
      expect((result.id as RecordId).table.toString()).toBe('user');
      expect((result.id as RecordId).id).toBe('custom-id');
    });

    test('transforms date field to Date object', () => {
      const dateStr = '2024-06-15T14:30:00.000Z';
      const data = { name: 'John', createdAt: dateStr };
      const result = transformData(data, userModel);

      expect(result.createdAt).toBeInstanceOf(Date);
      expect((result.createdAt as Date).toISOString()).toBe(dateStr);
    });

    test('preserves Date object for date field', () => {
      const date = new Date('2024-06-15T14:30:00.000Z');
      const data = { name: 'John', createdAt: date };
      const result = transformData(data, userModel);

      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt).toBe(date);
    });

    test('transforms multiple fields correctly', () => {
      const data = {
        id: 'user-123',
        email: 'john@example.com',
        name: 'John',
        age: '30',
        isActive: 'true',
        createdAt: '2024-01-01T00:00:00.000Z',
      };
      const result = transformData(data, userModel);

      expect(result.id).toBeInstanceOf(RecordId);
      expect(result.email).toBe('john@example.com');
      expect(result.name).toBe('John');
      expect(result.age).toBe(30);
      expect(result.isActive).toBe(true);
      expect(result.createdAt).toBeInstanceOf(Date);
    });

    test('does not transform id when not provided', () => {
      const data = { name: 'John', email: 'john@example.com' };
      const result = transformData(data, userModel);

      expect(result.id).toBeUndefined();
    });

    test('passes through unknown fields unchanged', () => {
      const data = { name: 'John', unknownField: 'value' };
      const result = transformData(data, userModel);

      expect(result.unknownField).toBe('value');
    });

    test('handles null values correctly', () => {
      const data = { name: 'John', age: null };
      const result = transformData(data, userModel);

      expect(result.age).toBeNull();
    });
  });
});
