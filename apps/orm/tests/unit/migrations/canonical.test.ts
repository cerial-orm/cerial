import { describe, expect, test } from 'bun:test';
import { acceptsNone, buildFieldModel, canonicalExpression, canonicalType } from '../../../src/migrations';

describe('canonicalType', () => {
  test('option<string | null> and none | string | null are one form', () => {
    expect(canonicalType('option<string | null>')).toBe(canonicalType('none | string | null'));
    expect(canonicalType('none | null | string')).toBe(canonicalType('none | string | null'));
  });

  test('a record member survives and compares the same either way', () => {
    expect(canonicalType('option<record<user> | null>')).toBe(canonicalType('none | record<user> | null'));
    expect(canonicalType('option<record<a | b>>')).toBe(canonicalType('none | record<b | a>'));
  });

  test('the server readback of option<string> matches the emitted type', () => {
    expect(canonicalType('none | string')).toBe(canonicalType('option<string>'));
  });

  test('nested option flattens and duplicates collapse', () => {
    expect(canonicalType('option<option<string>>')).toBe(canonicalType('option<string>'));
    expect(canonicalType('option<none | string>')).toBe(canonicalType('option<string>'));
  });

  test('generics canonicalise inside, including a size argument', () => {
    expect(canonicalType('array<option<string>>')).toBe(canonicalType('array<none | string>'));
    expect(canonicalType('array<string,5>')).toBe('array<string, 5>');
  });

  test('option<string> and string stay different', () => {
    expect(canonicalType('option<string>')).not.toBe(canonicalType('string'));
  });

  test('int and float stay different', () => {
    expect(canonicalType('int')).not.toBe(canonicalType('float'));
    expect(canonicalType('array<int>')).not.toBe(canonicalType('array<float>'));
  });

  test('a union inside quotes is not split', () => {
    expect(canonicalType("'a|b' | 'c'")).toBe("'a|b' | 'c'");
  });

  test('an optional tuple element reads back as the server renders it', () => {
    // INFO FOR TABLE ... STRUCTURE on 3.3.0 returns `[float, none | float]` for `[float, option<float>]`
    expect(canonicalType('[float, option<float>]')).toBe(canonicalType('[float, none | float]'));
    expect(canonicalType('[float, option<float>]')).toBe('[float, float | none]');
  });

  test('tuples canonicalise inside unions, generics and other tuples', () => {
    expect(canonicalType('option<[option<int>, string]>')).toBe(canonicalType('none | [none | int, string]'));
    expect(canonicalType('array<[int, option<string>]>')).toBe(canonicalType('array<[int, none | string]>'));
    expect(canonicalType('[[option<int>], string]')).toBe(canonicalType('[[none | int], string]'));
  });

  test('tuple element order is kept, a required and an optional element stay different', () => {
    expect(canonicalType('[int, string]')).not.toBe(canonicalType('[string, int]'));
    expect(canonicalType('[float, option<float>]')).not.toBe(canonicalType('[float, float]'));
    expect(canonicalType('[float, option<float>]')).not.toBe(canonicalType('[option<float>, float]'));
  });

  test('a comma or bracket inside a quoted literal element is not a boundary', () => {
    expect(canonicalType("['a,b', option<int>]")).toBe("['a,b', int | none]");
  });

  test('an unknown shape is returned unchanged', () => {
    expect(canonicalType('[int, option<string>')).toBe('[int, option<string>');
    expect(canonicalType('option<string')).toBe('option<string');
    expect(canonicalType("'open | string")).toBe("'open | string");
    expect(canonicalType('')).toBe('');
  });
});

describe('canonicalExpression', () => {
  test('the server readback of VALUE IF gains parentheses and single quotes', () => {
    const emitted = "IF $value THEN $value ELSE 'q' END";
    const readback = "(IF $value THEN $value ELSE 'q' END)";
    expect(canonicalExpression(readback)).toBe(canonicalExpression(emitted));
    expect(canonicalExpression(readback)).toBe(emitted);
  });

  test('repeated outer parentheses are stripped, inner ones are kept', () => {
    expect(canonicalExpression('((a + b))')).toBe('a + b');
    expect(canonicalExpression('(a) + (b)')).toBe('(a) + (b)');
  });

  test('99.99 and 99.99f are one form', () => {
    expect(canonicalExpression('99.99f')).toBe(canonicalExpression('99.99'));
    expect(canonicalExpression('-1.5f')).toBe('-1.5');
  });

  test('99.99 and 99.98 stay different', () => {
    expect(canonicalExpression('99.99')).not.toBe(canonicalExpression('99.98'));
  });

  test('a plain double-quoted string reads with single quotes', () => {
    expect(canonicalExpression('"x"')).toBe("'x'");
    expect(canonicalExpression('"it\'s"')).toBe('"it\'s"');
  });

  test('a quoted parenthesis does not count as a bracket', () => {
    expect(canonicalExpression("('(')")).toBe("'('");
  });

  test('an unknown shape is returned unchanged', () => {
    expect(canonicalExpression('(a + b')).toBe('(a + b');
    expect(canonicalExpression("'open")).toBe("'open");
  });

  test("an assert survives the server's rendering", () => {
    expect(canonicalExpression("$value != 'z'")).toBe("$value != 'z'");
  });
});

describe('buildFieldModel', () => {
  test('a computed expression is carried, and a changed one is a different model', () => {
    const a = buildFieldModel({ path: ['t'], kind: 'datetime', computed: 'time::now()' });
    expect(a.computed).toBe('time::now()');
    expect(buildFieldModel({ path: ['t'], kind: 'datetime', computed: 'time::now() + 1d' })).not.toEqual(a);
    expect(buildFieldModel({ path: ['t'], kind: 'datetime' })).not.toEqual(a);
  });

  test('a bare field has only path and kind, no null keys', () => {
    const model = buildFieldModel({ path: ['plain'], kind: 'string' });
    expect(Object.keys(model).sort()).toEqual(['kind', 'path']);
  });

  test('null inputs are omitted, not carried', () => {
    const model = buildFieldModel({
      path: ['a'],
      kind: 'string',
      default: null,
      defaultAlways: null,
      value: null,
      assert: null,
      readonly: null,
      flexible: null,
    });
    expect(Object.keys(model).sort()).toEqual(['kind', 'path']);
  });

  test('a decimal default, an option type and a hostile name compare equal across both sides', () => {
    const live = buildFieldModel({ path: ['é'], kind: 'none | decimal', default: '99.99f' });
    const desired = buildFieldModel({ path: ['é'], kind: 'option<decimal>', default: '99.99' });
    expect(live).toEqual(desired);
  });

  test('DEFAULT and DEFAULT ALWAYS stay different', () => {
    const plain = buildFieldModel({ path: ['a'], kind: 'string', default: "'x'" });
    const always = buildFieldModel({ path: ['a'], kind: 'string', default: "'x'", defaultAlways: true });
    expect(plain).not.toEqual(always);
    expect(always.defaultAlways).toBe(true);
    expect('defaultAlways' in plain).toBe(false);
  });

  test('every optional key is carried canonicalised when present', () => {
    const model = buildFieldModel({
      path: ['ob', { element: true }],
      kind: 'option<string>',
      default: "'x'",
      defaultAlways: true,
      value: "(IF $value THEN $value ELSE 'q' END)",
      assert: "$value != 'z'",
      readonly: true,
      flexible: true,
    });
    expect(model).toEqual({
      path: ['ob', { element: true }],
      kind: 'none | string',
      default: "'x'",
      defaultAlways: true,
      value: "IF $value THEN $value ELSE 'q' END",
      assert: "$value != 'z'",
      readonly: true,
      flexible: true,
    });
  });

  test('a default_always without a default is dropped', () => {
    expect('defaultAlways' in buildFieldModel({ path: ['a'], kind: 'string', defaultAlways: true })).toBe(false);
  });
});

describe('acceptsNone', () => {
  test('a type with none or any as a member is optional', () => {
    expect(acceptsNone('none | string')).toBe(true);
    expect(acceptsNone('option<string>')).toBe(true);
    expect(acceptsNone('any')).toBe(true);
  });

  test('a required type is not, including a tuple or array that holds an optional element', () => {
    expect(acceptsNone('string')).toBe(false);
    expect(acceptsNone('string | null')).toBe(false);
    expect(acceptsNone('[float, option<float>]')).toBe(false);
    expect(acceptsNone('array<option<string>>')).toBe(false);
  });
});
