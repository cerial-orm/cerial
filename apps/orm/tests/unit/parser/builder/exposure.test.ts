import { describe, expect, test } from 'bun:test';
import { chainEntries, createChain } from '../../../../src/parser/builder';

describe('builder exposure', () => {
  test('a chain target exposes the decorators whose targets include it', () => {
    expect('createdAt' in createChain('tupleElement')).toBe(true);
    expect('nullable' in createChain('tupleElement')).toBe(true);
    expect('id' in createChain('modelField')).toBe(true);
  });

  test('a target excluded from an entry has no method for it', () => {
    const tuple = createChain('tupleElement');
    const object = createChain('objectField');

    for (const name of ['id', 'uuid', 'uuid4', 'uuid7', 'unique', 'index', 'sort', 'readonly', 'point']) {
      expect(name in tuple).toBe(false);
    }
    expect('id' in object).toBe(false);
    expect('onDelete' in object).toBe(false);
    expect('uuid' in object).toBe(true);
  });

  test('nameAndFields entries have no chain method on any target', () => {
    for (const target of ['modelField', 'objectField', 'tupleElement', 'model'] as const) {
      expect(chainEntries(target, 'relation').some((e) => e.args.kind === 'nameAndFields')).toBe(false);
    }
    expect(chainEntries('model')).toEqual([]);
  });

  test('@model has no public method, on a plain or a relation builder', () => {
    expect('model' in createChain('modelField')).toBe(false);
    expect('model' in createChain('modelField', { kind: 'relation' })).toBe(false);
  });

  test('@field exists only on a relation builder', () => {
    expect('field' in createChain('modelField')).toBe(false);
    expect(typeof createChain('modelField', { kind: 'relation' }).field).toBe('function');
  });

  test('type level: the same exposure holds in the chain type', () => {
    const plain = createChain('modelField');
    const relation = createChain('modelField', { kind: 'relation' });
    const tuple = createChain('tupleElement');

    // @ts-expect-error -- @model has no public method
    void plain.model;
    // @ts-expect-error -- @field is only on a relation builder
    void plain.field;
    // @ts-expect-error -- @id is not legal on a tuple element
    void tuple.id;

    expect(typeof relation.field).toBe('function');
    expect(typeof tuple.nullable).toBe('function');
  });
});
