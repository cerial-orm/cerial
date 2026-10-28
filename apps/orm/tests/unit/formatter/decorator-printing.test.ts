/**
 * formatDecorator prints from the AST node and the registry entry alone. The sweep iterates
 * DECORATOR_REGISTRY, so a new decorator is covered without a test change. The pins below record the
 * spellings the AST cannot recover and the canonical form the formatter now prints for them.
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter/formatter';
import { formatDecorator } from '../../../src/formatter/printer';
import { DECORATOR_REGISTRY, getDecoratorEntry, matchDecoratorToken } from '../../../src/parser/registry';
import type { ArgumentShape, DecoratorEntry, LiteralForm } from '../../../src/parser/registry';
import type { ASTDecorator, SourceRange } from '../../../src/types';

const RANGE: SourceRange = {
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 1, offset: 0 },
};

const LITERAL_SAMPLES: Record<LiteralForm, string[]> = {
  boolean: ['true', 'false'],
  null: ['null'],
  int: ['42', '-3', '0'],
  float: ['1.5', '-3.14'],
  string: ["'US'", '"pending review"', "''", "'123'", "'true'", "'null'", '"it\'s"', "'1h; DROP'"],
  raw: ['1h30m', '30m', '1h'],
};

/** Every token of the shape the parser accepts, written the way an author would */
function sampleTokens(entry: DecoratorEntry): string[] {
  const args: ArgumentShape = entry.args;
  switch (args.kind) {
    case 'none':
      return [entry.name];
    case 'choice':
      return [...(args.optional ? [entry.name] : []), ...args.choices.map((c) => `${entry.name}(${c})`)];
    case 'name':
      return [`${entry.name}(Sample)`];
    case 'literal':
      return args.forms.flatMap((form) => LITERAL_SAMPLES[form].map((v) => `${entry.name}(${v})`));
    case 'nameAndFields':
      return [];
  }
}

function parseToken(token: string): ASTDecorator {
  const entry = matchDecoratorToken(token);
  if (!entry) throw new Error(`no entry accepts ${token}`);

  return entry.parse(token, RANGE) as ASTDecorator;
}

const FIELD_ENTRIES = [...DECORATOR_REGISTRY.values()].filter((e) => e.args.kind !== 'nameAndFields');

describe('formatDecorator registry sweep', () => {
  it('should cover every registered decorator', () => {
    for (const entry of DECORATOR_REGISTRY.values()) {
      if (entry.args.kind === 'nameAndFields') continue;
      expect(sampleTokens(entry).length).toBeGreaterThan(0);
    }
    expect(FIELD_ENTRIES.length).toBeGreaterThan(0);
  });

  for (const entry of FIELD_ENTRIES) {
    describe(entry.name, () => {
      for (const token of sampleTokens(entry)) {
        it(`should print ${token} so it re-parses to the same node`, () => {
          const node = parseToken(token);
          const printed = formatDecorator(node);
          const reparsed = parseToken(printed);

          expect(reparsed.type).toBe(node.type);
          expect(reparsed.value).toEqual(node.value);
        });
      }
    });
  }

  it('should refuse a decorator with no registry entry', () => {
    const node = { type: 'bogus', range: RANGE } as unknown as ASTDecorator;
    expect(() => formatDecorator(node)).toThrow("No registry entry for decorator '@bogus'");
  });

  it('should refuse a model directive passed as a field decorator', () => {
    expect(getDecoratorEntry('@@index')).toBeDefined();
    const node = { type: 'index', value: 'x', range: RANGE } as unknown as ASTDecorator;
    // `@index` is the field decorator (shape none); a nameAndFields entry is only reachable through `@@`
    expect(formatDecorator(node)).toBe('@index');
  });
});

describe('formatDecorator canonical spellings', () => {
  function field(decorator: string): string {
    const result = formatCerialSource(`model M {\nid Record @id\nv String ${decorator}\n}\n`);
    if (result.error) throw new Error(result.error.message);

    return result.formatted
      .split('\n')
      .find((l) => l.trim().startsWith('v '))!
      .trim()
      .replace(/\s+/g, ' ');
  }

  it.each([
    ['@default("US")', "v String @default('US')"],
    ["@default('US')", "v String @default('US')"],
    ['@default(Viewer)', "v String @default('Viewer')"],
    ['@default(1.0)', 'v String @default(1)'],
    ['@default(0.0)', 'v String @default(0)'],
    ["@default('1h30m')", 'v String @default(1h30m)'],
    ['@default(1h30m)', 'v String @default(1h30m)'],
    ['@default("1h; REMOVE TABLE x")', "v String @default('1h; REMOVE TABLE x')"],
    ["@default('123')", "v String @default('123')"],
    ['@default("it\'s")', 'v String @default("it\'s")'],
    ['@default(null)', 'v String @default(null)'],
    ['@default(true)', 'v String @default(true)'],
    ['@defaultAlways(-5)', 'v String @defaultAlways(-5)'],
    ['@onDelete(Cascade)', 'v String @onDelete(Cascade)'],
  ])('should print %s as %s', (written, expected) => {
    expect(field(written)).toBe(expected);
  });
});
