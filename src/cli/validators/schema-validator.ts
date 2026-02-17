/**
 * Schema validator - validates schema files
 */

import { getDecorator, getTuple, hasDecorator } from '../../parser/types/ast';
import type { ASTTuple, SchemaAST } from '../../types';
import { isValidFieldName, isValidModelName, isValidObjectName } from '../../utils/validation-utils';
import {
  validateNullableDecorator,
  validateNullableOnObjectFields,
  validateNullableOnTupleElements,
  validateNoOptionalTupleElements,
  validateNoOptionalAnyFields,
  validateTupleElementDecorators,
} from './nullable-validator';
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
        'set',
        'flexible',
        'readonly',
        'nullable',
        'uuid',
        'uuid4',
        'uuid7',
        'point',
        'line',
        'polygon',
        'multipoint',
        'multiline',
        'multipolygon',
        'geoCollection',
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
              message: `Decorator @${dec.type} is not allowed on object fields. Allowed: @default, @defaultAlways, @createdAt, @updatedAt, @index, @unique, @distinct, @sort, @set, @flexible, @readonly, @nullable, @uuid, @uuid4, @uuid7, @point, @line, @polygon, @multipoint, @multiline, @multipolygon, @geoCollection.`,
              line: field.range.start.line,
            });
          }
        }
      }

      // @flexible is only allowed on object-typed fields (fields referencing an object type)
      if (hasDecorator(field, 'flexible') && field.type !== 'object') {
        errors.push({
          message: `@flexible can only be used on fields with an object type, but '${field.name}' in object ${object.name} is of type '${field.type}'.`,
          line: field.range.start.line,
        });
      }

      // Validate timestamp, @defaultAlways, @readonly, and UUID decorators on object fields
      errors.push(...validateTimestampDecorators(field, `object ${object.name}`));
      errors.push(...validateDefaultAlwaysDecorator(field, `object ${object.name}`));
      errors.push(...validateReadonlyField(field, `object ${object.name}`));
      errors.push(...validateUuidDecorators(field, `object ${object.name}`));

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

/** Validate @readonly decorator rules on a single field (shared by model and object validation) */
function validateReadonlyField(
  field: { name: string; type: string; decorators: Array<{ type: string }>; range: { start: { line: number } } },
  parentName: string,
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const hasReadonly = field.decorators.some((d) => d.type === 'readonly');

  if (!hasReadonly) return errors;

  // @readonly + @now is invalid — SurrealDB cannot combine READONLY with COMPUTED
  const hasNow = field.decorators.some((d) => d.type === 'now');
  if (hasNow) {
    errors.push({
      message: `@readonly and @now cannot be used together on field '${field.name}' in ${parentName}. SurrealDB does not support READONLY on COMPUTED fields.`,
      line: field.range.start.line,
    });
  }

  // @readonly + @defaultAlways is contradictory — DEFAULT ALWAYS resets on every write, but READONLY prevents writes
  const hasDefaultAlways = field.decorators.some((d) => d.type === 'defaultAlways');
  if (hasDefaultAlways) {
    errors.push({
      message: `@readonly and @defaultAlways cannot be used together on field '${field.name}' in ${parentName}. @defaultAlways resets the value on every write, which contradicts @readonly.`,
      line: field.range.start.line,
    });
  }

  // @readonly on @id fields is redundant — SurrealDB already makes id immutable
  const hasId = field.decorators.some((d) => d.type === 'id');
  if (hasId) {
    errors.push({
      message: `@readonly is not allowed on @id field '${field.name}' in ${parentName}. The id field is already immutable in SurrealDB.`,
      line: field.range.start.line,
    });
  }

  // @readonly on Relation fields is invalid — they are virtual (not stored)
  if (field.type === 'relation') {
    errors.push({
      message: `@readonly is not allowed on Relation field '${field.name}' in ${parentName}. Relation fields are virtual and not stored in the database.`,
      line: field.range.start.line,
    });
  }

  return errors;
}

/** Validate @readonly decorator on model fields */
export function validateReadonlyDecorator(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      errors.push(...validateReadonlyField(field, `model ${model.name}`));
    }
  }

  return errors;
}

/** Validate @flexible decorator on model fields */
export function validateFlexibleDecorator(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (!hasDecorator(field, 'flexible')) continue;

      // @flexible is only allowed on object-typed fields
      if (field.type !== 'object') {
        errors.push({
          message: `@flexible can only be used on fields with an object type, but '${field.name}' in model ${model.name} is of type '${field.type}'.`,
          model: model.name,
          field: field.name,
          line: field.range.start.line,
        });
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

/**
 * Check if a tuple has a required element with a decorator that forces a DEFINE FIELD sub-constraint.
 * These decorators are: @default, @defaultAlways, @createdAt, @updatedAt.
 * (Optional/nullable elements always get sub-field constraints regardless.)
 */
function tupleHasDecoratedRequiredElement(tuple: ASTTuple): boolean {
  return tuple.elements.some((el) => {
    if (el.isOptional) return false;
    if (!el.decorators?.length) return false;

    return el.decorators.some(
      (d) => d.type === 'default' || d.type === 'defaultAlways' || d.type === 'createdAt' || d.type === 'updatedAt',
    );
  });
}

/**
 * Validate that a model does not trigger a SurrealDB bug with optional tuples + optional objects.
 *
 * SurrealDB bug: When a SCHEMAFULL table has ALL of:
 *   1. An optional tuple field with at least one optional element AND at least one
 *      required element that has a decorator (forcing a DEFINE FIELD sub-constraint)
 *   2. Any optional object field on the same table
 *
 * Then creating a record without providing the tuple fails with a type coercion error
 * on the required element's sub-field constraint.
 *
 * The migration generator already skips sub-field constraints for required primitive
 * elements WITHOUT decorators (Step 1 mitigation). This validation catches the remaining
 * case where a required element HAS a decorator and the sub-field can't be skipped.
 */
export function validateTupleObjectCombination(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    // Check if model has any optional object field
    const hasOptionalObject = model.fields.some((f) => f.type === 'object' && f.isOptional);
    if (!hasOptionalObject) continue;

    // Check each optional tuple field
    for (const field of model.fields) {
      if (field.type !== 'tuple' || !field.isOptional || !field.tupleName) continue;

      const tuple = getTuple(ast, field.tupleName);
      if (!tuple) continue;

      // Does the tuple have at least one optional element?
      const hasOptionalElement = tuple.elements.some((el) => el.isOptional);
      if (!hasOptionalElement) continue;

      // Does the tuple have a required element with a decorator?
      if (!tupleHasDecoratedRequiredElement(tuple)) continue;

      // All conditions met — this triggers the SurrealDB bug
      const optionalObjectFields = model.fields.filter((f) => f.type === 'object' && f.isOptional).map((f) => f.name);

      errors.push({
        message:
          `Model '${model.name}' has an optional tuple field '${field.name}' (${field.tupleName}) with a decorated required element ` +
          `and optional object field(s) (${optionalObjectFields.join(', ')}). This combination triggers a SurrealDB bug where ` +
          `creating a record without the tuple fails. Workarounds: (1) make the tuple field required, ` +
          `(2) remove the decorator from the required tuple element, or (3) make the object field(s) required.`,
        model: model.name,
        field: field.name,
        line: field.range.start.line,
      });
    }
  }

  return errors;
}

/** Decorators that are NOT allowed on literal-typed fields */
const DISALLOWED_LITERAL_DECORATORS = new Set([
  'flexible',
  'now',
  'createdAt',
  'updatedAt',
  'id',
  'field',
  'model',
  'onDelete',
  'key',
]);

/** Error messages for disallowed decorators on literal fields */
function getLiteralDecoratorError(decoratorType: string): string {
  if (decoratorType === 'flexible') return '@flexible is only allowed on object-type fields';
  if (decoratorType === 'now' || decoratorType === 'createdAt' || decoratorType === 'updatedAt')
    return 'timestamp decorators are only allowed on Date fields';
  if (decoratorType === 'id') return '@id is only allowed on Record fields';

  // Relation decorators
  return `@${decoratorType} is a relation decorator and is not allowed on literal fields`;
}

/** Validate decorators on literal-typed fields across models and objects */
export function validateLiteralDecorators(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  // Validate model fields
  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'literal') continue;

      for (const dec of field.decorators) {
        if (DISALLOWED_LITERAL_DECORATORS.has(dec.type)) {
          errors.push({
            message: `${getLiteralDecoratorError(dec.type)}. Field '${field.name}' in model ${model.name} is a literal type.`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
          });
        }
      }
    }
  }

  // Validate object fields
  for (const object of ast.objects) {
    for (const field of object.fields) {
      if (field.type !== 'literal') continue;

      for (const dec of field.decorators) {
        if (DISALLOWED_LITERAL_DECORATORS.has(dec.type)) {
          errors.push({
            message: `${getLiteralDecoratorError(dec.type)}. Field '${field.name}' in object ${object.name} is a literal type.`,
            line: field.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}

const UUID_DECORATORS = new Set(['uuid', 'uuid4', 'uuid7']);

function validateUuidDecorators(
  field: { name: string; type: string; decorators: Array<{ type: string }>; range: { start: { line: number } } },
  parentName: string,
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const uuidDecs = field.decorators.filter((d) => UUID_DECORATORS.has(d.type));

  if (!uuidDecs.length) return errors;

  // UUID decorators must be on Uuid fields only
  for (const dec of uuidDecs) {
    if (field.type !== 'uuid') {
      errors.push({
        message: `@${dec.type} can only be used on Uuid fields, but '${field.name}' in ${parentName} is of type '${field.type}'.`,
        line: field.range.start.line,
      });
    }
  }

  // Mutual exclusivity: only one UUID decorator per field
  if (uuidDecs.length > 1) {
    const names = uuidDecs.map((d) => `@${d.type}`).join(', ');
    errors.push({
      message: `Field '${field.name}' in ${parentName} has multiple UUID decorators (${names}). Only one of @uuid, @uuid4, @uuid7 is allowed per field.`,
      line: field.range.start.line,
    });
  }

  // Conflict with default strategy decorators
  for (const dec of uuidDecs) {
    if (field.decorators.some((d) => d.type === 'default')) {
      errors.push({
        message: `@${dec.type} and @default cannot be used together on field '${field.name}' in ${parentName}.`,
        line: field.range.start.line,
      });
    }
    if (field.decorators.some((d) => d.type === 'defaultAlways')) {
      errors.push({
        message: `@${dec.type} and @defaultAlways cannot be used together on field '${field.name}' in ${parentName}.`,
        line: field.range.start.line,
      });
    }
    if (field.decorators.some((d) => TIMESTAMP_DECORATORS.has(d.type))) {
      errors.push({
        message: `@${dec.type} cannot be combined with timestamp decorators on field '${field.name}' in ${parentName}.`,
        line: field.range.start.line,
      });
    }
  }

  return errors;
}

export function validateUuidFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      errors.push(...validateUuidDecorators(field, `model ${model.name}`));
    }
  }

  for (const object of ast.objects) {
    for (const field of object.fields) {
      errors.push(...validateUuidDecorators(field, `object ${object.name}`));
    }
  }

  return errors;
}

/** Primitive types allowed with @set (SurrealDB set type) */
const SET_ALLOWED_TYPES = new Set([
  'string',
  'email',
  'int',
  'float',
  'bool',
  'date',
  'uuid',
  'duration',
  'number',
  'bytes',
  'geometry',
  'any',
]);

/** Validate @set decorator on model and object fields */
export function validateSetDecorator(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const validateField = (
    field: {
      name: string;
      type: string;
      isArray?: boolean;
      decorators: Array<{ type: string }>;
      range: { start: { line: number } };
    },
    parentName: string,
  ): void => {
    const hasSet = field.decorators.some((d) => d.type === 'set');
    if (!hasSet) return;

    if (!field.isArray) {
      errors.push({
        message: `@set can only be used on array fields, but '${field.name}' in ${parentName} is not an array.`,
        line: field.range.start.line,
      });

      return;
    }

    if (field.type === 'decimal') {
      errors.push({
        message: `@set is not allowed on Decimal[] fields (SurrealDB set<decimal> has known issues). Field '${field.name}' in ${parentName}.`,
        line: field.range.start.line,
      });
    }

    if (!SET_ALLOWED_TYPES.has(field.type)) {
      errors.push({
        message: `@set is only allowed on primitive array fields. Field '${field.name}' in ${parentName} is of type '${field.type}[]'.`,
        line: field.range.start.line,
      });
    }

    if (field.decorators.some((d) => d.type === 'distinct')) {
      errors.push({
        message: `@set and @distinct cannot be used together on field '${field.name}' in ${parentName}. Sets are inherently distinct.`,
        line: field.range.start.line,
      });
    }

    if (field.decorators.some((d) => d.type === 'sort')) {
      errors.push({
        message: `@set and @sort cannot be used together on field '${field.name}' in ${parentName}. Sets are inherently sorted.`,
        line: field.range.start.line,
      });
    }
  };

  for (const model of ast.models) {
    for (const field of model.fields) {
      validateField(field, `model ${model.name}`);
    }
  }

  for (const object of ast.objects) {
    for (const field of object.fields) {
      validateField(field, `object ${object.name}`);
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
    ...validateFlexibleDecorator(ast),
    ...validateReadonlyDecorator(ast),
    ...validateNullableDecorator(ast),
    ...validateNullableOnObjectFields(ast),
    ...validateNullableOnTupleElements(ast),
    ...validateTupleElementDecorators(ast),
    ...validateNoOptionalTupleElements(ast),
    ...validateNoOptionalAnyFields(ast),
    ...validateTupleObjectCombination(ast),
    ...validateLiteralDecorators(ast),
    ...validateUuidFields(ast),
    ...validateSetDecorator(ast),
  ];

  return {
    valid: errors.length === 0,
    errors,
  };
}
