/**
 * Unit Tests: Typed ID Transformer
 *
 * Tests data transformation for typed Record IDs (number, bigint, array, object).
 * Verifies that toRecordIdInput, transformRecordId, transformOrValidateRecordId,
 * and transformData all preserve native ID types without string coercion.
 */

import { describe, expect, it } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import {
  toRecordIdInput,
  transformData,
  transformOrValidateRecordId,
  transformRecordId,
} from '../../../src/query/transformers/data-transformer';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';
import { CerialId } from '../../../src/utils/cerial-id';

function createModel(fields: FieldMetadata[], tableName = 'test'): ModelMetadata {
  return { name: tableName.charAt(0).toUpperCase() + tableName.slice(1), tableName, fields } as ModelMetadata;
}

function createField(overrides: Partial<FieldMetadata> & { name: string; type: string }): FieldMetadata {
  return { isId: false, isUnique: false, isRequired: false, ...overrides } as FieldMetadata;
}

// ---------------------------------------------------------------------------
// toRecordIdInput — preserves typed ID values
// ---------------------------------------------------------------------------

describe('toRecordIdInput', () => {
  describe('string inputs (backward compat)', () => {
    it('should return string as-is', () => {
      const result = toRecordIdInput('abc');
      expect(result).toBe('abc');
      expect(typeof result).toBe('string');
    });

    it('should return table:id string as-is', () => {
      const result = toRecordIdInput('user:abc');
      expect(result).toBe('user:abc');
    });
  });

  describe('wrapper type passthrough', () => {
    it('should return CerialId as-is', () => {
      const id = new CerialId('user:abc');
      const result = toRecordIdInput(id);
      expect(result).toBe(id);
      expect(CerialId.is(result)).toBe(true);
    });

    it('should return RecordId as-is', () => {
      const id = new RecordId('user', 'abc');
      const result = toRecordIdInput(id);
      expect(result).toBe(id);
      expect(result instanceof RecordId).toBe(true);
    });

    it('should return StringRecordId as-is', () => {
      const id = new StringRecordId('user:abc');
      const result = toRecordIdInput(id);
      expect(result).toBe(id);
      expect(result instanceof StringRecordId).toBe(true);
    });

    it('should return CerialId wrapping number as-is', () => {
      const id = new CerialId(42);
      const result = toRecordIdInput(id);
      expect(result).toBe(id);
      expect(CerialId.is(result)).toBe(true);
      expect((result as CerialId).id).toBe(42);
    });
  });

  describe('number preservation', () => {
    it('should preserve positive integer', () => {
      const result = toRecordIdInput(42);
      expect(result).toBe(42);
      expect(typeof result).toBe('number');
    });

    it('should preserve zero', () => {
      const result = toRecordIdInput(0);
      expect(result).toBe(0);
      expect(typeof result).toBe('number');
    });

    it('should preserve negative number', () => {
      const result = toRecordIdInput(-1);
      expect(result).toBe(-1);
      expect(typeof result).toBe('number');
    });

    it('should preserve float', () => {
      const result = toRecordIdInput(3.14);
      expect(result).toBe(3.14);
      expect(typeof result).toBe('number');
    });
  });

  describe('bigint preservation', () => {
    it('should preserve bigint value', () => {
      const result = toRecordIdInput(BigInt(999));
      expect(result).toBe(BigInt(999));
      expect(typeof result).toBe('bigint');
    });
  });

  describe('array preservation', () => {
    it('should preserve string-number array', () => {
      const arr = ['London', 42];
      const result = toRecordIdInput(arr);
      expect(result).toEqual(['London', 42]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should preserve number array', () => {
      const arr = [1.5, 2.5];
      const result = toRecordIdInput(arr);
      expect(result).toEqual([1.5, 2.5]);
    });

    it('should preserve empty array', () => {
      const result = toRecordIdInput([]);
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('object preservation', () => {
    it('should preserve plain object', () => {
      const obj = { service: 'api', ts: 123 };
      const result = toRecordIdInput(obj);
      expect(result).toEqual({ service: 'api', ts: 123 });
      expect(typeof result).toBe('object');
    });

    it('should preserve empty object', () => {
      const result = toRecordIdInput({});
      expect(result).toEqual({});
    });

    it('should preserve nested object', () => {
      const obj = { a: { b: 1 } };
      const result = toRecordIdInput(obj);
      expect(result).toEqual({ a: { b: 1 } });
    });
  });

  describe('does NOT corrupt typed values (regression)', () => {
    it('should NOT convert 42 to "42"', () => {
      const result = toRecordIdInput(42);
      expect(result).not.toBe('42');
      expect(typeof result).not.toBe('string');
    });

    it('should NOT convert array to "a,1"', () => {
      const result = toRecordIdInput(['a', 1]);
      expect(typeof result).not.toBe('string');
    });

    it('should NOT convert object to "[object Object]"', () => {
      const result = toRecordIdInput({ service: 'api', ts: 123 });
      expect(typeof result).not.toBe('string');
      expect(result).not.toBe('[object Object]');
    });
  });
});

// ---------------------------------------------------------------------------
// transformRecordId — creates RecordId with table + typed ID
// ---------------------------------------------------------------------------

describe('transformRecordId', () => {
  describe('string IDs (backward compat)', () => {
    it('should handle table:id string', () => {
      const result = transformRecordId('user', 'user:abc');
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc');
    });

    it('should handle bare id string', () => {
      const result = transformRecordId('user', 'abc');
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc');
    });
  });

  describe('CerialId inputs', () => {
    it('should handle CerialId with string id', () => {
      const result = transformRecordId('user', new CerialId('user:abc'));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc');
    });

    it('should handle CerialId wrapping number', () => {
      const result = transformRecordId('user', new CerialId(42));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe(42);
    });

    it('should handle CerialId wrapping object', () => {
      const result = transformRecordId('metric', new CerialId({ service: 'api', ts: 123 }));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('metric');
      expect(result.id).toEqual({ service: 'api', ts: 123 });
    });

    it('should handle CerialId wrapping array', () => {
      const result = transformRecordId('loc', new CerialId([1.5, 2.5]));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('loc');
      expect(result.id).toEqual([1.5, 2.5]);
    });
  });

  describe('RecordId passthrough', () => {
    it('should accept RecordId with typed id', () => {
      const input = new RecordId('user', 42);
      const result = transformRecordId('user', input);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe(42);
    });
  });

  describe('table validation', () => {
    it('should throw for CerialId with mismatched table', () => {
      expect(() => transformRecordId('user', new CerialId('post:abc'))).toThrow('does not match');
    });
  });
});

// ---------------------------------------------------------------------------
// transformOrValidateRecordId — validates table + handles typed IDs
// ---------------------------------------------------------------------------

describe('transformOrValidateRecordId', () => {
  describe('number IDs', () => {
    it('should create RecordId with number id', () => {
      const result = transformOrValidateRecordId('user', 42);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe(42);
    });

    it('should handle zero', () => {
      const result = transformOrValidateRecordId('user', 0);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toBe(0);
    });

    it('should handle negative number', () => {
      const result = transformOrValidateRecordId('user', -1);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toBe(-1);
    });

    it('should handle float', () => {
      const result = transformOrValidateRecordId('metric', 3.14);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toBe(3.14);
    });
  });

  describe('bigint IDs', () => {
    it('should create RecordId with bigint id', () => {
      const result = transformOrValidateRecordId('user', BigInt(999));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toBe(BigInt(999));
    });
  });

  describe('array IDs', () => {
    it('should create RecordId with array id', () => {
      const result = transformOrValidateRecordId('loc', [1.5, 2.5]);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('loc');
      expect(result.id).toEqual([1.5, 2.5]);
    });

    it('should handle string-number array', () => {
      const result = transformOrValidateRecordId('loc', ['London', 42]);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toEqual(['London', 42]);
    });

    it('should handle empty array', () => {
      const result = transformOrValidateRecordId('loc', []);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toEqual([]);
    });
  });

  describe('object IDs', () => {
    it('should create RecordId with object id', () => {
      const result = transformOrValidateRecordId('metric', { service: 'api', ts: 123 });
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('metric');
      expect(result.id).toEqual({ service: 'api', ts: 123 });
    });

    it('should handle empty object', () => {
      const result = transformOrValidateRecordId('metric', {});
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toEqual({});
    });
  });

  describe('Uuid IDs', () => {
    it('should create RecordId with Uuid id', () => {
      const uuid = new Uuid('01938efc-0732-7e62-b534-954060377809');
      const result = transformOrValidateRecordId('user', uuid);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      // Uuid is handled via the object branch
      expect(result.id).toBe(uuid);
    });
  });

  describe('CerialId with typed IDs', () => {
    it('should handle CerialId wrapping number (no table)', () => {
      const result = transformOrValidateRecordId('user', new CerialId(42));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe(42);
    });

    it('should handle CerialId wrapping number (with matching table)', () => {
      const id = new CerialId(42);
      id.table = 'user';
      const result = transformOrValidateRecordId('user', id);
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe(42);
    });

    it('should throw for CerialId wrapping number with wrong table', () => {
      const id = new CerialId(42);
      id.table = 'post';
      expect(() => transformOrValidateRecordId('user', id)).toThrow('does not match');
    });

    it('should handle CerialId wrapping array', () => {
      const result = transformOrValidateRecordId('loc', new CerialId([1.5, 2.5]));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toEqual([1.5, 2.5]);
    });

    it('should handle CerialId wrapping object', () => {
      const result = transformOrValidateRecordId('metric', new CerialId({ service: 'api', ts: 123 }));
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toEqual({ service: 'api', ts: 123 });
    });
  });

  describe('RecordId passthrough with validation', () => {
    it('should pass through RecordId with matching table', () => {
      const input = new RecordId('user', 42);
      const result = transformOrValidateRecordId('user', input);
      expect(result).toBe(input); // Same instance
      expect(result.id).toBe(42);
    });

    it('should throw for RecordId with wrong table', () => {
      const input = new RecordId('post', 42);
      expect(() => transformOrValidateRecordId('user', input)).toThrow('does not match');
    });
  });

  describe('string IDs (backward compat)', () => {
    it('should parse table:id string', () => {
      const result = transformOrValidateRecordId('user', 'user:abc');
      expect(result).toBeInstanceOf(RecordId);
      expect(result.table.name).toBe('user');
      expect(result.id).toBe('abc');
    });

    it('should parse bare string id', () => {
      const result = transformOrValidateRecordId('user', 'abc');
      expect(result).toBeInstanceOf(RecordId);
      expect(result.id).toBe('abc');
    });

    it('should throw for string with wrong table', () => {
      expect(() => transformOrValidateRecordId('user', 'post:abc')).toThrow('does not match');
    });
  });
});

// ---------------------------------------------------------------------------
// transformData — @id field with typed Record
// ---------------------------------------------------------------------------

describe('transformData with @id typed Record', () => {
  it('should transform int @id field', () => {
    const model = createModel(
      [
        createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
        createField({ name: 'name', type: 'string', isRequired: true }),
      ],
      'user',
    );
    const result = transformData({ id: 42, name: 'test' }, model);
    expect(result.id).toBeInstanceOf(RecordId);
    expect((result.id as RecordId).table.name).toBe('user');
    expect((result.id as RecordId).id).toBe(42);
    expect(result.name).toBe('test');
  });

  it('should transform string @id field (backward compat)', () => {
    const model = createModel(
      [
        createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
        createField({ name: 'name', type: 'string', isRequired: true }),
      ],
      'user',
    );
    const result = transformData({ id: 'user:abc', name: 'test' }, model);
    expect(result.id).toBeInstanceOf(RecordId);
    expect((result.id as RecordId).table.name).toBe('user');
    expect((result.id as RecordId).id).toBe('abc');
  });

  it('should transform object @id field', () => {
    const model = createModel([createField({ name: 'id', type: 'record', isId: true, isRequired: true })], 'metric');
    const result = transformData({ id: { service: 'api', ts: 123 } }, model);
    expect(result.id).toBeInstanceOf(RecordId);
    expect((result.id as RecordId).table.name).toBe('metric');
    expect((result.id as RecordId).id).toEqual({ service: 'api', ts: 123 });
  });

  it('should transform array @id field', () => {
    const model = createModel([createField({ name: 'id', type: 'record', isId: true, isRequired: true })], 'loc');
    const result = transformData({ id: ['London', 42] }, model);
    expect(result.id).toBeInstanceOf(RecordId);
    expect((result.id as RecordId).table.name).toBe('loc');
    expect((result.id as RecordId).id).toEqual(['London', 42]);
  });

  it('should transform CerialId wrapping number @id', () => {
    const model = createModel([createField({ name: 'id', type: 'record', isId: true, isRequired: true })], 'user');
    const result = transformData({ id: new CerialId(42) }, model);
    expect(result.id).toBeInstanceOf(RecordId);
    expect((result.id as RecordId).id).toBe(42);
  });

  it('should skip undefined @id', () => {
    const model = createModel([
      createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
      createField({ name: 'name', type: 'string', isRequired: true }),
    ]);
    const result = transformData({ id: undefined, name: 'test' }, model);
    // undefined @id is skipped (not transformed)
    expect(result.id).toBeUndefined();
  });

  it('should skip null @id', () => {
    const model = createModel([
      createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
      createField({ name: 'name', type: 'string', isRequired: true }),
    ]);
    const result = transformData({ id: null, name: 'test' }, model);
    // null @id is skipped (not transformed)
    expect(result.id).toBeNull();
  });

  it('should preserve zero as @id (not falsy-skipped)', () => {
    const model = createModel([createField({ name: 'id', type: 'record', isId: true, isRequired: true })], 'counter');
    const result = transformData({ id: 0 }, model);
    expect(result.id).toBeInstanceOf(RecordId);
    expect((result.id as RecordId).id).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// transformData — FK Record field with paired Relation
// ---------------------------------------------------------------------------

describe('transformData with FK Record field (paired Relation)', () => {
  function createModelWithFK(tableName: string, targetTable: string): ModelMetadata {
    return createModel(
      [
        createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
        createField({ name: 'parentId', type: 'record', isRequired: true, recordIdTypes: ['int'] }),
        createField({
          name: 'parent',
          type: 'relation',
          relationInfo: {
            targetModel: targetTable.charAt(0).toUpperCase() + targetTable.slice(1),
            targetTable,
            fieldRef: 'parentId',
            isReverse: false,
          },
        }),
      ],
      tableName,
    );
  }

  it('should transform int FK via paired Relation', () => {
    const model = createModelWithFK('child', 'parent');
    const result = transformData({ parentId: 42 }, model);
    expect(result.parentId).toBeInstanceOf(RecordId);
    expect((result.parentId as RecordId).table.name).toBe('parent');
    expect((result.parentId as RecordId).id).toBe(42);
  });

  it('should transform string FK via paired Relation (backward compat)', () => {
    const model = createModelWithFK('child', 'parent');
    const result = transformData({ parentId: 'parent:abc' }, model);
    expect(result.parentId).toBeInstanceOf(RecordId);
    expect((result.parentId as RecordId).table.name).toBe('parent');
    expect((result.parentId as RecordId).id).toBe('abc');
  });

  it('should transform CerialId wrapping number FK', () => {
    const model = createModelWithFK('child', 'parent');
    const result = transformData({ parentId: new CerialId(99) }, model);
    expect(result.parentId).toBeInstanceOf(RecordId);
    expect((result.parentId as RecordId).table.name).toBe('parent');
    expect((result.parentId as RecordId).id).toBe(99);
  });

  it('should transform RecordId FK passthrough', () => {
    const model = createModelWithFK('child', 'parent');
    const input = new RecordId('parent', 42);
    const result = transformData({ parentId: input }, model);
    expect(result.parentId).toBeInstanceOf(RecordId);
    expect((result.parentId as RecordId).id).toBe(42);
  });

  it('should throw for FK RecordId with wrong table', () => {
    const model = createModelWithFK('child', 'parent');
    const input = new RecordId('wrong', 42);
    expect(() => transformData({ parentId: input }, model)).toThrow('does not match');
  });

  it('should pass through null FK', () => {
    const model = createModelWithFK('child', 'parent');
    const result = transformData({ parentId: null }, model);
    expect(result.parentId).toBeNull();
  });

  it('should skip undefined FK', () => {
    const model = createModelWithFK('child', 'parent');
    const result = transformData({ parentId: undefined }, model);
    expect(result.parentId).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// transformData — FK Record[] array field with paired Relation
// ---------------------------------------------------------------------------

describe('transformData with FK Record[] array (paired Relation)', () => {
  function createModelWithArrayFK(tableName: string, targetTable: string): ModelMetadata {
    return createModel(
      [
        createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
        createField({ name: 'tagIds', type: 'record', isRequired: true, isArray: true, recordIdTypes: ['int'] }),
        createField({
          name: 'tags',
          type: 'relation',
          isArray: true,
          relationInfo: {
            targetModel: targetTable.charAt(0).toUpperCase() + targetTable.slice(1),
            targetTable,
            fieldRef: 'tagIds',
            isReverse: false,
          },
        }),
      ],
      tableName,
    );
  }

  it('should transform array of int FKs', () => {
    const model = createModelWithArrayFK('post', 'tag');
    const result = transformData({ tagIds: [1, 2, 3] }, model);
    expect(Array.isArray(result.tagIds)).toBe(true);
    const ids = result.tagIds as RecordId[];
    expect(ids).toHaveLength(3);
    expect(ids[0]).toBeInstanceOf(RecordId);
    expect(ids[0]!.table.name).toBe('tag');
    expect(ids[0]!.id).toBe(1);
    expect(ids[1]!.id).toBe(2);
    expect(ids[2]!.id).toBe(3);
  });

  it('should transform push operation with int FK', () => {
    const model = createModelWithArrayFK('post', 'tag');
    const result = transformData({ tagIds: { push: 42 } }, model);
    const ops = result.tagIds as { push: RecordId };
    expect(ops.push).toBeInstanceOf(RecordId);
    expect(ops.push.table.name).toBe('tag');
    expect(ops.push.id).toBe(42);
  });

  it('should transform push operation with int FK array', () => {
    const model = createModelWithArrayFK('post', 'tag');
    const result = transformData({ tagIds: { push: [10, 20] } }, model);
    const ops = result.tagIds as { push: RecordId[] };
    expect(ops.push).toHaveLength(2);
    expect(ops.push[0]).toBeInstanceOf(RecordId);
    expect(ops.push[0]!.id).toBe(10);
    expect(ops.push[1]!.id).toBe(20);
  });

  it('should transform unset operation with int FK', () => {
    const model = createModelWithArrayFK('post', 'tag');
    const result = transformData({ tagIds: { unset: [5, 10] } }, model);
    const ops = result.tagIds as { unset: RecordId[] };
    expect(ops.unset).toHaveLength(2);
    expect(ops.unset[0]).toBeInstanceOf(RecordId);
    expect(ops.unset[0]!.id).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// transformData — standalone Record (no paired Relation)
// ---------------------------------------------------------------------------

describe('transformData with standalone Record (no paired Relation)', () => {
  it('should keep standalone Record value as-is (no target table)', () => {
    const model = createModel([
      createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
      createField({ name: 'ref', type: 'record', isRequired: true, recordIdTypes: ['int'] }),
    ]);
    // No paired Relation field → code falls through to "keep value as-is"
    const result = transformData({ ref: 42 }, model);
    expect(result.ref).toBe(42);
  });

  it('should keep standalone Record string as-is', () => {
    const model = createModel([
      createField({ name: 'id', type: 'record', isId: true, isRequired: true }),
      createField({ name: 'ref', type: 'record', isRequired: true }),
    ]);
    const result = transformData({ ref: 'other:abc' }, model);
    expect(result.ref).toBe('other:abc');
  });
});
