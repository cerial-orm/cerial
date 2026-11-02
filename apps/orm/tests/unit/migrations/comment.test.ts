import { describe, expect, test } from 'bun:test';
import { CerialMigrationError } from '../../../src/errors';
import { commentOut, quoteIdent, sanitiseReason } from '../../../src/migrations';

const code = (n: number): string => String.fromCharCode(n);
const ONE_LINE = /^[^\p{Cc}\p{Zl}\p{Zp}]*$/u;

const TERMINATORS: readonly (readonly [string, string, string])[] = [
  ['LF', code(0x0a), '\\n'],
  ['CR', code(0x0d), '\\r'],
  ['VT', code(0x0b), '\\u{b}'],
  ['FF', code(0x0c), '\\u{c}'],
  ['NEL', code(0x85), '\\u{85}'],
  ['LS', code(0x2028), '\\u{2028}'],
  ['PS', code(0x2029), '\\u{2029}'],
];

describe('commentOut', () => {
  test.each(TERMINATORS)('a quoted statement with a %s in the name stays on one prefixed line', (_n, ch) => {
    const statement = `REMOVE TABLE ${quoteIdent(`t${ch}REMOVE TABLE victim; --`)};`;
    const line = commentOut(statement);

    expect(line.startsWith('-- REMOVE TABLE ')).toBe(true);
    expect(line).toMatch(ONE_LINE);
  });

  test.each(TERMINATORS)('throws CerialMigrationError on a raw %s', (_n, ch) => {
    expect(() => commentOut(`a${ch}b`)).toThrow(CerialMigrationError);
  });

  test('throws on a terminator at either end', () => {
    expect(() => commentOut(`${code(0x0a)}x`)).toThrow(CerialMigrationError);
    expect(() => commentOut(`x${code(0x2028)}`)).toThrow(CerialMigrationError);
  });

  test('benign text passes unchanged, prefixed', () => {
    expect(commentOut('REMOVE TABLE `user`; -- note\ttab')).toBe('-- REMOVE TABLE `user`; -- note\ttab');
    expect(commentOut('')).toBe('-- ');
  });
});

describe('sanitiseReason', () => {
  test.each(TERMINATORS)('renders %s visibly', (_n, ch, rendered) => {
    const out = sanitiseReason(`a${ch}b`);

    expect(out).toBe(`a${rendered}b`);
    expect(out).toMatch(ONE_LINE);
  });

  test('a sanitised reason is safe to comment out', () => {
    const raw = TERMINATORS.map(([, ch]) => ch).join('x');

    expect(() => commentOut(sanitiseReason(raw))).not.toThrow();
  });

  test('benign text passes unchanged', () => {
    expect(sanitiseReason('field `a.b` dropped; tab\there')).toBe('field `a.b` dropped; tab\there');
  });
});
