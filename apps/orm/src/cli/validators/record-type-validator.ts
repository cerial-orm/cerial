/**
 * Record(Type) validator - validates Record ID type parameters
 */

import { hasDecorator } from '../../parser/types/ast';
import type { SchemaAST } from '../../types';
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
          line: field.range.start.line,
        });
        continue; // Skip further validation on this field
      }

      // If no recordIdTypes, nothing more to validate
      if (!field.recordIdTypes?.length) continue;

      // Validate each type parameter
      for (const typeName of field.recordIdTypes) {
        if (VALID_PRIMITIVE_ID_TYPES.has(typeName)) continue; // Valid primitive

        if (INVALID_ID_TYPES.has(typeName)) {
          errors.push({
            message: `Cannot use '${typeName}' as record ID type on field "${field.name}" in model "${model.name}". Valid types: int, number, string, uuid, or a tuple/object name.`,
            model: model.name,
            field: field.name,
            line: field.range.start.line,
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
              message: `Type '${typeName}' in Record(${typeName}) on field "${field.name}" in model "${model.name}" is not a defined tuple or object. Did you mean to define a tuple or object named '${typeName}'?`,
              model: model.name,
              field: field.name,
              line: field.range.start.line,
            });
          } else {
            errors.push({
              message: `Cannot use '${typeName}' as record ID type on field "${field.name}" in model "${model.name}". Valid types: int, number, string, uuid, or a tuple/object name.`,
              model: model.name,
              field: field.name,
              line: field.range.start.line,
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
                  message: `Warning: Decorators on '${typeName}' elements are ignored when used as @id — SurrealDB doesn't support DEFAULT/sub-field constraints on id fields. Field "${field.name}" in model "${model.name}".`,
                  model: model.name,
                  field: field.name,
                  line: field.range.start.line,
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
                  message: `Warning: Decorators on '${typeName}' fields are ignored when used as @id — SurrealDB doesn't support DEFAULT/sub-field constraints on id fields. Field "${field.name}" in model "${model.name}".`,
                  model: model.name,
                  field: field.name,
                  line: field.range.start.line,
                });
              }
            }
          }
        }
      }
    }
  }

  return errors;
}
