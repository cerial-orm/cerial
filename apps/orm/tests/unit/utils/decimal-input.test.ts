/**
 * A Decimal accepts a finite number, a CerialDecimal, or a string that parses in full. The SDK parser
 * turns anything else into 0, so the validators and the transformer must refuse it first.
 */

import { describe, expect, test } from 'bun:test';
import { Decimal } from 'surrealdb';
import { transformData } from '../../../src/query/transformers';
import { validateCreateData } from '../../../src/query/validators/data-validator';
import { validateWhere } from '../../../src/query/validators';
import { CerialDecimal, isValidDecimalInput } from '../../../src/utils/cerial-decimal';
import { validateFieldType } from '../../../src/utils/validation-utils';
import { field, model } from '../query/helpers';

const m = model('Price', [
  field({ name: 'amount', type: 'decimal', isRequired: false }),
  field({ name: 'list', type: 'decimal', isArray: true, isRequired: false }),
]);

const BAD = ['1,5', '12abc', '', 'NaN', 'Infinity', '-Infinity', ' 1', '1 ', '+1', '0x10', '1e', '--1', '1.5.2'];
const GOOD = ['1.5', '-0.25', '0', '10', '.5', '1.', '1e3', '1E-3', '-.5'];

describe('decimal input', () => {
  test.each(BAD)('refuses the string %j', (value) => {
    expect(isValidDecimalInput(value)).toBe(false);
    expect(validateFieldType(value, 'decimal')).toBe(false);
    expect(validateCreateData({ amount: value }, m).valid).toBe(false);
    expect(() => transformData({ amount: value }, m)).toThrow(/Invalid decimal/);
    expect(() => new CerialDecimal(value)).toThrow();
  });

  test.each([NaN, Infinity, -Infinity])('refuses the number %p', (value) => {
    expect(validateCreateData({ amount: value }, m).valid).toBe(false);
    expect(() => transformData({ amount: value }, m)).toThrow(/Invalid decimal/);
    expect(() => new CerialDecimal(value)).toThrow();
  });

  test('refuses a bad member of a decimal array, naming the index', () => {
    const { errors } = validateCreateData({ list: ['1', '12abc'] }, m);

    expect(errors[0]!.message).toContain('list[1]');
  });

  test.each([...GOOD, 1.5, -0.25, 0, CerialDecimal.from('2.5'), new Decimal('3')])('accepts %p', (value) => {
    expect(validateCreateData({ amount: value }, m).valid).toBe(true);
    expect(() => transformData({ amount: value }, m)).not.toThrow();
  });

  test('a valid string transforms to the same decimal', () => {
    const out = transformData({ amount: '-0.25' }, m).amount as Decimal;

    expect(out.toString()).toBe('-0.25');
  });

  test.each(BAD)('a where value %j is refused', (value) => {
    expect(validateWhere({ amount: value }, m).valid).toBe(false);
    expect(validateWhere({ amount: { eq: value } }, m).valid).toBe(false);
    expect(validateWhere({ amount: { in: ['1', value] } }, m).valid).toBe(false);
  });

  test.each([...GOOD, 1.5, CerialDecimal.from('2.5')])('a where value %p is accepted', (value) => {
    expect(validateWhere({ amount: value }, m).valid).toBe(true);
    expect(validateWhere({ amount: { gt: value } }, m).valid).toBe(true);
  });

  test('a null where value stays accepted for a nullable decimal', () => {
    const nullable = model('P', [field({ name: 'amount', type: 'decimal', isRequired: false, isNullable: true })]);

    expect(validateWhere({ amount: null }, nullable).valid).toBe(true);
  });
});
