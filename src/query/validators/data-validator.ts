/**
 * Data validator - validates data for create/update operations
 */

import type { ModelMetadata, SchemaFieldType } from '../../types';
import { validateFieldType, isValidEmail } from '../../utils/validation-utils';

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
): DataValidationError | null {
  // Check required
  if (value === undefined || value === null) {
    if (isRequired) {
      return { field: fieldName, message: `${fieldName} is required` };
    }
    return null;
  }

  // Check type
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
): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const field of model.fields) {
    // Skip fields with @now default (auto-filled)
    if (field.hasNowDefault) continue;

    // Skip fields with default value
    if (field.defaultValue !== undefined) continue;

    const value = data[field.name];
    const error = validateFieldValue(field.name, value, field.type, field.isRequired);
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
export function validateUpdateData(
  data: Record<string, unknown>,
  model: ModelMetadata,
): DataValidationResult {
  const errors: DataValidationError[] = [];

  for (const [fieldName, value] of Object.entries(data)) {
    if (value === undefined) continue;

    const field = model.fields.find((f) => f.name === fieldName);
    if (!field) {
      // Unknown field - could be an error or just ignored
      continue;
    }

    // For updates, don't require fields - just validate types
    const error = validateFieldValue(fieldName, value, field.type, false);
    if (error) {
      errors.push(error);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
