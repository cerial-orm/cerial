/**
 * Types generator tests
 */

import { test, expect, describe } from 'bun:test';
import { generateInterface, generateInterfaces, generateCreateType, generateUpdateType } from '../../src/generators/types';
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
      expect(result).toContain('id?: string;');
      expect(result).toContain('name: string;');
      expect(result).toContain('email: string;');
      expect(result).toContain('age?: number | null;');
      expect(result).toContain('createdAt: Date;');
    });
  });

  describe('generateCreateType', () => {
    test('generates create type omitting auto fields', () => {
      const result = generateCreateType(userModel);

      expect(result).toContain('export type UserCreate');
      expect(result).toContain("Omit<");
      // Should omit id and createdAt (@now)
      expect(result).toContain("'id'");
      expect(result).toContain("'createdAt'");
    });
  });

  describe('generateUpdateType', () => {
    test('generates update type as partial', () => {
      const result = generateUpdateType(userModel);

      expect(result).toContain('export type UserUpdate');
      expect(result).toContain('Partial<');
      expect(result).toContain("Omit<User, 'id'>");
    });
  });
});
