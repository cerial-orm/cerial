/**
 * Record(Type) validator - validates Record ID type parameters
 */

import { hasDecorator } from '../../parser/types/ast';
import type { ASTField, SchemaAST } from '../../types';
import { located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

/** Valid primitive ID type parameters for Record(Type) */
const VALID_PRIMITIVE_ID_TYPES = new Set(['int', 'number', 'string', 'uuid']);

/** Known invalid ID type parameters — clear error messages */
const INVALID_ID_TYPES = new Set([
  'float',
  'bool',
  'date',
  'datetime',
  'decimal',
  'duration',
  'literal',
  'enum',
  'relation',
  'email',
  'bytes',
  'geometry',
  'any',
]);

/** Decorators that are ignored when tuple/object is used as @id */
const ID_IGNORED_DECORATORS = new Set(['default', 'defaultAlways', 'createdAt', 'updatedAt']);

/** Check every `Record(...)` type parameter of one field; `kind` and `owner` name where the field lives */
function checkTypeParams(
  ast: SchemaAST,
  field: ASTField,
  kind: 'model' | 'object',
  owner: string,
  tupleNames: Set<string>,
  objectNames: Set<string>,
  errors: SchemaValidationError[],
): void {
  for (const typeName of field.recordIdTypes ?? []) {
    if (VALID_PRIMITIVE_ID_TYPES.has(typeName)) continue; // Valid primitive

    if (INVALID_ID_TYPES.has(typeName)) {
      errors.push({
        message: `Cannot use '${typeName}' as record ID type on field "${field.name}" in ${kind} "${owner}". Valid types: int, number, string, uuid, or a tuple/object name.`,
        model: owner,
        field: field.name,
        ...located(field.origin),
      });
      continue;
    }

    // Check if it's a tuple or object name
    const isTupleName = tupleNames.has(typeName);
    const isObjectName = objectNames.has(typeName);

    if (!isTupleName && !isObjectName) {
      // Check if it looks like a PascalCase name (potential typo)
      if (/^[A-Z]/.test(typeName)) {
        errors.push({
          message: `Type '${typeName}' in Record(${typeName}) on field "${field.name}" in ${kind} "${owner}" is not a defined tuple or object. Did you mean to define a tuple or object named '${typeName}'?`,
          model: owner,
          field: field.name,
          ...located(field.origin),
        });
      } else {
        errors.push({
          message: `Cannot use '${typeName}' as record ID type on field "${field.name}" in ${kind} "${owner}". Valid types: int, number, string, uuid, or a tuple/object name.`,
          model: owner,
          field: field.name,
          ...located(field.origin),
        });
      }
      continue;
    }

    // Rule 4: WARNING for @id with decorated tuple/object
    if (hasDecorator(field, 'id')) {
      if (isTupleName) {
        const tuple = ast.tuples.find((t) => t.name === typeName);
        if (tuple) {
          const hasDecoratedElements = tuple.elements.some((el) =>
            el.decorators?.some((d) => ID_IGNORED_DECORATORS.has(d.type)),
          );
          if (hasDecoratedElements) {
            errors.push({
              message: `Warning: Decorators on '${typeName}' elements are ignored when used as @id — SurrealDB doesn't support DEFAULT/sub-field constraints on id fields. Field "${field.name}" in ${kind} "${owner}".`,
              model: owner,
              field: field.name,
              ...located(field.origin),
            });
          }
        }
      }
      if (isObjectName) {
        const object = ast.objects.find((o) => o.name === typeName);
        if (object) {
          const hasDecoratedFields = object.fields.some((f) =>
            f.decorators.some((d) => ID_IGNORED_DECORATORS.has(d.type)),
          );
          if (hasDecoratedFields) {
            errors.push({
              message: `Warning: Decorators on '${typeName}' fields are ignored when used as @id — SurrealDB doesn't support DEFAULT/sub-field constraints on id fields. Field "${field.name}" in ${kind} "${owner}".`,
              model: owner,
              field: field.name,
              ...located(field.origin),
            });
          }
        }
      }
    }
  }
}

/**
 * Validate Record(Type) type parameters on all Record fields in the schema.
 *
 * Rules:
 * 1. Each type param must be a valid primitive (int, number, string, uuid) OR a defined tuple/object name
 * 2. FK Record WITH paired Relation → ERROR if explicit Record(Type) (type inferred from target)
 * 3. Standalone Record WITHOUT Relation → Record(Type) is VALID
 * 4. @id Record(TupleName/ObjectName) where the tuple/object has decorators → WARNING
 */
export function validateRecordIdTypes(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const tupleNames = new Set(ast.tuples.map((t) => t.name));
  const objectNames = new Set(ast.objects.map((o) => o.name));

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type !== 'record') continue;

      // Check if this Record field has a paired Relation (FK field)
      const hasPairedRelation = model.fields.some(
        (f) => f.type === 'relation' && f.decorators.some((d) => d.type === 'field' && d.value === field.name),
      );

      // Rule 2: FK Record WITH Relation must NOT have explicit Record(Type)
      if (hasPairedRelation && field.recordIdTypes?.length) {
        errors.push({
          message: `Record(Type) cannot be used on FK field "${field.name}" with Relation in model "${model.name}" — type is inferred from target model's @id. Remove the type parameter.`,
          model: model.name,
          field: field.name,
          ...located(field.origin),
        });
        continue; // Skip further validation on this field
      }

      // If no recordIdTypes, nothing more to validate
      if (!field.recordIdTypes?.length) continue;

      checkTypeParams(ast, field, 'model', model.name, tupleNames, objectNames, errors);
    }
  }

  // Object fields reach the generated registry through the same recordIdTypes, so they get the same check.
  // Nested objects and objects inside tuple elements are top-level declarations, so this loop covers them.
  for (const object of ast.objects) {
    for (const field of object.fields) {
      if (field.type === 'record' && field.recordIdTypes?.length) {
        checkTypeParams(ast, field, 'object', object.name, tupleNames, objectNames, errors);
      }
    }
  }

  return errors;
}
