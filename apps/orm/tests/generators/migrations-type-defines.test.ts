/**
 * Migration generator tests
 */

import { describe, expect, test } from 'bun:test';
import {
  generateModelDefineStatements,
  generateObjectFieldDefines,
} from '../../src/generators/migrations/define-generator';
import { parseModelRegistry } from '../test-helpers';

describe('Migration Generator', () => {
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
      const model = registry.User!;
      const statements = generateModelDefineStatements(model);

      const nicknamesStmt = statements.find((s) => s.includes('nicknames'));
      expect(nicknamesStmt).toContain('TYPE array<string>');
    });

    test('generates array<int> for Int[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry.User!;
      const statements = generateModelDefineStatements(model);

      const scoresStmt = statements.find((s) => s.includes('scores'));
      expect(scoresStmt).toContain('TYPE array<int>');
    });

    test('generates array<datetime> for Date[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry.User!;
      const statements = generateModelDefineStatements(model);

      const loginDatesStmt = statements.find((s) => s.includes('loginDates'));
      expect(loginDatesStmt).toContain('TYPE array<datetime>');
    });

    test('generates array<float> for Float[]', () => {
      const registry = parseModelRegistry(arrayDsl);
      const model = registry.User!;
      const statements = generateModelDefineStatements(model);

      const ratingsStmt = statements.find((s) => s.includes('ratings'));
      expect(ratingsStmt).toContain('TYPE array<float>');
    });
  });

  describe('Array element assertions and literal arrays inside objects', () => {
    const base = { isId: false, isUnique: false, isIndexed: false, isRequired: true, isArray: true };
    const literalInfo = {
      literalName: 'Code',
      variants: [
        { kind: 'string', value: 'A' },
        { kind: 'string', value: 'B' },
      ],
    } as unknown as import('../../src/types').LiteralFieldMetadata;
    const holder = {
      name: 'Holder',
      fields: [
        { ...base, name: 'codes', type: 'literal' as const, literalInfo },
        { ...base, name: 'emails', type: 'email' as const },
      ],
    };

    test('an object literal array lists the variants, not the internal type name', () => {
      const statements = generateObjectFieldDefines('h', 'doc', holder, { Holder: holder });
      const codes = statements.find((st) => st.includes('h.codes'));

      expect(codes).toContain("TYPE array<'A' | 'B'>");
      expect(codes).not.toContain('literal');
    });

    test('an object email array asserts each element', () => {
      const statements = generateObjectFieldDefines('h', 'doc', holder, { Holder: holder });
      const emails = statements.find((st) => st.includes('h.emails'));

      expect(emails).toContain('TYPE array<string>');
      expect(emails).toContain('ASSERT $value.all(|$v| string::is_email($v))');
    });

    test('a model email array asserts each element', () => {
      const model = {
        name: 'Doc',
        tableName: 'doc',
        fields: [
          { name: 'id', type: 'record' as const, isId: true, isUnique: true, isRequired: true },
          { ...base, name: 'emails', type: 'email' as const },
        ],
      };
      const statements = generateModelDefineStatements(model);

      expect(statements.some((st) => st.includes('ASSERT $value.all(|$v| string::is_email($v))'))).toBe(true);
      expect(statements.some((st) => st.includes('ASSERT string::is_email($value)'))).toBe(false);
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
      const model = registry.Profile!;
      const statements = generateModelDefineStatements(model);

      const userIdStmt = statements.find((s) => s.includes('userId'));
      expect(userIdStmt).toContain('TYPE record<user>');
    });

    test('generates option<record<table>> for optional Record? (no null without @nullable)', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry.User!;
      const statements = generateModelDefineStatements(model);

      const profileIdStmt = statements.find((s) => s.includes('profileId'));
      // Optional fields use option<T> — null requires @nullable
      expect(profileIdStmt).toContain('TYPE option<record<profile>>');
    });

    test('generates array<record<table>> with distinct for Record[]', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry.User!;
      const statements = generateModelDefineStatements(model);

      const tagIdsStmt = statements.find((s) => s.includes('tagIds'));
      expect(tagIdsStmt).toContain('TYPE array<record<tag>>');
      // Uses IF/THEN/ELSE to handle NONE values gracefully
      expect(tagIdsStmt).toContain('VALUE IF $value THEN $value.distinct() ELSE [] END');
    });

    test('skips Relation fields in migration statements', () => {
      const registry = parseModelRegistry(recordDsl);
      const model = registry.User!;
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
      { name: 'street', type: 'string' as const, isId: false, isUnique: false, isRequired: true },
      { name: 'city', type: 'string' as const, isId: false, isUnique: false, isRequired: true },
      {
        name: 'zipCode',
        type: 'string' as const,
        isId: false,
        isUnique: false,
        isRequired: false,
      },
    ];
    const addressInfo = { objectName: 'Address', fields: addressFields };
    const objectRegistry = { Address: { name: 'Address', fields: addressFields } };

    const storeModel = {
      name: 'Store',
      tableName: 'store',
      fields: [
        { name: 'id', type: 'record' as const, isId: true, isUnique: true, isRequired: true },
        { name: 'name', type: 'string' as const, isId: false, isUnique: false, isRequired: true },
        {
          name: 'address',
          type: 'object' as const,
          isId: false,
          isUnique: false,
          isRequired: true,
          objectInfo: addressInfo,
        },
        {
          name: 'shipping',
          type: 'object' as const,
          isId: false,
          isUnique: false,
          isRequired: false,
          objectInfo: addressInfo,
        },
        {
          name: 'locations',
          type: 'object' as const,
          isId: false,
          isUnique: false,
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
      expect(statements.some((s) => s.includes('address.zipCode') && s.includes('TYPE option<string>'))).toBe(true);
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
});
