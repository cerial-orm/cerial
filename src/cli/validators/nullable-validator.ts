/**
 * Validator for @nullable decorator rules
 *
 * @nullable marks a field as accepting null as a value (distinct from NONE/absent via ?).
 *
 * Rules:
 * - Allowed on: model fields (primitive, record, date, bool, email, float, int types)
 * - Allowed on: object sub-fields (same types as above)
 * - Disallowed on: object-type fields, tuple-type fields (SurrealDB can't define sub-fields on nullable parents)
 * - Disallowed on: relation fields (virtual, not stored)
 * - Disallowed on: @id fields (always present, never null)
 * - Disallowed on: @now fields (computed, output-only)
 * - @default(null) requires @nullable
 */

import type { SchemaAST } from '../../types';
import { hasDecorator, getDecorator } from '../../parser/types/ast';
import type { SchemaValidationError } from './schema-validator';

/** Types that cannot be @nullable */
const DISALLOWED_NULLABLE_TYPES = new Set(['object', 'tuple', 'relation', 'any']);

/** Validate @nullable decorator on a single field */
function validateNullableField(
  field: {
    name: string;
    type: string;
    isOptional: boolean;
    decorators: Array<{ type: string; value?: unknown }>;
    range: { start: { line: number } };
  },
  parentName: string,
): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const hasNullable = field.decorators.some((d) => d.type === 'nullable');

  // Validate @default(null) requires @nullable
  const defaultDecorator = field.decorators.find((d) => d.type === 'default');
  if (defaultDecorator && defaultDecorator.value === null && !hasNullable) {
    errors.push({
      message: `@default(null) requires @nullable on field '${field.name}' in ${parentName}. A field cannot default to null if it doesn't accept null values.`,
      line: field.range.start.line,
    });
  }

  if (!hasNullable) return errors;

  if (DISALLOWED_NULLABLE_TYPES.has(field.type)) {
    const reason =
      field.type === 'any'
        ? 'CerialAny already includes null in its union type.'
        : `SurrealDB cannot define sub-field schemas on nullable ${field.type} parents.`;
    errors.push({
      message: `@nullable is not allowed on ${field.type} field '${field.name}' in ${parentName}. ${reason}`,
      line: field.range.start.line,
    });
  }

  // @nullable not allowed on @id fields
  if (field.decorators.some((d) => d.type === 'id')) {
    errors.push({
      message: `@nullable is not allowed on @id field '${field.name}' in ${parentName}. Record IDs are always present and cannot be null.`,
      line: field.range.start.line,
    });
  }

  // @nullable not allowed on @now fields (COMPUTED, output-only)
  if (field.decorators.some((d) => d.type === 'now')) {
    errors.push({
      message: `@nullable is not allowed on @now field '${field.name}' in ${parentName}. COMPUTED fields are output-only and cannot be null.`,
      line: field.range.start.line,
    });
  }

  return errors;
}

/** Validate @nullable decorator on model fields */
export function validateNullableDecorator(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      errors.push(...validateNullableField(field, `model ${model.name}`));
    }
  }

  return errors;
}

/** Validate @nullable decorator on object sub-fields */
export function validateNullableOnObjectFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const object of ast.objects) {
    for (const field of object.fields) {
      errors.push(...validateNullableField(field, `object ${object.name}`));
    }
  }

  return errors;
}

/** Validate @nullable decorator on tuple elements */
export function validateNullableOnTupleElements(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const tuple of ast.tuples) {
    for (let i = 0; i < tuple.elements.length; i++) {
      const element = tuple.elements[i]!;
      if (!element.decorators?.length) continue;

      const hasNullable = element.decorators.some((d) => d.type === 'nullable');
      if (!hasNullable) continue;

      const elemName = element.name ?? `element[${i}]`;

      // @nullable not allowed on object-type tuple elements
      if (element.type === 'object') {
        errors.push({
          message: `@nullable is not allowed on object tuple element '${elemName}' in tuple ${tuple.name}. SurrealDB cannot define sub-field schemas on nullable object parents.`,
          line: tuple.range.start.line,
        });
      }
    }
  }

  return errors;
}

/** Validate that Any fields do not use the `?` (optional) modifier */
export function validateNoOptionalAnyFields(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const model of ast.models) {
    for (const field of model.fields) {
      if (field.type === 'any' && field.isOptional) {
        errors.push({
          message: `Optional (?) is not allowed on Any field '${field.name}' in model ${model.name}. TYPE any natively accepts NONE and CerialAny includes null.`,
          line: field.range.start.line,
        });
      }
    }
  }

  for (const object of ast.objects) {
    for (const field of object.fields) {
      if (field.type === 'any' && field.isOptional) {
        errors.push({
          message: `Optional (?) is not allowed on Any field '${field.name}' in object ${object.name}. TYPE any natively accepts NONE and CerialAny includes null.`,
          line: field.range.start.line,
        });
      }
    }
  }

  return errors;
}

/** Validate that tuple elements do not use the `?` (optional) modifier */
export function validateNoOptionalTupleElements(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  for (const tuple of ast.tuples) {
    for (let i = 0; i < tuple.elements.length; i++) {
      const element = tuple.elements[i]!;
      if (!element.isOptional) continue;

      const elemName = element.name ?? `element[${i}]`;
      errors.push({
        message: `Optional elements (?) are not allowed in tuples. Use @nullable instead. SurrealDB returns null (not undefined) for absent tuple positions, making ? semantically incorrect. Element '${elemName}' in tuple ${tuple.name}.`,
        line: tuple.range.start.line,
      });
    }
  }

  return errors;
}

/** Validate tuple element decorators (only specific decorators are allowed) */
export function validateTupleElementDecorators(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];

  const ALLOWED_TUPLE_ELEMENT_DECORATORS = new Set(['nullable', 'default', 'defaultAlways', 'createdAt', 'updatedAt']);

  for (const tuple of ast.tuples) {
    for (let i = 0; i < tuple.elements.length; i++) {
      const element = tuple.elements[i]!;
      if (!element.decorators?.length) continue;

      const elemName = element.name ?? `element[${i}]`;

      for (const dec of element.decorators) {
        if (!ALLOWED_TUPLE_ELEMENT_DECORATORS.has(dec.type)) {
          errors.push({
            message: `Decorator @${dec.type} is not allowed on tuple element '${elemName}' in tuple ${tuple.name}. Allowed: @nullable, @default, @defaultAlways, @createdAt, @updatedAt.`,
            line: tuple.range.start.line,
          });
        }
      }

      // Timestamp decorators must be on Date-type elements
      const hasCreatedAt = element.decorators.some((d) => d.type === 'createdAt');
      const hasUpdatedAt = element.decorators.some((d) => d.type === 'updatedAt');
      if ((hasCreatedAt || hasUpdatedAt) && element.type !== 'date') {
        errors.push({
          message: `Timestamp decorators (@createdAt, @updatedAt) can only be used on Date-type elements, but '${elemName}' in tuple ${tuple.name} is of type '${element.type}'.`,
          line: tuple.range.start.line,
        });
      }

      // Cannot have both @createdAt and @updatedAt
      if (hasCreatedAt && hasUpdatedAt) {
        errors.push({
          message: `Element '${elemName}' in tuple ${tuple.name} cannot have both @createdAt and @updatedAt.`,
          line: tuple.range.start.line,
        });
      }

      // @default and timestamp decorators are mutually exclusive
      const hasDefault = element.decorators.some((d) => d.type === 'default');
      const hasDefaultAlways = element.decorators.some((d) => d.type === 'defaultAlways');
      if (hasDefault && (hasCreatedAt || hasUpdatedAt)) {
        errors.push({
          message: `@default and timestamp decorators cannot be used together on element '${elemName}' in tuple ${tuple.name}.`,
          line: tuple.range.start.line,
        });
      }

      // @default and @defaultAlways are mutually exclusive
      if (hasDefault && hasDefaultAlways) {
        errors.push({
          message: `@default and @defaultAlways cannot be used together on element '${elemName}' in tuple ${tuple.name}.`,
          line: tuple.range.start.line,
        });
      }

      // @default(null) on tuple elements requires @nullable
      if (hasDefault) {
        const defaultDec = element.decorators.find((d) => d.type === 'default');
        if (defaultDec?.value === null && !element.isNullable) {
          errors.push({
            message: `@default(null) requires @nullable on element '${elemName}' in tuple ${tuple.name}. An element cannot default to null if it doesn't accept null values.`,
            line: tuple.range.start.line,
          });
        }
      }
    }
  }

  return errors;
}
