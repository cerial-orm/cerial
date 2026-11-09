/**
 * Unit Tests: one value in `connect` or `create` on an array relation is a list of one
 *
 * A single id or object must compile to the statements of the one-element list, in create and in update, with
 * the other side of an N:N pair synced. A single value of another kind is refused naming the field.
 */

import { describe, expect, test } from 'bun:test';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
  extractNestedOperations,
  type NestedOperation,
} from '../../../src/query/builders/nested-builder';
import { registryFor } from './helpers';

const registry = registryFor(`
model User {
  id Record @id
  name String
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
  labelIds Record[]
  labels Relation[] @field(labelIds) @model(Label)
}

model Tag {
  id Record @id
  name String
  userIds Record[]
  users Relation[] @field(userIds) @model(User)
}

model Label {
  id Record @id
  name String
}
`);
const user = registry.User!;

const ops = (field: string, op: unknown): Map<string, NestedOperation> => new Map([[field, op as NestedOperation]]);
const create = (field: string, op: unknown) =>
  buildCreateWithNestedTransaction(user, { name: 'u' }, ops(field, op), registry);
const update = (field: string, op: unknown) =>
  buildUpdateWithNestedTransaction(user, { name: 'u' }, {}, ops(field, op), registry);

describe('create', () => {
  test('one id in connect compiles as the list of one, N:N sync included', () => {
    const single = create('tags', { connect: 'tag:t1' });
    const list = create('tags', { connect: ['tag:t1'] });

    expect(single.text).toBe(list.text);
    expect(single.vars).toEqual(list.vars);
    expect(single.text).toContain('userIds');
  });

  test('one object in create compiles as the list of one, N:N sync included', () => {
    const single = create('tags', { create: { name: 'n' } });
    const list = create('tags', { create: [{ name: 'n' }] });

    expect(single.text).toBe(list.text);
    expect(single.text).toContain('CREATE ONLY tag');
    expect(single.text).toMatch(/UPDATE \$nested_create_\w+\.id SET userIds \+= /);
  });

  test('one id and one object together on a one-way array relation', () => {
    const query = create('labels', { connect: 'label:l1', create: { name: 'n' } });

    expect(query.text).toContain('CREATE ONLY label');
    expect(query.text).toContain('array::concat(');
  });
});

describe('update', () => {
  test('one object in create syncs the other side as the list of one does', () => {
    const single = update('tags', { create: { name: 'n' } });
    const list = update('tags', { create: [{ name: 'n' }] });
    const sync = /UPDATE \$nested_create_\w+\.id SET userIds \+= \$result\[0\]\.id/;

    expect(list.text).toMatch(sync);
    expect(single.text).toMatch(/UPDATE \$nested_create_\w+\.id SET userIds \+= \$result\[0\]\.id/);
  });
});

describe('an invalid single value is refused naming the field', () => {
  test.each([
    ['connect', { connect: true }, /tags connect must be a record id or an array of record ids/],
    ['connect', { connect: { a: 1 } }, /tags connect must be a record id or an array of record ids/],
    ['create', { create: 'x' }, /tags create must be an object or an array of objects/],
    ['create', { create: 5 }, /tags create must be an object or an array of objects/],
  ])('%s %j', (_verb, op, message) => {
    expect(() => extractNestedOperations({ tags: op }, user)).toThrow(message);
  });

  test('a valid single value passes', () => {
    expect(() => extractNestedOperations({ tags: { connect: 'tag:t1' } }, user)).not.toThrow();
    expect(() => extractNestedOperations({ tags: { create: { name: 'n' } } }, user)).not.toThrow();
  });
});
