/**
 * Validators for select, orderBy, limit and offset
 */

import type { FieldMetadata, ModelMetadata, TupleFieldMetadata } from '../../types';
import { isObject } from '../../utils/type-utils';
import { resolveElementBySelectKey } from '../builders/select-builder';

/** Validation error */
export interface SelectValidationError {
  path: string;
  message: string;
}

function unknownField(path: string, model: ModelMetadata): SelectValidationError {
  return {
    path,
    message: `Unknown field '${path}' on model ${model.name} — check the field name against the schema`,
  };
}

function validateObjectSelect(
  select: Record<string, unknown>,
  fields: FieldMetadata[],
  isFlexible: boolean | undefined,
  prefix: string,
  model: ModelMetadata,
): SelectValidationError[] {
  const errors: SelectValidationError[] = [];

  for (const [key, value] of Object.entries(select)) {
    const path = `${prefix}.${key}`;
    const subField = fields.find((f) => f.name === key);

    if (!subField) {
      if (!isFlexible) errors.push(unknownField(path, model));
      continue;
    }

    errors.push(...validateNestedSelect(value, subField, path, model));
  }

  return errors;
}

function validateTupleSelect(
  select: Record<string, unknown>,
  tupleInfo: TupleFieldMetadata,
  prefix: string,
  model: ModelMetadata,
): SelectValidationError[] {
  const errors: SelectValidationError[] = [];

  for (const [key, value] of Object.entries(select)) {
    const path = `${prefix}.${key}`;
    const element = resolveElementBySelectKey(key, tupleInfo.elements);

    if (!element) {
      errors.push(unknownField(path, model));
      continue;
    }
    if (!isObject(value)) continue;
    if (element.type === 'object' && element.objectInfo) {
      errors.push(...validateObjectSelect(value, element.objectInfo.fields, false, path, model));
    } else if (element.type === 'tuple' && element.tupleInfo) {
      errors.push(...validateTupleSelect(value, element.tupleInfo, path, model));
    }
  }

  return errors;
}

function validateNestedSelect(
  value: unknown,
  field: Pick<FieldMetadata, 'objectInfo' | 'tupleInfo' | 'isFlexible'>,
  path: string,
  model: ModelMetadata,
): SelectValidationError[] {
  if (!isObject(value)) return [];
  if (field.tupleInfo) return validateTupleSelect(value, field.tupleInfo, path, model);
  if (field.objectInfo) return validateObjectSelect(value, field.objectInfo.fields, field.isFlexible, path, model);

  return [];
}

/** Reject select keys (including object/tuple sub-keys) that the model does not define. @flexible objects accept any sub-key. */
export function validateSelect(select: object | undefined, model: ModelMetadata): SelectValidationError[] {
  if (!select) return [];
  const errors: SelectValidationError[] = [];

  for (const [key, value] of Object.entries(select)) {
    const field = model.fields.find((f) => f.name === key);

    if (!field) {
      errors.push(unknownField(key, model));
      continue;
    }

    errors.push(...validateNestedSelect(value, field, key, model));
  }

  return errors;
}

function validateOrderByLevel(
  orderBy: Record<string, unknown>,
  fields: FieldMetadata[],
  isFlexible: boolean | undefined,
  prefix: string,
  model: ModelMetadata,
): SelectValidationError[] {
  const errors: SelectValidationError[] = [];

  for (const [key, value] of Object.entries(orderBy)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const field = fields.find((f) => f.name === key);

    if (!field) {
      if (!isFlexible) errors.push(unknownField(path, model));
      continue;
    }

    if (value === undefined) continue;

    if (field.type === 'relation') {
      errors.push({
        path,
        message: `Cannot order by relation field '${path}' on model ${model.name} — relations are not orderable`,
      });
    } else if (isObject(value)) {
      if (field.type === 'object' && field.objectInfo) {
        errors.push(...validateOrderByLevel(value, field.objectInfo.fields, field.isFlexible, path, model));
      } else {
        errors.push({
          path,
          message: `Cannot order by a nested path under '${path}' on model ${model.name} — only object fields have sub-fields`,
        });
      }
    } else if (typeof value !== 'string' || !['asc', 'desc'].includes(value.toLowerCase())) {
      errors.push({
        path,
        message: `Order direction for '${path}' must be 'asc' or 'desc', got ${JSON.stringify(value)}`,
      });
    }
  }

  return errors;
}

/** Reject orderBy paths that are unknown or relations, and directions other than asc/desc. */
export function validateOrderBy(orderBy: object | undefined, model: ModelMetadata): SelectValidationError[] {
  if (!orderBy) return [];

  return validateOrderByLevel(orderBy as Record<string, unknown>, model.fields, false, '', model);
}

function validatePageValue(name: 'limit' | 'offset', value: unknown): SelectValidationError[] {
  if (value === undefined) return [];
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return [];

  return [{ path: name, message: `${name} must be a non-negative integer, got ${String(value)}` }];
}

/** Reject limit/offset values that are not non-negative safe integers. 0 is valid for both. */
export function validatePagination(limit: unknown, offset: unknown): SelectValidationError[] {
  return [...validatePageValue('limit', limit), ...validatePageValue('offset', offset)];
}
