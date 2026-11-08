/**
 * Type checks for the operands of a where filter. A filter value is held to the rules a create applies to
 * the same field, so a mistyped operand is refused here instead of being compared by the database, where
 * a string would be cast against a number and match or miss rows the caller never meant.
 */

import type { FieldMetadata, ModelMetadata } from '../../types';
import { isObject } from '../../utils/type-utils';
import { isOperatorObject } from '../filters/condition-builder';
import { isRegisteredOperator } from '../filters/registry';
import { prepareOperand, type OperandIssue } from '../filters/operand';
import { validateFieldInput } from './data-validator';

function isPlainObject(value: unknown): boolean {
  if (!isObject(value)) return false;
  const proto = Object.getPrototypeOf(value);

  return proto === Object.prototype || proto === null;
}

/**
 * Check every operand of one field's filter (an operator object, an array or a shorthand value) against
 * the field's type with the rules create uses. Fields that are objects, tuples or relations are checked
 * structurally by the caller; their leaves come back through here. Key problems of a non-operator object
 * are reported by the caller, so such an object is skipped.
 */
export function operandIssues(
  field: FieldMetadata,
  filter: unknown,
  path: string,
  label: string,
  model: ModelMetadata,
): OperandIssue[] {
  if (field.type === 'relation' || filter === undefined) return [];

  if (field.type === 'object' || field.type === 'tuple') {
    // A plain object holds sub-field or element conditions, which the caller walks
    if (filter === null || isPlainObject(filter)) return [];

    return validateFieldInput({ ...field, isRequired: false }, filter, model, label)
      .slice(0, 1)
      .map((e) => ({ path, message: e.message }));
  }

  if (isOperatorObject(filter)) {
    const issues: OperandIssue[] = [];
    for (const [op, value] of Object.entries(filter)) {
      // An unregistered operator is reported by the caller as an unknown operator
      if (value === undefined || !isRegisteredOperator(op)) continue;
      issues.push(...(prepareOperand(field, op, value, model, `${path}.${op}`, label).issues ?? []));
    }

    return issues;
  }

  // An object that is not an operator shape holds keys the caller reports as unknown operators; {} names no
  // operator and constrains nothing
  if (isPlainObject(filter)) return [];

  return prepareOperand(field, 'eq', filter, model, path, label).issues ?? [];
}
