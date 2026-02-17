import { describe, expect, test } from 'bun:test';
import { RecordId, StringRecordId, Uuid } from 'surrealdb';
import {
  buildConditions,
  buildDirectCondition,
  buildFieldCondition,
  isOperatorObject,
} from '../../../src/query/filters/condition-builder';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { CerialId } from '../../../src/utils/cerial-id';
import { CerialUuid } from '../../../src/utils/cerial-uuid';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';

function makeField(overrides: Partial<FieldMetadata>): FieldMetadata {
  return {
    name: 'test',
    type: 'string',
    isId: false,
    isUnique: false,
    isRequired: true,
    ...overrides,
  };
}

function makeModel(overrides: Partial<ModelMetadata> = {}): ModelMetadata {
  return {
    name: 'TestModel',
    tableName: 'test_model',
    fields: [],
    ...overrides,
  };
}

describe('Typed ID Condition Builder', () => {
  describe('isOperatorObject distinguishes typed IDs from operators', () => {
    test('{ eq: 42 } is an operator object', () => {
      expect(isOperatorObject({ eq: 42 })).toBe(true);
    });

    test('{ gt: 5, lt: 10 } is an operator object', () => {
      expect(isOperatorObject({ gt: 5, lt: 10 })).toBe(true);
    });

    test('{ service: "api", ts: 123 } is NOT an operator object', () => {
      expect(isOperatorObject({ service: 'api', ts: 123 })).toBe(false);
    });

    test('number 42 is NOT an operator object', () => {
      expect(isOperatorObject(42)).toBe(false);
    });

    test('bigint is NOT an operator object', () => {
      expect(isOperatorObject(BigInt(999))).toBe(false);
    });

    test('null is NOT an operator object', () => {
      expect(isOperatorObject(null)).toBe(false);
    });

    test('CerialId is NOT an operator object', () => {
      expect(isOperatorObject(new CerialId('user:1'))).toBe(false);
    });

    test('RecordId is NOT an operator object', () => {
      expect(isOperatorObject(new RecordId('user', 42))).toBe(false);
    });

    test('array [1, 2, 3] is NOT an operator object', () => {
      expect(isOperatorObject([1, 2, 3])).toBe(false);
    });

    test('Uuid is NOT an operator object', () => {
      expect(isOperatorObject(new Uuid('550e8400-e29b-41d4-a716-446655440000'))).toBe(false);
    });

    test('empty object {} is NOT an operator object', () => {
      expect(isOperatorObject({})).toBe(false);
    });
  });

  describe('buildDirectCondition transforms typed @id values to RecordId', () => {
    test('number 42 on @id field produces RecordId with .id === 42', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'sensor', fields: [idField] });
      const result = buildDirectCondition(ctx, 'id', 42, idField, m);

      expect(result.text).toContain('id =');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(42);
      expect((bound as RecordId).table.name).toBe('sensor');
    });

    test('bigint on @id field produces RecordId with bigint id', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'counter', fields: [idField] });
      const result = buildDirectCondition(ctx, 'id', BigInt(9999), idField, m);

      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(BigInt(9999));
      expect((bound as RecordId).table.name).toBe('counter');
    });

    test('Uuid on @id field produces RecordId with Uuid id', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'session', fields: [idField] });
      const uuid = new Uuid('550e8400-e29b-41d4-a716-446655440000');
      const result = buildDirectCondition(ctx, 'id', uuid, idField, m);

      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).table.name).toBe('session');
    });

    test('string on @id field still works (backward compat)', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'user', fields: [idField] });
      const result = buildDirectCondition(ctx, 'id', 'user:abc', idField, m);

      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).table.name).toBe('user');
    });

    test('CerialId on @id field still works (backward compat)', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'user', fields: [idField] });
      const cid = new CerialId('user:abc');
      const result = buildDirectCondition(ctx, 'id', cid, idField, m);

      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
    });
  });

  describe('buildFieldCondition transforms typed values inside operators', () => {
    test('{ eq: 42 } on @id field transforms value to RecordId', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'sensor', fields: [idField] });
      const result = buildFieldCondition(ctx, 'id', { eq: 42 }, idField, m);

      expect(result.text).toContain('id =');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(42);
    });

    test('{ in: [1, 2, 3] } on @id field transforms array elements to RecordIds', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'sensor', fields: [idField] });
      const result = buildFieldCondition(ctx, 'id', { in: [1, 2, 3] }, idField, m);

      expect(result.text).toContain('id IN');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName] as RecordId[];
      expect(Array.isArray(bound)).toBe(true);
      expect(bound.length).toBe(3);
      expect(bound[0]).toBeInstanceOf(RecordId);
      expect((bound[0] as RecordId).id).toBe(1);
      expect((bound[0] as RecordId).table.name).toBe('sensor');
      expect((bound[1] as RecordId).id).toBe(2);
      expect((bound[2] as RecordId).id).toBe(3);
    });
  });

  describe('FK Record field with typed values', () => {
    test('number value on FK Record field produces RecordId with target table', () => {
      const ctx = createCompileContext();
      const fkField = makeField({ name: 'authorId', type: 'record', isId: false });
      const relField = makeField({
        name: 'author',
        type: 'relation',
        relationInfo: { targetModel: 'Author', targetTable: 'author', fieldRef: 'authorId', isReverse: false },
      });
      const m = makeModel({ tableName: 'post', fields: [fkField, relField] });
      const result = buildDirectCondition(ctx, 'authorId', 42, fkField, m);

      expect(result.text).toContain('authorId =');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(42);
      expect((bound as RecordId).table.name).toBe('author');
    });

    test('bigint value on FK Record field produces RecordId', () => {
      const ctx = createCompileContext();
      const fkField = makeField({ name: 'parentId', type: 'record', isId: false });
      const relField = makeField({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Category', targetTable: 'category', fieldRef: 'parentId', isReverse: false },
      });
      const m = makeModel({ tableName: 'category', fields: [fkField, relField] });
      const result = buildDirectCondition(ctx, 'parentId', BigInt(55), fkField, m);

      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(BigInt(55));
      expect((bound as RecordId).table.name).toBe('category');
    });

    test('{ in: [10, 20] } on FK Record field transforms array elements to RecordIds', () => {
      const ctx = createCompileContext();
      const fkField = makeField({ name: 'authorId', type: 'record', isId: false });
      const relField = makeField({
        name: 'author',
        type: 'relation',
        relationInfo: { targetModel: 'Author', targetTable: 'author', fieldRef: 'authorId', isReverse: false },
      });
      const m = makeModel({ tableName: 'post', fields: [fkField, relField] });
      const result = buildFieldCondition(ctx, 'authorId', { in: [10, 20] }, fkField, m);

      expect(result.text).toContain('IN');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName] as RecordId[];
      expect(Array.isArray(bound)).toBe(true);
      expect(bound.length).toBe(2);
      expect(bound[0]).toBeInstanceOf(RecordId);
      expect((bound[0] as RecordId).id).toBe(10);
      expect((bound[0] as RecordId).table.name).toBe('author');
      expect(bound[1]).toBeInstanceOf(RecordId);
      expect((bound[1] as RecordId).id).toBe(20);
    });
  });

  describe('buildConditions integration', () => {
    test('WHERE { id: 42 } on Record(int) model transforms to RecordId', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true, recordIdTypes: ['int'] });
      const m = makeModel({ tableName: 'device', fields: [idField] });
      const result = buildConditions(ctx, { id: 42 }, m);

      expect(result.text).toContain('id =');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(42);
      expect((bound as RecordId).table.name).toBe('device');
    });

    test('WHERE { id: { eq: 42 } } operator form also transforms', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true, recordIdTypes: ['int'] });
      const m = makeModel({ tableName: 'device', fields: [idField] });
      const result = buildConditions(ctx, { id: { eq: 42 } }, m);

      expect(result.text).toContain('id =');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(42);
    });

    test('WHERE { id: "device:abc" } string form still works', () => {
      const ctx = createCompileContext();
      const idField = makeField({ name: 'id', type: 'record', isId: true });
      const m = makeModel({ tableName: 'device', fields: [idField] });
      const result = buildConditions(ctx, { id: 'device:abc' }, m);

      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
    });

    test('WHERE with FK Record field and typed value', () => {
      const ctx = createCompileContext();
      const fkField = makeField({ name: 'authorId', type: 'record', isId: false });
      const relField = makeField({
        name: 'author',
        type: 'relation',
        relationInfo: { targetModel: 'Author', targetTable: 'author', fieldRef: 'authorId', isReverse: false },
      });
      const m = makeModel({ tableName: 'post', fields: [fkField, relField] });
      const result = buildConditions(ctx, { authorId: 42 }, m);

      expect(result.text).toContain('authorId =');
      const varName = Object.keys(result.vars)[0]!;
      const bound = result.vars[varName];
      expect(bound).toBeInstanceOf(RecordId);
      expect((bound as RecordId).id).toBe(42);
      expect((bound as RecordId).table.name).toBe('author');
    });

    test('non-typed value on non-record field passes through unchanged', () => {
      const ctx = createCompileContext();
      const nameField = makeField({ name: 'name', type: 'string' });
      const m = makeModel({ fields: [nameField] });
      const result = buildConditions(ctx, { name: 'Alice' }, m);

      const varName = Object.keys(result.vars)[0]!;
      expect(result.vars[varName]).toBe('Alice');
    });
  });
});
