import { describe, expect, test } from 'bun:test';
import { formatOrigin, NO_LINE, originLine } from '../../../src/cli/validators';
import { validateModelNames, validateSchema } from '../../../src/cli/validators/schema-validator';
import { createDslOrigin, parse } from '../../../src/parser';
import type { Origin, SourceRange } from '../../../src/types';

const range: SourceRange = {
  start: { line: 12, column: 0, offset: 0 },
  end: { line: 14, column: 0, offset: 0 },
};
const dsl: Origin = { kind: 'dsl', file: 'post.cerial', range };
const ts: Origin = { kind: 'ts', file: 'post.ts', export: 'Post' };

describe('error locations from the origin', () => {
  test('dsl origin yields its start line and file:line text', () => {
    expect(originLine(dsl)).toBe(12);
    expect(formatOrigin(dsl)).toBe('post.cerial:12');
  });

  test('ts origin yields the sentinel line and file plus export', () => {
    expect(originLine(ts)).toBe(NO_LINE);
    expect(NO_LINE).toBe(0);
    expect(formatOrigin(ts)).toBe('post.ts (export Post)');
  });

  test('a validator error takes its line from the origin, not from range', () => {
    const { ast } = parse(
      'model lower {\n  id Record @id\n}\nmodel alsoLower {\n  id Record @id\n}\n',
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      'a.cerial',
    );
    ast.models[1]!.origin = ts;
    const errors = validateModelNames(ast);
    expect(errors.map((e) => e.line)).toEqual([1, NO_LINE]);
    expect(createDslOrigin(range, 'a.cerial')).toEqual({ kind: 'dsl', file: 'a.cerial', range });
  });

  const fieldRange: SourceRange = {
    start: { line: 7, column: 2, offset: 0 },
    end: { line: 7, column: 30, offset: 0 },
  };

  test('a field-level node formats as file:line for dsl and file plus export for ts', () => {
    expect(formatOrigin({ kind: 'dsl', file: 'post.cerial', range: fieldRange })).toBe('post.cerial:7');
    expect(formatOrigin({ kind: 'ts', file: 'schema.ts', export: 'Post' })).toBe('schema.ts (export Post)');
  });

  test('a ts-origin model yields the exact validator message, line sentinel and location text', () => {
    const { ast } = parse(
      'model Post {\n  id Record @id\n  authorId Record\n  author Relation @field(authorId) @model(Nope)\n}\n',
      new Set(),
      new Set(),
      new Set(),
      new Set(),
      'post.cerial',
    );
    const origin: Origin = { kind: 'ts', file: 'schema.ts', export: 'Post' };
    const post = ast.models[0]!;
    post.origin = origin;
    for (const field of post.fields) field.origin = origin;

    const result = validateSchema(ast);

    expect(result.errors.map((e) => ({ message: e.message, model: e.model, line: e.line }))).toEqual([
      { message: 'Relation field "author" references non-existent model "Nope"', model: 'Post', line: NO_LINE },
    ]);
    expect(`${formatOrigin(post.fields.find((f) => f.name === 'author')!.origin)}`).toBe('schema.ts (export Post)');
  });
});
