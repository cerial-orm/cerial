/**
 * Types generator tests
 */

import { test, expect, describe } from 'bun:test';
import {
  generateInterface,
  generateCreateType,
  generateUpdateType,
  generateSelectType,
  generateWhereInterface,
} from '../../src/generators/types';
import { parseModelRegistry } from '../test-helpers';

// Parse model using DSL to ensure correct behavior
const dsl = `
model User {
  id String @id
  name String
  email Email @unique
  age Int?
  createdAt Date @now
}`;

const registry = parseModelRegistry(dsl);
const userModel = registry['User']!;

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
    test('generates create type with @id and @now fields optional', () => {
      const result = generateCreateType(userModel);

      expect(result).toContain('export type UserCreate');
      // @id field (id) should be optional
      expect(result).toContain(`Partial<Pick<User, 'id' | 'age' | 'createdAt'>>`);
    });
  });

  describe('generateUpdateType', () => {
    test('generates update type as partial without id', () => {
      const result = generateUpdateType(userModel);

      expect(result).toContain('export type UserUpdate');
      expect(result).toContain('Partial<');
      expect(result).toContain("Omit<User, 'id'>"); // only id field is omitted in update
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

      // id field (string type, @id) - no ordering, no between, no isNull (id fields are always present)
      expect(result).toContain('id?:');
      expect(result).toContain('eq?: string;');
      expect(result).toContain('neq?: string;');
      expect(result).toContain('contains?: string;');
      expect(result).toContain('startsWith?: string;');
      expect(result).toContain('endsWith?: string;');
      // id field should NOT have isNull even though isRequired is false
      expect(result.substring(result.indexOf('id?'), result.indexOf('name?'))).not.toContain('isNull');

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
