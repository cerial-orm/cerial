import type { DecoratorName } from '../registry';

/**
 * Registry entries that deliberately get no public builder method. `@model` is written by the relation
 * factory from its argument, so a chain method would give a second way to set the same thing.
 */
export const NO_PUBLIC_METHOD = ['@model'] as const satisfies readonly DecoratorName[];

/** Entries whose method exists only on a relation builder: `@field` overrides a relation's derived foreign key. */
export const RELATION_ONLY_METHOD = ['@field'] as const satisfies readonly DecoratorName[];

/**
 * Entries a relation line cannot carry: the validators refuse these on a `Relation`, because it is virtual
 * and stores nothing, or is not the type the decorator needs. A relation builder has no such method, though
 * the generic chain still carries them.
 */
export const REFUSED_ON_RELATION = [
  '@nullable',
  '@readonly',
  '@distinct',
  '@sort',
  '@set',
  '@flexible',
  '@now',
  '@createdAt',
  '@updatedAt',
  '@uuid',
  '@uuid4',
  '@uuid7',
] as const satisfies readonly DecoratorName[];

/** Which kind of builder a chain belongs to; `f.relation(...)` is the only `'relation'`. */
export type BuilderKind = 'plain' | 'relation';
