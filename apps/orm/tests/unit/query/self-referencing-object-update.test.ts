/**
 * Unit Tests: updating a self-referencing object
 *
 * The registry lists a self-referencing object's fields one level deep and an empty list below, so the
 * array sub-key `children` must be written whole, not merged key by key into an empty field list.
 */

import { describe, expect, test } from 'bun:test';
import { buildUpdateManyQuery } from '../../../src/query/builders/update-builder';
import type { FieldMetadata, ModelMetadata } from '../../../src/types';
import { field } from './helpers';

const emptyCopy = { objectName: 'TreeNode', fields: [] as FieldMetadata[] };
const treeFields: FieldMetadata[] = [
  field({ name: 'payload', type: 'int', isRequired: true }),
  field({ name: 'children', type: 'object', isRequired: true, isArray: true, objectInfo: emptyCopy }),
];
const treeInfo = { objectName: 'TreeNode', fields: treeFields };
const model: ModelMetadata = {
  name: 'Order',
  tableName: 'order',
  fields: [
    field({ name: 'id', type: 'record', isId: true, isRequired: true }),
    field({ name: 'metadata', type: 'object', isRequired: false, objectInfo: treeInfo }),
  ],
};
const node = { payload: 2, children: [{ payload: 3, children: [] }] };

describe('Self-referencing object update', () => {
  test('writes a replaced children array whole', () => {
    const result = buildUpdateManyQuery(model, {}, { metadata: { payload: 1, children: [node] } });

    expect(result.text).toContain('metadata.payload =');
    expect(result.text).toContain('metadata.children =');
    expect(Object.values(result.vars)).toContainEqual([node]);
  });

  test('writes a pushed child with +=', () => {
    const result = buildUpdateManyQuery(model, {}, { metadata: { children: { push: node } } });

    expect(result.text).toContain('metadata.children +=');
    expect(Object.values(result.vars)).toContainEqual(node);
  });

  test('writes a set wrapper on children whole', () => {
    const result = buildUpdateManyQuery(model, {}, { metadata: { children: { set: [node] } } });

    expect(result.text).toContain('metadata.children =');
    expect(Object.values(result.vars)).toContainEqual([node]);
  });
});
