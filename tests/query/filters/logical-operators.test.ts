/**
 * Logical operators tests
 */

import { describe, expect, test } from 'bun:test';
import type { QueryFragment } from '../../../src/query/compile';
import { handleAnd, handleNot, handleOr } from '../../../src/query/filters/logical-operators';

describe('logical operators', () => {
  test('handleAnd combines conditions with AND', () => {
    const conditions: QueryFragment[] = [
      { text: 'age > 18', vars: { age_gt_0: 18 } },
      { text: 'name = "John"', vars: { name_eq_1: 'John' } },
    ];

    const result = handleAnd(conditions);

    expect(result.text).toContain('AND');
    expect(result.text).toContain('age > 18');
    expect(result.text).toContain('name = "John"');
    expect(result.vars['age_gt_0']).toBe(18);
    expect(result.vars['name_eq_1']).toBe('John');
  });

  test('handleOr combines conditions with OR', () => {
    const conditions: QueryFragment[] = [
      { text: 'status = "active"', vars: { status_eq_0: 'active' } },
      { text: 'status = "pending"', vars: { status_eq_1: 'pending' } },
    ];

    const result = handleOr(conditions);

    expect(result.text).toContain('OR');
    expect(result.text).toContain('status = "active"');
    expect(result.text).toContain('status = "pending"');
  });

  test('handleNot negates a condition', () => {
    const condition: QueryFragment = {
      text: 'status = "deleted"',
      vars: { status_eq_0: 'deleted' },
    };

    const result = handleNot(condition);

    expect(result.text).toContain('NOT');
    expect(result.text).toContain('status = "deleted"');
  });

  test('handleAnd returns empty for empty array', () => {
    const result = handleAnd([]);
    expect(result.text).toBe('');
  });

  test('handleAnd returns single condition without wrapping', () => {
    const conditions: QueryFragment[] = [{ text: 'age > 18', vars: { age_gt_0: 18 } }];

    const result = handleAnd(conditions);
    expect(result.text).toBe('age > 18');
  });
});
