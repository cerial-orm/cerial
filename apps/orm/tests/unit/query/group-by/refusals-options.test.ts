import { describe, expect, test } from 'bun:test';
import { problems } from './helpers';

const by = { status: true };

describe('groupBy refuses options', () => {
  test.each(['select', 'include', 'compute', 'unset', 'return'])(
    '%s returns records, which groupBy does not',
    (key) => {
      expect(problems({ by, [key]: {} })).toEqual([
        `groupBy does not take '${key}' — it returns one row per group, not records`,
      ]);
    },
  );

  test('having does not exist in this release', () => {
    expect(problems({ by, having: { _count: { _all: { gt: 1 } } } })).toEqual([
      "groupBy has no 'having' — filter the groups in code, or use where to filter the rows before grouping",
    ]);
  });

  test('an unknown option', () => {
    expect(problems({ by, orderby: {} })).toEqual(["Unknown groupBy option 'orderby'"]);
  });

  test('a hostile option name is named in the message, not executed', () => {
    expect(problems({ by, 'x; REMOVE TABLE order': 1 })[0]).toBe("Unknown groupBy option 'x; REMOVE TABLE order'");
  });
});

describe('groupBy where and paging', () => {
  test('a where that is not an object', () => {
    expect(problems({ by, where: 'x' })).toEqual(['where must be an object']);
  });

  test('a where on an unknown field is refused through the where validator', () => {
    const [message] = problems({ by, where: { nope: 1 } });
    expect(message).toContain('nope');
  });

  test('a valid where passes', () => {
    expect(problems({ by, where: { qty: { gt: 1 } } })).toEqual([]);
  });

  test('limit and offset must be non-negative safe integers', () => {
    expect(problems({ by, limit: -1 })).toEqual(['limit must be a non-negative integer, got -1']);
    expect(problems({ by, offset: 1.5 })).toEqual(['offset must be a non-negative integer, got 1.5']);
    expect(problems({ by, limit: '5' })).toEqual(['limit must be a non-negative integer, got 5']);
    expect(problems({ by, limit: 0, offset: 0 })).toEqual([]);
  });
});
