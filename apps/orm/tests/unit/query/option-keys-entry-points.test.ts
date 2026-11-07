/**
 * Unit tests: the exported compile functions and the QueryBuilder methods refuse an option key the method
 * does not take, as the model methods do, and an include refuses a key it does not take.
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import {
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileFindMany,
  compileFindOne,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  compileUpsert,
  QueryBuilder,
  QueryBuilderStatic,
} from '../../../src/query/builder';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
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
}
`);
const author = registry.Author!;
const hostile = (value: unknown): never => value as never;
const where = { id: 'a' };

const compiles: [string, (options: object) => unknown, object][] = [
  ['compileFindOne', (o) => compileFindOne(author, hostile(o), registry), { where }],
  ['compileFindUnique', (o) => compileFindUnique(author, hostile(o), registry), { where }],
  ['compileFindMany', (o) => compileFindMany(author, hostile(o), registry), { where }],
  ['compileCreate', (o) => compileCreate(author, hostile(o), registry), { data: { name: 'n' } }],
  ['compileUpdateMany', (o) => compileUpdateMany(author, hostile(o), registry), { where, data: { name: 'n' } }],
  ['compileUpdateUnique', (o) => compileUpdateUnique(author, hostile(o), registry), { where, data: { name: 'n' } }],
  ['compileDeleteMany', (o) => compileDeleteMany(author, hostile(o), registry), { where }],
  ['compileDeleteUnique', (o) => compileDeleteUnique(author, hostile(o), registry), { where }],
  ['compileUpsert', (o) => compileUpsert(author, hostile(o), registry), { where, create: { name: 'n' } }],
];

describe('compile functions refuse an unknown option key', () => {
  test.each(compiles)('%s', (_name, run, valid) => {
    expect(() => run(valid)).not.toThrow();
    expect(() => run({ ...valid, wehre: { name: 'x' } })).toThrow(/does not take the option 'wehre'/);
    // The typo replacing the real key is the dangerous case: the call would run with no filter at all
    expect(() =>
      run({ ...Object.fromEntries(Object.entries(valid).filter(([k]) => k !== 'where')), wehre: {} }),
    ).toThrow(/does not take the option 'wehre'/);
  });
});

describe('QueryBuilder and QueryBuilderStatic refuse an unknown option key before any query', () => {
  const db = {
    query: () => {
      throw new Error('a query ran');
    },
  } as unknown as Surreal;
  const builder = new QueryBuilder<Record<string, unknown>>(db, author, registry);

  test.each([
    ['findOne', () => builder.findOne(hostile({ wehre: {} }))],
    ['findUnique', () => builder.findUnique(hostile({ where, wehre: {} }))],
    ['findMany', () => builder.findMany(hostile({ wehre: {} }))],
    ['create', () => builder.create(hostile({ data: { name: 'n' }, wehre: {} }))],
    ['updateMany', () => builder.updateMany(hostile({ data: { name: 'n' }, wehre: {} }))],
    ['updateUnique', () => builder.updateUnique(hostile({ where, data: { name: 'n' }, wehre: {} }))],
    ['deleteMany', () => builder.deleteMany(hostile({ wehre: {} }))],
    ['deleteUnique', () => builder.deleteUnique(hostile({ where, wehre: {} }))],
    ['upsert', () => builder.upsert(hostile({ where, create: { name: 'n' }, wehre: {} }))],
    ['static deleteMany', () => QueryBuilderStatic.deleteMany(db, author, hostile({ wehre: {} }), registry)],
    ['static findMany', () => QueryBuilderStatic.findMany(db, author, hostile({ wehre: {} }), registry)],
    ['static updateMany', () => QueryBuilderStatic.updateMany(db, author, hostile({ data: {}, whre: {} }), registry)],
  ])('%s', async (_name, run) => {
    await expect(run()).rejects.toThrow(/does not take the option '(wehre|whre)'/);
  });
});

describe('include options refuse an unknown key', () => {
  test.each([
    ['wehre', { wehre: { title: 'x' } }],
    ['limt', { limt: 1 }],
    ['compute', { compute: {} }],
  ])('a forward or reverse include with %s', (key, options) => {
    expect(() => compileFindMany(author, { include: { posts: hostile(options) } }, registry)).toThrow(
      new RegExp(`'${key}' is not an option of include 'posts'`),
    );
    expect(() => compileFindMany(registry.Post!, { include: { author: hostile(options) } }, registry)).toThrow(
      new RegExp(`'${key}' is not an option of include 'author'`),
    );
  });

  test('a nested include with a typo is refused too', () => {
    expect(() =>
      compileFindMany(author, { include: { posts: { include: { author: hostile({ wehre: {} }) } } } }, registry),
    ).toThrow(/'wehre' is not an option of include 'author'/);
  });

  test('every key an include takes is still accepted', () => {
    expect(() =>
      compileFindMany(
        author,
        {
          include: {
            posts: {
              select: { title: true },
              where: { title: 'x' },
              orderBy: { title: 'asc' },
              limit: 1,
              offset: 0,
              include: { author: true },
            },
          },
        },
        registry,
      ),
    ).not.toThrow();
  });
});
