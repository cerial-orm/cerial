/**
 * Unit Tests: a nested write inside a nested create is refused, naming its path
 *
 * The nested builders emit one level. A create or connect inside the data of a nested create was dropped
 * without an error; every entry point now refuses it before a query is built.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
  extractNestedOperations,
  type NestedOperation,
} from '../../../src/query/builders/nested-builder';
import { buildUpsertWithNestedTransaction } from '../../../src/query/builders/upsert-builder';

const { ast } = parse(`
model Owner {
  id Record @id
  title String
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag)
  posts Relation[] @model(Post)
}

model Tag {
  id Record @id
  label String
  ownerIds Record[]
  owners Relation[] @field(ownerIds) @model(Owner)
}

model Post {
  id Record @id
  body String
  ownerId Record?
  owner Relation? @field(ownerId) @model(Owner)
}
`);
const registry = astToRegistry(ast);
const owner = registry.Owner!;

const ops = (entries: Record<string, unknown>): Map<string, NestedOperation> =>
  new Map(Object.entries(entries)) as Map<string, NestedOperation>;

const deepArray = ops({ posts: { create: [{ body: 'B', owner: { create: { title: 'DEEP' } } }] } });
const deepConnect = ops({ posts: { create: { body: 'B', owner: { connect: 'owner:x' } } } });
const message = (path: string) => `'${path}' holds a relation value`;

describe('deep nested writes are refused', () => {
  test('create: array item, naming posts[0].owner', () => {
    expect(() => buildCreateWithNestedTransaction(owner, { title: 'T' }, deepArray, registry, {})).toThrow(
      message('posts[0].owner'),
    );
  });

  test('create: single create with a nested connect, naming posts.owner', () => {
    expect(() => buildCreateWithNestedTransaction(owner, { title: 'T' }, deepConnect, registry, {})).toThrow(
      message('posts.owner'),
    );
  });

  test('update: reverse array create', () => {
    expect(() => buildUpdateWithNestedTransaction(owner, { title: 'W' }, {}, deepArray, registry, {})).toThrow(
      message('posts[0].owner'),
    );
  });

  test('update: forward array create inside a nested create', () => {
    const forward = ops({ tags: { create: [{ label: 'L', owners: { create: [{ title: 'DEEP' }] } }] } });

    expect(() => buildUpdateWithNestedTransaction(owner, { title: 'W' }, {}, forward, registry, {})).toThrow(
      message('tags[0].owners'),
    );
  });

  test('upsert: both halves', () => {
    const none = new Map<string, NestedOperation>();
    const build = (create: typeof none, update: typeof none) =>
      buildUpsertWithNestedTransaction(
        owner,
        { id: 'owner:a' } as never,
        { title: 'C' },
        { title: 'U' },
        create,
        update,
        {},
        registry,
      );

    expect(() => build(deepArray, none)).toThrow(message('posts[0].owner'));
    expect(() => build(none, deepArray)).toThrow(message('posts[0].owner'));
  });
});

describe('one level of nesting still builds', () => {
  test('create with a nested create and connect', () => {
    const query = buildCreateWithNestedTransaction(
      owner,
      { title: 'T' },
      ops({ posts: { create: [{ body: 'B' }] }, tags: { connect: ['tag:a'] } }),
      registry,
      {},
    );

    expect(query.text).toContain('CREATE ONLY post');
  });

  test('update with a nested create', () => {
    const query = buildUpdateWithNestedTransaction(
      owner,
      { title: 'W' },
      {},
      ops({ tags: { create: [{ label: 'L' }] } }),
      registry,
      {},
    );

    expect(query.text).toContain('CREATE ONLY tag');
  });
});

describe('any relation value inside a nested create is refused', () => {
  const values: Array<[string, unknown]> = [
    ['a plain record id', 'owner:o2'],
    ['{ update }', { update: { title: 'x' } }],
    ['{ connectOrCreate }', { connectOrCreate: {} }],
    ['{ upsert }', { upsert: {} }],
    ['{}', {}],
    ['null', null],
  ];

  test.each(values)('%s', (_label, value) => {
    const nested = ops({ posts: { create: [{ body: 'B', owner: value }] } });

    expect(() => buildCreateWithNestedTransaction(owner, { title: 'T' }, nested, registry, {})).toThrow(
      message('posts[0].owner'),
    );
  });

  test('undefined is not a value and builds', () => {
    const nested = ops({ posts: { create: [{ body: 'B', owner: undefined }] } });

    expect(() => buildCreateWithNestedTransaction(owner, { title: 'T' }, nested, registry, {})).not.toThrow();
  });
});

describe('a top-level relation value must be a nested operation', () => {
  const refuse =
    (data: Record<string, unknown>, model = owner) =>
    () =>
      extractNestedOperations(data, model);

  test('a plain object on a relation', () => {
    expect(refuse({ owner: { title: 'x' } }, registry.Post!)).toThrow("Relation 'owner' on model Post takes");
  });

  test('a plain record id on a relation', () => {
    expect(refuse({ owner: 'owner:a' }, registry.Post!)).toThrow("Relation 'owner'");
  });

  test('{ update } on an array relation names the allowed operations', () => {
    expect(refuse({ posts: { update: {} } })).toThrow('create, connect, disconnect, set');
  });

  test('an unknown key beside a valid operation', () => {
    expect(refuse({ posts: { create: [], update: {} } })).toThrow("Relation 'posts'");
  });

  test('set is not an operation of a single relation', () => {
    expect(refuse({ owner: { set: ['owner:a'] } }, registry.Post!)).toThrow('create, connect, disconnect');
  });

  test('valid operations still extract', () => {
    const { nestedOps } = extractNestedOperations(
      { title: 'T', posts: { create: [{ body: 'B' }] }, tags: { set: ['tag:a'] } },
      owner,
    );

    expect([...nestedOps.keys()]).toEqual(['posts', 'tags']);
  });
});
