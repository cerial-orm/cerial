/**
 * Types generator tests
 */

import { test, expect, describe } from 'bun:test';
import { generateInterface, generateCreateType, generateUpdateType, generateSelectType, generateWhereInterface } from '../../src/generators/types';
import type { ModelMetadata } from '../../src/types';

const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  fields: [
    { name: 'id', type: 'string', isId: true, isUnique: false, hasNowDefault: false, isRequired: true },
    { name: 'name', type: 'string', isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
    { name: 'email', type: 'email', isId: false, isUnique: true, hasNowDefault: false, isRequired: true },
    { name: 'age', type: 'int', isId: false, isUnique: false, hasNowDefault: false, isRequired: false },
    { name: 'createdAt', type: 'date', isId: false, isUnique: false, hasNowDefault: true, isRequired: true },
  ],
};

describe('types generator', () => {
  describe('generateInterface', () => {
    test('generates interface with all fields', () => {
      const result = generateInterface(userModel);

      expect(result).toContain('export interface User {');
      expect(result).toContain('id: string;'); // id field is now required
      expect(result).toContain('name: string;');
      expect(result).toContain('email: string;');
      expect(result).toContain('age?: number | null;');
      expect(result).toContain('createdAt: Date;');
    });
  });

  describe('generateCreateType', () => {
    test('generates create type with partial optional fields', () => {
      const result = generateCreateType(userModel);

      expect(result).toContain('export type UserCreate');
      // No fields are auto-omitted, users can provide their own values
      // Optional fields (like 'age') are still partial
      expect(result).toContain('Partial<');
    });
  });

  describe('generateUpdateType', () => {
    test('generates update type as partial without id', () => {
      const result = generateUpdateType(userModel);

      expect(result).toContain('export type UserUpdate');
      expect(result).toContain('Partial<');
      expect(result).toContain("Omit<User, 'id'>"); // id field is still omitted in update
    });
  });

  describe('generateSelectType', () => {
    test('generates select type requiring at least one field', () => {
      const result = generateSelectType(userModel);

      expect(result).toContain('export type UserSelect');
      expect(result).toContain('| { id: boolean }');
      expect(result).toContain('| { name: boolean }');
      expect(result).toContain('| { email: boolean }');
      expect(result).toContain('| { age: boolean }');
      expect(result).toContain('| { createdAt: boolean }');
    });
  });

  describe('generateWhereInterface', () => {
    test('generates where type with appropriate operators', () => {
      const result = generateWhereInterface(userModel);

      expect(result).toContain('export interface UserWhere');
      
      // id field (string type) - no ordering, no between, no isNull (required)
      expect(result).toContain('id?:');
      expect(result).toContain('eq?: string;');
      expect(result).toContain('neq?: string;');
      expect(result).toContain('contains?: string;');
      expect(result).toContain('startsWith?: string;');
      expect(result).toContain('endsWith?: string;');
      
      // name field (string type, required) - no ordering, no between, no isNull
      expect(result).toContain('name?:');
      
      // email field (email type, required) - no ordering, no between, no isNull
      expect(result).toContain('email?:');
      
      // age field (int type, optional) - has ordering, between, and isNull
      expect(result).toContain('age?:');
      expect(result).toContain('gt?: number;');
      expect(result).toContain('gte?: number;');
      expect(result).toContain('lt?: number;');
      expect(result).toContain('lte?: number;');
      expect(result).toContain('between?: [number, number];');
      expect(result).toContain('isNull?: boolean;');
      
      // createdAt field (date type, required) - has ordering, between, but no isNull
      expect(result).toContain('createdAt?:');
      expect(result).toContain('gt?: Date;');
      expect(result).toContain('between?: [Date, Date];');
    });
  });
});
