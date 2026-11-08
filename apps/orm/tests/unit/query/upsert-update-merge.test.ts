/**
 * Unit tests: the update half of a non-id upsert is built like updateUnique's
 */

import { describe, expect, test } from 'bun:test';
import { compileUpsert } from '../../../src/query/builder';
import type { ObjectFieldMetadata } from '../../../src/types';
import { field, model } from './helpers';

const addrInfo: ObjectFieldMetadata = {
  objectName: 'Addr',
  fields: [field({ name: 'city', type: 'string' }), field({ name: 'zip', type: 'string' })],
};
const payload = field({ name: 'payload', type: 'int' });
const children = field({
  name: 'children',
  type: 'object',
  isArray: true,
  objectInfo: { objectName: 'Tree', fields: [payload] },
});
const place = model('Place', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'name', type: 'string' }),
  field({ name: 'addr', type: 'object', objectInfo: addrInfo }),
  field({
    name: 'tree',
    type: 'object',
    isRequired: false,
    objectInfo: { objectName: 'Tree', fields: [payload, children] },
  }),
]);
const addr = { city: 'a', zip: 'z' };

const build = (update: Record<string, unknown>) =>
  compileUpsert(place, { where: { name: 'x' }, create: { name: 'x', addr }, update } as never).query;

describe('upsert update half, non-id where', () => {
  test('object field merges per sub-key instead of binding whole', () => {
    const { text, vars } = build({ addr: { city: 'ber' } });

    expect(text).toContain('addr.city = $');
    expect(text.split('ELSE {')[0]).not.toMatch(/SET addr = /);
    expect(Object.values(vars)).toContain('ber');
  });

  test('object-array push is emitted as +=', () => {
    const { text } = build({ tree: { children: { push: { payload: 1 } } } });

    expect(text).toContain('tree.children += $');
  });

  test('the create half still carries the full object and runs only for no match', () => {
    const { text } = build({ addr: { city: 'ber' } });
    const [, createBranch] = text.split('ELSE {');

    expect(createBranch).toContain('addr = IF $this == NONE THEN $');
    expect(createBranch).not.toContain('addr.city');
  });

  test('the update half writes one row through the captured first match', () => {
    const { text } = build({ addr: { city: 'ber' } });

    expect(text).toContain('LIMIT 1');
    expect(text).toMatch(/UPDATE \$\w+ SET addr\.city/);
  });
});
