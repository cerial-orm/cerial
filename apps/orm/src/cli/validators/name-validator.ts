/**
 * Declaration name validator - one name per declaration across the schema
 */

import type { SchemaAST } from '../../types';
import type { SchemaValidationError } from './schema-validator';

interface Named {
  name: string;
  range: { start: { line: number } };
}

function findDuplicates(kind: string, items: Named[]): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (seen.has(item.name)) {
      errors.push({ message: `Duplicate ${kind} name: ${item.name}`, line: item.range.start.line });
    }
    seen.add(item.name);
  }

  return errors;
}

/**
 * Reject two declarations of the same kind sharing a name.
 *
 * Must run on the merged AST before inheritance resolution: the resolver keys types by name,
 * so two `User` models arrive as one and the second is silently dropped.
 */
export function validateDuplicateNames(ast: SchemaAST): SchemaValidationError[] {
  return [
    ...findDuplicates('model', ast.models),
    ...findDuplicates('object', ast.objects),
    ...findDuplicates('tuple', ast.tuples),
    ...findDuplicates('literal', ast.literals),
    ...findDuplicates('enum', ast.enums),
  ];
}
