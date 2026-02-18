import { describe, expect, it } from 'bun:test';
import { inferFKTypes } from '../../../src/generators/metadata/fk-type-inference';
import type { FieldMetadata, ModelMetadata, ModelRegistry } from '../../../src/types/metadata.types';

function field(overrides: Partial<FieldMetadata> & { name: string; type: FieldMetadata['type'] }): FieldMetadata {
  return {
    isId: false,
    isUnique: false,
    isIndexed: false,
    isRequired: true,
    timestampDecorator: undefined,
    ...overrides,
  };
}

function model(name: string, tableName: string, fields: FieldMetadata[]): ModelMetadata {
  return { name, tableName, fields };
}

function registry(models: ModelMetadata[]): ModelRegistry {
  const reg: ModelRegistry = {};
  for (const m of models) reg[m.name] = m;

  return reg;
}

function getField(m: ModelMetadata, name: string): FieldMetadata {
  const f = m.fields.find((f) => f.name === name);
  if (!f) throw new Error(`Field "${name}" not found in model "${m.name}"`);

  return f;
}

describe('inferFKTypes', () => {
  it('should infer Record(int) from target @id to FK field', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
      field({ name: 'label', type: 'string' }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toEqual(['int']);
  });

  it('should infer Record(string, int) multi-type from target @id', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['string', 'int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toEqual(['string', 'int']);
  });

  it('should leave FK unchanged when target has plain Record @id (no recordIdTypes)', () => {
    const parent = model('Parent', 'parent', [field({ name: 'id', type: 'record', isId: true, isUnique: true })]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toBeUndefined();
  });

  it('should infer Record(uuid) from target @id', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['uuid'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toEqual(['uuid']);
  });

  it('should NOT affect standalone Record(int) fields without a paired Relation', () => {
    const standalone = model('Standalone', 'standalone', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'someRef', type: 'record', recordIdTypes: ['int'] }),
    ]);
    const models = [standalone];
    inferFKTypes(models, registry(models));
    expect(getField(standalone, 'someRef').recordIdTypes).toEqual(['int']);
  });

  it('should NOT affect @id fields', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'id').recordIdTypes).toBeUndefined();
  });

  it('should infer types for array FK fields (Record[] with Relation[])', () => {
    const tag = model('Tag', 'tag', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['string'] }),
    ]);
    const post = model('Post', 'post', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'tagIds', type: 'record', isArray: true }),
      field({
        name: 'tags',
        type: 'relation',
        isArray: true,
        relationInfo: { targetModel: 'Tag', targetTable: 'tag', isReverse: false, fieldRef: 'tagIds' },
      }),
    ]);
    const models = [tag, post];
    inferFKTypes(models, registry(models));
    expect(getField(post, 'tagIds').recordIdTypes).toEqual(['string']);
  });

  it('should NOT trigger inference from reverse relations (no @field)', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
      field({
        name: 'children',
        type: 'relation',
        isArray: true,
        relationInfo: { targetModel: 'Child', targetTable: 'child', isReverse: true },
      }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toEqual(['int']);
    expect(parent.fields.every((f) => f.name !== 'children' || !f.recordIdTypes)).toBe(true);
  });

  it('should handle self-referential model (FK to self)', () => {
    const node = model('TreeNode', 'tree_node', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
      field({ name: 'parentId', type: 'record', isRequired: false }),
      field({
        name: 'parent',
        type: 'relation',
        isRequired: false,
        relationInfo: { targetModel: 'TreeNode', targetTable: 'tree_node', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [node];
    inferFKTypes(models, registry(models));
    expect(getField(node, 'parentId').recordIdTypes).toEqual(['int']);
  });

  it('should gracefully skip when target model is not found in registry', () => {
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Missing', targetTable: 'missing', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toBeUndefined();
  });

  it('should NOT overwrite FK field that already has its own recordIdTypes', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record', recordIdTypes: ['string'] }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toEqual(['string']);
  });

  it('should infer across multiple models in a single pass', () => {
    const a = model('A', 'a', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const b = model('B', 'b', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['uuid'] }),
    ]);
    const c = model('C', 'c', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'aId', type: 'record' }),
      field({
        name: 'aRel',
        type: 'relation',
        relationInfo: { targetModel: 'A', targetTable: 'a', isReverse: false, fieldRef: 'aId' },
      }),
      field({ name: 'bId', type: 'record' }),
      field({
        name: 'bRel',
        type: 'relation',
        relationInfo: { targetModel: 'B', targetTable: 'b', isReverse: false, fieldRef: 'bId' },
      }),
    ]);
    const models = [a, b, c];
    inferFKTypes(models, registry(models));
    expect(getField(c, 'aId').recordIdTypes).toEqual(['int']);
    expect(getField(c, 'bId').recordIdTypes).toEqual(['uuid']);
  });

  it('should skip when fieldRef points to a non-record field', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentLabel', type: 'string' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentLabel' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentLabel').recordIdTypes).toBeUndefined();
  });

  it('should skip when target model has no @id field', () => {
    const parent = model('Parent', 'parent', [field({ name: 'label', type: 'string' })]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toBeUndefined();
  });

  it('should not copy empty recordIdTypes array', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: [] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));
    expect(getField(child, 'parentId').recordIdTypes).toBeUndefined();
  });

  it('should only infer direct links, not transitive (A→B→C chain)', () => {
    const a = model('A', 'a', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const b = model('B', 'b', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['uuid'] }),
      field({ name: 'aId', type: 'record' }),
      field({
        name: 'aRel',
        type: 'relation',
        relationInfo: { targetModel: 'A', targetTable: 'a', isReverse: false, fieldRef: 'aId' },
      }),
    ]);
    const c = model('C', 'c', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'bId', type: 'record' }),
      field({
        name: 'bRel',
        type: 'relation',
        relationInfo: { targetModel: 'B', targetTable: 'b', isReverse: false, fieldRef: 'bId' },
      }),
    ]);
    const models = [a, b, c];
    inferFKTypes(models, registry(models));

    // B.aId gets A's @id types (direct)
    expect(getField(b, 'aId').recordIdTypes).toEqual(['int']);
    // C.bId gets B's @id types (direct), NOT A's types (transitive)
    expect(getField(c, 'bId').recordIdTypes).toEqual(['uuid']);
  });

  it('should skip when fieldRef points to a nonexistent field name', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'ghostField' },
      }),
    ]);
    const models = [parent, child];

    expect(() => inferFKTypes(models, registry(models))).not.toThrow();
  });

  it('should handle empty models array without crashing', () => {
    expect(() => inferFKTypes([], {})).not.toThrow();
  });

  it('should handle model with no relation fields (no-op)', () => {
    const m = model('Simple', 'simple', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
      field({ name: 'name', type: 'string' }),
    ]);
    const models = [m];
    inferFKTypes(models, registry(models));

    expect(getField(m, 'id').recordIdTypes).toEqual(['int']);
    expect(getField(m, 'name').recordIdTypes).toBeUndefined();
  });

  it('should deep-copy recordIdTypes (not share reference with target)', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));

    // Mutating the copied array should not affect the source
    getField(child, 'parentId').recordIdTypes!.push('string');
    expect(getField(parent, 'id').recordIdTypes).toEqual(['int']);
  });

  it('should skip relation fields that have no relationInfo', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record' }),
      field({ name: 'parent', type: 'relation' }),
    ]);
    const models = [parent, child];

    expect(() => inferFKTypes(models, registry(models))).not.toThrow();
    expect(getField(child, 'parentId').recordIdTypes).toBeUndefined();
  });

  it('should skip when FK field is an @id field (even if paired with a relation)', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['string'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record', isId: true }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));

    expect(getField(child, 'parentId').recordIdTypes).toBeUndefined();
  });

  it('should infer into FK with empty recordIdTypes array (empty = untyped)', () => {
    const parent = model('Parent', 'parent', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true, recordIdTypes: ['int'] }),
    ]);
    const child = model('Child', 'child', [
      field({ name: 'id', type: 'record', isId: true, isUnique: true }),
      field({ name: 'parentId', type: 'record', recordIdTypes: [] }),
      field({
        name: 'parent',
        type: 'relation',
        relationInfo: { targetModel: 'Parent', targetTable: 'parent', isReverse: false, fieldRef: 'parentId' },
      }),
    ]);
    const models = [parent, child];
    inferFKTypes(models, registry(models));

    // Empty array has length 0 → falsy → inference proceeds
    expect(getField(child, 'parentId').recordIdTypes).toEqual(['int']);
  });
});
