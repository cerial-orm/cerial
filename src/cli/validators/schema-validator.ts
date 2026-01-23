/**
 * Schema validator - validates schema files
 */

import type { SchemaAST, ParseError } from '../../types';
import { isValidModelName, isValidFieldName } from '../../utils/validation-utils';

/** Validation error */
export interface SchemaValidationError {
  message: string;
  model?: string;
  field?: string;
  line?: number;
}

/** Validation result */
export interface SchemaValidationResult {
  valid: boolean;
  errors: SchemaValidationError[];
}

/** Validate model names */
export function validateModelNames(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const names = new Set<string>();

  for (const model of ast.models) {
    // Check valid name format
    if (!isValidModelName(model.name)) {
      errors.push({
        message: `Invalid model name: ${model.name}. Must be PascalCase.`,
        model: model.name,
        line: model.range.start.line,
      });
    }

    // Check for duplicates
    if (names.has(model.name)) {
      errors.push({
        message: `Duplicate model name: ${model.name}`,
        model: model.name,
        line: model.range.start.line,
      });
    }
    names.add(model.name);
  }

  return errors;
}

/** Validate field names in a model */
export function validateFieldNames(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    const fieldNames = new Set<string>();

    for (const field of model.fields) {
      // Check valid name format
      if (!isValidFieldName(field.name)) {
        errors.push({
          message: `Invalid field name: ${field.name}. Must be camelCase or snake_case.`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }

      // Check for duplicates
      if (fieldNames.has(field.name)) {
        errors.push({
          message: `Duplicate field name: ${field.name}`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }
      fieldNames.add(field.name);
    }
  }

  return errors;
}

/** Validate entire schema */
export function validateSchema(ast: SchemaAST): SchemaValidationResult {
  const errors: SchemaValidationError[] = [
    ...validateModelNames(ast),
    ...validateFieldNames(ast),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}
