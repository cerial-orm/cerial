import type { DecoratorName } from '../registry';

/**
 * Registry entries that deliberately get no public builder method. `@model` is written by the relation
 * factory from its argument, so a chain method would give a second way to set the same thing.
 */
export const NO_PUBLIC_METHOD = ['@model'] as const satisfies readonly DecoratorName[];

/** Entries whose method exists only on a relation builder: `@field` overrides a relation's derived foreign key. */
export const RELATION_ONLY_METHOD = ['@field'] as const satisfies readonly DecoratorName[];

/** Which kind of builder a chain belongs to; `f.relation(...)` is the only `'relation'`. */
export type BuilderKind = 'plain' | 'relation';
