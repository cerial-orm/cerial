/**
 * Unit Tests: unknown keys in create/update data are rejected
 *
 * Only keys absent from the model are unknown. Computed, readonly and relation
 * fields are known and keep their existing handling.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import { compileCreate, compileUpdateMany, compileUpdateUnique, compileUpsert } from '../../../src/query/builder';
import { validateCreateData, validateUpdateData } from '../../../src/query/validators/data-validator';

const schema = `
model Author {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  createdAt Date @createdAt
  accessedAt Date @now
  authorId Record
  author Relation @field(authorId) @model(Author)
}
`;

const registry = astToRegistry(parse(schema).ast);
const post = registry.Post!;
const author = registry.Author!;

describe('validateCreateData unknown keys', () => {
  const base = { title: 'T', authorId: 'author:1' };

  test('rejects a typo key and names it', () => {
    const result = validateCreateData({ ...base, titel: 'x' }, post);
    expect(result.valid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.field).toBe('titel');
    expect(result.errors[0]!.message).toContain("'titel'");
    expect(result.errors[0]!.message).toContain('Post');
  });

  test('names every unknown key', () => {
    const result = validateCreateData({ ...base, foo: 1, bar: 2 }, post);
    expect(result.valid).toBe(false);
    expect(result.errors.map((e) => e.field)).toEqual(['foo', 'bar']);
    expect(result.errors[0]!.message).toContain("'foo'");
    expect(result.errors[0]!.message).not.toContain("'bar'");
    expect(result.errors[1]!.message).toContain("'bar'");
    expect(result.errors[1]!.message).not.toContain("'foo'");
  });

  test('accepts a known-but-computed field', () => {
    expect(validateCreateData({ ...base, accessedAt: new Date() }, post).valid).toBe(true);
  });

  test('accepts only known keys', () => {
    expect(validateCreateData({ ...base, createdAt: new Date() }, post).valid).toBe(true);
  });

  test('reports missing required field when data is empty', () => {
    const result = validateCreateData({}, post);
    expect(result.errors.map((e) => e.field)).toEqual(['title', 'authorId']);
  });
});

describe('validateUpdateData unknown keys', () => {
  test('rejects a typo key and names it', () => {
    const result = validateUpdateData({ titel: 'x' }, post);
    expect(result.valid).toBe(false);
    expect(result.errors[0]!.field).toBe('titel');
    expect(result.errors[0]!.message).toContain("'titel'");
  });

  test('names every unknown key', () => {
    const result = validateUpdateData({ foo: 1, bar: 2, title: 'ok' }, post);
    expect(result.errors.map((e) => e.field)).toEqual(['foo', 'bar']);
  });

  test('accepts a known-but-computed field', () => {
    expect(validateUpdateData({ accessedAt: new Date() }, post).valid).toBe(true);
  });

  test('accepts empty data', () => {
    expect(validateUpdateData({}, post).valid).toBe(true);
  });

  test('rejects an unknown key with a null value', () => {
    expect(validateUpdateData({ nope: null }, post).valid).toBe(false);
  });
});

describe('entry points reject unknown data keys', () => {
  const unknownMsg = "Unknown field 'typo'";
  const postData = { title: 'T', authorId: 'author:1' };

  test('compileCreate', () => {
    expect(() => compileCreate(post, { data: { ...postData, typo: 1 } }, registry)).toThrow(unknownMsg);
  });

  test('compileUpdateMany', () => {
    expect(() => compileUpdateMany(post, { where: { title: 'T' }, data: { typo: 1 } }, registry)).toThrow(unknownMsg);
  });

  test('compileUpdateUnique', () => {
    expect(() => compileUpdateUnique(post, { where: { id: 'post:1' }, data: { typo: 1 } }, registry)).toThrow(
      unknownMsg,
    );
  });

  test('compileUpsert create half', () => {
    expect(() =>
      compileUpsert(
        post,
        { where: { id: 'post:1' }, create: { ...postData, typo: 1 }, update: { title: 'U' } },
        registry,
      ),
    ).toThrow(`Invalid create data: ${unknownMsg}`);
  });

  test('compileUpsert update half', () => {
    expect(() =>
      compileUpsert(post, { where: { id: 'post:1' }, create: postData, update: { typo: 1 } }, registry),
    ).toThrow(`Invalid update data: ${unknownMsg}`);
  });

  test('computed field still accepted through compileCreate', () => {
    expect(() => compileCreate(post, { data: { ...postData, accessedAt: new Date() } }, registry)).not.toThrow();
  });

  test('nested create relation operation key still accepted', () => {
    expect(() =>
      compileCreate(post, { data: { title: 'T', author: { create: { name: 'A' } } } }, registry),
    ).not.toThrow();
  });

  test('nested connect relation operation key still accepted', () => {
    expect(() =>
      compileCreate(post, { data: { title: 'T', author: { connect: 'author:1' } } }, registry),
    ).not.toThrow();
  });

  test('nested relation operation on update still accepted', () => {
    expect(() =>
      compileUpdateUnique(author, { where: { id: 'author:1' }, data: { posts: { connect: ['post:1'] } } }, registry),
    ).not.toThrow();
  });

  test('unknown key next to a nested operation is still rejected', () => {
    expect(() =>
      compileCreate(post, { data: { title: 'T', typo: 1, author: { connect: 'author:1' } } }, registry),
    ).toThrow(unknownMsg);
  });
});
