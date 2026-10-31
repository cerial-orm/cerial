/**
 * Declaration name validator - one name per declaration across the schema
 */

import type { Origin, SchemaAST } from '../../types';
import { formatOrigin, originLine } from './origin-location';
import type { SchemaValidationError } from './schema-validator';

interface Named {
  name: string;
  origin: Origin;
}

function findDuplicates(kind: string, items: Named[]): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const seen = new Map<string, Origin>();

  for (const item of items) {
    const first = seen.get(item.name);
    if (first) {
      errors.push({
        message: `Duplicate ${kind} name: ${item.name} (declared in ${formatOrigin(first)} and in ${formatOrigin(item.origin)})`,
        line: originLine(item.origin),
      });
    } else {
      seen.set(item.name, item.origin);
    }
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
