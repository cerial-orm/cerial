/**
 * Migration generator tests
 * Tests for per-model migration code generation
 */

import { describe, expect, test } from 'bun:test';
import {
  generatePerModelMigrationCode,
  generateModelMigrationMap,
  generateModelDefineStatements,
} from '../../src/generators/migrations/define-generator';
import { parseModelRegistry } from '../test-helpers';

// Parse models using DSL
const singleModelDsl = `
model User {
  id String @id
  email Email @unique
  name String
  age Int?
}
`;

const multiModelDsl = `
model User {
  id String @id
  email Email @unique
  name String
}

model Post {
  id String @id
  title String
  content String?
  published Bool
}

model Comment {
  id String @id
  text String
  createdAt Date @now
}
`;

describe('Migration Generator', () => {
  describe('generateModelMigrationMap', () => {
    test('generates map with single model', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const map = generateModelMigrationMap(registry);

      expect(Object.keys(map)).toEqual(['User']);
      expect(map['User']).toBeDefined();
      expect(map['User']!.length).toBeGreaterThan(0);
    });

    test('generates map with multiple models', () => {
      const registry = parseModelRegistry(multiModelDsl);
      const map = generateModelMigrationMap(registry);

      expect(Object.keys(map)).toContain('User');
      expect(Object.keys(map)).toContain('Post');
      expect(Object.keys(map)).toContain('Comment');
      expect(Object.keys(map).length).toBe(3);
    });

    test('each model has correct statements', () => {
      const registry = parseModelRegistry(multiModelDsl);
      const map = generateModelMigrationMap(registry);

      // User model should have table, fields, and index
      expect(map['User']!.some((s) => s.includes('DEFINE TABLE'))).toBe(true);
      expect(map['User']!.some((s) => s.includes('user'))).toBe(true);
      expect(map['User']!.some((s) => s.includes('DEFINE INDEX') && s.includes('email'))).toBe(true);

      // Post model should have table and fields
      expect(map['Post']!.some((s) => s.includes('DEFINE TABLE'))).toBe(true);
      expect(map['Post']!.some((s) => s.includes('post'))).toBe(true);
      expect(map['Post']!.some((s) => s.includes('title'))).toBe(true);

      // Comment model should have table and fields with default
      expect(map['Comment']!.some((s) => s.includes('DEFINE TABLE'))).toBe(true);
      expect(map['Comment']!.some((s) => s.includes('comment'))).toBe(true);
      expect(map['Comment']!.some((s) => s.includes('time::now()'))).toBe(true);
    });
  });

  describe('generatePerModelMigrationCode', () => {
    test('generates ModelName type union for single model', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      expect(code).toContain("export type ModelName = 'User';");
    });

    test('generates ModelName type union for multiple models', () => {
      const registry = parseModelRegistry(multiModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      expect(code).toContain('export type ModelName =');
      expect(code).toContain("'User'");
      expect(code).toContain("'Post'");
      expect(code).toContain("'Comment'");
    });

    test('generates modelNames const array', () => {
      const registry = parseModelRegistry(multiModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      expect(code).toContain('export const modelNames =');
      expect(code).toContain('as const');
    });

    test('generates migrationsByModel with typed Record', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      expect(code).toContain('export const migrationsByModel: Record<ModelName, string[]>');
      expect(code).toContain('User: [');
    });

    test('generates getModelMigrationQuery with typed parameter', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      expect(code).toContain('export function getModelMigrationQuery(modelName: ModelName): string');
    });

    test('generates getMigrationModelNames with typed return', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      expect(code).toContain('export function getMigrationModelNames(): ModelName[]');
    });

    test('does not generate flat migrationStatements array', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      // Should NOT contain the old flat array export
      expect(code).not.toContain('export const migrationStatements: string[]');
      expect(code).not.toContain('getMigrationQuery()');
    });

    test('generates correct migration statements per model', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const models = Object.values(registry).filter((m): m is NonNullable<typeof m> => m !== undefined);
      const code = generatePerModelMigrationCode(models);

      // Check User model statements
      expect(code).toContain('DEFINE TABLE OVERWRITE user SCHEMAFULL');
      expect(code).toContain('DEFINE FIELD OVERWRITE email ON TABLE user');
      expect(code).toContain('DEFINE FIELD OVERWRITE name ON TABLE user');
      expect(code).toContain('DEFINE FIELD OVERWRITE age ON TABLE user');
      expect(code).toContain('DEFINE INDEX OVERWRITE user_email_unique');
    });
  });

  describe('generateModelDefineStatements', () => {
    test('generates statements in correct order', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      // First statement should be DEFINE TABLE
      expect(statements[0]).toContain('DEFINE TABLE');

      // Last statement should be DEFINE INDEX (for unique fields)
      const lastStatement = statements[statements.length - 1];
      expect(lastStatement).toContain('DEFINE INDEX');
    });

    test('skips id field in DEFINE FIELD statements', () => {
      const registry = parseModelRegistry(singleModelDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      // Should not have DEFINE FIELD for id
      const idFieldStatement = statements.find((s) => s.includes('DEFINE FIELD') && s.includes(' id '));
      expect(idFieldStatement).toBeUndefined();
    });
  });
});
