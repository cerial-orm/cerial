/**
 * WHERE clause validator
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { ModelMetadata, WhereClause } from '../../types';
import { CerialBytes } from '../../utils/cerial-bytes';
import { CerialDecimal } from '../../utils/cerial-decimal';
import { CerialId } from '../../utils/cerial-id';
import { CerialDuration } from '../../utils/cerial-duration';
import { CerialUuid } from '../../utils/cerial-uuid';
import { isObject } from '../../utils/type-utils';
import { isRegisteredOperator } from '../filters/registry';

/** Check if a value is a direct value (not an operator object) — wrapper classes, RecordId types */
function isDirectValue(value: unknown): boolean {
  return (
    CerialId.is(value) ||
    value instanceof RecordId ||
    value instanceof StringRecordId ||
    CerialUuid.is(value) ||
    CerialDuration.is(value) ||
    CerialDecimal.is(value) ||
    CerialBytes.is(value) ||
    value instanceof Uint8Array
  );
}

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

/** Check if a key is a composite unique directive name */
function isCompositeKeyName(key: string, model: ModelMetadata): boolean {
  return model.compositeDirectives?.some((d) => d.kind === 'unique' && d.name === key) ?? false;
}

/** Validate a single field filter */
export function validateFieldFilter(
  fieldName: string,
  filter: unknown,
  model: ModelMetadata,
  path: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Skip composite unique key names - they are expanded later by the query builder
  if (isCompositeKeyName(fieldName, model)) return errors;

  // Check if field exists in model
  const field = model.fields.find((f) => f.name === fieldName);
  if (!field) {
    errors.push({ path, message: `Unknown field: ${fieldName}` });
    return errors;
  }

  // If filter is an object, validate operators
  // But first check if it's a RecordIdInput type (CerialId, RecordId, StringRecordId)
  // which should be treated as direct values, not operator objects
  if (isObject(filter) && !isDirectValue(filter)) {
    // For relation fields, the filter object contains nested field conditions, not operators
    // e.g., profile: { bio: { contains: 'x' } } - bio is a field, not an operator
    if (field.type === 'relation') {
      // Skip detailed validation for nested relation conditions
      // The nested-condition-builder will handle this at query build time
      return errors;
    }

    // For object fields, the filter object contains sub-field conditions, not operators
    // e.g., address: { city: 'NYC' } - city is a sub-field, not an operator
    // For array object fields: locations: { some: { lat: { gt: 0 } } }
    if (field.type === 'object') {
      // Skip detailed validation — the condition-builder handles object field queries
      return errors;
    }

    // For tuple fields, the filter object contains element conditions by name/index
    // e.g., location: { lat: { gt: 1.0 } } or location: { 0: { gt: 1.0 } }
    if (field.type === 'tuple') {
      // Skip detailed validation — the condition-builder handles tuple field queries
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
