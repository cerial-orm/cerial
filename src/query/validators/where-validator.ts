/**
 * WHERE clause validator
 */

import type { ModelMetadata, WhereClause } from '../../types';
import { isObject } from '../../utils/type-utils';
import { isRegisteredOperator } from '../filters/registry';

/** Validation error */
export interface ValidationError {
  path: string;
  message: string;
}

/** Validation result */
export interface WhereValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Validate a single field filter */
export function validateFieldFilter(
  fieldName: string,
  filter: unknown,
  model: ModelMetadata,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check if field exists in model
  const field = model.fields.find((f) => f.name === fieldName);
  if (!field) {
    errors.push({ path, message: `Unknown field: ${fieldName}` });
    return errors;
  }

  // If filter is an object, validate operators
  if (isObject(filter)) {
    // For relation fields, the filter object contains nested field conditions, not operators
    // e.g., profile: { bio: { contains: 'x' } } - bio is a field, not an operator
    if (field.type === 'relation') {
      // Skip detailed validation for nested relation conditions
      // The nested-condition-builder will handle this at query build time
      return errors;
    }

    for (const [op, _value] of Object.entries(filter)) {
      if (!isRegisteredOperator(op)) {
        errors.push({ path: `${path}.${op}`, message: `Unknown operator: ${op}` });
      }
    }
  }

  return errors;
}

/** Validate a where clause recursively */
export function validateWhereClause(
  where: WhereClause,
  model: ModelMetadata,
  path: string = 'where',
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    // Handle logical operators
    if (key === 'AND' || key === 'OR') {
      if (!Array.isArray(value)) {
        errors.push({ path: `${path}.${key}`, message: `${key} must be an array` });
        continue;
      }

      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (isObject(item)) {
          errors.push(...validateWhereClause(item as WhereClause, model, `${path}.${key}[${i}]`));
        }
      }
      continue;
    }

    if (key === 'NOT') {
      if (!isObject(value)) {
        errors.push({ path: `${path}.NOT`, message: 'NOT must be an object' });
        continue;
      }
      errors.push(...validateWhereClause(value as WhereClause, model, `${path}.NOT`));
      continue;
    }

    // Validate field filter
    errors.push(...validateFieldFilter(key, value, model, `${path}.${key}`));
  }

  return errors;
}

/** Validate a where clause and return result */
export function validateWhere(where: WhereClause | undefined, model: ModelMetadata): WhereValidationResult {
  if (!where) {
    return { valid: true, errors: [] };
  }

  const errors = validateWhereClause(where, model);
  return {
    valid: errors.length === 0,
    errors,
  };
}
