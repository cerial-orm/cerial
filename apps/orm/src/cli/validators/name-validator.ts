/**
 * Declaration name validator - one name per declaration across the schema, within and across kinds
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
 * Reject a name used by two different kinds of declaration. Each later declaration is reported once,
 * against the first one that took the name. Abstract models are skipped: they are consumed by
 * inheritance resolution and leave no type behind, so nothing can collide with them.
 */
function findCrossKindCollisions(ast: SchemaAST): SchemaValidationError[] {
  const errors: SchemaValidationError[] = [];
  const first = new Map<string, { kind: string; origin: Origin }>();
  const groups: Array<[string, Named[]]> = [
    ['model', ast.models.filter((m) => !m.abstract)],
    ['object', ast.objects],
    ['tuple', ast.tuples],
    ['literal', ast.literals],
    ['enum', ast.enums],
  ];

  for (const [kind, items] of groups) {
    for (const item of items) {
      const taken = first.get(item.name);
      if (!taken) {
        first.set(item.name, { kind, origin: item.origin });
      } else if (taken.kind !== kind) {
        errors.push({
          message: `Duplicate name: ${item.name} (declared as ${taken.kind} in ${formatOrigin(taken.origin)} and as ${kind} in ${formatOrigin(item.origin)})`,
          line: originLine(item.origin),
        });
      }
    }
  }

  return errors;
}

/**
 * Reject two declarations sharing a name, of the same kind or of different kinds.
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
    ...findCrossKindCollisions(ast),
  ];
}
