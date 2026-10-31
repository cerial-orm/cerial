/**
 * Composite directive validator - @@index and @@unique rules
 */

import type { ASTModel, SchemaAST } from '../../types';
import { located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

/**
 * Resolve a dot-notation field reference against a model and its object definitions.
 * Returns the field type if valid, or null if invalid.
 * Examples: "email" → resolves to email field; "address.city" → resolves to city subfield of Address object
 */
function resolveCompositeField(
  fieldRef: string,
  model: ASTModel,
  ast: SchemaAST,
): {
  valid: boolean;
  isOptional: boolean;
  isRelation: boolean;
  isArray: boolean;
  isId: boolean;
  parentOverlap?: string;
} {
  const parts = fieldRef.split('.');

  // Top-level field lookup
  const topField = model.fields.find((f) => f.name === parts[0]);
  if (!topField) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

  // Single-part reference (e.g., "email", "authorId")
  if (parts.length === 1) {
    return {
      valid: true,
      isOptional: topField.isOptional,
      isRelation: topField.type === 'relation',
      isArray: !!topField.isArray,
      isId: topField.decorators.some((d) => d.type === 'id'),
    };
  }

  // Dot-notation: must be an object type field
  if (topField.type !== 'object' || !topField.objectName) {
    return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
  }

  // Walk the dot-notation path through nested objects
  let currentObjectName = topField.objectName;
  for (let i = 1; i < parts.length; i++) {
    const objectDef = ast.objects.find((o) => o.name === currentObjectName);
    if (!objectDef) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

    const subField = objectDef.fields.find((f) => f.name === parts[i]);
    if (!subField) return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };

    // If there are more parts, this must also be an object type
    if (i < parts.length - 1) {
      if (subField.type !== 'object' || !subField.objectName) {
        return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
      }
      currentObjectName = subField.objectName;
    } else {
      // Final field in the dot path
      return {
        valid: true,
        isOptional: topField.isOptional || subField.isOptional,
        isRelation: false,
        isArray: !!subField.isArray,
        isId: false,
      };
    }
  }

  return { valid: false, isOptional: false, isRelation: false, isArray: false, isId: false };
}

/** Validate the @@index and @@unique directives on every model */
export function validateCompositeDirectives(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  // A directive name identifies its index, so it must not repeat across models
  const globalNames = new Map<string, string>();

  for (const model of ast.models) {
    for (const directive of model.directives ?? []) {
      const at = located(directive.origin);
      const label = `@@${directive.kind}("${directive.name}")`;
      const push = (message: string) => errors.push({ message, model: model.name, ...at });

      const existingModel = globalNames.get(directive.name);
      if (existingModel) {
        push(
          `Composite directive name '${directive.name}' is already used in model ${existingModel}. Names must be unique across all models.`,
        );
      } else {
        globalNames.set(directive.name, model.name);
      }

      if (directive.fields.length < 2) {
        push(`Composite ${label} must have at least 2 fields. Use field-level @${directive.kind} for single fields.`);
      }

      const seenFields = new Set<string>();
      for (const fieldRef of directive.fields) {
        if (seenFields.has(fieldRef)) push(`Duplicate field '${fieldRef}' in composite ${label}`);
        seenFields.add(fieldRef);
      }

      const wholeObjectFields = new Set<string>();
      const dotNotationRoots = new Set<string>();

      for (const fieldRef of directive.fields) {
        const resolved = resolveCompositeField(fieldRef, model, ast);

        if (!resolved.valid) {
          push(`Field '${fieldRef}' in composite ${label} does not exist in model ${model.name}`);
          continue;
        }
        if (resolved.isId) {
          push(
            `Field '${fieldRef}' in composite ${label} has @id and cannot be part of a composite. @id fields are already unique.`,
          );
        }
        if (resolved.isRelation) {
          push(
            `Field '${fieldRef}' in composite ${label} is a Relation (virtual field) and cannot be indexed. Use the Record field instead.`,
          );
        }
        if (resolved.isArray) {
          push(`Field '${fieldRef}' in composite ${label} is an array field and cannot be part of a composite index.`);
        }

        const parts = fieldRef.split('.');
        if (parts.length === 1) {
          if (model.fields.find((f) => f.name === fieldRef)?.type === 'object') wholeObjectFields.add(fieldRef);
        } else {
          dotNotationRoots.add(parts[0]!);
        }
      }

      for (const objField of wholeObjectFields) {
        if (dotNotationRoots.has(objField)) {
          push(
            `Composite ${label} references both '${objField}' (whole object) and its subfield(s). This is redundant — use either the whole object or specific subfields.`,
          );
        }
      }
    }
  }

  return errors;
}
