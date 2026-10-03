/**
 * Escapers for schema-derived text in generated output
 */

import { describe, expect, test } from 'bun:test';
import { escapeSurqlString, escapeTsString } from '../../../src/generators/shared';

const escapers = [
  { name: 'escapeTsString', encode: escapeTsString },
  { name: 'escapeSurqlString', encode: escapeSurqlString },
];

describe.each(escapers)('$name', ({ encode }) => {
  test('leaves plain text alone', () => {
    expect(encode('plain text 123')).toBe('plain text 123');
  });

  test('escapes a single quote', () => {
    expect(encode("O'Brien")).toBe("O\\'Brien");
  });

  test('escapes a backslash', () => {
    expect(encode('a\\b')).toBe('a\\\\b');
  });

  test('escapes a trailing backslash so it cannot cancel the closing quote', () => {
    expect(encode('x\\')).toBe('x\\\\');
    // The pre-fix escaper turned this into 'x\' which swallows the closing quote
    expect(`'${encode('x\\')}'`).toBe("'x\\\\'");
  });

  test('escapes a backslash before a quote in the right order', () => {
    expect(encode("\\'")).toBe("\\\\\\'");
  });

  test('escapes a newline', () => {
    expect(encode('a\nb')).toBe('a\\nb');
  });

  test('escapes a carriage return', () => {
    expect(encode('a\rb')).toBe('a\\rb');
  });

  test('leaves a semicolon and double quote alone', () => {
    expect(encode('a; "b"')).toBe('a; "b"');
  });

  test('round-trips through a real single-quoted TypeScript literal', () => {
    const hostile = "it's \\ a\nb\r; '\\' \\\\'";
    const parsed = new Function(`return '${encode(hostile)}'`)();

    expect(parsed).toBe(hostile);
  });
});
