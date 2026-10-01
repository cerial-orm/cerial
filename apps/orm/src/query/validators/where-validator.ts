/**
 * WHERE clause validator
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { FieldMetadata, ModelMetadata, TupleFieldMetadata, WhereClause } from '../../types';
import { CerialBytes } from '../../utils/cerial-bytes';
import { CerialDecimal } from '../../utils/cerial-decimal';
import { CerialDuration } from '../../utils/cerial-duration';
import { CerialGeometry } from '../../utils/cerial-geometry';
import { CerialId } from '../../utils/cerial-id';
import { CerialUuid } from '../../utils/cerial-uuid';
import { isObject } from '../../utils/type-utils';
import { validateTypedRecordId } from '../../utils/validation-utils';
import { isOperatorObject, resolveTupleElementKey } from '../filters/condition-builder';
import { isRegisteredOperator } from '../filters/registry';

function isDirectValue(value: unknown): boolean {
  return (
    CerialId.is(value) ||
    value instanceof RecordId ||
    value instanceof StringRecordId ||
    CerialUuid.is(value) ||
    CerialDuration.is(value) ||
    CerialDecimal.is(value) ||
    CerialBytes.is(value) ||
    value instanceof Uint8Array ||
    CerialGeometry.is(value)
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

const QUANTIFIERS = ['some', 'every', 'none'];
const LOGICAL_KEYS = ['AND', 'OR', 'NOT'];

function unknownSubField(path: string, fieldPath: string, model: ModelMetadata): ValidationError {
  return {
    path,
    message: `Unknown field '${fieldPath}' on model ${model.name} — check the field name against the schema`,
  };
}

/** Validate the keys of an object field's filter. @flexible objects accept any undeclared sub-key. */
function validateObjectFilter(
  filter: Record<string, unknown>,
  fields: FieldMetadata[],
  isFlexible: boolean | undefined,
  isArray: boolean | undefined,
  model: ModelMetadata,
  path: string,
  fieldPath: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (isArray) {
      if (QUANTIFIERS.includes(key)) {
        if (isObject(value))
          errors.push(...validateObjectFilter(value, fields, isFlexible, false, model, `${path}.${key}`, fieldPath));
      } else {
        errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, model));
      }
      continue;
    }

    if (LOGICAL_KEYS.includes(key)) {
      for (const item of key === 'NOT' ? [value] : Array.isArray(value) ? value : []) {
        if (isObject(item))
          errors.push(...validateObjectFilter(item, fields, isFlexible, false, model, `${path}.${key}`, fieldPath));
      }
      continue;
    }

    const subField = fields.find((f) => f.name === key);
    const subPath = `${path}.${key}`;
    const subFieldPath = `${fieldPath}.${key}`;

    if (!subField) {
      if (!isFlexible) errors.push(unknownSubField(subPath, subFieldPath, model));
      continue;
    }
    if (!isObject(value) || isDirectValue(value) || isOperatorObject(value)) continue;

    if (subField.type === 'object' && subField.objectInfo)
      errors.push(
        ...validateObjectFilter(
          value,
          subField.objectInfo.fields,
          subField.isFlexible,
          subField.isArray,
          model,
          subPath,
          subFieldPath,
        ),
      );
  }

  return errors;
}

/** Validate the element keys (by name or index) of a tuple field's filter. */
function validateTupleFilter(
  filter: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
  isArray: boolean | undefined,
  model: ModelMetadata,
  path: string,
  fieldPath: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [key, value] of Object.entries(filter)) {
    if (value === undefined) continue;

    if (isArray) {
      if (QUANTIFIERS.includes(key)) {
        if (isObject(value))
          errors.push(...validateTupleFilter(value, tupleInfo, false, model, `${path}.${key}`, fieldPath));
      } else {
        errors.push(unknownSubField(`${path}.${key}`, `${fieldPath}.${key}`, model));
      }
      continue;
    }

    const subPath = `${path}.${key}`;
    const subFieldPath = `${fieldPath}.${key}`;
    const element = resolveTupleElementKey(key, tupleInfo)?.syntheticField;

    if (!element) {
      errors.push(unknownSubField(subPath, subFieldPath, model));
      continue;
    }
    if (!isObject(value) || isDirectValue(value) || isOperatorObject(value)) continue;

    if (element.type === 'object' && element.objectInfo)
      errors.push(
        ...validateObjectFilter(value, element.objectInfo.fields, false, false, model, subPath, subFieldPath),
      );
    else if (element.type === 'tuple' && element.tupleInfo)
      errors.push(...validateTupleFilter(value, element.tupleInfo, false, model, subPath, subFieldPath));
  }

  return errors;
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

  // For record fields with typed IDs, validate direct values against expected types
  if (field.type === 'record' && field.recordIdTypes?.length) {
    if (!isObject(filter)) {
      if (!validateTypedRecordId(filter, field.recordIdTypes)) {
        errors.push({
          path,
          message: `${fieldName} must be a valid ${field.recordIdTypes.join(' | ')} record ID`,
        });
      }

      return errors;
    }

    if (!isDirectValue(filter) && !isOperatorObject(filter)) {
      const hasObjectOrTupleIdType = field.recordIdTypes!.some(
        (t) => !['int', 'float', 'number', 'string', 'uuid'].includes(t),
      );
      if (hasObjectOrTupleIdType) return errors;
    }
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
    if (field.type === 'object' && field.objectInfo) {
      return validateObjectFilter(
        filter,
        field.objectInfo.fields,
        field.isFlexible,
        field.isArray,
        model,
        path,
        fieldName,
      );
    }

    // For tuple fields, the filter object contains element conditions by name/index
    // e.g., location: { lat: { gt: 1.0 } } or location: { 0: { gt: 1.0 } }
    if (field.type === 'tuple' && field.tupleInfo) {
      return validateTupleFilter(filter, field.tupleInfo, field.isArray, model, path, fieldName);
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
