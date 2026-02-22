/**
 * Branded type for SurrealDB set fields.
 * A set is a deduplicated, sorted array. The brand distinguishes it from plain arrays in the type system.
 */
export type CerialSet<T> = T[] & { readonly __cerialSet: true };
