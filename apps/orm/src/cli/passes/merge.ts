import type { SchemaAST } from '../../types';
import { emptyAst } from './types';

function byFile<T extends { origin: { file: string } }>(items: readonly T[]): T[] {
  // The sort is stable, so declarations of one file keep the order they were written in
  return [...items].sort((a, b) => (a.origin.file < b.origin.file ? -1 : a.origin.file > b.origin.file ? 1 : 0));
}

/**
 * Join the declarations of two parsed halves of one entry. Nothing is renamed or deduplicated, so a
 * duplicate name reaches the duplicate-name validator unchanged. Each array follows file path, then
 * declaration order, so the result does not depend on which half came first. `source` stays empty, as it does
 * for a multi-file parse.
 */
export function mergeDeclarations(a: SchemaAST, b: SchemaAST): SchemaAST {
  return {
    ...emptyAst(),
    models: byFile([...a.models, ...b.models]),
    objects: byFile([...a.objects, ...b.objects]),
    tuples: byFile([...a.tuples, ...b.tuples]),
    literals: byFile([...a.literals, ...b.literals]),
    enums: byFile([...a.enums, ...b.enums]),
  };
}
