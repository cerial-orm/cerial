/**
 * Type utils tests
 */

import { test, expect, describe } from 'bun:test';
import {
  isString,
  isNumber,
  isBoolean,
  isDate,
  isNullish,
  isObject,
  isArray,
  getSchemaFieldType,
  schemaTypeToTsType,
  schemaTypeToSurrealType,
} from '../../src/utils/type-utils';

describe('type-utils', () => {
  describe('type checks', () => {
    test('isString', () => {
      expect(isString('hello')).toBe(true);
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
    });

    test('isNumber', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(12.34)).toBe(true);
      expect(isNumber(NaN)).toBe(false);
      expect(isNumber('123')).toBe(false);
    });

    test('isBoolean', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(0)).toBe(false);
    });

    test('isDate', () => {
      expect(isDate(new Date())).toBe(true);
      expect(isDate(new Date('invalid'))).toBe(false);
      expect(isDate('2024-01-01')).toBe(false);
    });

    test('isNullish', () => {
      expect(isNullish(null)).toBe(true);
      expect(isNullish(undefined)).toBe(true);
      expect(isNullish(0)).toBe(false);
      expect(isNullish('')).toBe(false);
    });

    test('isObject', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
    });

    test('isArray', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray({})).toBe(false);
    });
  });

  describe('type conversions', () => {
    test('getSchemaFieldType', () => {
      expect(getSchemaFieldType('string')).toBe('string');
      expect(getSchemaFieldType('email')).toBe('email');
      expect(getSchemaFieldType('int')).toBe('int');
      expect(getSchemaFieldType('integer')).toBe('int');
      expect(getSchemaFieldType('bool')).toBe('bool');
      expect(getSchemaFieldType('boolean')).toBe('bool');
      expect(getSchemaFieldType('float')).toBe('float');
      expect(getSchemaFieldType('number')).toBe('number');
      expect(getSchemaFieldType('invalid')).toBe(null);
    });

    test('schemaTypeToTsType', () => {
      expect(schemaTypeToTsType('string')).toBe('string');
      expect(schemaTypeToTsType('email')).toBe('string');
      expect(schemaTypeToTsType('int')).toBe('number');
      expect(schemaTypeToTsType('float')).toBe('number');
      expect(schemaTypeToTsType('bool')).toBe('boolean');
      expect(schemaTypeToTsType('date')).toBe('Date');
    });

    test('schemaTypeToSurrealType', () => {
      expect(schemaTypeToSurrealType('string')).toBe('string');
      expect(schemaTypeToSurrealType('email')).toBe('string');
      expect(schemaTypeToSurrealType('int')).toBe('int');
      expect(schemaTypeToSurrealType('float')).toBe('float');
      expect(schemaTypeToSurrealType('bool')).toBe('bool');
      expect(schemaTypeToSurrealType('date')).toBe('datetime');
    });
  });
});
