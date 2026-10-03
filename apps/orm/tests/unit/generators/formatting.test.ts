import { describe, expect, it } from 'bun:test';
import { formatCode } from '../../../src/generators/shared/formatting';

const format = (code: string): Promise<string> => formatCode(code, '');

/** Wider than oxfmt's default 100 columns, narrower than the configured 120. */
const WIDE_CALL = `foo(${'a'.repeat(50)}, ${'b'.repeat(50)});`;

const FIXTURES = [
  'const a = {b:1}\nconst f = x => x',
  'function f(a: number,\n b: number) {\n\treturn a+b\n}',
  `export const longName = { aaaaaaaaaaaaaaaaaaaa: 1, bbbbbbbbbbbbbbbbbbbbbbb: 2, cccccccccccccccccccccc: 3, ddddddddddddd: 4, eeee: 5 };`,
  `export type T = {\n/** doc */\na: string\n} & {\nb: number }`,
  WIDE_CALL,
];

describe('formatCode options', () => {
  it('indents with two spaces, not tabs (useTabs, tabWidth)', async () => {
    expect(await format('function f() {\n\treturn 1;\n}')).toBe('function f() {\n  return 1;\n}\n');
  });

  it('keeps a 110 column line on one line (printWidth 120)', async () => {
    expect(WIDE_CALL.length).toBeGreaterThan(100);
    expect(WIDE_CALL.length).toBeLessThanOrEqual(120);
    expect(await format(WIDE_CALL)).toBe(`${WIDE_CALL}\n`);
  });

  it('breaks a line over 120 columns (printWidth 120)', async () => {
    const out = await format(`foo(${'a'.repeat(60)}, ${'b'.repeat(60)});`);
    expect(out.split('\n').length).toBeGreaterThan(2);
  });

  it('writes LF line endings (endOfLine)', async () => {
    const out = await format('const a = 1;\r\nconst b = 2;\r\n');
    expect(out).not.toContain('\r');
    expect(out).toBe('const a = 1;\nconst b = 2;\n');
  });

  it('uses single quotes (singleQuote)', async () => {
    expect(await format('const a = "x";')).toBe("const a = 'x';\n");
  });

  it('adds trailing commas in multi-line lists (trailingComma all)', async () => {
    const out = await format(
      `function f(${'a'.repeat(50)}: number, ${'b'.repeat(50)}: number, ${'c'.repeat(30)}: number) {}`,
    );
    expect(out).toContain(`${'c'.repeat(30)}: number,\n)`);
  });

  it('adds semicolons (semi)', async () => {
    expect(await format('const a = 1')).toBe('const a = 1;\n');
  });

  it('wraps a lone arrow parameter in parentheses (arrowParens always)', async () => {
    expect(await format('const f = x => x;')).toBe('const f = (x) => x;\n');
  });

  it('pads object braces (bracketSpacing)', async () => {
    expect(await format('const a = {b: 1};')).toBe('const a = { b: 1 };\n');
  });
});

describe('formatCode behaviour', () => {
  it('is idempotent over the fixtures', async () => {
    for (const fixture of FIXTURES) {
      const once = await format(fixture);
      expect(await format(once)).toBe(once);
    }
  });

  it('returns its input unchanged when oxfmt cannot parse it', async () => {
    const broken = 'const = = ;;{';
    expect(await format(broken)).toBe(broken);
  });
});
