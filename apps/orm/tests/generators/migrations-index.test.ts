/**
 * Migration generator tests
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';
import { parseModelRegistry } from '../test-helpers';

describe('Migration Generator', () => {
  describe('Index and Composite Index Migrations', () => {
    test('generates DEFINE INDEX for @index field', () => {
      const registry = parseModelRegistry(`
        model User {
          id Record @id
          email Email @unique
          name String @index
        }
      `);
      const statements = generateModelDefineStatements(registry.User!);

      // @index generates non-unique DEFINE INDEX
      const indexStmt = statements.find((s) => s.includes('DEFINE INDEX') && s.includes('name'));
      expect(indexStmt).toBeDefined();
      expect(indexStmt).toContain('COLUMNS name');
      expect(indexStmt).not.toContain('UNIQUE');
    });

    test('generates DEFINE INDEX with UNIQUE for @unique field', () => {
      const registry = parseModelRegistry(`
        model User {
          id Record @id
          email Email @unique
          name String
        }
      `);
      const statements = generateModelDefineStatements(registry.User!);

      const uniqueStmt = statements.find((s) => s.includes('DEFINE INDEX') && s.includes('email'));
      expect(uniqueStmt).toBeDefined();
      expect(uniqueStmt).toContain('COLUMNS email');
      expect(uniqueStmt).toContain('UNIQUE');
    });

    test('generates DEFINE INDEX for @@index composite directive', () => {
      const registry = parseModelRegistry(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@index(nameIdx, [firstName, lastName])
        }
      `);
      const statements = generateModelDefineStatements(registry.User!);

      const compositeStmt = statements.find((s) => s.includes('nameIdx'));
      expect(compositeStmt).toBeDefined();
      expect(compositeStmt).toContain('DEFINE INDEX');
      expect(compositeStmt).toContain('nameIdx ON TABLE user');
      expect(compositeStmt).toContain('COLUMNS firstName, lastName');
      expect(compositeStmt).not.toContain('UNIQUE');
    });

    test('generates DEFINE INDEX UNIQUE for @@unique composite directive', () => {
      const registry = parseModelRegistry(`
        model User {
          id Record @id
          firstName String
          lastName String
          @@unique(firstLast, [firstName, lastName])
        }
      `);
      const statements = generateModelDefineStatements(registry.User!);

      const compositeStmt = statements.find((s) => s.includes('firstLast'));
      expect(compositeStmt).toBeDefined();
      expect(compositeStmt).toContain('DEFINE INDEX');
      expect(compositeStmt).toContain('firstLast ON TABLE user');
      expect(compositeStmt).toContain('COLUMNS firstName, lastName');
      expect(compositeStmt).toContain('UNIQUE');
    });

    test('generates composite index with dot-notation columns', () => {
      const registry = parseModelRegistry(`
        object Address {
          city String
          zip String
        }

        model Store {
          id Record @id
          address Address
          @@unique(cityZip, [address.city, address.zip])
        }
      `);
      const statements = generateModelDefineStatements(registry.Store!);

      const compositeStmt = statements.find((s) => s.includes('cityZip'));
      expect(compositeStmt).toBeDefined();
      expect(compositeStmt).toContain('COLUMNS address.city, address.zip');
      expect(compositeStmt).toContain('UNIQUE');
    });

    test('generates multiple composite directives', () => {
      const registry = parseModelRegistry(`
        model User {
          id Record @id
          firstName String
          lastName String
          email Email
          @@index(nameIdx, [firstName, lastName])
          @@unique(nameEmail, [firstName, email])
        }
      `);
      const statements = generateModelDefineStatements(registry.User!);

      const indexStmt = statements.find((s) => s.includes('nameIdx'));
      const uniqueStmt = statements.find((s) => s.includes('nameEmail'));
      expect(indexStmt).toBeDefined();
      expect(uniqueStmt).toBeDefined();
      expect(indexStmt).not.toContain('UNIQUE');
      expect(uniqueStmt).toContain('UNIQUE');
    });
  });
});
