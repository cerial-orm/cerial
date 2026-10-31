/**
 * Tuple validator - element rules and references
 */

import type { SchemaAST } from '../../types';
import { located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

/** Validate tuple definitions */
export function validateTuples(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const objectNames = new Set(ast.objects.map((o) => o.name));
  const tupleNames = new Set(ast.tuples.map((t) => t.name));
  const literalOrEnumNames = new Set([...ast.literals.map((l) => l.name), ...ast.enums.map((e) => e.name)]);

  for (const tuple of ast.tuples) {
    const at = located(tuple.origin);
    const push = (message: string) => errors.push({ message, ...at });

    const elementNames = new Set<string>();
    for (const element of tuple.elements) {
      if (element.name) {
        if (elementNames.has(element.name)) {
          push(`Duplicate element name '${element.name}' in tuple ${tuple.name}`);
        }
        elementNames.add(element.name);
      }

      if (element.type === 'relation') push(`Tuple elements cannot be Relation type in tuple ${tuple.name}`);
      if (element.type === 'record') push(`Tuple elements cannot be Record type in tuple ${tuple.name}`);

      // A required self-reference can never be populated, so the type has no finite value. Tuple elements
      // cannot use `?`, so @nullable is how a self-reference ends the chain.
      if (element.type === 'tuple' && element.tupleName === tuple.name && !element.isOptional && !element.isNullable) {
        push(`Self-referencing tuple element in tuple ${tuple.name} must be @nullable to avoid infinite recursion`);
      }

      if (element.type === 'object' && element.objectName && !objectNames.has(element.objectName)) {
        push(`Tuple element references unknown object '${element.objectName}' in tuple ${tuple.name}`);
      }

      if (
        element.type === 'tuple' &&
        element.tupleName &&
        element.tupleName !== tuple.name &&
        !tupleNames.has(element.tupleName)
      ) {
        push(`Tuple element references unknown tuple '${element.tupleName}' in tuple ${tuple.name}`);
      }

      if (element.type === 'literal' && element.literalName && !literalOrEnumNames.has(element.literalName)) {
        push(`Tuple element references unknown literal '${element.literalName}' in tuple ${tuple.name}`);
      }
    }
  }

  return errors;
}
