/**
 * Unit Tests: a self-referencing object refuses an undeclared key at every depth
 *
 * The registry lists the fields of a self-referencing object one level deep and an empty list below
 * that, so the validator resolves the empty copies from the object that encloses them.
 */

import { describe, expect, test } from 'bun:test';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';

const base = { isId: false, isUnique: false, isIndexed: false, timestampDecorator: undefined, isRequired: true };
const payload: FieldMetadata = { ...base, name: 'payload', type: 'int' };
const children = (fields: FieldMetadata[]): FieldMetadata => ({
  ...base,
  name: 'children',
  type: 'object',
  isArray: true,
  objectInfo: { objectName: 'TreeNode', fields },
});
// payload + children, then payload + children with an empty list: the shape the generator emits
const truncated = children([payload, children([])]);
const treeField = (name: string, isFlexible?: boolean): FieldMetadata => ({
  ...base,
  name,
  type: 'object',
  isFlexible,
  objectInfo: { objectName: 'TreeNode', fields: [payload, children([payload, children([])])] },
});

const model: ModelMetadata = {
  name: 'Doc',
  tableName: 'doc',
  fields: [
    { ...base, name: 'title', type: 'string' },
    treeField('tree'),
    { ...treeField('loose', true), isRequired: false },
  ],
};

const node = (extra: Record<string, unknown> = {}, kids: unknown[] = []) => ({ payload: 1, children: kids, ...extra });
const deep = (leaf: Record<string, unknown>) => node({}, [node({}, [node({}, [leaf])])]);
const create = (data: Record<string, unknown>) =>
  validateCreateData({ title: 't', tree: node(), ...data }, model).errors.map((e) => e.field);
const update = (data: Record<string, unknown>) => validateUpdateData(data, model).errors.map((e) => e.field);

describe('self-referencing object — undeclared keys', () => {
  test('the truncated copy is what the registry gives', () => {
    expect(truncated.objectInfo!.fields).toHaveLength(2);
  });

  test.each([
    ['depth 1', node({ extra: 1 }), 'tree.extra'],
    ['depth 2', node({}, [node({ extra: 1 })]), 'tree.children[0].extra'],
    ['depth 3', node({}, [node({}, [node({ extra: 1 })])]), 'tree.children[0].children[0].extra'],
    ['depth 4', deep({ payload: 1, children: [], extra: 1 }), 'tree.children[0].children[0].children[0].extra'],
  ])('create refuses an undeclared key at %s', (_label, tree, field) => {
    expect(create({ tree })).toEqual([field]);
  });

  test.each([
    ['depth 1', node({ extra: 1 }), 'tree.extra'],
    ['depth 2', node({}, [node({ extra: 1 })]), 'tree.children[0].extra'],
    ['depth 3', node({}, [node({}, [node({ extra: 1 })])]), 'tree.children[0].children[0].extra'],
  ])('update refuses an undeclared key at %s', (_label, tree, field) => {
    expect(update({ tree })).toEqual([field]);
  });

  test('update refuses an undeclared key in a merged object and in a { push } element', () => {
    expect(update({ tree: { extra: 1 } })).toEqual(['tree.extra']);
    expect(update({ tree: { children: { push: node({}, [node({ extra: 1 })]) } } })).toEqual([
      'tree.children.push[0].children[0].extra',
    ]);
  });

  test('declared keys pass at every depth', () => {
    expect(create({ tree: deep({ payload: 2, children: [] }) })).toEqual([]);
    expect(update({ tree: deep({ payload: 2, children: [] }) })).toEqual([]);
    expect(update({ tree: { children: { push: node({}, [node({}, [node()])]) } } })).toEqual([]);
  });

  test('a declared key of the wrong type is still refused deep down', () => {
    expect(create({ tree: node({}, [node({}, [node({ payload: 'x' })])]) })).toEqual([
      'tree.children[0].children[0].payload',
    ]);
  });

  test('a flexible field keeps accepting undeclared keys at every depth', () => {
    const loose = deep({ payload: 1, children: [], extra: 1 });

    expect(create({ loose: { ...loose, extra: 1 } })).toEqual([]);
    expect(update({ loose })).toEqual([]);
  });
});
