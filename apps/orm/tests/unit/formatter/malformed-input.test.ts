/**
 * What formatCerialSource does with input it cannot fully parse. It never throws: input the
 * parser rejects comes back as { error } with a 1-based line, and input the parser tolerates is
 * silently repaired, which can drop text. Every case pins the exact observed result so changing
 * either choice is a deliberate edit to this file.
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter/formatter';

const MODEL = ['model A {', '  id Record @id'];

function lines(...parts: string[]): string {
  return `${parts.join('\n')}\n`;
}

function expectError(source: string, message: string, line: number): void {
  const result = formatCerialSource(source);

  expect(result).toEqual({ error: { message, line, column: 0 } });
}

function expectFormatted(source: string, formatted: string): void {
  const result = formatCerialSource(source);

  expect(result).toEqual({ formatted, changed: formatted !== source });
}

describe('formatter malformed input: rejected with an error result', () => {
  it('should report a decorator whose paren is never closed when the value is lost', () => {
    expectError(
      lines(...MODEL, '  n String @default(1', '}'),
      "Decorator '@default' requires a value. Use @default(value)",
      3,
    );
  });

  it('should report an array type whose bracket is never closed', () => {
    expectError(
      lines(...MODEL, '  n String[', '}'),
      'Invalid field type: String[. Use String, Email, Int, Date, Bool, Float, Uuid, Record, Relation, a sized number (Int8, Uint8, Int16, Uint16, Int32, Uint32, Uint64, Float16, Float32), or array types (String[], Int[], Date[], Uuid[], Record[], Relation[]).',
      3,
    );
  });

  it('should report an unknown field type', () => {
    expectError(
      lines(...MODEL, '  n Bogus', '}'),
      'Invalid field type: Bogus. Use String, Email, Int, Date, Bool, Float, Uuid, Record, Relation, a sized number (Int8, Uint8, Int16, Uint16, Int32, Uint32, Uint64, Float16, Float32), or array types (String[], Int[], Date[], Uuid[], Record[], Relation[]).',
      3,
    );
  });

  it('should report a field with a name and no type', () => {
    expectError(lines('model A {', '  id', '}'), 'Invalid field declaration: id', 2);
  });

  it('should report a model with no name', () => {
    expectError(lines('model {', '  id Record @id', '}'), 'Invalid model declaration: model {', 1);
  });

  it('should report only the first of several errors', () => {
    expectError(
      lines(...MODEL, '  a Bogus', '  b AlsoBogus', '}'),
      'Invalid field type: Bogus. Use String, Email, Int, Date, Bool, Float, Uuid, Record, Relation, a sized number (Int8, Uint8, Int16, Uint16, Int32, Uint32, Uint64, Float16, Float32), or array types (String[], Int[], Date[], Uuid[], Record[], Relation[]).',
      3,
    );
  });

  it('should not return a formatted string alongside an error', () => {
    const result = formatCerialSource(lines('model A {', '  id', '}'));

    expect(result.formatted).toBeUndefined();
    expect(result.changed).toBeUndefined();
  });
});

describe('formatter malformed input: tolerated and repaired, no error', () => {
  it('should close an unclosed model brace', () => {
    expectFormatted(lines(...MODEL), lines('model A {', '  id Record @id', '}'));
  });

  it('should close an unclosed model brace that has no body', () => {
    expectFormatted('model A {', lines('model A {', '}'));
  });

  it('should close an unclosed enum brace', () => {
    expectFormatted('enum E { A, B\n', lines('enum E {', '  A,', '  B', '}'));
  });

  it('should close an unclosed tuple brace', () => {
    expectFormatted('tuple T { a Int\n', lines('tuple T {', '  a Int', '}'));
  });

  it('should pass an unterminated single-quoted string through verbatim', () => {
    expectFormatted(
      lines(...MODEL, "  n String @default('abc)", '}'),
      lines('model A {', '  id Record @id', "  n  String @default('abc)", '}'),
    );
  });

  it('should pass an unterminated double-quoted string through verbatim', () => {
    expectFormatted(
      lines(...MODEL, '  n String @default("abc)', '}'),
      lines('model A {', '  id Record @id', '  n  String @default("abc)', '}'),
    );
  });

  it('should rewrite @sort(asc with a missing paren to @sort(asc)', () => {
    expectFormatted(
      lines(...MODEL, '  n String[] @sort(asc', '}'),
      lines('model A {', '  id Record   @id', '  n  String[] @sort(asc)', '}'),
    );
  });

  it('should drop an unknown decorator without a diagnostic', () => {
    expectFormatted(
      lines(...MODEL, '  n String @bogus', '}'),
      lines('model A {', '  id Record @id', '  n  String', '}'),
    );
  });

  it('should drop an unexpected character in a field line', () => {
    expectFormatted(lines(...MODEL, '  n String $', '}'), lines('model A {', '  id Record @id', '  n  String', '}'));
  });

  it('should drop a stray closing brace at the top level', () => {
    expectFormatted(lines('}', ...MODEL, '}'), lines('model A {', '  id Record @id', '}'));
  });

  it('should drop a stray word at the top level', () => {
    expectFormatted(lines('foo', ...MODEL, '}'), lines('model A {', '  id Record @id', '}'));
  });

  it('should drop a stray token after the last block', () => {
    expectFormatted(lines(...MODEL, '}', '@@'), lines('model A {', '  id Record @id', '}'));
  });

  it('should drop a whole block introduced by an unknown keyword', () => {
    expectFormatted(lines('widget A {', '}'), '\n');
  });

  it('should keep both declarations of a duplicated model name', () => {
    const model = lines('model A {', '  id Record @id', '}');

    expectFormatted(`${model}${model}`, `${model}\n\n${model}`);
  });

  it('should keep an unclosed block comment at the end verbatim', () => {
    expectFormatted(lines(...MODEL, '}', '/* never'), lines('model A {', '  id Record @id', '}', '', '/* never'));
  });
});

describe('formatter malformed input: empty and comment-only files', () => {
  it('should turn an empty file into a single newline', () => {
    expectFormatted('', '\n');
  });

  it('should turn a whitespace-only file into a single newline', () => {
    expectFormatted('  \n\n', '\n');
  });

  it('should leave a file of only comments unchanged', () => {
    expectFormatted(lines('# a', '// b', '/* c */'), lines('# a', '// b', '/* c */'));
  });

  it('should format an empty model and an empty enum without error', () => {
    expectFormatted(lines('model A {', '}'), lines('model A {', '}'));
    expectFormatted(lines('enum E {', '}'), lines('enum E {', '}'));
  });
});

describe('formatter malformed input: repaired output is stable', () => {
  const REPAIRED = [
    lines(...MODEL),
    'enum E { A, B\n',
    lines(...MODEL, "  n String @default('abc)", '}'),
    lines(...MODEL, '  n String[] @sort(asc', '}'),
    lines('foo', ...MODEL, '}'),
    lines(...MODEL, '}', '/* never'),
    '',
  ];

  for (const source of REPAIRED) {
    it(`should be a fixed point after one pass for ${JSON.stringify(source)}`, () => {
      const first = formatCerialSource(source);
      if (first.error) throw new Error(first.error.message);

      expect(formatCerialSource(first.formatted)).toEqual({ formatted: first.formatted, changed: false });
    });
  }
});
