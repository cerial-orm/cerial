import { describe, expect, test } from 'bun:test';
import { formatOrigin, NO_LINE, originLine } from '../../../src/cli/validators';
import { validateModelNames } from '../../../src/cli/validators/schema-validator';
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
});
