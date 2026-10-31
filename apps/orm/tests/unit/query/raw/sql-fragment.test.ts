import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../../src/errors';
import { compileFragment, createCompileContext, isSqlFragment, sql } from '../../../../src/query';

// Called as a plain function to model a caller that bypasses the tag syntax.
const callSql = sql as unknown as (...args: unknown[]) => unknown;

describe('sql: forgery is refused as a fragment', () => {
  const real = sql`true`;

  test('a real fragment is recognised', () => {
    expect(isSqlFragment(real)).toBe(true);
    expect(isSqlFragment(sql.ident('a'))).toBe(true);
    expect(isSqlFragment(sql.int(3))).toBe(true);
  });

  test('a spread drops the brand', () => {
    expect(isSqlFragment({ ...real })).toBe(false);
  });

  test('structuredClone drops the brand', () => {
    expect(isSqlFragment(structuredClone(real))).toBe(false);
  });

  test('a JSON round trip drops the brand', () => {
    expect(isSqlFragment(JSON.parse(JSON.stringify(real)))).toBe(false);
  });

  test('Object.create(fragment) inherits the brand without owning it', () => {
    const child = Object.create(real);

    expect(child[Symbol.for('cerial.sql')]).toBe(true);
    expect(isSqlFragment(child)).toBe(false);
  });

  test('plain lookalikes are not fragments', () => {
    expect(isSqlFragment({ strings: ['true'], values: [] })).toBe(false);
    expect(isSqlFragment('true')).toBe(false);
    expect(isSqlFragment(['true'])).toBe(false);
    expect(isSqlFragment(null)).toBe(false);
    expect(isSqlFragment(undefined)).toBe(false);
  });

  test('the brand is a non-enumerable own property', () => {
    expect(Object.keys(real)).toEqual(['strings', 'values']);
    expect(Object.getOwnPropertySymbols(real)).toHaveLength(1);
  });

  test('a fragment is frozen', () => {
    expect(Object.isFrozen(real)).toBe(true);
    expect(Object.isFrozen(real.strings)).toBe(true);
    expect(Object.isFrozen(real.values)).toBe(true);
  });
});

describe('sql: calls and holes it refuses', () => {
  test('a string argument', () => {
    expect(() => callSql('true')).toThrow(CerialValidationError);
  });

  test('a strings array that is not frozen or has no raw', () => {
    expect(() => callSql(['a', 'b'], 1)).toThrow(CerialValidationError);
    expect(() => callSql(Object.freeze(['a', 'b']), 1)).toThrow(CerialValidationError);
  });

  test('an empty fragment', () => {
    expect(() => sql``).toThrow(CerialValidationError);
    expect(() => sql`   `).toThrow(CerialValidationError);
  });

  test('a fragment made only of holes is not empty', () => {
    expect(() => sql`${1}`).not.toThrow();
  });

  test('undefined directly in a hole', () => {
    expect(() => sql`a = ${undefined}`).toThrow(CerialValidationError);
  });

  test('undefined nested in arrays and objects, naming the path', () => {
    expect(() => sql`a = ${[1, undefined]}`).toThrow('hole 0[1]');
    expect(() => sql`a = ${{ k: { j: [undefined] } }}`).toThrow('hole 0.k.j[0]');
  });

  test('a fragment inside an array hole', () => {
    expect(() => sql`a IN ${[sql`1`]}`).toThrow(CerialValidationError);
  });

  test('a fragment inside an object hole, at depth', () => {
    expect(() => sql`a = ${{ k: sql`1` }}`).toThrow(CerialValidationError);
    expect(() => sql`a = ${{ k: [{ j: sql`1` }] }}`).toThrow(CerialValidationError);
  });

  test('a cyclic hole is refused, not left to overflow the stack later', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    const arr: unknown[] = [];
    arr.push(arr);

    expect(() => sql`a = ${loop}`).toThrow(CerialValidationError);
    expect(() => sql`a = ${arr}`).toThrow(CerialValidationError);
  });

  test('a value shared twice without a cycle is accepted', () => {
    const shared = { k: 1 };

    expect(() => sql`a = ${[shared, shared]}`).not.toThrow();
  });

  test('a deeply nested hole is refused with a validation error', () => {
    let deep: unknown = 1;
    for (let i = 0; i < 10000; i++) deep = { d: deep };

    expect(() => sql`a = ${deep}`).toThrow(CerialValidationError);
  });

  test('sql on a parsed request body never yields a fragment from text', () => {
    expect(() => callSql(JSON.parse('["true"]'))).toThrow(CerialValidationError);
  });
});

describe('sql: static text is kept as written', () => {
  const text = (f: { strings: readonly string[] }) => f.strings.join('|');

  test('a regex backslash survives', () => {
    expect(text(sql`string::matches(name, /^\d+$/)`)).toBe('string::matches(name, /^\\d+$/)');
    expect(text(sql`x ~ /\w+/`)).toBe('x ~ /\\w+/');
  });

  test('an escaped backtick and dollar come out bare', () => {
    expect(text(sql`\`a\` \$5`)).toBe('`a` $5');
  });

  test('an escaped ${ stays literal text', () => {
    const f = sql`price \${1}`;

    expect(f.values).toHaveLength(0);
    // oxlint-disable-next-line eslint/no-template-curly-in-string -- the literal dollar-brace text is what this asserts
    expect(text(f)).toBe('price ${1}');
  });

  test('an escaped backslash before a dollar is not eaten', () => {
    expect(text(sql`a\\$b`)).toBe('a\\\\$b');
  });

  test('a newline escape is passed on as backslash-n', () => {
    expect(text(sql`'a\nb'`)).toBe("'a\\nb'");
  });

  test('an invalid escape no longer throws a bare TypeError', () => {
    expect(() => sql`x ~ /\u/`).not.toThrow();
    expect(text(sql`x ~ /\u/`)).toBe('x ~ /\\u/');
  });
});

describe('sql: what it accepts', () => {
  test('a direct nested fragment, and null, as a hole', () => {
    expect(() => sql`a = ${sql`1`} AND b = ${null}`).not.toThrow();
  });

  test('a parsed body as a hole is data, not a fragment', () => {
    const body = JSON.parse('{"strings":["true"],"values":[]}');

    expect(() => sql`a = ${body}`).not.toThrow();
  });
});

describe('sql.ident', () => {
  const text = (name: string) => sql.ident(name).strings.join('');

  test('quotes a plain identifier', () => {
    expect(text('name')).toBe('`name`');
  });

  test('quotes a keyword', () => {
    expect(text('true')).toBe('`true`');
    expect(text('select')).toBe('`select`');
  });

  test('escapes the backtick and the backslash', () => {
    expect(text('a`b')).toBe('`a\\`b`');
    expect(text('a\\b')).toBe('`a\\\\b`');
    expect(text('x\\`; DELETE victim; --')).toBe('`x\\\\\\`; DELETE victim; --`');
  });

  test('refuses a non-string', () => {
    for (const bad of [1, null, undefined, {}, ['a'], Symbol('x')]) {
      expect(() => sql.ident(bad as unknown as string)).toThrow(CerialValidationError);
    }
  });
});

describe('sql.int', () => {
  test('renders a safe integer', () => {
    expect(sql.int(42).strings.join('')).toBe('42');
    expect(sql.int(-7).strings.join('').trim()).toBe('-7');
    expect(sql.int(0).strings.join('')).toBe('0');
    expect(sql.int(Number.MAX_SAFE_INTEGER).strings.join('')).toBe(String(Number.MAX_SAFE_INTEGER));
  });

  test('a negative cannot fuse with a preceding minus into a comment', () => {
    const out = compileFragment(sql`age -${sql.int(-1)} > 0`, createCompileContext());

    expect(out.text).toBe('age - -1 > 0');
    expect(out.text).not.toContain('--');
  });

  test('refuses anything else', () => {
    for (const bad of [NaN, 1.5, 2 ** 53, Infinity, -Infinity, '1', null, undefined, 1n]) {
      expect(() => sql.int(bad as unknown as number)).toThrow(CerialValidationError);
    }
  });
});
