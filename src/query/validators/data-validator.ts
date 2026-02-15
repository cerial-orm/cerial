/**
 * Data validator - validates data for create/update operations
 */

import { Duration, RecordId, StringRecordId } from 'surrealdb';
import type { ModelMetadata, SchemaFieldType } from '../../types';
import { CerialId } from '../../utils/cerial-id';
import { isNone } from '../../utils/none';
import { isValidEmail, validateFieldType } from '../../utils/validation-utils';

/** Check if value is a RecordIdInput type (valid for ID/Record fields) */
function isRecordIdInput(value: unknown): boolean {
  return (
    CerialId.is(value) || value instanceof RecordId || value instanceof StringRecordId || typeof value === 'string'
  );
}

/** Validation error */
export interface DataValidationError {
  field: string;
  message: string;
}

/** Validation result */
export interface DataValidationResult {
  valid: boolean;
  errors: DataValidationError[];
}

/** Validate a single field value */
export function validateFieldValue(
  fieldName: string,
  value: unknown,
  fieldType: SchemaFieldType,
  isRequired: boolean,
  isArray?: boolean,
  isNullable?: boolean,
): DataValidationError | null {
  // NONE sentinel is always valid for optional fields (clear the field)
  if (isNone(value)) {
    if (isRequired) {
      return { field: fieldName, message: `${fieldName} is required and cannot be set to NONE` };
    }

    return null;
  }

  // Check null — only allowed on @nullable fields
  if (value === null) {
    if (isRequired && !isNullable) {
      return { field: fieldName, message: `${fieldName} is required` };
    }
    if (!isNullable) {
      return {
        field: fieldName,
        message: `${fieldName} is not nullable — use NONE to unset, or add @nullable to the schema`,
      };
    }

    return null;
  }

  // Check undefined (field omitted) — valid for optional or defaulted fields
  if (value === undefined) {
    if (isRequired) {
      return { field: fieldName, message: `${fieldName} is required` };
    }

    return null;
  }

  // Handle array fields
  if (isArray) {
    if (!Array.isArray(value)) {
      return { field: fieldName, message: `${fieldName} must be an array` };
    }
    // Validate each element in the array
    for (let i = 0; i < value.length; i++) {
      const element = value[i];
      if (!validateFieldType(element, fieldType)) {
        return { field: fieldName, message: `${fieldName}[${i}] must be of type ${fieldType}` };
      }
    }
    return null;
  }

  // Check type for non-array fields
  if (!validateFieldType(value, fieldType)) {
    return { field: fieldName, message: `${fieldName} must be of type ${fieldType}` };
  }

  // Special validation for email
  if (fieldType === 'email' && typeof value === 'string') {
    if (!isValidEmail(value)) {
      return { field: fieldName, message: `${fieldName} must be a valid email` };
    }
  }

  return null;
}

/** Validate data for create operation */
export function validateCreateData(
  data: Record<string, unknown>,
  model: ModelMetadata,
  nestedOps?: Map<string, unknown>,
): DataValidationResult {
  const errors: DataValidationError[] = [];

  // Build set of Record fields that will be satisfied by nested operations
  const fieldsFromNestedOps = new Set<string>();
  if (nestedOps) {
    for (const relationName of nestedOps.keys()) {
      // Find the relation field and its fieldRef (the Record field it populates)
      const relationField = model.fields.find((f) => f.name === relationName && f.type === 'relation');
      if (relationField?.relationInfo?.fieldRef) {
        fieldsFromNestedOps.add(relationField.relationInfo.fieldRef);
      }
    }
  }

  for (const field of model.fields) {
    const value = data[field.name];

    // Skip relation fields - they're virtual and don't exist in database
    if (field.type === 'relation') continue;

    // For id fields: if user provides a value, validate it; otherwise skip (auto-generated)
    if (field.isId) {
      if (value !== undefined && value !== null) {
        // Validate user-provided id (accepts RecordIdInput: string, CerialId, RecordId, StringRecordId)
        if (!isRecordIdInput(value)) {
          errors.push({ field: field.name, message: `${field.name} must be a valid record ID` });
        }
      }
      continue;
    }

    // Skip @now fields entirely (COMPUTED — not stored, never in user input)
    if (field.timestampDecorator === 'now') continue;

    // Skip @createdAt/@updatedAt fields when undefined (handled by database via DEFAULT/DEFAULT ALWAYS)
    if ((field.timestampDecorator === 'createdAt' || field.timestampDecorator === 'updatedAt') && value === undefined)
      continue;

    // Skip @uuid/@uuid4/@uuid7 fields when undefined (handled by database via DEFAULT)
    if (field.uuidDecorator && value === undefined) continue;

    // Skip fields with default value (if not provided)
    if (field.defaultValue !== undefined && value === undefined) continue;

    // Skip @defaultAlways fields when undefined (handled by database via DEFAULT ALWAYS)
    if (field.defaultAlwaysValue !== undefined && value === undefined) continue;

    // Skip array fields when undefined - they default to empty array
    if (field.isArray && (value === undefined || value === null)) continue;

    // Skip Record fields that will be populated by nested operations
    if (field.type === 'record' && fieldsFromNestedOps.has(field.name)) continue;

    const error = validateFieldValue(field.name, value, field.type, field.isRequired, field.isArray, field.isNullable);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate unset object for update operations.
 * Ensures all fields in unset are valid model fields that can be unset.
 */
export function validateUnset(unset: Record<string, unknown>, model: ModelMetadata): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const [fieldName, value] of Object.entries(unset)) {
    if (value === undefined) continue;

    const field = model.fields.find((f) => f.name === fieldName);
    if (!field) {
      errors.push({ field: fieldName, message: `Unknown field '${fieldName}' in unset` });
      continue;
    }

    // Cannot unset readonly, relation, id, or @now fields
    if (field.isReadonly) {
      errors.push({ field: fieldName, message: `Cannot unset readonly field '${fieldName}'` });
      continue;
    }
    if (field.type === 'relation') {
      errors.push({ field: fieldName, message: `Cannot unset relation field '${fieldName}' — use disconnect instead` });
      continue;
    }
    if (field.isId) {
      errors.push({ field: fieldName, message: `Cannot unset id field '${fieldName}'` });
      continue;
    }
    if (field.timestampDecorator === 'now') {
      errors.push({ field: fieldName, message: `Cannot unset computed field '${fieldName}'` });
      continue;
    }

    // true = unset entire field — must be optional
    if (value === true) {
      if (field.isRequired) {
        errors.push({
          field: fieldName,
          message: `Cannot unset required field '${fieldName}' — only optional fields can be unset`,
        });
      }
      continue;
    }

    // Object value = sub-field unset — validate recursively
    if (typeof value === 'object' && value !== null) {
      // Sub-field unset on objects and tuples is valid if the sub-fields exist
      // Deep validation is handled by the type system; runtime just checks structure
      continue;
    }

    errors.push({
      field: fieldName,
      message: `Invalid unset value for '${fieldName}' — expected true or sub-field object`,
    });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate that data and unset don't have leaf-level conflicts.
 * Data takes priority — conflicting fields in unset are errors.
 */
export function validateDataUnsetOverlap(
  data: Record<string, unknown>,
  unset: Record<string, unknown>,
  model: ModelMetadata,
): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const [fieldName, unsetValue] of Object.entries(unset)) {
    if (unsetValue === undefined) continue;
    if (!(fieldName in data) || data[fieldName] === undefined) continue;

    // Both data and unset touch this field
    if (unsetValue === true) {
      // Leaf conflict: data sets a value, unset tries to clear it
      errors.push({
        field: fieldName,
        message: `Field '${fieldName}' appears in both data and unset — cannot set and unset the same field`,
      });
      continue;
    }

    // Sub-field unset — only a conflict if data also has an object at this key
    // Deep overlap checking is best-effort; the type system handles most cases
    const dataValue = data[fieldName];
    if (
      typeof unsetValue === 'object' &&
      typeof dataValue === 'object' &&
      dataValue !== null &&
      !Array.isArray(dataValue)
    ) {
      // Both are objects — check for leaf-level overlap recursively
      const subErrors = validateDataUnsetOverlapDeep(
        dataValue as Record<string, unknown>,
        unsetValue as Record<string, unknown>,
        fieldName,
      );
      errors.push(...subErrors);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/** Recursively check data/unset overlap at sub-field level */
function validateDataUnsetOverlapDeep(
  data: Record<string, unknown>,
  unset: Record<string, unknown>,
  parentPath: string,
): DataValidationError[] {
  const errors: DataValidationError[] = [];

  for (const [key, unsetValue] of Object.entries(unset)) {
    if (unsetValue === undefined) continue;
    if (!(key in data) || data[key] === undefined) continue;

    const path = `${parentPath}.${key}`;

    if (unsetValue === true) {
      errors.push({
        field: path,
        message: `Field '${path}' appears in both data and unset — cannot set and unset the same field`,
      });
      continue;
    }

    const dataValue = data[key];
    if (
      typeof unsetValue === 'object' &&
      typeof dataValue === 'object' &&
      dataValue !== null &&
      !Array.isArray(dataValue)
    ) {
      errors.push(
        ...validateDataUnsetOverlapDeep(
          dataValue as Record<string, unknown>,
          unsetValue as Record<string, unknown>,
          path,
        ),
      );
    }
  }

  return errors;
}

/** Validate data for update operation */
export function validateUpdateData(data: Record<string, unknown>, model: ModelMetadata): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const [fieldName, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const field = model.fields.find((f) => f.name === fieldName);
    if (!field) {
      // Unknown field - could be an error or just ignored
      continue;
    }

    // @readonly fields cannot be updated — reject immediately
    if (field.isReadonly) {
      errors.push({ field: fieldName, message: `Cannot update readonly field '${fieldName}'` });
      continue;
    }

    // Skip relation fields - they're virtual
    if (field.type === 'relation') continue;

    // For array fields with object values (push/unset operations), skip type validation
    // as the operation format is handled separately
    if (field.isArray && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      continue;
    }

    // Skip tuple per-element update (non-array object on single tuple) — validated by types + builder
    if (
      field.type === 'tuple' &&
      !field.isArray &&
      typeof value === 'object' &&
      value !== null &&
      !Array.isArray(value)
    ) {
      continue;
    }

    // NONE sentinel is always valid in updates (clears the field)
    if (isNone(value)) continue;

    // For updates, don't require fields - just validate types
    // Pass isNullable to correctly validate null values
    const error = validateFieldValue(fieldName, value, field.type, false, field.isArray, field.isNullable);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
