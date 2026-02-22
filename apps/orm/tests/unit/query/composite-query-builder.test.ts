/**
 * Unit Tests: Composite Query Builder
 *
 * Tests composite unique key detection, expansion, and integration
 * with findUnique, updateUnique, deleteUnique query builders.
 */

import { describe, expect, test } from 'bun:test';
import { getRecordIdFromWhere } from '../../../src/query/builders/delete-builder';
import {
  buildFindUniqueQuery,
  expandCompositeKey,
  findCompositeUniqueKey,
  validateUniqueField,
} from '../../../src/query/builders/select-builder';
import type { ModelMetadata, WhereClause } from '../../../src/types';

/** Test model with a composite unique on (firstName, lastName) */
const userModel: ModelMetadata = {
  name: 'User',
  tableName: 'user',
  compositeDirectives: [
    { kind: 'unique', name: 'firstLast', fields: ['firstName', 'lastName'] },
    { kind: 'index', name: 'emailAge', fields: ['email', 'age'] },
  ],
  fields: [
    { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: false },
    { name: 'firstName', type: 'string', isId: false, isUnique: false, isRequired: true },
    { name: 'lastName', type: 'string', isId: false, isUnique: false, isRequired: true },
    { name: 'email', type: 'email', isId: false, isUnique: true, isRequired: true },
    { name: 'age', type: 'int', isId: false, isUnique: false, isRequired: false },
  ],
};

/** Test model with dot-notation composite fields */
const storeModel: ModelMetadata = {
  name: 'Store',
  tableName: 'store',
  compositeDirectives: [
    { kind: 'unique', name: 'cityZip', fields: ['address.city', 'address.zip'] },
    { kind: 'unique', name: 'nameCityMixed', fields: ['name', 'address.city'] },
  ],
  fields: [
    { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: false },
    { name: 'name', type: 'string', isId: false, isUnique: false, isRequired: true },
    {
      name: 'address',
      type: 'object',
      isId: false,
      isUnique: false,
      isRequired: true,
      objectInfo: {
        objectName: 'Address',
        fields: [
          { name: 'city', type: 'string', isId: false, isUnique: false, isRequired: true },
          { name: 'zip', type: 'string', isId: false, isUnique: false, isRequired: true },
          { name: 'street', type: 'string', isId: false, isUnique: false, isRequired: false },
        ],
      },
    },
  ],
};

/** Model with no composite directives */
const simpleModel: ModelMetadata = {
  name: 'Tag',
  tableName: 'tag',
  fields: [
    { name: 'id', type: 'record', isId: true, isUnique: true, isRequired: false },
    { name: 'name', type: 'string', isId: false, isUnique: true, isRequired: true },
  ],
};

describe('findCompositeUniqueKey', () => {
  test('should find composite unique key when present in where clause', () => {
    const where: WhereClause = {
      firstLast: { firstName: 'Alice', lastName: 'Smith' },
    };
    const result = findCompositeUniqueKey(where, userModel);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('firstLast');
    expect(result!.fields).toEqual(['firstName', 'lastName']);
    expect(result!.values).toEqual({ firstName: 'Alice', lastName: 'Smith' });
  });

  test('should return null when no composite key is in where clause', () => {
    const where: WhereClause = { email: 'alice@example.com' };
    const result = findCompositeUniqueKey(where, userModel);

    expect(result).toBeNull();
  });

  test('should ignore @@index directives (only matches @@unique)', () => {
    const where: WhereClause = { emailAge: { email: 'alice@example.com', age: 30 } };
    const result = findCompositeUniqueKey(where, userModel);

    expect(result).toBeNull();
  });

  test('should return null for model without composite directives', () => {
    const where: WhereClause = { name: 'test' };
    const result = findCompositeUniqueKey(where, simpleModel);

    expect(result).toBeNull();
  });

  test('should find dot-notation composite key', () => {
    const where: WhereClause = {
      cityZip: { address: { city: 'NYC', zip: '10001' } },
    };
    const result = findCompositeUniqueKey(where, storeModel);

    expect(result).not.toBeNull();
    expect(result!.name).toBe('cityZip');
  });
});

describe('expandCompositeKey', () => {
  test('should expand simple composite key into flat fields', () => {
    const where: WhereClause = {
      firstLast: { firstName: 'Alice', lastName: 'Smith' },
    };
    const expanded = expandCompositeKey(where, userModel);

    expect(expanded).toEqual({ firstName: 'Alice', lastName: 'Smith' });
    expect(expanded).not.toHaveProperty('firstLast');
  });

  test('should preserve additional where fields alongside composite key', () => {
    const where: WhereClause = {
      firstLast: { firstName: 'Alice', lastName: 'Smith' },
      age: 30,
    };
    const expanded = expandCompositeKey(where, userModel);

    expect(expanded).toEqual({ firstName: 'Alice', lastName: 'Smith', age: 30 });
  });

  test('should return original where when no composite key present', () => {
    const where: WhereClause = { email: 'alice@example.com' };
    const expanded = expandCompositeKey(where, userModel);

    expect(expanded).toEqual(where);
  });

  test('should expand dot-notation composite key', () => {
    const where: WhereClause = {
      cityZip: { address: { city: 'NYC', zip: '10001' } },
    };
    const expanded = expandCompositeKey(where, storeModel);

    expect(expanded).toEqual({ 'address.city': 'NYC', 'address.zip': '10001' });
    expect(expanded).not.toHaveProperty('cityZip');
  });

  test('should expand mixed composite key (primitive + dot-notation)', () => {
    const where: WhereClause = {
      nameCityMixed: { name: 'Downtown Store', address: { city: 'NYC' } },
    };
    const expanded = expandCompositeKey(where, storeModel);

    expect(expanded).toEqual({ name: 'Downtown Store', 'address.city': 'NYC' });
  });

  test('should handle model without composite directives', () => {
    const where: WhereClause = { name: 'test' };
    const expanded = expandCompositeKey(where, simpleModel);

    expect(expanded).toEqual(where);
  });
});

describe('validateUniqueField with composites', () => {
  test('should pass validation when composite unique key is present', () => {
    const where: WhereClause = {
      firstLast: { firstName: 'Alice', lastName: 'Smith' },
    };

    expect(() => validateUniqueField(where, userModel)).not.toThrow();
  });

  test('should pass validation when single unique field is present', () => {
    const where: WhereClause = { email: 'alice@example.com' };

    expect(() => validateUniqueField(where, userModel)).not.toThrow();
  });

  test('should pass validation when id field is present', () => {
    const where: WhereClause = { id: 'some-id' };

    expect(() => validateUniqueField(where, userModel)).not.toThrow();
  });

  test('should fail validation when no unique field or composite key is present', () => {
    const where: WhereClause = { age: 30 };

    expect(() => validateUniqueField(where, userModel)).toThrow(/unique field/i);
  });

  test('should include composite key names in error message', () => {
    const where: WhereClause = { age: 30 };

    try {
      validateUniqueField(where, userModel);
    } catch (e: unknown) {
      const msg = (e as Error).message;
      expect(msg).toContain('firstLast');
    }
  });
});

describe('getRecordIdFromWhere with composites', () => {
  test('should return expandedWhere with composite key flattened', () => {
    const where: WhereClause = {
      firstLast: { firstName: 'Alice', lastName: 'Smith' },
    };
    const result = getRecordIdFromWhere(where, userModel, 'findUnique');

    expect(result.hasId).toBe(false);
    expect(result.expandedWhere).toEqual({ firstName: 'Alice', lastName: 'Smith' });
  });

  test('should return expandedWhere unchanged when no composite key', () => {
    const where: WhereClause = { email: 'alice@example.com' };
    const result = getRecordIdFromWhere(where, userModel, 'findUnique');

    expect(result.hasId).toBe(false);
    expect(result.expandedWhere).toEqual(where);
  });

  test('should detect id in expandedWhere', () => {
    const where: WhereClause = { id: 'some-id' };
    const result = getRecordIdFromWhere(where, userModel, 'findUnique');

    expect(result.hasId).toBe(true);
    expect(result.id).toBe('some-id');
  });
});

describe('buildFindUniqueQuery with composites', () => {
  test('should build query with expanded composite key', () => {
    const query = buildFindUniqueQuery(userModel, {
      where: { firstLast: { firstName: 'Alice', lastName: 'Smith' } },
    });

    // Should be a WHERE-based query (no id present)
    expect(query.text).toContain('SELECT');
    expect(query.text).toContain('FROM ONLY user');
    expect(query.text).toContain('WHERE');
    // Should contain variable bindings for both fields
    expect(Object.keys(query.vars).length).toBeGreaterThanOrEqual(2);
  });

  test('should build query with composite key plus additional filters', () => {
    const query = buildFindUniqueQuery(userModel, {
      where: {
        firstLast: { firstName: 'Alice', lastName: 'Smith' },
        age: 30,
      },
    });

    expect(query.text).toContain('WHERE');
    // Should have variable bindings for firstName, lastName, and age
    expect(Object.keys(query.vars).length).toBeGreaterThanOrEqual(3);
  });

  test('should build query with dot-notation composite key', () => {
    const query = buildFindUniqueQuery(storeModel, {
      where: { cityZip: { address: { city: 'NYC', zip: '10001' } } },
    });

    expect(query.text).toContain('SELECT');
    expect(query.text).toContain('FROM ONLY store');
    expect(query.text).toContain('WHERE');
    // Dot-notation paths should appear in the query
    expect(query.text).toContain('address.city');
    expect(query.text).toContain('address.zip');
  });

  test('should build query with mixed composite key', () => {
    const query = buildFindUniqueQuery(storeModel, {
      where: { nameCityMixed: { name: 'Downtown Store', address: { city: 'NYC' } } },
    });

    expect(query.text).toContain('WHERE');
    expect(query.text).toContain('address.city');
    expect(query.text).toContain('name');
  });
});
