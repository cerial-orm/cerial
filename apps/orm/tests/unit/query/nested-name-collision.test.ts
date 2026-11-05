/**
 * Unit Tests: names in nested writes never collide with each other or with bound values
 *
 * Variable names used to be built from relation and field names, so two relations (`tags` with an
 * array create and `tags0` with a single create), or a reverse relation `posts_set` and a field
 * `rev_create_posts`, reached the same name and one value replaced the other. Names now come from a
 * tag and the statement-wide counter. Each case loses a value without that.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import { buildUpdateManyQuery } from '../../../src/query/builders';
import {
  buildCreateWithNestedTransaction,
  buildUpdateWithNestedTransaction,
  type NestedOperation,
} from '../../../src/query/builders/nested-builder';

const { ast } = parse(`
model Owner {
  id Record @id
  title String
  rev_create_posts String?
  title_set String?
  title_eq String?
  tagIds Record[]
  tags Relation[] @field(tagIds) @model(Tag) @key(a)
  tag0Id Record?
  tags0 Relation? @field(tag0Id) @model(Tag) @key(b)
  posts_set Relation[] @model(Post)
  rev_0_0_bodyId Record?
  rev_0_0_body Relation? @field(rev_0_0_bodyId) @model(Tag) @key(c)
}

model Tag {
  id Record @id
  label String
  ownersA Relation[] @model(Owner) @key(a)
  ownersB Relation[] @model(Owner) @key(b)
  ownersC Relation[] @model(Owner) @key(c)
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

const lost = (vars: Record<string, unknown>, markers: string[]): string[] => {
  const held = JSON.stringify(Object.values(vars));

  return markers.filter((m) => !held.includes(m));
};

const letNames = (text: string): string[] => [...text.matchAll(/LET \$([A-Za-z0-9_]+)/g)].map((m) => m[1]!);

describe('forward creates on relations whose names run together', () => {
  const nested = ops({ tags: { create: [{ label: 'ARRAY0' }] }, tags0: { create: { label: 'SINGLE' } } });

  test('update: keeps both created records and gives each its own LET', () => {
    const { text, vars } = buildUpdateWithNestedTransaction(owner, { title: 'W1' }, {}, nested, registry, {});

    expect(lost(vars, ['ARRAY0', 'SINGLE', 'W1'])).toEqual([]);
    const names = letNames(text).filter((n) => n.startsWith('nested_create'));
    expect(new Set(names).size).toBe(2);
  });

  test('create: keeps both created records and gives each its own LET', () => {
    const { text, vars } = buildCreateWithNestedTransaction(owner, { title: 'T' }, nested, registry, {});

    expect(lost(vars, ['ARRAY0', 'SINGLE'])).toEqual([]);
    const names = letNames(text).filter((n) => n.startsWith('nested_create'));
    expect(new Set(names).size).toBe(2);
  });
});

describe('reverse create beside a field named like its variable', () => {
  test('update: the SET value and the reverse create data are both bound', () => {
    const { text, vars } = buildUpdateWithNestedTransaction(
      owner,
      { title: 'W1' },
      { rev_create_posts: 'SETVAL' },
      ops({ posts_set: { create: [{ body: 'REVBODY' }] } }),
      registry,
      {},
    );

    expect(lost(vars, ['SETVAL', 'REVBODY', 'W1'])).toEqual([]);
    expect(text).not.toContain('$rev_create_posts_set_0');
  });
});

describe('reverse create on the create path', () => {
  test('a key value is not shadowed by a LET named after a relation (rev_<i>_<j>_<key> family)', () => {
    const { text, vars } = buildCreateWithNestedTransaction(
      owner,
      { title: 'T' },
      ops({ posts_set: { create: [{ body: 'B0' }] }, rev_0_0_body: { create: { label: 'SINGLE' } } }),
      registry,
      {},
    );

    expect(lost(vars, ['B0', 'SINGLE'])).toEqual([]);
    expect(letNames(text).filter((name) => name in vars)).toEqual([]);
  });

  test('a main value named like a reverse-create key keeps both values', () => {
    const { vars } = buildCreateWithNestedTransaction(
      owner,
      { title: 'T', rev_create_posts: 'MAINSET' },
      ops({ posts_set: { create: [{ body: 'B0' }] }, tags0: { create: { label: 'SINGLE' } } }),
      registry,
      {},
    );

    expect(lost(vars, ['T', 'MAINSET', 'B0', 'SINGLE'])).toEqual([]);
  });
});

describe('SET and WHERE values in one statement', () => {
  // A SET name ends in `_set_<n>`, a WHERE name in a filter operator and `_<n>`; no filter operator is
  // called `set`, so fields like `title_set` and `title_eq` cannot make the two sides meet.
  test('fields named like the other side keep all four values under four names', () => {
    const { text, vars } = buildUpdateManyQuery(
      owner,
      { title: 'W1', title_set: 'W2' },
      { title: 'S1', title_set: 'S2', title_eq: 'S3' },
      undefined,
      undefined,
      registry,
    );

    expect(Object.values(vars).sort()).toEqual(['S1', 'S2', 'S3', 'W1', 'W2']);
    expect(new Set(Object.keys(vars)).size).toBe(5);
    for (const name of Object.keys(vars)) expect(text).toContain(`$${name}`);
  });
});
