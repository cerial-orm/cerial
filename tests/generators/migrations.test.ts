/**
 * Migration generator tests
 * Tests for per-model migration code generation
 */

import { describe, expect, test } from 'bun:test';
import {
  generateModelDefineStatements,
  generateModelMigrationMap,
  generatePerModelMigrationCode,
} from '../../src/generators/migrations/define-generator';
import { parseModelRegistry } from '../test-helpers';

// Parse models using DSL
const singleModelDsl = `
model User {
  id Record @id
  email Email @unique
  name String
  age Int?
}
`;

const multiModelDsl = `
model User {
  id Record @id
  email Email @unique
  name String
}

model Post {
  id Record @id
  title String
  content String?
  published Bool
}

model Comment {
  id Record @id
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

  describe('Array type migrations', () => {
    const arrayDsl = `
model User {
  id Record @id
  nicknames String[]
  scores Int[]
  loginDates Date[]
  ratings Float[]
}
`;

    test('generates array<string> for String[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      const nicknamesStmt = statements.find((s) => s.includes('nicknames'));
      expect(nicknamesStmt).toContain('TYPE array<string>');
    });

    test('generates array<int> for Int[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      const scoresStmt = statements.find((s) => s.includes('scores'));
      expect(scoresStmt).toContain('TYPE array<int>');
    });

    test('generates array<datetime> for Date[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      const loginDatesStmt = statements.find((s) => s.includes('loginDates'));
      expect(loginDatesStmt).toContain('TYPE array<datetime>');
    });

    test('generates array<float> for Float[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      const ratingsStmt = statements.find((s) => s.includes('ratings'));
      expect(ratingsStmt).toContain('TYPE array<float>');
    });
  });

  describe('Record type migrations', () => {
    const recordDsl = `
model User {
  id Record @id
  profileId Record?
  profile Relation @field(profileId) @model(Profile)
  tagIds Record[]
  tags Relation @field(tagIds) @model(Tag)
}

model Profile {
  id Record @id
  userId Record
  user Relation @field(userId) @model(User)
}

model Tag {
  id Record @id
  name String
}
`;

    test('generates record<table> for required Record', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry['Profile']!;
      const statements = generateModelDefineStatements(model);

      const userIdStmt = statements.find((s) => s.includes('userId'));
      expect(userIdStmt).toContain('TYPE record<user>');
    });

    test('generates option<record<table> | null> for optional Record?', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      const profileIdStmt = statements.find((s) => s.includes('profileId'));
      // Optional fields use option<T | null> to support both NONE (absent) and null values
      expect(profileIdStmt).toContain('TYPE option<record<profile> | null>');
    });

    test('generates array<record<table>> with distinct for Record[]', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      const tagIdsStmt = statements.find((s) => s.includes('tagIds'));
      expect(tagIdsStmt).toContain('TYPE array<record<tag>>');
      // Uses IF/THEN/ELSE to handle NONE values gracefully
      expect(tagIdsStmt).toContain('VALUE IF $value THEN $value.distinct() ELSE [] END');
    });

    test('skips Relation fields in migration statements', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry['User']!;
      const statements = generateModelDefineStatements(model);

      // Should not have DEFINE FIELD for relation fields
      const profileStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.includes(' profile '));
      const tagsStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.includes(' tags '));

      expect(profileStmt).toBeUndefined();
      expect(tagsStmt).toBeUndefined();
    });
  });

  describe('Object type migrations', () => {
    // Manually construct metadata because parseModelRegistry doesn't populate objectInfo
    const addressFields = [
      { name: 'street', type: 'string' as const, isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
      { name: 'city', type: 'string' as const, isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
      {
        name: 'zipCode',
        type: 'string' as const,
        isId: false,
        isUnique: false,
        hasNowDefault: false,
        isRequired: false,
      },
    ];
    const addressInfo = { objectName: 'Address', fields: addressFields };
    const objectRegistry = { Address: { name: 'Address', fields: addressFields } };

    const storeModel = {
      name: 'Store',
      tableName: 'store',
      fields: [
        { name: 'id', type: 'record' as const, isId: true, isUnique: true, hasNowDefault: false, isRequired: true },
        { name: 'name', type: 'string' as const, isId: false, isUnique: false, hasNowDefault: false, isRequired: true },
        {
          name: 'address',
          type: 'object' as const,
          isId: false,
          isUnique: false,
          hasNowDefault: false,
          isRequired: true,
          objectInfo: addressInfo,
        },
        {
          name: 'shipping',
          type: 'object' as const,
          isId: false,
          isUnique: false,
          hasNowDefault: false,
          isRequired: false,
          objectInfo: addressInfo,
        },
        {
          name: 'locations',
          type: 'object' as const,
          isId: false,
          isUnique: false,
          hasNowDefault: false,
          isRequired: true,
          isArray: true,
          objectInfo: addressInfo,
        },
      ],
    };

    test('generates DEFINE FIELD with TYPE object for required object', () => {
      const statements = generateModelDefineStatements(storeModel, undefined, undefined, objectRegistry);

      // Required object parent
      const addressStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ address /));
      expect(addressStmt).toContain('TYPE object');

      // Dot notation sub-fields
      expect(statements.some((s) => s.includes('address.street') && s.includes('TYPE string'))).toBe(true);
      expect(statements.some((s) => s.includes('address.city') && s.includes('TYPE string'))).toBe(true);
      expect(statements.some((s) => s.includes('address.zipCode') && s.includes('TYPE option<string | null>'))).toBe(
        true,
      );
    });

    test('generates DEFINE FIELD with TYPE option<object> for optional object (no null)', () => {
      const statements = generateModelDefineStatements(storeModel, undefined, undefined, objectRegistry);

      const shippingStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ shipping /));
      expect(shippingStmt).toContain('TYPE option<object>');
    });

    test('generates DEFINE FIELD with TYPE array<object> and .* notation for object arrays', () => {
      const statements = generateModelDefineStatements(storeModel, undefined, undefined, objectRegistry);

      const locationsStmt = statements.find((s) => s.includes('DEFINE FIELD') && s.match(/ locations /));
      expect(locationsStmt).toContain('TYPE array<object>');

      // Array sub-fields use .* notation
      expect(statements.some((s) => s.includes('locations.*.street'))).toBe(true);
      expect(statements.some((s) => s.includes('locations.*.city'))).toBe(true);
    });

    test('generates same object in multiple fields with separate DEFINE FIELD sets', () => {
      const statements = generateModelDefineStatements(storeModel, undefined, undefined, objectRegistry);

      // Both address and shipping get separate sub-field DEFINEs
      expect(statements.some((s) => s.includes('address.street'))).toBe(true);
      expect(statements.some((s) => s.includes('shipping.street'))).toBe(true);
    });
  });

  describe('Index and Composite Index Migrations', () => {
    test('generates DEFINE INDEX for @index field', () => {
      const registry = parseModelRegistry(`
        model User {
          id Record @id
          email Email @unique
          name String @index
        }
      `);
      const statements = generateModelDefineStatements(registry['User']!);

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
      const statements = generateModelDefineStatements(registry['User']!);

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
      const statements = generateModelDefineStatements(registry['User']!);

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
      const statements = generateModelDefineStatements(registry['User']!);

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
      const statements = generateModelDefineStatements(registry['Store']!);

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
      const statements = generateModelDefineStatements(registry['User']!);

      const indexStmt = statements.find((s) => s.includes('nameIdx'));
      const uniqueStmt = statements.find((s) => s.includes('nameEmail'));
      expect(indexStmt).toBeDefined();
      expect(uniqueStmt).toBeDefined();
      expect(indexStmt).not.toContain('UNIQUE');
      expect(uniqueStmt).toContain('UNIQUE');
    });
  });
});
