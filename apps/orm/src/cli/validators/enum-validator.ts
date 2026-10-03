/**
 * Enum validator - name collisions and duplicate values
 */

import type { SchemaAST } from '../../types';
import type { SchemaValidationError } from './schema-validator';

/** Validate enum definitions */
export function validateEnums(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const collisions: Array<[string, Set<string>]> = [
    ['model', new Set(ast.models.map((m) => m.name))],
    ['object', new Set(ast.objects.map((o) => o.name))],
    ['tuple', new Set(ast.tuples.map((t) => t.name))],
    ['literal', new Set(ast.literals.map((l) => l.name))],
  ];

  for (const enumDef of ast.enums) {
    const line = enumDef.range.start.line;

    for (const [kind, names] of collisions) {
      if (names.has(enumDef.name)) {
        errors.push({ message: `Enum name '${enumDef.name}' conflicts with ${kind} name`, line });
      }
    }

    const seenValues = new Set<string>();
    for (const value of enumDef.values) {
      if (seenValues.has(value)) {
        errors.push({ message: `Duplicate value '${value}' in enum ${enumDef.name}`, line });
      }
      seenValues.add(value);
    }
  }

  return errors;
}
