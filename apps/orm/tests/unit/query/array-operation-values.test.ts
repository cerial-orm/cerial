/**
 * The values of an array update operation ({ push }, { set }, { unset }) on a primitive array are
 * checked against the element type exactly as a create checks an element.
 */

import { describe, expect, test } from 'bun:test';
import { validateUpdateData } from '../../../src/query/validators/data-validator';
import { field, model } from './helpers';

const m = model('Thing', [
  field({ name: 'nums', type: 'int', isArray: true, isRequired: false }),
  field({ name: 'tags', type: 'string', isArray: true, isRequired: false }),
  field({ name: 'dates', type: 'date', isArray: true, isRequired: false }),
]);

const errorsOf = (data: Record<string, unknown>) => validateUpdateData(data, m).errors.map((e) => e.message);

describe('array operation values', () => {
  test.each([
    ['unset a fraction', { nums: { unset: 2.7 } }, /nums\[0\] must be of type int/],
    ['unset a fraction in a list', { nums: { unset: [1, 2.7] } }, /nums\[1\] must be of type int/],
    ['push a fraction', { nums: { push: 1.5 } }, /nums\[0\] must be of type int/],
    ['push a list holding a fraction', { nums: { push: [1, 2.5] } }, /nums\[1\] must be of type int/],
    ['set a list holding a fraction', { nums: { set: [1.5, 2] } }, /nums\[0\] must be of type int/],
    ['push a number to strings', { tags: { push: 5 } }, /tags\[0\] must be of type string/],
    ['push an object to strings', { tags: { push: { a: 1 } } }, /tags\[0\] must be of type string/],
    ['push a bad date', { dates: { push: 'not a date' } }, /dates\[0\] must be of type date/],
    ['push a string to ints', { nums: { push: '5' } }, /nums\[0\] must be of type int/],
  ])('refuses %s', (_name, data, message) => {
    expect(errorsOf(data).join(' ')).toMatch(message);
  });

  test.each([
    { nums: { push: 3 } },
    { nums: { push: [1, 2] } },
    { nums: { set: [1, 2, 3] } },
    { nums: { unset: 2 } },
    { nums: { unset: [1, 2] } },
    { nums: { push: 1, unset: 2 } },
    { tags: { push: 'a' } },
    { dates: { push: '2020-01-01' } },
    { dates: { push: new Date() } },
    { tags: [] },
  ])('accepts %j', (data) => {
    expect(errorsOf(data)).toEqual([]);
  });
});
