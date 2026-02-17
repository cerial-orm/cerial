import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';
import { validateFieldFilter, validateWhere } from '../../../src/query/validators/where-validator';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';
import { CerialId } from '../../../src/utils/cerial-id';
import { CerialUuid } from '../../../src/utils/cerial-uuid';
import { NONE } from '../../../src/utils/none';
import { validateTypedRecordId } from '../../../src/utils/validation-utils';

function field(overrides: Partial<FieldMetadata> & { name: string }): FieldMetadata {
  return {
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

describe('validateTypedRecordId', () => {
  describe('int type', () => {
    test('accepts integer number', () => {
      expect(validateTypedRecordId(42, ['int'])).toBe(true);
    });

    test('accepts zero', () => {
      expect(validateTypedRecordId(0, ['int'])).toBe(true);
    });

    test('accepts negative integer', () => {
      expect(validateTypedRecordId(-5, ['int'])).toBe(true);
    });

    test('rejects float', () => {
      expect(validateTypedRecordId(3.14, ['int'])).toBe(false);
    });

    test('rejects string', () => {
      expect(validateTypedRecordId('42', ['int'])).toBe(false);
    });

    test('rejects boolean', () => {
      expect(validateTypedRecordId(true, ['int'])).toBe(false);
    });
  });

  describe('number type', () => {
    test('accepts integer', () => {
      expect(validateTypedRecordId(42, ['number'])).toBe(true);
    });

    test('accepts float', () => {
      expect(validateTypedRecordId(3.14, ['number'])).toBe(true);
    });

    test('accepts negative', () => {
      expect(validateTypedRecordId(-1.5, ['number'])).toBe(true);
    });

    test('rejects string', () => {
      expect(validateTypedRecordId('42', ['number'])).toBe(false);
    });
  });

  describe('string type', () => {
    test('accepts string', () => {
      expect(validateTypedRecordId('hello', ['string'])).toBe(true);
    });

    test('accepts empty string', () => {
      expect(validateTypedRecordId('', ['string'])).toBe(true);
    });

    test('rejects number', () => {
      expect(validateTypedRecordId(42, ['string'])).toBe(false);
    });
  });

  describe('uuid type', () => {
    test('accepts valid UUID string', () => {
      expect(validateTypedRecordId('550e8400-e29b-41d4-a716-446655440000', ['uuid'])).toBe(true);
    });

    test('rejects invalid UUID string', () => {
      expect(validateTypedRecordId('not-a-uuid', ['uuid'])).toBe(false);
    });

    test('accepts CerialUuid instance', () => {
      const uuid = CerialUuid.fromString('550e8400-e29b-41d4-a716-446655440000');
      expect(validateTypedRecordId(uuid, ['uuid'])).toBe(true);
    });

    test('accepts native Uuid instance', () => {
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      expect(validateTypedRecordId(uuid, ['uuid'])).toBe(true);
    });

    test('rejects number for uuid type', () => {
      expect(validateTypedRecordId(42, ['uuid'])).toBe(false);
    });
  });

  describe('union types', () => {
    test('accepts int when types are [string, int]', () => {
      expect(validateTypedRecordId(42, ['string', 'int'])).toBe(true);
    });

    test('accepts string when types are [string, int]', () => {
      expect(validateTypedRecordId('hello', ['string', 'int'])).toBe(true);
    });

    test('rejects float when types are [string, int]', () => {
      expect(validateTypedRecordId(3.14, ['string', 'int'])).toBe(false);
    });

    test('accepts uuid when types are [int, uuid]', () => {
      expect(validateTypedRecordId('550e8400-e29b-41d4-a716-446655440000', ['int', 'uuid'])).toBe(true);
    });

    test('rejects boolean when types are [string, int]', () => {
      expect(validateTypedRecordId(true, ['string', 'int'])).toBe(false);
    });
  });

  describe('wrapper types always valid', () => {
    test('accepts CerialId regardless of recordIdTypes', () => {
      const id = CerialId.fromString('user:abc');
      expect(validateTypedRecordId(id, ['int'])).toBe(true);
    });

    test('accepts RecordId regardless of recordIdTypes', () => {
      const id = new RecordId('user', 'abc');
      expect(validateTypedRecordId(id, ['int'])).toBe(true);
    });

    test('accepts StringRecordId regardless of recordIdTypes', () => {
      const id = new StringRecordId('user:abc');
      expect(validateTypedRecordId(id, ['int'])).toBe(true);
    });
  });

  describe('tuple/object types (complex IDs)', () => {
    test('accepts array for unknown type (tuple ID)', () => {
      expect(validateTypedRecordId([1, 2, 3], ['Coordinate'])).toBe(true);
    });

    test('accepts plain object for unknown type (object ID)', () => {
      expect(validateTypedRecordId({ x: 1, y: 2 }, ['Point'])).toBe(true);
    });

    test('rejects primitive for unknown complex type', () => {
      expect(validateTypedRecordId(42, ['Coordinate'])).toBe(false);
    });

    test('rejects string for unknown complex type', () => {
      expect(validateTypedRecordId('hello', ['Coordinate'])).toBe(false);
    });
  });
});

describe('validateCreateData with typed @id', () => {
  const intIdModel = model('Counter', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false, recordIdTypes: ['int'] }),
    field({ name: 'label', type: 'string' }),
  ]);

  test('accepts integer id when recordIdTypes is [int]', () => {
    const result = validateCreateData({ id: 42, label: 'test' }, intIdModel);
    expect(result.valid).toBe(true);
  });

  test('rejects float id when recordIdTypes is [int]', () => {
    const result = validateCreateData({ id: 3.14, label: 'test' }, intIdModel);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('int');
  });

  test('accepts CerialId for typed @id (wrapper bypass)', () => {
    const id = CerialId.fromString('counter:42');
    const result = validateCreateData({ id, label: 'test' }, intIdModel);
    expect(result.valid).toBe(true);
  });

  test('accepts undefined id (optional)', () => {
    const result = validateCreateData({ label: 'test' }, intIdModel);
    expect(result.valid).toBe(true);
  });

  test('accepts null id (skipped)', () => {
    const result = validateCreateData({ id: null, label: 'test' }, intIdModel);
    expect(result.valid).toBe(true);
  });

  const unionIdModel = model('Flexible', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false, recordIdTypes: ['string', 'int'] }),
    field({ name: 'data', type: 'string' }),
  ]);

  test('accepts string id for union [string, int]', () => {
    const result = validateCreateData({ id: 'my-id', data: 'test' }, unionIdModel);
    expect(result.valid).toBe(true);
  });

  test('accepts int id for union [string, int]', () => {
    const result = validateCreateData({ id: 99, data: 'test' }, unionIdModel);
    expect(result.valid).toBe(true);
  });

  test('rejects boolean id for union [string, int]', () => {
    const result = validateCreateData({ id: true, data: 'test' }, unionIdModel);
    expect(result.valid).toBe(false);
  });

  const untypedIdModel = model('Basic', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'name', type: 'string' }),
  ]);

  test('falls back to isRecordIdInput when no recordIdTypes', () => {
    const result = validateCreateData({ id: 'basic:abc', name: 'test' }, untypedIdModel);
    expect(result.valid).toBe(true);
  });
});

describe('validateCreateData with FK recordIdTypes', () => {
  const modelWithFk = model('Post', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'authorId', type: 'record', recordIdTypes: ['int'] }),
    field({ name: 'title', type: 'string' }),
  ]);

  test('accepts integer FK when recordIdTypes is [int]', () => {
    const result = validateCreateData({ authorId: 42, title: 'Hello' }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('rejects string FK when recordIdTypes is [int]', () => {
    const result = validateCreateData({ authorId: 'not-int', title: 'Hello' }, modelWithFk);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('int');
  });

  test('accepts CerialId FK (wrapper bypass)', () => {
    const id = CerialId.fromString('user:42');
    const result = validateCreateData({ authorId: id, title: 'Hello' }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('accepts RecordId FK (wrapper bypass)', () => {
    const id = new RecordId('user', 42);
    const result = validateCreateData({ authorId: id, title: 'Hello' }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('skips validation for NONE value on optional FK', () => {
    const optFkModel = model('Post', [
      field({ name: 'id', type: 'record', isId: true, isRequired: false }),
      field({ name: 'authorId', type: 'record', isRequired: false, recordIdTypes: ['int'] }),
      field({ name: 'title', type: 'string' }),
    ]);
    const result = validateCreateData({ authorId: NONE, title: 'Hello' }, optFkModel);
    expect(result.valid).toBe(true);
  });

  test('skips typed record check for null value on nullable FK', () => {
    const nullableFkModel = model('Post', [
      field({ name: 'id', type: 'record', isId: true, isRequired: false }),
      field({ name: 'authorId', type: 'record', isRequired: true, isNullable: true, recordIdTypes: ['int'] }),
      field({ name: 'title', type: 'string' }),
    ]);
    const result = validateCreateData({ authorId: null, title: 'Hello' }, nullableFkModel);
    expect(result.valid).toBe(true);
  });

  test('skips typed record check for undefined value on optional FK', () => {
    const optFkModel = model('Post', [
      field({ name: 'id', type: 'record', isId: true, isRequired: false }),
      field({ name: 'authorId', type: 'record', isRequired: false, recordIdTypes: ['int'] }),
      field({ name: 'title', type: 'string' }),
    ]);
    const result = validateCreateData({ authorId: undefined, title: 'Hello' }, optFkModel);
    expect(result.valid).toBe(true);
  });

  const noTypeFkModel = model('Post', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'authorId', type: 'record' }),
    field({ name: 'title', type: 'string' }),
  ]);

  test('falls through to generic validateFieldValue when no recordIdTypes on FK', () => {
    const result = validateCreateData({ authorId: 'user:abc', title: 'Hello' }, noTypeFkModel);
    expect(result.valid).toBe(true);
  });
});

describe('validateUpdateData with typed Record fields', () => {
  const modelWithFk = model('Post', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'authorId', type: 'record', recordIdTypes: ['int'] }),
    field({ name: 'title', type: 'string' }),
  ]);

  test('accepts integer FK in update when recordIdTypes is [int]', () => {
    const result = validateUpdateData({ authorId: 42 }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('rejects string FK in update when recordIdTypes is [int]', () => {
    const result = validateUpdateData({ authorId: 'not-int' }, modelWithFk);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('int');
  });

  test('rejects float FK in update when recordIdTypes is [int]', () => {
    const result = validateUpdateData({ authorId: 3.14 }, modelWithFk);
    expect(result.valid).toBe(false);
  });

  test('accepts CerialId FK in update (wrapper bypass)', () => {
    const id = CerialId.fromString('user:42');
    const result = validateUpdateData({ authorId: id }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('accepts RecordId FK in update (wrapper bypass)', () => {
    const id = new RecordId('user', 42);
    const result = validateUpdateData({ authorId: id }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('accepts StringRecordId FK in update (wrapper bypass)', () => {
    const id = new StringRecordId('user:42');
    const result = validateUpdateData({ authorId: id }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('skips validation for NONE value in update', () => {
    const result = validateUpdateData({ authorId: NONE }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('skips validation for undefined value in update', () => {
    const result = validateUpdateData({ authorId: undefined }, modelWithFk);
    expect(result.valid).toBe(true);
  });

  test('rejects null on non-nullable FK in update', () => {
    const result = validateUpdateData({ authorId: null }, modelWithFk);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.message).toContain('not nullable');
  });

  test('accepts null on nullable FK in update', () => {
    const nullableFkModel = model('Post', [
      field({ name: 'id', type: 'record', isId: true, isRequired: false }),
      field({ name: 'authorId', type: 'record', isRequired: true, isNullable: true, recordIdTypes: ['int'] }),
      field({ name: 'title', type: 'string' }),
    ]);
    const result = validateUpdateData({ authorId: null }, nullableFkModel);
    expect(result.valid).toBe(true);
  });

  test('validates non-record fields normally alongside typed record fields', () => {
    const result = validateUpdateData({ authorId: 42, title: 123 as any }, modelWithFk);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain('title');
  });

  const unionFkModel = model('Post', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'refId', type: 'record', recordIdTypes: ['string', 'int'] }),
    field({ name: 'title', type: 'string' }),
  ]);

  test('accepts string for union FK in update', () => {
    const result = validateUpdateData({ refId: 'my-ref' }, unionFkModel);
    expect(result.valid).toBe(true);
  });

  test('accepts int for union FK in update', () => {
    const result = validateUpdateData({ refId: 99 }, unionFkModel);
    expect(result.valid).toBe(true);
  });

  test('rejects boolean for union FK in update', () => {
    const result = validateUpdateData({ refId: true }, unionFkModel);
    expect(result.valid).toBe(false);
  });

  const noTypeFkModel = model('Post', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'authorId', type: 'record' }),
    field({ name: 'title', type: 'string' }),
  ]);

  test('falls through to generic validation when no recordIdTypes in update', () => {
    const result = validateUpdateData({ authorId: 'user:abc' }, noTypeFkModel);
    expect(result.valid).toBe(true);
  });
});

describe('WHERE clause typed record ID validation', () => {
  const typedFkModel = model('Post', [
    field({ name: 'id', type: 'record', isId: true, isRequired: false }),
    field({ name: 'authorId', type: 'record', recordIdTypes: ['int'] }),
    field({ name: 'title', type: 'string' }),
  ]);

  describe('validateFieldFilter with typed record fields', () => {
    test('accepts integer direct value for int-typed record field', () => {
      const errors = validateFieldFilter('authorId', 42, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });

    test('rejects string direct value for int-typed record field', () => {
      const errors = validateFieldFilter('authorId', 'not-int', typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('int');
    });

    test('rejects float direct value for int-typed record field', () => {
      const errors = validateFieldFilter('authorId', 3.14, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(1);
    });

    test('rejects boolean direct value for int-typed record field', () => {
      const errors = validateFieldFilter('authorId', true, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(1);
    });

    test('accepts CerialId wrapper for int-typed record field', () => {
      const id = CerialId.fromString('user:42');
      const errors = validateFieldFilter('authorId', id, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });

    test('accepts RecordId wrapper for int-typed record field', () => {
      const id = new RecordId('user', 42);
      const errors = validateFieldFilter('authorId', id, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });

    test('accepts StringRecordId wrapper for int-typed record field', () => {
      const id = new StringRecordId('user:42');
      const errors = validateFieldFilter('authorId', id, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateFieldFilter with union typed record fields', () => {
    const unionModel = model('Ref', [
      field({ name: 'id', type: 'record', isId: true, isRequired: false }),
      field({ name: 'targetId', type: 'record', recordIdTypes: ['string', 'int'] }),
    ]);

    test('accepts string for union [string, int]', () => {
      const errors = validateFieldFilter('targetId', 'my-ref', unionModel, 'where.targetId');
      expect(errors).toHaveLength(0);
    });

    test('accepts int for union [string, int]', () => {
      const errors = validateFieldFilter('targetId', 99, unionModel, 'where.targetId');
      expect(errors).toHaveLength(0);
    });

    test('rejects boolean for union [string, int]', () => {
      const errors = validateFieldFilter('targetId', true, unionModel, 'where.targetId');
      expect(errors).toHaveLength(1);
    });

    test('rejects float for union [string, int]', () => {
      const errors = validateFieldFilter('targetId', 3.14, unionModel, 'where.targetId');
      expect(errors).toHaveLength(1);
    });
  });

  describe('validateFieldFilter skips typed check for operator objects', () => {
    test('passes through operator objects without typed ID check', () => {
      const errors = validateFieldFilter('authorId', { eq: 42 }, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });

    test('still validates unknown operators on record fields', () => {
      const errors = validateFieldFilter('authorId', { badOp: 42 }, typedFkModel, 'where.authorId');
      expect(errors).toHaveLength(1);
      expect(errors[0]!.message).toContain('Unknown operator');
    });
  });

  describe('validateFieldFilter with untyped record fields', () => {
    const untypedModel = model('Post', [
      field({ name: 'id', type: 'record', isId: true, isRequired: false }),
      field({ name: 'authorId', type: 'record' }),
    ]);

    test('does not validate typed IDs when no recordIdTypes', () => {
      const errors = validateFieldFilter('authorId', 'any-string', untypedModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });

    test('accepts number for untyped record field', () => {
      const errors = validateFieldFilter('authorId', 42, untypedModel, 'where.authorId');
      expect(errors).toHaveLength(0);
    });
  });

  describe('validateWhere integration with typed record fields', () => {
    test('valid where clause with matching typed ID', () => {
      const result = validateWhere({ authorId: 42 }, typedFkModel);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test('invalid where clause with mismatched typed ID', () => {
      const result = validateWhere({ authorId: 'not-int' }, typedFkModel);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('int');
    });

    test('valid where clause with CerialId wrapper', () => {
      const id = CerialId.fromString('user:42');
      const result = validateWhere({ authorId: id }, typedFkModel);
      expect(result.valid).toBe(true);
    });

    test('valid where clause with operator object on typed record field', () => {
      const result = validateWhere({ authorId: { eq: 42 } }, typedFkModel);
      expect(result.valid).toBe(true);
    });

    test('valid where clause mixing typed record and non-record fields', () => {
      const result = validateWhere({ authorId: 42, title: 'Hello' }, typedFkModel);
      expect(result.valid).toBe(true);
    });

    test('invalid where with typed record error alongside valid non-record field', () => {
      const result = validateWhere({ authorId: 'bad', title: 'Hello' }, typedFkModel);
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]!.message).toContain('authorId');
    });

    test('valid where clause with AND containing typed record field', () => {
      const result = validateWhere({ AND: [{ authorId: 42 }, { title: 'Hello' }] }, typedFkModel);
      expect(result.valid).toBe(true);
    });

    test('invalid where clause with AND containing mismatched typed record', () => {
      const result = validateWhere({ AND: [{ authorId: 'bad' }] }, typedFkModel);
      expect(result.valid).toBe(false);
    });

    test('valid where clause with NOT containing typed record field', () => {
      const result = validateWhere({ NOT: { authorId: 42 } }, typedFkModel);
      expect(result.valid).toBe(true);
    });

    test('invalid where clause with NOT containing mismatched typed record', () => {
      const result = validateWhere({ NOT: { authorId: true } }, typedFkModel);
      expect(result.valid).toBe(false);
    });

    test('valid where clause with OR containing typed record field', () => {
      const result = validateWhere({ OR: [{ authorId: 1 }, { authorId: 2 }] }, typedFkModel);
      expect(result.valid).toBe(true);
    });
  });
});
