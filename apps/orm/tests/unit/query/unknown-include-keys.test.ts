/**
 * Unit Tests: unresolvable include keys are rejected
 *
 * A typo or a non-relation field in `include` must throw instead of silently
 * dropping the relation. Falsy values stay a legitimate opt-out.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import { compileFindMany, compileFindOne, compileFindUnique } from '../../../src/query/builder';
import { combineSelectWithIncludes, type IncludeClause } from '../../../src/query/builders/relation-builder';

const schema = `
model Author {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Author)
  comments Relation[] @model(Comment)
}

model Comment {
  id Record @id
  body String
  postId Record
  post Relation @field(postId) @model(Post)
}
`;

const registry = astToRegistry(parse(schema).ast);
const author = registry.Author!;
const post = registry.Post!;

const bad = (include: Record<string, unknown>): IncludeClause => include as IncludeClause;

describe('unknown include keys', () => {
  test('a key that names nothing throws, naming key and model', () => {
    expect(() => compileFindMany(author, { include: bad({ psots: true }) }, registry)).toThrow(
      "Invalid include: Unknown field 'psots' on model Author — check the field name against the schema",
    );
  });

  test('a key naming a scalar field throws the wrong-kind message', () => {
    expect(() => compileFindMany(author, { include: bad({ name: true }) }, registry)).toThrow(
      "Invalid include: 'name' on model Author is a string field, not a relation — only relation fields can be included",
    );
  });

  test('a key naming a record field throws the wrong-kind message', () => {
    expect(() => compileFindMany(post, { include: bad({ authorId: true }) }, registry)).toThrow(
      "'authorId' on model Post is a record field, not a relation",
    );
  });

  test('throws on findOne and findUnique too', () => {
    expect(() => compileFindOne(author, { include: bad({ psots: true }) }, registry)).toThrow(/Unknown field 'psots'/);
    expect(() =>
      compileFindUnique(author, { where: { id: 'author:1' }, include: bad({ psots: true }) }, registry),
    ).toThrow(/Unknown field 'psots'/);
  });

  test('a bad key alongside a valid one still throws', () => {
    expect(() => compileFindMany(author, { include: bad({ posts: true, psots: true }) }, registry)).toThrow(
      /Unknown field 'psots'/,
    );
  });

  test('a bad key throws even with a falsy value', () => {
    expect(() => compileFindMany(author, { include: bad({ psots: false }) }, registry)).toThrow(
      /Unknown field 'psots'/,
    );
    expect(() => compileFindMany(author, { include: bad({ psots: undefined }) }, registry)).toThrow(
      /Unknown field 'psots'/,
    );
  });

  test('false and undefined values opt out silently', () => {
    const { query } = compileFindMany(author, { include: bad({ posts: false }) }, registry);
    expect(query.text).not.toContain('AS posts');
    const undef = compileFindMany(author, { include: bad({ posts: undefined }) }, registry);
    expect(undef.query.text).not.toContain('AS posts');
  });
});

describe('nested include keys', () => {
  test('a bad key one level deep throws and names the nested model', () => {
    expect(() =>
      compileFindMany(author, { include: bad({ posts: { include: { cmments: true } } }) }, registry),
    ).toThrow("Unknown field 'cmments' on model Post");
  });

  test('a non-relation key two levels deep throws the wrong-kind message', () => {
    expect(() =>
      compileFindMany(
        author,
        { include: bad({ posts: { include: { comments: { include: { body: true } } } } }) },
        registry,
      ),
    ).toThrow("'body' on model Comment is a string field, not a relation");
  });

  test('a bad nested key under a forward relation throws', () => {
    expect(() => compileFindMany(post, { include: bad({ author: { include: { psots: true } } }) }, registry)).toThrow(
      "Unknown field 'psots' on model Author",
    );
  });
});

describe('valid includes still work', () => {
  test('single-level reverse include', () => {
    const { query } = compileFindMany(author, { include: { posts: true } }, registry);
    expect(query.text).toContain('AS posts');
  });

  test('single-level forward include', () => {
    const { query } = compileFindMany(post, { include: { author: true } }, registry);
    expect(query.text).toContain('AS author');
  });

  test('nested include', () => {
    const { query } = compileFindMany(author, { include: { posts: { include: { comments: true } } } }, registry);
    expect(query.text).toContain('AS comments');
    expect(query.text).toContain('AS posts');
  });
});

describe('registry missing', () => {
  test('throws when includes are requested', () => {
    expect(() => combineSelectWithIncludes('*', { posts: true }, author)).toThrow(
      'Invalid include: a model registry is required to resolve includes',
    );
  });

  test('returns the base select when include is absent', () => {
    expect(combineSelectWithIncludes('*', undefined, author)).toBe('*');
  });

  test('returns the base select when every include is opted out', () => {
    expect(combineSelectWithIncludes('*', { posts: false }, author)).toBe('*');
  });
});
