/**
 * Type checks for the operands of a where filter. A filter value is held to the rules a create applies to
 * the same field, so a mistyped operand is refused here instead of being compared by the database, where
 * a string would be cast against a number and match or miss rows the caller never meant.
 */

import type { FieldMetadata } from '../../types';
import { CerialDecimal, isValidDecimalInput } from '../../utils/cerial-decimal';
import { isObject } from '../../utils/type-utils';
import { isOperatorObject } from '../filters/condition-builder';
import { validateFieldValue } from './data-validator';
import { isSizedNumberFieldType, sizedNumberError } from './sized-number-validator';

interface OperandIssue {
  path: string;
  message: string;
}

/** What an operand is checked against: a model field, an object sub-field or a tuple element. */
export type OperandField = Pick<
  FieldMetadata,
  'type' | 'isArray' | 'isNullable' | 'isRequired' | 'recordIdTypes' | 'literalInfo' | 'objectInfo' | 'tupleInfo'
>;

/** Operators whose operand is one value, and those whose operand is a list of them. */
const VALUE_OPERATORS = ['eq', 'neq', 'not', 'gt', 'gte', 'lt', 'lte'];
const ELEMENT_LIST_OPERATORS = ['hasAll', 'hasAny'];
const STRING_OPERATORS = ['contains', 'startsWith', 'endsWith'];
const FLAG_OPERATORS = ['isNull', 'isNone', 'isDefined', 'isEmpty'];

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';

  return typeof value === 'string' ? 'a string' : `a ${typeof value}`;
}

function isPlainObject(value: unknown): boolean {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

/** Why one value is not valid for the field (as an element, when `element` is set), or null. */
function valueMessage(field: OperandField, value: unknown, label: string, element: boolean): string | null {
  const type = field.type === 'email' ? 'string' : field.type;
  if (value === undefined) return null;

  // An optional field never holds null, but comparing it to null is a harmless no-match, as it always was
  if (value === null) {
    if (field.isNullable || !field.isRequired || type === 'any') return null;

    return `Field "${label}" is required and not @nullable, so it cannot be compared to null`;
  }

  if (!element && field.isArray) {
    if (!Array.isArray(value)) return `${label} must be an array`;
    for (const [i, item] of value.entries()) {
      const message = valueMessage(field, item, `${label}[${i}]`, true);
      if (message) return message;
    }

    return null;
  }

  // A partial email is a legitimate operand, so email is held to string
  if (type === 'decimal') {
    if (isValidDecimalInput(value) || CerialDecimal.is(value)) return null;

    return `Field "${label}" is Decimal and expects a finite number, a CerialDecimal or a decimal string, got ${String(value)}`;
  }

  if (isSizedNumberFieldType(type)) {
    const sized = sizedNumberError(type, label, value);
    if (sized) return sized;
  }

  const issue = validateFieldValue(label, value, {
    type,
    isRequired: false,
    isArray: false,
    isNullable: field.isNullable,
    recordIdTypes: field.recordIdTypes,
    literalInfo: field.literalInfo,
  });

  return issue?.message ?? null;
}

/** Check a list operand: it must be an array, and each member is held to the field's type. */
function listIssues(
  field: OperandField,
  value: unknown,
  path: string,
  label: string,
  element: boolean,
): OperandIssue[] {
  if (!Array.isArray(value))
    return [{ path, message: `${label} expects an array for this operator, got ${describe(value)}` }];

  return value.flatMap((item, i) => {
    const message = valueMessage(field, item, `${label}[${i}]`, element);

    return message ? [{ path: `${path}[${i}]`, message }] : [];
  });
}

/**
 * Check every operand of one field's filter (an operator object, an array or a shorthand value) against
 * the field's type with the rules create uses. Fields that are objects, tuples or relations are checked
 * structurally by the caller; their leaves come back through here. Key problems of a non-operator object
 * are reported by the caller, so such an object is skipped.
 */
export function operandIssues(field: OperandField, filter: unknown, path: string, label: string): OperandIssue[] {
  if (field.type === 'object' || field.type === 'tuple' || field.type === 'relation' || field.type === 'any') return [];
  if (filter === undefined) return [];

  if (isOperatorObject(filter)) {
    const issues: OperandIssue[] = [];
    for (const [op, value] of Object.entries(filter)) {
      if (value === undefined) continue;
      const opPath = `${path}.${op}`;
      const whole = (): OperandIssue[] => {
        const message = valueMessage(field, value, label, false);

        return message ? [{ path: opPath, message }] : [];
      };

      if (VALUE_OPERATORS.includes(op)) issues.push(...whole());
      else if (op === 'has') {
        const message = valueMessage(field, value, label, true);
        if (message) issues.push({ path: opPath, message });
      } else if (op === 'in' || op === 'notIn' || op === 'between')
        issues.push(...listIssues(field, value, opPath, label, false));
      else if (ELEMENT_LIST_OPERATORS.includes(op)) issues.push(...listIssues(field, value, opPath, label, true));
      else if (STRING_OPERATORS.includes(op)) {
        if (typeof value !== 'string')
          issues.push({ path: opPath, message: `Field "${label}": ${op} expects a string, got ${describe(value)}` });
      } else if (FLAG_OPERATORS.includes(op)) {
        if (typeof value !== 'boolean')
          issues.push({ path: opPath, message: `Field "${label}": ${op} expects a boolean, got ${describe(value)}` });
      }
    }

    return issues;
  }

  // An object that is not an operator shape holds keys the caller reports as unknown operators
  if (isPlainObject(filter) && Object.keys(filter as object).length) return [];
  // {} names no operator and constrains nothing
  if (isPlainObject(filter)) return [];

  const message = valueMessage(field, filter, label, false);

  return message ? [{ path, message }] : [];
}
