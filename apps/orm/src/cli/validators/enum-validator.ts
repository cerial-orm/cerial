/**
 * Enum validator - duplicate values
 */

import type { SchemaAST } from '../../types';
import { located } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

/** Validate enum definitions */
export function validateEnums(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  for (const enumDef of ast.enums) {
    const at = located(enumDef.origin);

    const seenValues = new Set<string>();
    for (const value of enumDef.values) {
      if (seenValues.has(value)) {
        errors.push({ message: `Duplicate value '${value}' in enum ${enumDef.name}`, ...at });
      }
      seenValues.add(value);
    }
  }

  return errors;
}
