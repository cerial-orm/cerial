/**
 * `nullsNotDistinct` on `@unique` and `@@unique` must survive formatting untouched, print in one
 * canonical spelling from irregular input, and stay idempotent.
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter/formatter';
import { parse } from '../../../src/parser/parser';

function format(source: string): string {
  const result = formatCerialSource(source);
  if (result.error) throw new Error(result.error.message);

  return result.formatted;
}

function expectIdempotent(source: string): string {
  const once = format(source);
  expect(format(once)).toBe(once);

  return once;
}

describe('formatter: nullsNotDistinct', () => {
  it('prints the field form on a model field', () => {
    const out = expectIdempotent('model User {\n  id Record @id\n  email String? @unique(nullsNotDistinct)\n}\n');
    expect(out).toContain('@unique(nullsNotDistinct)');
  });

  it('prints the field form on an object sub-field', () => {
    const out = expectIdempotent(
      'object Addr {\n  zip String? @unique(nullsNotDistinct)\n}\nmodel U {\n  id Record @id\n  addr Addr\n}\n',
    );
    expect(out).toContain('zip String? @unique(nullsNotDistinct)');
  });

  it('combines with other decorators', () => {
    const out = expectIdempotent(
      'model User {\n  id Record @id\n  email String @nullable @unique(nullsNotDistinct)\n  name String? @unique(nullsNotDistinct)\n}\n',
    );
    expect(out).toContain('@unique(nullsNotDistinct) @nullable');
    expect(out).toContain('String? @unique(nullsNotDistinct)');
  });

  it('normalises irregular whitespace in the field form', () => {
    const out = expectIdempotent('model U {\n  id Record @id\n  e String? @unique( nullsNotDistinct )\n}\n');
    expect(out).toContain('@unique(nullsNotDistinct)');
  });

  it('prints the composite form with the option last', () => {
    const out = expectIdempotent(
      'model U {\n  id Record @id\n  a String\n  b String\n  @@unique(ab, [a, b], nullsNotDistinct)\n}\n',
    );
    expect(out).toContain('@@unique(ab, [a, b], nullsNotDistinct)');
  });

  it('normalises irregular whitespace in the composite form', () => {
    const out = expectIdempotent(
      'model U {\n  id Record @id\n  a String\n  b String\n  @@unique(ab,[a,b] , nullsNotDistinct)\n}\n',
    );
    expect(out).toContain('@@unique(ab, [a, b], nullsNotDistinct)');
  });

  it('keeps comments next to the option', () => {
    const out = expectIdempotent(
      'model U {\n  id Record @id\n  a String\n  b String\n  e String? @unique(nullsNotDistinct) // one per null\n  // composite\n  @@unique(ab, [a, b], nullsNotDistinct) // pair\n}\n',
    );
    expect(out).toContain('@unique(nullsNotDistinct) // one per null');
    expect(out).toContain('@@unique(ab, [a, b], nullsNotDistinct) // pair');
    expect(out).toContain('// composite');
  });

  it('aligns decorator columns like other decorators', () => {
    const out = expectIdempotent(
      'model U {\n  id Record @id\n  e String? @unique(nullsNotDistinct)\n  longerName Int @unique\n}\n',
    );
    const lines = out.split('\n');
    const col = (needle: string): number => lines.find((l) => l.trim().startsWith(needle))!.indexOf('@unique');
    expect(col('e ')).toBe(col('longerName'));
  });

  it('keeps the parsed option through formatting', () => {
    const src =
      'model U {\n  id Record @id\n  a String\n  b String\n  e String? @unique(nullsNotDistinct)\n  @@unique(ab, [a, b], nullsNotDistinct)\n}\n';
    const model = parse(format(src)).ast.models[0]!;
    expect(model.directives?.[0]?.nullsNotDistinct).toBe(true);
    expect(JSON.stringify(model.fields)).toContain('nullsNotDistinct');
  });

  it('adds nothing to plain forms', () => {
    const out = expectIdempotent(
      'model U {\n  id Record @id\n  a String\n  b String\n  e String @unique\n  @@unique(ab, [a, b])\n}\n',
    );
    expect(out).not.toContain('nullsNotDistinct');
    expect(out).toContain('@@unique(ab, [a, b])');
  });
});
