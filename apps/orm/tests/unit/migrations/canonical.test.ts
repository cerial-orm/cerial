import { describe, expect, test } from 'bun:test';
import { buildFieldModel, canonicalExpression, canonicalType } from '../../../src/migrations';

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

  test('an unknown shape is returned unchanged', () => {
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
