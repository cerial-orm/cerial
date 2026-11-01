/**
 * Normalised schema model: the one shape the live reader and the desired-schema builder both produce,
 * so a diff compares two values of the same type instead of two renderings of SurrealQL.
 */

/** How a difference affects stored data; `unmanaged` is reported and never acted on. */
export type DifferenceClass = 'additive' | 'destructive' | 'data-loss' | 'unmanaged';

/** A named step of a field path, or the `.*` element step an array or set type implies. */
export type FieldPathSegment = string | { readonly element: true };

export type FieldPath = readonly FieldPathSegment[];

/** Optional keys are omitted when absent, never `null`, matching what `INFO ... STRUCTURE` returns. */
export interface FieldModel {
  readonly path: FieldPath;
  readonly kind: string;
  readonly default?: string;
  readonly defaultAlways?: true;
  readonly value?: string;
  readonly assert?: string;
  readonly readonly?: true;
  readonly flexible?: true;
}

export interface IndexModel {
  readonly name: string;
  readonly columns: readonly FieldPath[];
  /** The raw index clause from the server: `''` for a plain index, `'UNIQUE'` and so on otherwise. */
  readonly index: string;
}

export interface TableModel {
  readonly name: string;
  readonly fields: readonly FieldModel[];
  readonly indexes: readonly IndexModel[];
}

/** A live construct Cerial has no concept for (event, function, param, access, unknown permission). */
export interface UnmanagedItem {
  readonly kind: string;
  readonly name: string;
  readonly table?: string;
}

export interface SchemaModel {
  readonly tables: readonly TableModel[];
  readonly unmanaged: readonly UnmanagedItem[];
}
