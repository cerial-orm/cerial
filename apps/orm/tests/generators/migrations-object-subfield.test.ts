/**
 * Migration generator tests
 */

import { describe, expect, test } from 'bun:test';
import { generateModelDefineStatements } from '../../src/generators/migrations/define-generator';

describe('Migration Generator', () => {
  describe('Object subfield decorator migrations', () => {
    // Helper: manually build metadata since parseModelRegistry doesn't yet handle object decorators
    function makeField(
      overrides: Partial<import('../../src/types').FieldMetadata>,
    ): import('../../src/types').FieldMetadata {
      return {
        name: 'test',
        type: 'string',
        isId: false,
        isUnique: false,
        isRequired: true,
        ...overrides,
      };
    }

    test('generates DEFAULT clause for @default on object subfield', () => {
      const addressFields = [
        makeField({ name: 'street', type: 'string' }),
        makeField({ name: 'city', type: 'string', defaultValue: 'Unknown' }),
      ];
      const objectRegistry = { Address: { name: 'Address', fields: addressFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'address',
            type: 'object',
            objectInfo: { objectName: 'Address', fields: addressFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const cityStmt = statements.find((s) => s.includes('address.city'));

      expect(cityStmt).toBeDefined();
      expect(cityStmt).toContain("DEFAULT 'Unknown'");
    });

    test('generates DEFAULT time::now() for @now on object subfield', () => {
      const objFields = [
        makeField({ name: 'name', type: 'string' }),
        makeField({ name: 'createdAt', type: 'date', timestampDecorator: 'createdAt' }),
      ];
      const objectRegistry = { Meta: { name: 'Meta', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'meta', type: 'object', objectInfo: { objectName: 'Meta', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const createdAtStmt = statements.find((s) => s.includes('meta.createdAt'));

      expect(createdAtStmt).toBeDefined();
      expect(createdAtStmt).toContain('DEFAULT time::now()');
    });

    test('generates DEFINE INDEX for @index on object subfield', () => {
      const objFields = [
        makeField({ name: 'city', type: 'string', isIndexed: true }),
        makeField({ name: 'zip', type: 'string' }),
      ];
      const objectRegistry = { Address: { name: 'Address', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'address', type: 'object', objectInfo: { objectName: 'Address', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const indexStmt = statements.find((s) => s.includes('DEFINE INDEX') && s.includes('address.city'));

      expect(indexStmt).toBeDefined();
      expect(indexStmt).toContain('DEFINE INDEX');
      expect(indexStmt).toContain('user_address_city_index');
      expect(indexStmt).toContain('COLUMNS address.city');
      expect(indexStmt).not.toContain('UNIQUE');
    });

    test('generates DEFINE INDEX UNIQUE for @unique on object subfield', () => {
      const objFields = [
        makeField({ name: 'city', type: 'string' }),
        makeField({ name: 'zip', type: 'string', isUnique: true }),
      ];
      const objectRegistry = { Address: { name: 'Address', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'address', type: 'object', objectInfo: { objectName: 'Address', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const indexStmt = statements.find((s) => s.includes('DEFINE INDEX') && s.includes('address.zip'));

      expect(indexStmt).toBeDefined();
      expect(indexStmt).toContain('user_address_zip_unique');
      expect(indexStmt).toContain('COLUMNS address.zip');
      expect(indexStmt).toContain('UNIQUE');
    });

    test('generates separate indexes for same object used in multiple fields', () => {
      const objFields = [makeField({ name: 'zip', type: 'string', isUnique: true })];
      const objectRegistry = { Address: { name: 'Address', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'address', type: 'object', objectInfo: { objectName: 'Address', fields: objFields } }),
          makeField({
            name: 'shipping',
            type: 'object',
            isRequired: false,
            objectInfo: { objectName: 'Address', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const addressIndexStmt = statements.find((s) => s.includes('user_address_zip_unique'));
      const shippingIndexStmt = statements.find((s) => s.includes('user_shipping_zip_unique'));

      expect(addressIndexStmt).toBeDefined();
      expect(addressIndexStmt).toContain('COLUMNS address.zip UNIQUE');
      expect(shippingIndexStmt).toBeDefined();
      expect(shippingIndexStmt).toContain('COLUMNS shipping.zip UNIQUE');
    });

    test('generates VALUE clause for @distinct on object array subfield', () => {
      const objFields = [makeField({ name: 'tags', type: 'string', isArray: true, isDistinct: true })];
      const objectRegistry = { Meta: { name: 'Meta', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'meta', type: 'object', objectInfo: { objectName: 'Meta', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const tagsStmt = statements.find((s) => s.includes('meta.tags'));

      expect(tagsStmt).toBeDefined();
      expect(tagsStmt).toContain('VALUE IF $value THEN $value.distinct() ELSE [] END');
    });

    test('generates VALUE clause for @sort on object array subfield', () => {
      const objFields = [makeField({ name: 'scores', type: 'int', isArray: true, sortOrder: 'desc' as const })];
      const objectRegistry = { Stats: { name: 'Stats', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'stats', type: 'object', objectInfo: { objectName: 'Stats', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const scoresStmt = statements.find((s) => s.includes('stats.scores'));

      expect(scoresStmt).toBeDefined();
      expect(scoresStmt).toContain('VALUE IF $value THEN $value.sort(false) ELSE [] END');
    });

    test('generates DEFAULT clause with boolean default value', () => {
      const objFields = [makeField({ name: 'active', type: 'bool', defaultValue: true })];
      const objectRegistry = { Flags: { name: 'Flags', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'flags', type: 'object', objectInfo: { objectName: 'Flags', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const activeStmt = statements.find((s) => s.includes('flags.active'));

      expect(activeStmt).toBeDefined();
      expect(activeStmt).toContain('DEFAULT true');
    });

    test('generates DEFAULT clause with numeric default value', () => {
      const objFields = [makeField({ name: 'count', type: 'int', defaultValue: 0 })];
      const objectRegistry = { Counter: { name: 'Counter', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'counter', type: 'object', objectInfo: { objectName: 'Counter', fields: objFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const countStmt = statements.find((s) => s.includes('counter.count'));

      expect(countStmt).toBeDefined();
      expect(countStmt).toContain('DEFAULT 0');
    });

    test('generates indexes for nested object subfields', () => {
      const innerFields = [makeField({ name: 'code', type: 'string', isUnique: true })];
      const outerFields = [
        makeField({
          name: 'inner',
          type: 'object',
          objectInfo: { objectName: 'Inner', fields: innerFields },
        }),
      ];
      const objectRegistry = {
        Inner: { name: 'Inner', fields: innerFields },
        Outer: { name: 'Outer', fields: outerFields },
      };
      const model = {
        name: 'Store',
        tableName: 'store',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({ name: 'outer', type: 'object', objectInfo: { objectName: 'Outer', fields: outerFields } }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const indexStmt = statements.find((s) => s.includes('DEFINE INDEX') && s.includes('outer.inner.code'));

      expect(indexStmt).toBeDefined();
      expect(indexStmt).toContain('store_outer_inner_code_unique');
      expect(indexStmt).toContain('COLUMNS outer.inner.code');
      expect(indexStmt).toContain('UNIQUE');
    });

    test('generates indexes for array object subfields with .* path', () => {
      const objFields = [makeField({ name: 'email', type: 'email', isIndexed: true })];
      const objectRegistry = { Contact: { name: 'Contact', fields: objFields } };
      const model = {
        name: 'User',
        tableName: 'user',
        fields: [
          makeField({ name: 'id', type: 'record', isId: true, isUnique: true }),
          makeField({
            name: 'contacts',
            type: 'object',
            isArray: true,
            objectInfo: { objectName: 'Contact', fields: objFields },
          }),
        ],
      };

      const statements = generateModelDefineStatements(model, undefined, undefined, objectRegistry);
      const indexStmt = statements.find((s) => s.includes('DEFINE INDEX') && s.includes('contacts'));

      expect(indexStmt).toBeDefined();
      expect(indexStmt).toContain('COLUMNS contacts.*.email');
      // Index name should not include .*
      expect(indexStmt).toContain('user_contacts_email_index');
    });
  });
});
