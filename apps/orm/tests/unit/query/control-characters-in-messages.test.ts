/**
 * Unit Tests: a caller-supplied key reaches an error message with control characters rendered visibly
 *
 * A key taken from a request body can hold a line feed (a forged log line) or ESC and BEL (a terminal
 * escape sequence). The message shows them as escapes; an ordinary key reads as before.
 */

import { describe, expect, test } from 'bun:test';
import { assertKnownOptionKeys } from '../../../src/client/model/option-keys';
import { buildRelationSelectFields } from '../../../src/query/builders/relation-builder';
import { validateCreateData, validateRelationValue } from '../../../src/query/validators/data-validator';
import { validateOrderBy, validateSelect } from '../../../src/query/validators/select-validator';
import { validateWhere } from '../../../src/query/validators/where-validator';
import { escapeControl } from '../../../src/utils/safe-text';
import { owner, place, placeRegistry } from './where-validation-helpers';

const HOSTILE = 'zz\n2026-11-08 INFO login ok\u001b[2J\u001b]52;c;cHduZWQ=\u0007';
// Every C0 and C1 control character except the tab, plus the Unicode line and paragraph separators
const RAW_CONTROL = /(?!\t)[\p{Cc}\p{Zl}\p{Zp}]/u;

function expectEscaped(message: string): void {
  expect(message).not.toMatch(RAW_CONTROL);
  expect(message).toContain('\\n');
  expect(message).toContain('\\u{1b}');
  expect(message).toContain('\\u{7}');
}

describe('escapeControl', () => {
  test('leaves a normal key and a tab unchanged', () => {
    expect(escapeControl('nmae')).toBe('nmae');
    expect(escapeControl('a\tb')).toBe('a\tb');
  });

  test('renders LF, CR, ESC, BEL, a C1 character and the line separators', () => {
    expect(escapeControl('a\nb\rc\u001bd\u0007e\u009bf g ')).toBe(
      'a\\nb\\rc\\u{1b}d\\u{7}e\\u{9b}f\\u{2028}g\\u{2029}',
    );
  });
});

describe('control characters in refusal messages', () => {
  test('a where key', () => {
    const messages = validateWhere({ [HOSTILE]: 'x' }, place, placeRegistry).errors.map((e) => e.message);

    expect(messages).toHaveLength(1);
    expectEscaped(messages[0]!);
  });

  test('a where operator', () => {
    const messages = validateWhere({ name: { [HOSTILE]: 'x' } }, place, placeRegistry).errors.map((e) => e.message);

    expect(messages).toHaveLength(1);
    expectEscaped(messages[0]!);
  });

  test('a data key', () => {
    const messages = validateCreateData({ [HOSTILE]: 'x' }, place).errors.map((e) => e.message);

    expect(messages.length).toBeGreaterThan(0);
    expectEscaped(messages[0]!);
  });

  test('a select key', () => {
    const messages = validateSelect({ [HOSTILE]: true }, place).map((e) => e.message);

    expect(messages).toHaveLength(1);
    expectEscaped(messages[0]!);
  });

  test('an orderBy key', () => {
    const messages = validateOrderBy({ [HOSTILE]: 'asc' }, place).map((e) => e.message);

    expect(messages).toHaveLength(1);
    expectEscaped(messages[0]!);
  });

  test('an option key', () => {
    expect.assertions(4);
    try {
      assertKnownOptionKeys('findMany', { [HOSTILE]: 1 }, 'Place');
    } catch (error) {
      expectEscaped((error as Error).message);
    }
  });
});

describe('ordinary keys read as before', () => {
  test('an unknown where key', () => {
    expect(validateWhere({ nmae: 'x' }, place, placeRegistry).errors.map((e) => e.message)).toEqual([
      "Unknown field 'nmae' on model Place — check the field name against the schema",
    ]);
  });

  test('an unknown option key', () => {
    expect(() => assertKnownOptionKeys('findMany', { wehre: {} }, 'Place')).toThrow(
      /^findMany does not take the option 'wehre'; it takes /,
    );
  });
});

describe('control characters in relation-value refusals', () => {
  const places = owner.fields.find((f) => f.name === 'places');

  test('a nested-operation key and the field it names', () => {
    expect(places).toBeDefined();
    const bad = validateRelationValue(places!, { [HOSTILE]: ['a1'] }, owner);

    expect(bad).not.toBeNull();
    expectEscaped(bad!.message);
    expect(bad!.field).not.toMatch(RAW_CONTROL);
  });

  test('a relation name with a control character', () => {
    const bad = validateRelationValue(places!, { x: 1 }, owner, 'a\nb');

    expect(bad!.field).toBe('a\\nb');
    expect(bad!.message).not.toMatch(RAW_CONTROL);
  });
});

describe('control characters in an unknown include key', () => {
  test('the message and the field property', () => {
    expect.assertions(5);
    try {
      buildRelationSelectFields({ [HOSTILE]: true }, owner, placeRegistry);
    } catch (error) {
      expectEscaped((error as Error).message);
      expect((error as { field?: string }).field).not.toMatch(RAW_CONTROL);
    }
  });
});
