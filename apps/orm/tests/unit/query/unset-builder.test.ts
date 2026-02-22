/**
 * Unit tests for unset builder functionality
 *
 * Tests mergeUnsetIntoData, buildUpdateManyQuery with unset,
 * buildUpdateUniqueQuery with unset, object sub-field NONE,
 * and tuple element NONE via $this reconstruction.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import {
  buildUpdateManyQuery,
  buildUpdateUniqueQuery,
  mergeUnsetIntoData,
} from '../../../src/query/builders/update-builder';
import { buildUpsertQuery } from '../../../src/query/builders/upsert-builder';
import type { FieldMetadata, ModelMetadata, ObjectFieldMetadata, TupleFieldMetadata } from '../../../src/types';
import { isNone, NONE } from '../../../src/utils/none';

// ============================================================================
// Helper: construct metadata manually (astToRegistry doesn't populate objectInfo/tupleInfo)
// ============================================================================

function field(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function model(name: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName: name.toLowerCase(), fields };
}

// ============================================================================
// Test Schemas (for flat-field tests via parse)
// ============================================================================

const schemaBasic = `
model User {
  id Record @id
  name String
  bio String?
  age Int?
  email Email @unique
}
`;

const schemaWithTimestamps = `
model Tracked {
  id Record @id
  name String
  bio String?
  updatedAt Date @updatedAt
}
`;

// ============================================================================
// Manually constructed metadata (for object/tuple tests)
// ============================================================================

const addressObjectInfo: ObjectFieldMetadata = {
  objectName: 'Address',
  fields: [
    field({ name: 'street', type: 'string' }),
    field({ name: 'city', type: 'string' }),
    field({ name: 'zip', type: 'string', isRequired: false }),
  ],
};

const profileModel = model('Profile', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'name', type: 'string' }),
  field({ name: 'address', type: 'object', objectInfo: addressObjectInfo }),
  field({ name: 'shipping', type: 'object', isRequired: false, objectInfo: addressObjectInfo }),
]);

const innerObjInfo: ObjectFieldMetadata = {
  objectName: 'InnerObj',
  fields: [field({ name: 'value', type: 'string' }), field({ name: 'extra', type: 'string', isRequired: false })],
};

const withOptionalTupleInfo: TupleFieldMetadata = {
  tupleName: 'WithOptional',
  elements: [
    { name: 'text', index: 0, type: 'string', isOptional: false },
    { index: 1, type: 'float', isOptional: false, isNullable: true },
  ],
};

const objTupleInfo: TupleFieldMetadata = {
  tupleName: 'ObjTuple',
  elements: [
    { name: 'tag', index: 0, type: 'string', isOptional: false },
    { index: 1, type: 'object', isOptional: false, objectInfo: innerObjInfo },
  ],
};

const coordTupleInfo: TupleFieldMetadata = {
  tupleName: 'Coord',
  elements: [
    { name: 'lat', index: 0, type: 'float', isOptional: false },
    { name: 'lng', index: 1, type: 'float', isOptional: false },
  ],
};

const locationModel = model('Location', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'name', type: 'string' }),
  field({ name: 'pos', type: 'tuple', tupleInfo: coordTupleInfo }),
  field({ name: 'backup', type: 'tuple', isRequired: false, tupleInfo: coordTupleInfo }),
  field({ name: 'opt', type: 'tuple', isRequired: false, tupleInfo: withOptionalTupleInfo }),
  field({ name: 'tagged', type: 'tuple', isRequired: false, tupleInfo: objTupleInfo }),
]);

// ============================================================================
// mergeUnsetIntoData
// ============================================================================

describe('mergeUnsetIntoData', () => {
  test('merges flat field as NONE', () => {
    const result = mergeUnsetIntoData({}, { bio: true });
    expect(isNone(result.bio)).toBe(true);
  });

  test('merges multiple flat fields as NONE', () => {
    const result = mergeUnsetIntoData({}, { bio: true, age: true });
    expect(isNone(result.bio)).toBe(true);
    expect(isNone(result.age)).toBe(true);
  });

  test('data takes priority over unset for flat fields', () => {
    const result = mergeUnsetIntoData({ bio: 'hello' }, { bio: true });
    expect(result.bio).toBe('hello');
  });

  test('skips undefined data values (unset wins)', () => {
    const result = mergeUnsetIntoData({ bio: undefined }, { bio: true });
    expect(isNone(result.bio)).toBe(true);
  });

  test('preserves existing data fields not in unset', () => {
    const result = mergeUnsetIntoData({ name: 'Alice', bio: 'hello' }, { age: true });
    expect(result.name).toBe('Alice');
    expect(result.bio).toBe('hello');
    expect(isNone(result.age)).toBe(true);
  });

  test('skips undefined unset values', () => {
    const result = mergeUnsetIntoData({ name: 'Alice' }, { bio: undefined });
    expect(result.name).toBe('Alice');
    expect(result.bio).toBeUndefined();
  });

  test('deep merges object sub-fields as NONE', () => {
    const result = mergeUnsetIntoData({ address: { city: 'NYC' } }, { address: { zip: true } });
    const address = result.address as Record<string, unknown>;
    expect(address.city).toBe('NYC');
    expect(isNone(address.zip)).toBe(true);
  });

  test('data sub-field takes priority in deep merge', () => {
    const result = mergeUnsetIntoData({ address: { zip: '10001' } }, { address: { zip: true } });
    const address = result.address as Record<string, unknown>;
    expect(address.zip).toBe('10001');
  });

  test('converts entire unset subtree to NONE when data has no object', () => {
    const result = mergeUnsetIntoData({}, { address: { zip: true, city: true } });
    const address = result.address as Record<string, unknown>;
    expect(isNone(address.zip)).toBe(true);
    expect(isNone(address.city)).toBe(true);
  });

  test('data non-object value wins over unset object', () => {
    const result = mergeUnsetIntoData({ address: NONE }, { address: { zip: true } });
    expect(isNone(result.address)).toBe(true);
  });

  test('handles nested objects within unset', () => {
    const result = mergeUnsetIntoData(
      { address: { inner: { deep: 'value' } } },
      { address: { inner: { other: true } } },
    );
    const inner = (result.address as Record<string, unknown>).inner as Record<string, unknown>;
    expect(inner.deep).toBe('value');
    expect(isNone(inner.other)).toBe(true);
  });
});

// ============================================================================
// buildUpdateManyQuery with unset (flat fields)
// ============================================================================

describe('buildUpdateManyQuery with unset', () => {
  const { ast } = parse(schemaBasic);
  const registry = astToRegistry(ast);
  const userModel = registry.User!;

  test('emits NONE for unset flat field', () => {
    const query = buildUpdateManyQuery(userModel, { name: { equals: 'Alice' } }, { name: 'Bob' }, undefined, {
      bio: true,
    });

    expect(query.text).toContain('name = $name_set_0');
    expect(query.text).toContain('bio = NONE');
    expect(query.vars.name_set_0).toBe('Bob');
  });

  test('emits NONE for multiple unset fields', () => {
    const query = buildUpdateManyQuery(userModel, { name: { equals: 'Alice' } }, { name: 'Bob' }, undefined, {
      bio: true,
      age: true,
    });

    expect(query.text).toContain('bio = NONE');
    expect(query.text).toContain('age = NONE');
  });

  test('data field takes priority — unset ignored for overlapping field', () => {
    const query = buildUpdateManyQuery(userModel, { name: { equals: 'Alice' } }, { bio: 'Updated bio' }, undefined, {
      bio: true,
    });

    expect(query.text).toContain('bio = $bio_set_');
    expect(query.text).not.toMatch(/bio = NONE/);
  });

  test('works with empty data and only unset', () => {
    const query = buildUpdateManyQuery(userModel, { name: { equals: 'Alice' } }, {}, undefined, { bio: true });

    expect(query.text).toContain('bio = NONE');
  });

  test('no unset produces standard query', () => {
    const query = buildUpdateManyQuery(userModel, { name: { equals: 'Alice' } }, { name: 'Bob' });

    expect(query.text).toContain('name = $name_set_0');
    expect(query.text).not.toContain('NONE');
  });
});

// ============================================================================
// buildUpdateManyQuery with unset + objects (manual metadata)
// ============================================================================

describe('buildUpdateManyQuery with unset + objects', () => {
  test('emits NONE for optional object field (unset entire object)', () => {
    const query = buildUpdateManyQuery(profileModel, { name: { equals: 'Alice' } }, { name: 'Bob' }, undefined, {
      shipping: true,
    });

    expect(query.text).toContain('shipping = NONE');
  });

  test('emits dot-notation NONE for object sub-field unset', () => {
    const query = buildUpdateManyQuery(profileModel, { name: { equals: 'Alice' } }, { name: 'Bob' }, undefined, {
      address: { zip: true },
    });

    expect(query.text).toContain('address.zip = NONE');
  });

  test('combines data and unset on same object (different sub-fields)', () => {
    const query = buildUpdateManyQuery(
      profileModel,
      { name: { equals: 'Alice' } },
      { address: { city: 'NYC' } },
      undefined,
      { address: { zip: true } },
    );

    expect(query.text).toContain('address.city = $');
    expect(query.text).toContain('address.zip = NONE');
  });

  test('data sub-field takes priority over unset sub-field', () => {
    const query = buildUpdateManyQuery(
      profileModel,
      { name: { equals: 'Alice' } },
      { address: { zip: '10001' } },
      undefined,
      { address: { zip: true } },
    );

    // zip is in data, so it should NOT be NONE
    expect(query.text).toContain('address.zip = $');
    expect(query.text).not.toMatch(/address\.zip = NONE/);
  });
});

// ============================================================================
// buildUpdateManyQuery with unset + tuples (manual metadata)
// ============================================================================

describe('buildUpdateManyQuery with unset + tuples', () => {
  test('emits NONE for optional tuple field (unset entire tuple)', () => {
    const query = buildUpdateManyQuery(locationModel, { name: { equals: 'HQ' } }, { name: 'Office' }, undefined, {
      backup: true,
    });

    expect(query.text).toContain('backup = NONE');
  });

  test('emits $this reconstruction with NULL for @nullable tuple element unset', () => {
    // WithOptional has: [String, Float @nullable]
    // Unsetting the @nullable Float element (index 1)
    const query = buildUpdateManyQuery(locationModel, { name: { equals: 'HQ' } }, {}, undefined, { opt: { 1: true } });

    // Should use $this reconstruction: opt = [$this.opt[0], NULL]
    expect(query.text).toContain('opt = [$this.opt[0], NULL]');
  });

  test('emits $this reconstruction with NONE for object-in-tuple sub-field', () => {
    // ObjTuple has: [String, InnerObj]
    // Unsetting the optional sub-field of the object element
    const query = buildUpdateManyQuery(locationModel, { name: { equals: 'HQ' } }, {}, undefined, {
      tagged: { 1: { extra: true } },
    });

    // Should reconstruct tagged = [$this.tagged[0], $this.tagged[1]]
    // Then merge sub-field: tagged[1].extra = NONE
    expect(query.text).toContain('tagged = [$this.tagged[0], $this.tagged[1]]');
    expect(query.text).toContain('tagged[1].extra = NONE');
  });

  test('combines tuple element unset with data on different element', () => {
    // WithOptional: [String, Float @nullable] — update text (index 0) and unset Float (index 1)
    const query = buildUpdateManyQuery(
      locationModel,
      { name: { equals: 'HQ' } },
      { opt: { 0: 'new-label' } },
      undefined,
      { opt: { 1: true } },
    );

    // The merged data should have both: text = 'new-label', 1 = NONE → NULL for @nullable
    // Reconstruction: opt = [$opt_0_set_X, NULL]
    expect(query.text).toContain('opt = [');
    expect(query.text).toContain('NULL');
  });
});

// ============================================================================
// buildUpdateUniqueQuery with unset
// ============================================================================

describe('buildUpdateUniqueQuery with unset', () => {
  const { ast } = parse(schemaBasic);
  const registry = astToRegistry(ast);
  const userModel = registry.User!;

  test('emits NONE for unset field via ID-based update', () => {
    const query = buildUpdateUniqueQuery(
      userModel,
      { id: 'abc123' },
      { name: 'Bob' },
      undefined,
      undefined,
      undefined,
      undefined,
      { bio: true },
    );

    expect(query.text).toContain('UPDATE ONLY user:abc123');
    expect(query.text).toContain('name = $name_set_0');
    expect(query.text).toContain('bio = NONE');
  });

  test('emits NONE for unset field via unique-field update', () => {
    const query = buildUpdateUniqueQuery(
      userModel,
      { email: 'test@example.com' },
      { name: 'Bob' },
      undefined,
      undefined,
      undefined,
      undefined,
      { bio: true },
    );

    expect(query.text).toContain('UPDATE user');
    expect(query.text).toContain('bio = NONE');
    expect(query.text).toContain('WHERE email = $email_eq_0');
  });

  test('combines data and unset in unique update', () => {
    const query = buildUpdateUniqueQuery(
      userModel,
      { id: 'abc123' },
      { name: 'Bob' },
      undefined,
      undefined,
      undefined,
      undefined,
      { bio: true, age: true },
    );

    expect(query.text).toContain('name = $name_set_0');
    expect(query.text).toContain('bio = NONE');
    expect(query.text).toContain('age = NONE');
  });
});

// ============================================================================
// buildUpdateManyQuery with unset + @updatedAt
// ============================================================================

describe('buildUpdateManyQuery with unset + @updatedAt', () => {
  const { ast } = parse(schemaWithTimestamps);
  const registry = astToRegistry(ast);
  const trackedModel = registry.Tracked!;

  test('@updatedAt NONE injection still happens alongside unset', () => {
    const query = buildUpdateManyQuery(trackedModel, { name: { equals: 'Alice' } }, { name: 'Bob' }, undefined, {
      bio: true,
    });

    expect(query.text).toContain('updatedAt = NONE');
    expect(query.text).toContain('bio = NONE');
    expect(query.text).toContain('name = $name_set_');
  });
});

// ============================================================================
// buildUpsertQuery with unset
// ============================================================================

describe('buildUpsertQuery with unset', () => {
  const { ast } = parse(schemaBasic);
  const registry = astToRegistry(ast);
  const userModel = registry.User!;

  test('unset merges into update data for WHERE-based upsert', () => {
    const query = buildUpsertQuery(
      userModel,
      { email: 'test@example.com' },
      { name: 'Alice', email: 'test@example.com', isActive: true },
      { name: 'Updated' },
      undefined,
      undefined,
      undefined,
      undefined,
      { bio: true },
    );

    // The bio field should appear with NONE on the ELSE branch (update path)
    expect(query.text).toContain('bio');
    expect(query.text).toContain('NONE');
  });

  test('unset merges into update data for ID-based upsert', () => {
    const query = buildUpsertQuery(
      userModel,
      { id: 'user1' },
      { name: 'Alice', email: 'test@example.com', isActive: true },
      { name: 'Updated' },
      undefined,
      undefined,
      undefined,
      undefined,
      { bio: true },
    );

    // ID-based uses transaction. The UPDATE branch should have bio = NONE
    expect(query.text).toContain('bio = NONE');
  });

  test('no unset produces standard upsert', () => {
    const query = buildUpsertQuery(
      userModel,
      { email: 'test@example.com' },
      { name: 'Alice', email: 'test@example.com', isActive: true },
      { name: 'Updated' },
      undefined,
    );

    expect(query.text).not.toMatch(/bio = NONE/);
  });
});
