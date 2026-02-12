/**
 * Data validator - validates data for create/update operations
 */

import { RecordId, StringRecordId } from 'surrealdb';
import type { ModelMetadata, SchemaFieldType } from '../../types';
import { CerialId } from '../../utils/cerial-id';
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
): DataValidationError | null {
  // Check required
  if (value === undefined || value === null) {
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

    // Skip fields with default value (if not provided)
    if (field.defaultValue !== undefined && value === undefined) continue;

    // Skip array fields when undefined - they default to empty array
    if (field.isArray && (value === undefined || value === null)) continue;

    // Skip Record fields that will be populated by nested operations
    if (field.type === 'record' && fieldsFromNestedOps.has(field.name)) continue;

    const error = validateFieldValue(field.name, value, field.type, field.isRequired, field.isArray);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
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

    // Skip relation fields - they're virtual
    if (field.type === 'relation') continue;

    // For array fields with object values (push/unset operations), skip type validation
    // as the operation format is handled separately
    if (field.isArray && typeof value === 'object' && !Array.isArray(value) && value !== null) {
      continue;
    }

    // For updates, don't require fields - just validate types
    const error = validateFieldValue(fieldName, value, field.type, false, field.isArray);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
