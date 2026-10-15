/**
 * The formatter returns the author's spelling of a @sort argument. The printer reads decorator
 * text from the source line, so rewriting through the parsed value would turn asc into true.
 * Assertions are on the output text, never on the AST.
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

  it('should keep @sort(asc) and not turn it into @sort(true)', () => {
    const line = fieldLine(formatted, 'ascWord');
    expect(line).toContain('@sort(asc)');
    expect(line).not.toContain('@sort(true)');
  });

  it('should keep @sort(true) and not turn it into @sort(asc)', () => {
    const line = fieldLine(formatted, 'ascBool');
    expect(line).toContain('@sort(true)');
    expect(line).not.toContain('@sort(asc)');
  });

  it('should keep @sort(desc) and not turn it into @sort(false)', () => {
    const line = fieldLine(formatted, 'descWord');
    expect(line).toContain('@sort(desc)');
    expect(line).not.toContain('@sort(false)');
  });

  it('should keep @sort(false) and not turn it into @sort(desc)', () => {
    const line = fieldLine(formatted, 'descBool');
    expect(line).toContain('@sort(false)');
    expect(line).not.toContain('@sort(desc)');
  });

  it('should keep a bare @sort bare', () => {
    const line = fieldLine(formatted, 'bare');
    expect(line).toMatch(/@sort$/);
    expect(line).not.toContain('@sort(');
  });

  it('should produce byte-identical output on a second pass', () => {
    expect(formatOnce(formatted)).toBe(formatted);
  });
});
