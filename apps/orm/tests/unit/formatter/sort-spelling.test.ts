/**
 * The printer reads a decorator from its AST node alone. @sort stores a boolean, so the author's
 * spelling (asc / true, desc / false, bare) is gone by then and the formatter prints the canonical
 * words. Assertions are on the output text, never on the AST.
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter/formatter';

// Ragged spacing makes the formatter rewrite every line, so a passing result is not a no-op
const SOURCE = [
  'model Feed {',
  'id Record @id',
  'ascWord String[] @sort(asc)',
  'ascBool String[] @sort(true)',
  'descWord String[] @sort(desc)',
  'descBool String[] @sort(false)',
  'bare String[] @sort',
  'empty String[] @sort()',
  '}',
  '',
].join('\n');

function formatOnce(source: string): string {
  const result = formatCerialSource(source);
  if (result.error) throw new Error(result.error.message);

  return result.formatted;
}

function fieldLine(output: string, field: string): string {
  const line = output.split('\n').find((l) => l.trim().startsWith(`${field} `));
  if (line === undefined) throw new Error(`field ${field} missing from output`);

  return line;
}

describe('formatter @sort spelling', () => {
  const formatted = formatOnce(SOURCE);

  it('should rewrite the fixture so the spelling checks are not a no-op', () => {
    expect(formatted).not.toBe(SOURCE);
  });

  it.each([
    ['ascWord', '@sort(asc)'],
    ['ascBool', '@sort(asc)'],
    ['bare', '@sort(asc)'],
    ['empty', '@sort(asc)'],
    ['descWord', '@sort(desc)'],
    ['descBool', '@sort(desc)'],
  ])('should print %s as %s', (field, expected) => {
    expect(fieldLine(formatted, field).endsWith(expected)).toBe(true);
  });

  it('should produce byte-identical output on a second pass', () => {
    expect(formatOnce(formatted)).toBe(formatted);
  });
});
