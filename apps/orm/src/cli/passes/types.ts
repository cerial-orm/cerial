import type { SchemaAST } from '../../types';

/** A `.cerial` file read from disk */
export interface SchemaSource {
  readonly path: string;
  readonly content: string;
}

/** Declaration names a parse may resolve a field type against, one set per kind that can be referenced */
export interface NameSets {
  readonly objects: ReadonlySet<string>;
  readonly tuples: ReadonlySet<string>;
  readonly literals: ReadonlySet<string>;
  readonly enums: ReadonlySet<string>;
}

export function emptyAst(): SchemaAST {
  return { models: [], objects: [], tuples: [], literals: [], enums: [], source: '' };
}
