/**
 * The one path a where operand takes. The operator's registry entry says what shape the operand has; the
 * operand is split into single values and each runs through create's own validate and transform functions,
 * so a filter refuses what create refuses and compares against what create stores.
 */

import type { FieldMetadata, ModelMetadata } from '../../types';
import { escapeControl } from '../../utils/safe-text';
import { isNone } from '../../utils/none';
import { OMIT_FIELD, transformFieldInput } from '../transformers/data-transformer';
import { validateFieldInput } from '../validators/data-validator';
import { getOperatorEntry } from './registry';

export interface OperandIssue {
  path: string;
  message: string;
}

export type PreparedOperand =
  | { readonly value: unknown; readonly issues?: undefined }
  | { readonly issues: OperandIssue[] };

function describe(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';

  return `a ${typeof value}`;
}

/** The field one element of an array field is checked and converted as */
function elementOf(field: FieldMetadata): FieldMetadata {
  return field.isArray ? { ...field, isArray: false, isSet: false } : field;
}

/** One value, held to the field exactly as create holds a value written to it */
function prepareUnit(
  field: FieldMetadata,
  value: unknown,
  model: ModelMetadata,
  path: string,
  label: string,
): PreparedOperand {
  if (value === undefined) return { value };
  if (isNone(value))
    return {
      issues: [{ path, message: `Field "${label}": a NONE operand matches nothing, use isNone: true instead` }],
    };

  // An optional field never holds null, but comparing it to null is a harmless no-match, as it always was
  if (value === null) {
    if (field.isNullable || !field.isRequired || field.type === 'any') return { value };

    return {
      issues: [{ path, message: `Field "${label}" is required and not @nullable, so it cannot be compared to null` }],
    };
  }

  const unit = { ...field, isRequired: false };
  const [first] = validateFieldInput(unit, value, model, label);
  if (first) return { issues: [{ path, message: first.message }] };

  try {
    const converted = transformFieldInput(unit, value, model, 'create');

    return { value: converted === OMIT_FIELD ? undefined : converted };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    return {
      issues: [
        {
          path,
          message: `Field "${label}" is ${field.type} and the operand is not a valid ${field.type}: ${escapeControl(reason)}`,
        },
      ],
    };
  }
}

function prepareList(
  field: FieldMetadata,
  value: unknown,
  model: ModelMetadata,
  path: string,
  label: string,
): PreparedOperand {
  if (!Array.isArray(value))
    return {
      issues: [{ path, message: `Field "${label}" expects an array for this operator, got ${describe(value)}` }],
    };

  const issues: OperandIssue[] = [];
  const converted: unknown[] = [];
  for (const [i, item] of value.entries()) {
    const prepared = prepareUnit(field, item, model, `${path}[${i}]`, `${label}[${i}]`);
    if (prepared.issues) issues.push(...prepared.issues);
    else converted.push(prepared.value);
  }

  return issues.length ? { issues } : { value: converted };
}

/**
 * Check one operator's operand against the field and convert it to what create would store.
 * `path` locates the operand in the filter, `label` names the field in a refusal.
 */
export function prepareOperand(
  field: FieldMetadata,
  op: string,
  value: unknown,
  model: ModelMetadata,
  path: string,
  label: string,
): PreparedOperand {
  const entry = getOperatorEntry(op);
  if (!entry) return { issues: [{ path, message: `Unknown operator: ${escapeControl(op)}` }] };

  if (!entry.kinds(field)) {
    const kind = `${field.type}${field.isArray ? '[]' : ''}`;

    return { issues: [{ path, message: `Field "${label}" is ${kind} and does not take the ${op} operator` }] };
  }

  // A relation is virtual and holds no value of its own; the nested builders resolve it before this point
  if (field.type === 'relation') return { value };

  switch (entry.operand) {
    case 'flag':
      return typeof value === 'boolean'
        ? { value }
        : { issues: [{ path, message: `Field "${label}": ${op} expects a boolean, got ${describe(value)}` }] };

    case 'text':
      return typeof value === 'string'
        ? { value }
        : { issues: [{ path, message: `Field "${label}": ${op} expects a string, got ${describe(value)}` }] };

    case 'value':
      return prepareUnit(field, value, model, path, label);

    case 'element':
      return prepareUnit(elementOf(field), value, model, path, label);

    case 'valueList':
      return prepareList(field, value, model, path, label);

    case 'elementList':
      return prepareList(elementOf(field), value, model, path, label);

    case 'pair': {
      // The handler reads exactly a minimum and a maximum; a missing bound would compare to NONE
      if (Array.isArray(value) && value.length !== 2)
        return {
          issues: [{ path, message: `Field "${label}": between expects exactly two bounds, got ${value.length}` }],
        };

      return prepareList(field, value, model, path, label);
    }
  }
}
