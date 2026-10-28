/**
 * A `@default` string that is a single quote character must survive a format: the printer used to
 * print it bare, which re-parsed as an empty string and changed the generated DEFAULT clause.
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter/formatter';
import { generateDefaultClause } from '../../../src/generators/migrations/type-mapper';
import { parse } from '../../../src/parser/parser';

function format(source: string): string {
  const result = formatCerialSource(source);
  if (result.error) throw new Error(result.error.message);

  return result.formatted;
}

function modelDefault(source: string): unknown {
  return parse(source)
    .ast.models[0]!.fields.find((f) => f.name === 'v')!
    .decorators.find((d) => d.type === 'default')!.value;
}

function tupleDefault(source: string): unknown {
  return parse(source).ast.tuples[0]!.elements[0]!.decorators!.find((d) => d.type === 'default')!.value;
}

const CASES = [
  ['single quote', `"'"`, "'"],
  ['double quote', `'"'`, '"'],
] as const;

const SHAPES = [
  ['model field', (d: string) => `model M {\n  id Record @id\n  v String @default(${d})\n}\n`, modelDefault],
  ['tuple element', (d: string) => `tuple T { String @default(${d}) }\n`, tupleDefault],
] as const;

describe('lone quote @default', () => {
  for (const [shape, build, read] of SHAPES) {
    for (const [label, written, value] of CASES) {
      describe(`${shape}, ${label}`, () => {
        const source = build(written);
        const formatted = format(source);

        it('should parse to the lone character', () => {
          expect(read(source)).toBe(value);
        });

        it('should keep the value through format and parse', () => {
          expect(read(formatted)).toBe(value);
        });

        it('should keep the generated DEFAULT clause', () => {
          expect(generateDefaultClause(undefined, read(formatted))).toBe(generateDefaultClause(undefined, value));
          expect(generateDefaultClause(undefined, read(formatted))).not.toBe("DEFAULT ''");
        });

        it('should be stable on a second format', () => {
          expect(format(formatted)).toBe(formatted);
        });
      });
    }
  }
});
