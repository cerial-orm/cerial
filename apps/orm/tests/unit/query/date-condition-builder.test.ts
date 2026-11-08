/**
 * Unit Tests: Date where values
 *
 * A date string is bound as a Date, never as the string, so the database compares datetimes.
 */

import { describe, expect, test } from 'bun:test';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { elem, field, model, tupleInfo } from './helpers';

const eventModel = model('Event', [
  field({ name: 'id', type: 'record', isId: true }),
  field({ name: 'when', type: 'date' }),
  field({ name: 'dates', type: 'date', isArray: true }),
  field({ name: 'label', type: 'string' }),
  field({
    name: 'info',
    type: 'object',
    objectInfo: { objectName: 'Info', fields: [field({ name: 'at', type: 'date' })] },
  }),
  field({ name: 'span', type: 'tuple', tupleInfo: tupleInfo('Span', [elem({ index: 0, type: 'date' })]) }),
]);

function varsOf(where: Record<string, unknown>): unknown[] {
  const result = buildConditions(createCompileContext(), where, eventModel);

  return Object.values(result.vars);
}

const iso = '2021-06-01';

describe('date where operands', () => {
  test.each([
    ['shorthand', { when: iso }],
    ['eq', { when: { eq: iso } }],
    ['neq', { when: { neq: iso } }],
    ['gt', { when: { gt: iso } }],
    ['gte', { when: { gte: iso } }],
    ['lt', { when: { lt: iso } }],
    ['lte', { when: { lte: iso } }],
    ['object sub-field', { info: { at: { gte: iso } } }],
    ['tuple element', { span: { 0: { gte: iso } } }],
  ])('%s binds a Date', (_name, where) => {
    const vars = varsOf(where);
    expect(vars).toHaveLength(1);
    expect(vars[0]).toBeInstanceOf(Date);
    expect((vars[0] as Date).getTime()).toBe(new Date(iso).getTime());
  });

  test.each([
    ['in', { when: { in: [iso, '2022-01-01'] } }],
    ['notIn', { when: { notIn: [iso, '2022-01-01'] } }],
    ['between', { when: { between: [iso, '2022-01-01'] } }],
    ['hasAny', { dates: { hasAny: [iso, '2022-01-01'] } }],
  ])('%s binds Dates for every member', (_name, where) => {
    const bound = varsOf(where).flat();
    expect(bound).toHaveLength(2);
    for (const v of bound) expect(v).toBeInstanceOf(Date);
  });

  test('a Date operand passes through and a string field is not converted', () => {
    const d = new Date(iso);
    expect(varsOf({ when: d })[0]).toBe(d);
    expect(varsOf({ label: iso })[0]).toBe(iso);
  });
});
