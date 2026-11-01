import { describe, expect, test } from 'bun:test';
import { CerialMigrationError } from '../../../src/errors';
import { parseFieldIdiom, quoteFieldPath, quoteIdent } from '../../../src/migrations';
import allowlist from '../query/interpolation-allowlist.json';
import { inScope, unlistedSites } from '../query/interpolation-sites';

const BS = String.fromCharCode(92);
const BT = '`';
const LINE_TERMINATORS = /[\p{Zl}\p{Zp}\p{Cc}]/u;

const code = (n: number): string => String.fromCharCode(n);

/** Each payload class with the exact text it must quote to. */
const EXPECTED: readonly (readonly [string, string, string])[] = [
  ['plain', 'user', `${BT}user${BT}`],
  ['semicolon payload', 'a; REMOVE TABLE victim; --', `${BT}a; REMOVE TABLE victim; --${BT}`],
  ['LF', `h${code(0x0a)}x`, `${BT}h${BS}nx${BT}`],
  ['CR', `h${code(0x0d)}x`, `${BT}h${BS}rx${BT}`],
  ['NEL', `h${code(0x85)}x`, `${BT}h${BS}u{85}x${BT}`],
  ['LS', `h${code(0x2028)}x`, `${BT}h${BS}u{2028}x${BT}`],
  ['PS', `h${code(0x2029)}x`, `${BT}h${BS}u{2029}x${BT}`],
  ['VT', `h${code(0x0b)}x`, `${BT}h${BS}u{b}x${BT}`],
  ['tab', `h${code(0x09)}x`, `${BT}h${BS}u{9}x${BT}`],
  ['backtick', `h${BT}x`, `${BT}h${BS}${BT}x${BT}`],
  ['backslash', `h${BS}x`, `${BT}h${BS}${BS}x${BT}`],
  ['trailing backslash', `h${BS}`, `${BT}h${BS}${BS}${BT}`],
  ['backslash then backtick', `h${BS}${BT}`, `${BT}h${BS}${BS}${BS}${BT}${BT}`],
  ['unicode', 'héllo😀', `${BT}héllo😀${BT}`],
];

describe('quoteIdent', () => {
  test.each(EXPECTED)('%s', (_label, name, quoted) => {
    expect(quoteIdent(name)).toBe(quoted);
  });

  test('a trailing backslash cannot escape the closing backtick', () => {
    const quoted = quoteIdent(`name${BS}`);

    expect(quoted.endsWith(`${BS}${BS}${BT}`)).toBe(true);
    expect(quoted.slice(0, -1).endsWith(`${BS}${BS}`)).toBe(true);
  });

  test('no output holds a raw line terminator or control character, over every code unit below 0xa0', () => {
    const terminators = [0x2028, 0x2029, ...Array.from({ length: 0xa0 }, (_, i) => i)];
    for (const unit of terminators) {
      const quoted = quoteIdent(`a${code(unit)}b`);

      expect(LINE_TERMINATORS.test(quoted)).toBe(false);
    }
  });

  test('every output round-trips through parseFieldIdiom as one segment', () => {
    for (const [, name] of EXPECTED) expect(parseFieldIdiom(quoteIdent(name))).toEqual([name]);
  });
});

describe('quoteFieldPath', () => {
  test('quotes each named segment and leaves the element step bare', () => {
    expect(quoteFieldPath(['arr', { element: true }])).toBe(`${BT}arr${BT}.*`);
    expect(quoteFieldPath(['o y', 'z'])).toBe(`${BT}o y${BT}.${BT}z${BT}`);
  });

  test('a name that is literally * stays quoted', () => {
    expect(quoteFieldPath(['*'])).toBe(`${BT}*${BT}`);
  });
});

describe('parseFieldIdiom', () => {
  test('reads bare, quoted and element segments', () => {
    expect(parseFieldIdiom('a')).toEqual(['a']);
    expect(parseFieldIdiom(`${BT}a.b${BT}`)).toEqual(['a.b']);
    expect(parseFieldIdiom(`${BT}o y${BT}.z`)).toEqual(['o y', 'z']);
    expect(parseFieldIdiom('arr.*')).toEqual(['arr', { element: true }]);
    expect(parseFieldIdiom(`${BT}select${BT}.x.*`)).toEqual(['select', 'x', { element: true }]);
    expect(parseFieldIdiom(`${BT}*${BT}`)).toEqual(['*']);
  });

  test('reads the short escapes the server writes', () => {
    expect(parseFieldIdiom(`${BT}a${BS}tb${BS}fc${BS}bd${BS}ne${BS}rf${BT}`)).toEqual([
      `a${code(9)}b${code(12)}c${code(8)}d${code(10)}e${code(13)}f`,
    ]);
  });

  test('quoting a parsed idiom gives a path that parses back to the same segments', () => {
    for (const idiom of [`${BT}a.b${BT}`, `${BT}o y${BT}.z`, 'arr.*', `${BT}é${BT}.${BT}${BS}n${BT}`]) {
      const path = parseFieldIdiom(idiom);

      expect(parseFieldIdiom(quoteFieldPath(path))).toEqual(path);
    }
  });

  test.each([
    ['unterminated backtick', `${BT}abc`],
    ['backslash before the end', `${BT}abc${BS}`],
    ['escaped closing backtick', `${BT}abc${BS}${BT}`],
    ['unknown escape', `${BT}a${BS}qb${BT}`],
    ['bad unicode escape', `${BT}a${BS}u{zz}${BT}`],
    ['unicode escape out of range', `${BT}a${BS}u{110000}${BT}`],
    ['empty idiom', ''],
    ['empty segment', 'a..b'],
    ['trailing dot', 'a.'],
    ['text after a closing backtick', `${BT}a${BT}b`],
    ['backtick inside a bare segment', `a${BT}b`],
  ])('refuses %s with CerialMigrationError', (_label, rendered) => {
    expect(() => parseFieldIdiom(rendered)).toThrow(CerialMigrationError);
  });
});

/* oxlint-disable no-template-curly-in-string */
// The probe sources are text containing template placeholders, scanned literally
describe('interpolation gate scope', () => {
  const ALLOWED: Readonly<Record<string, number>> = allowlist;

  test.each(['src/migrations/', 'src/cli/migrate/'])(
    '%s is read by the gate and an unquoted site there fails it',
    (dir) => {
      const path = `${dir}probe.ts`;
      const source = 'export function drop(name: string) { return `REMOVE TABLE ${name};`; }';

      expect(inScope(path)).toBe(true);
      expect(unlistedSites([{ path, source }], ALLOWED)).toEqual([`${path}:1  ${path}::drop::template::name`]);
    },
  );

  test('the same site written through the quoter is still a site and needs a reviewed entry', () => {
    const path = 'src/migrations/probe.ts';
    const source = 'export function drop(name: string) { return `REMOVE TABLE ${quoteIdent(name)};`; }';

    expect(unlistedSites([{ path, source }], ALLOWED)).toHaveLength(1);
  });
});
/* oxlint-enable no-template-curly-in-string */
