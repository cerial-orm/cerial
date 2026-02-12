/**
 * Schema validator - validates schema files
 */

import { getDecorator, hasDecorator } from '../../parser/types/ast';
import type { SchemaAST } from '../../types';
import { isValidFieldName, isValidModelName, isValidObjectName } from '../../utils/validation-utils';
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

      // Skip @id fields - they reference the model's own table, no paired Relation needed
      if (hasDecorator(field, 'id')) continue;

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

/** Validate @distinct and @sort decorators on array fields */
export function validateArrayDecorators(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      const hasDistinct = hasDecorator(field, 'distinct');
      const hasSort = hasDecorator(field, 'sort');

      if (!hasDistinct && !hasSort) continue;

      // Must be an array field
      if (!field.isArray) {
        if (hasDistinct) {
          errors.push({
            message: `@distinct can only be used on array fields`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
        if (hasSort) {
          errors.push({
            message: `@sort can only be used on array fields`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
        continue;
      }

      // Not allowed on Relation[] (virtual, not stored)
      if (field.type === 'relation') {
        if (hasDistinct) {
          errors.push({
            message: `@distinct cannot be used on Relation[] fields (virtual, not stored in database)`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
        if (hasSort) {
          errors.push({
            message: `@sort cannot be used on Relation[] fields (virtual, not stored in database)`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
        continue;
      }

      // Not allowed on Record[] that is paired with a Relation (PK side of relation)
      if (field.type === 'record') {
        const pairedRelation = model.fields.find(
          (f) => f.type === 'relation' && f.decorators.some((d) => d.type === 'field' && d.value === field.name),
        );

        if (pairedRelation) {
          if (hasDistinct) {
            errors.push({
              message: `@distinct cannot be used on Record[] fields paired with a Relation (already has implicit distinct)`,
              model: model.name,
              field: field.name,
              line: field.range.start.line,
            });
          }
          if (hasSort) {
            errors.push({
              message: `@sort cannot be used on Record[] fields paired with a Relation`,
              model: model.name,
              field: field.name,
              line: field.range.start.line,
            });
          }
        }
      }
    }
  }

  return errors;
}

/** Timestamp decorator types */
const TIMESTAMP_DECORATORS = new Set(['now', 'createdAt', 'updatedAt']);

/** All decorators that provide a default value strategy (mutually exclusive) */
const DEFAULT_STRATEGY_DECORATORS = new Set(['default', 'defaultAlways', 'now', 'createdAt', 'updatedAt']);

/** Validate timestamp decorator rules on a single field (shared by model and object validation) */
function validateTimestampDecorators(
  field: { name: string; type: string; decorators: Array<{ type: string }>; range: { start: { line: number } } },
  parentName: string,
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const timestampDecs = field.decorators.filter((d) => TIMESTAMP_DECORATORS.has(d.type));

  if (!timestampDecs.length) return errors;

  // Timestamp decorators must be on Date fields only
  for (const dec of timestampDecs) {
    if (field.type !== 'date') {
      errors.push({
        message: `@${dec.type} can only be used on Date fields, but '${field.name}' in ${parentName} is of type '${field.type}'.`,
        line: field.range.start.line,
      });
    }
  }

  // Mutual exclusivity: only one timestamp decorator per field
  if (timestampDecs.length > 1) {
    const names = timestampDecs.map((d) => `@${d.type}`).join(', ');
    errors.push({
      message: `Field '${field.name}' in ${parentName} has multiple timestamp decorators (${names}). Only one of @now, @createdAt, @updatedAt is allowed per field.`,
      line: field.range.start.line,
    });
  }

  // Conflict with @default: timestamp decorators and @default are mutually exclusive
  const hasDefault = field.decorators.some((d) => d.type === 'default');
  if (hasDefault) {
    for (const dec of timestampDecs) {
      errors.push({
        message: `@${dec.type} and @default cannot be used together on field '${field.name}' in ${parentName}.`,
        line: field.range.start.line,
      });
    }
  }

  // Conflict with @defaultAlways: timestamp decorators and @defaultAlways are mutually exclusive
  const hasDefaultAlways = field.decorators.some((d) => d.type === 'defaultAlways');
  if (hasDefaultAlways) {
    for (const dec of timestampDecs) {
      errors.push({
        message: `@${dec.type} and @defaultAlways cannot be used together on field '${field.name}' in ${parentName}.`,
        line: field.range.start.line,
      });
    }
  }

  return errors;
}

/** Validate @defaultAlways decorator rules on a single field (shared by model and object validation) */
function validateDefaultAlwaysDecorator(
  field: { name: string; type: string; decorators: Array<{ type: string }>; range: { start: { line: number } } },
  parentName: string,
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const hasDefaultAlways = field.decorators.some((d) => d.type === 'defaultAlways');

  if (!hasDefaultAlways) return errors;

  // @defaultAlways and @default are mutually exclusive
  const hasDefault = field.decorators.some((d) => d.type === 'default');
  if (hasDefault) {
    errors.push({
      message: `@defaultAlways and @default cannot be used together on field '${field.name}' in ${parentName}. Use one or the other.`,
      line: field.range.start.line,
    });
  }

  return errors;
}

/** Validate timestamp and @defaultAlways decorators on model fields */
export function validateTimestampFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      errors.push(...validateTimestampDecorators(field, `model ${model.name}`));
      errors.push(...validateDefaultAlwaysDecorator(field, `model ${model.name}`));
    }
  }

  return errors;
}

/** Validate object names */
export function validateObjectNames(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const objectNames = new Set<string>();
  const modelNames = new Set(ast.models.map((m) => m.name));

  for (const object of ast.objects) {
    // Check valid name format (PascalCase)
    if (!isValidObjectName(object.name)) {
      errors.push({
        message: `Invalid object name: ${object.name}. Must be PascalCase.`,
        line: object.range.start.line,
      });
    }

    // Check for duplicate object names
    if (objectNames.has(object.name)) {
      errors.push({
        message: `Duplicate object name: ${object.name}`,
        line: object.range.start.line,
      });
    }

    // Check for name collision with model names
    if (modelNames.has(object.name)) {
      errors.push({
        message: `Object name '${object.name}' conflicts with model name`,
        line: object.range.start.line,
      });
    }

    objectNames.add(object.name);
  }

  return errors;
}

/** Validate object field rules */
export function validateObjectFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const objectNames = new Set(ast.objects.map((o) => o.name));

  for (const object of ast.objects) {
    const fieldNames = new Set<string>();

    for (const field of object.fields) {
      // Check valid field name
      if (!isValidFieldName(field.name)) {
        errors.push({
          message: `Invalid field name: ${field.name}. Must be camelCase or snake_case.`,
          line: field.range.start.line,
        });
      }

      // Check for duplicate field names
      if (fieldNames.has(field.name)) {
        errors.push({
          message: `Duplicate field name: ${field.name} in object ${object.name}`,
          line: field.range.start.line,
        });
      }
      fieldNames.add(field.name);

      // Objects cannot have 'id' field
      if (field.name === 'id') {
        errors.push({
          message: `Objects cannot have an 'id' field`,
          line: field.range.start.line,
        });
      }

      // Objects cannot have Relation fields
      if (field.type === 'relation') {
        errors.push({
          message: `Objects cannot have Relation fields`,
          line: field.range.start.line,
        });
      }

      // Validate decorators on object fields — only specific decorators are allowed
      const ALLOWED_OBJECT_DECORATORS = new Set([
        'default',
        'defaultAlways',
        'createdAt',
        'updatedAt',
        'index',
        'unique',
        'distinct',
        'sort',
      ]);
      for (const dec of field.decorators) {
        if (!ALLOWED_OBJECT_DECORATORS.has(dec.type)) {
          if (dec.type === 'now') {
            errors.push({
              message: `@now is not allowed on object fields. SurrealDB requires COMPUTED fields to be top-level. Use @createdAt or @updatedAt instead.`,
              line: field.range.start.line,
            });
          } else {
            errors.push({
              message: `Decorator @${dec.type} is not allowed on object fields. Allowed: @default, @defaultAlways, @createdAt, @updatedAt, @index, @unique, @distinct, @sort.`,
              line: field.range.start.line,
            });
          }
        }
      }

      // Validate timestamp and @defaultAlways decorators on object fields
      errors.push(...validateTimestampDecorators(field, `object ${object.name}`));
      errors.push(...validateDefaultAlwaysDecorator(field, `object ${object.name}`));

      // Validate @index and @unique mutual exclusivity on object fields
      if (hasDecorator(field, 'index') && hasDecorator(field, 'unique')) {
        errors.push({
          message: `Field '${field.name}' in object ${object.name} cannot have both @index and @unique. Use one or the other.`,
          line: field.range.start.line,
        });
      }

      // Validate @unique on array object fields
      if (hasDecorator(field, 'unique') && field.isArray) {
        errors.push({
          message: `Field '${field.name}' in object ${object.name} is an array field and cannot have @unique.`,
          line: field.range.start.line,
        });
      }

      // Validate @distinct and @sort are only on array fields
      if ((hasDecorator(field, 'distinct') || hasDecorator(field, 'sort')) && !field.isArray) {
        errors.push({
          message: `@distinct and @sort decorators on field '${field.name}' in object ${object.name} are only allowed on array fields.`,
          line: field.range.start.line,
        });
      }

      // Self-referencing object fields must be optional or array
      if (field.type === 'object' && field.objectName === object.name) {
        if (!field.isOptional && !field.isArray) {
          errors.push({
            message: `Self-referencing object fields must be optional or array`,
            line: field.range.start.line,
          });
        }
      }

      // Validate object type references exist
      if (field.type === 'object' && field.objectName) {
        if (!objectNames.has(field.objectName)) {
          errors.push({
            message: `Field "${field.name}" references unknown object type "${field.objectName}"`,
            line: field.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}

/** Validate object references in model fields */
export function validateObjectReferences(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const objectNames = new Set(ast.objects.map((o) => o.name));

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type === 'object' && field.objectName) {
        if (!objectNames.has(field.objectName)) {
          errors.push({
            message: `Field "${field.name}" in model "${model.name}" references unknown object type "${field.objectName}"`,
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

/** Validate entire schema */
export function validateSchema(ast: SchemaAST): SchemaValidationResult {
  const errors: SchemaValidationError[] = [
    ...validateModelNames(ast),
    ...validateFieldNames(ast),
    ...validateRelations(ast),
    ...validateRecordFields(ast),
    ...validateRelationRules(ast),
    ...validateArrayDecorators(ast),
    ...validateTimestampFields(ast),
    ...validateObjectNames(ast),
    ...validateObjectFields(ast),
    ...validateObjectReferences(ast),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}
