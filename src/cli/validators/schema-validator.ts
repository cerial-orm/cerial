/**
 * Schema validator - validates schema files
 */

import { getDecorator } from '../../parser/types/ast';
import type { SchemaAST } from '../../types';
import { isValidFieldName, isValidModelName } from '../../utils/validation-utils';
import { validateRelationRules } from './relation-validator';

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

/** Validate relation fields */
export function validateRelations(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  // Get all model names for target validation
  const modelNames = new Set(ast.models.map((m) => m.name));

  for (const model of ast.models) {
    for (const field of model.fields) {
      // Only validate Relation type fields
      if (field.type !== 'relation') continue;

      // Validate @model decorator exists and target is valid
      const modelDecorator = getDecorator(field, 'model');
      if (!modelDecorator) {
        errors.push({
          message: `Relation field "${field.name}" must have @model decorator`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
        continue;
      }

      const targetModel = modelDecorator.value as string | undefined;
      if (!targetModel) {
        errors.push({
          message: `Relation field "${field.name}" has @model decorator with missing value`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
        continue;
      }

      // Check if target model exists
      if (!modelNames.has(targetModel)) {
        errors.push({
          message: `Relation field "${field.name}" references non-existent model "${targetModel}"`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
      }

      // Validate @field decorator if present (forward relation)
      const fieldDecorator = getDecorator(field, 'field');
      if (fieldDecorator) {
        const fieldRef = fieldDecorator.value as string | undefined;
        if (!fieldRef) {
          errors.push({
            message: `Relation field "${field.name}" has @field decorator with missing value`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
          continue;
        }

        // Check if referenced field exists
        const referencedField = model.fields.find((f) => f.name === fieldRef);
        if (!referencedField) {
          errors.push({
            message: `Relation field "${field.name}" references non-existent field "${fieldRef}"`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
          continue;
        }

        // Check if referenced field is Record type
        if (referencedField.type !== 'record') {
          errors.push({
            message: `Relation field "${field.name}" references field "${fieldRef}" which is not a Record type`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}

/** Validate Record fields have paired Relation fields */
export function validateRecordFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      // Only check Record fields
      if (field.type !== 'record') continue;

      // Find paired Relation field
      const pairedRelation = model.fields.find(
        (f) => f.type === 'relation' && f.decorators.some((d) => d.type === 'field' && d.value === field.name),
      );

      // It's a warning but not an error if Record has no paired Relation
      // The Record can still be used directly without the convenience of Relation
      if (!pairedRelation) {
        // This is informational, not necessarily an error
        // Could be converted to a warning system later
      }
    }
  }

  return errors;
}

/** Validate entire schema */
export function validateSchema(ast: SchemaAST): SchemaValidationResult {
  const errors: SchemaValidationError[] = [
    ...validateModelNames(ast),
    ...validateFieldNames(ast),
    ...validateRelations(ast),
    ...validateRecordFields(ast),
    ...validateRelationRules(ast),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}
