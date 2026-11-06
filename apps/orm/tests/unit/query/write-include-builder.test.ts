/**
 * Unit Tests: `include` on the create and updateMany builders
 *
 * The RETURN clause of a plain CREATE or UPDATE carries the same relation subqueries findMany projects,
 * and an include the model cannot honour is rejected while the statement is built.
 */

import { describe, expect, test } from 'bun:test';
import { astToRegistry } from '../../../src/parser/model-metadata';
import { parse } from '../../../src/parser/parser';
import { buildCreateQuery } from '../../../src/query/builders/insert-builder';
import { buildUpdateManyQuery } from '../../../src/query/builders/update-builder';

const { ast } = parse(`
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
const registry = astToRegistry(ast);
const author = registry.Author!;

describe('create builder include', () => {
  test('adds the relation subquery to RETURN', () => {
    const { text } = buildCreateQuery(author, { name: 'a' }, undefined, { posts: true }, registry);

    expect(text).toStartWith('CREATE ONLY author CONTENT');
    expect(text).toMatch(/RETURN .*\(SELECT .* FROM post .*\) AS posts/);
  });

  test('without include the RETURN has no subquery', () => {
    const { text } = buildCreateQuery(author, { name: 'a' }, undefined, undefined, registry);

    expect(text).not.toContain('SELECT');
  });

  test('keeps select alongside include', () => {
    const { text } = buildCreateQuery(author, { name: 'a' }, { name: true }, { posts: true }, registry);

    expect(text).toContain('name');
    expect(text).not.toMatch(/RETURN \*/);
    expect(text).toContain('AS posts');
  });

  test('rejects an unknown relation', () => {
    expect(() => buildCreateQuery(author, { name: 'a' }, undefined, { nope: true }, registry)).toThrow(
      /Unknown field 'nope'/,
    );
  });

  test('rejects a scalar field named as a relation', () => {
    expect(() => buildCreateQuery(author, { name: 'a' }, undefined, { name: true }, registry)).toThrow();
  });
});

describe('updateMany builder include', () => {
  const where = { name: 'a' };

  test('adds the relation subquery to RETURN, after the WHERE', () => {
    const { text } = buildUpdateManyQuery(author, where, { name: 'b' }, undefined, undefined, registry, {
      posts: true,
    });

    expect(text).toContain('UPDATE $bulk_ids_n_0 SET');
    expect(text.indexOf('WHERE')).toBeLessThan(text.indexOf('RETURN'));
    expect(text).toMatch(/RETURN .*\(SELECT .* FROM post .*\) AS posts/);
  });

  test('without include the RETURN has no subquery', () => {
    const { text } = buildUpdateManyQuery(author, where, { name: 'b' }, undefined, undefined, registry);

    // The only SELECT is the capture of the matched ids
    expect(text.match(/SELECT/g)).toHaveLength(1);
    expect(text).toContain('RETURN *;');
  });

  test('rejects an unknown relation', () => {
    expect(() =>
      buildUpdateManyQuery(author, where, { name: 'b' }, undefined, undefined, registry, { nope: true }),
    ).toThrow(/Unknown field 'nope'/);
  });
});
