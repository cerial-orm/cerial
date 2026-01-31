/**
 * Utility types for dynamic return type inference
 *
 * These types enable:
 * - Select: Only return fields where select[field] = true
 * - Include: Add populated relations to the result
 * - Nested: Support nested select/include within includes
 */

/**
 * Extract keys from Select object where value is `true`
 * { id: true, name: true, email: false } -> 'id' | 'name'
 */
export type TrueKeys<T> = {
  [K in keyof T]: T[K] extends true ? K : never;
}[keyof T];

/**
 * Pick fields from T based on Select object S
 * Only includes fields where S[K] = true
 */
export type SelectSubset<T, S> = S extends undefined
  ? T
  : S extends Record<string, boolean>
    ? Pick<T, Extract<TrueKeys<S>, keyof T>>
    : T;

/**
 * Check if a type is a boolean include (true) or object include ({...})
 */
export type IsBooleanInclude<T> = T extends true ? true : false;

/**
 * Get the payload type for a single relation based on include options
 * - true: Return full relation type
 * - { select: {...} }: Return selected fields only
 * - { include: {...} }: Return with nested includes
 */
export type GetRelationPayload<RelationType, RelationInclude, IncludeValue> = IncludeValue extends true
  ? RelationType
  : IncludeValue extends { select: infer S; include: infer I }
    ? SelectSubset<RelationType, S> & GetIncludePayload<RelationType, RelationInclude, I>
    : IncludeValue extends { select: infer S }
      ? SelectSubset<RelationType, S>
      : IncludeValue extends { include: infer I }
        ? RelationType & GetIncludePayload<RelationType, RelationInclude, I>
        : RelationType;

/**
 * Get the payload for all included relations
 * Maps each included relation key to its resolved type
 */
export type GetIncludePayload<Model, ModelRelations, Include> = Include extends undefined
  ? {}
  : Include extends Record<string, unknown>
    ? {
        [K in keyof Include as Include[K] extends false | undefined
          ? never
          : K extends keyof ModelRelations
            ? K
            : never]: K extends keyof ModelRelations
          ? ModelRelations[K] extends { type: infer R; include: infer RI }
            ? R extends unknown[]
              ? GetRelationPayload<R[number], RI, Include[K]>[]
              : GetRelationPayload<R, RI, Include[K]>
            : never
          : never;
      }
    : {};

/**
 * Main result type resolver
 * Combines select and include to produce final result type
 *
 * Priority:
 * 1. If select is defined: Only selected scalar fields + included relations
 * 2. If only include: Full model + included relations
 * 3. Neither: Full model type
 */
export type GetResult<Model, ModelRelations, Select, Include> =
  Select extends Record<string, boolean>
    ? SelectSubset<Model, Select> & GetIncludePayload<Model, ModelRelations, Include>
    : Include extends Record<string, unknown>
      ? Model & GetIncludePayload<Model, ModelRelations, Include>
      : Model;

/**
 * Helper to make result nullable for findOne/findUnique
 */
export type NullableResult<T> = T | null;

/**
 * Helper to make result an array for findMany
 */
export type ArrayResult<T> = T[];

/**
 * Relation definition for type generation
 * Used to define the shape of relations for a model
 */
export interface RelationDef<T, I = unknown> {
  type: T;
  include: I;
}

/**
 * Default args type - used when no options provided
 */
export type DefaultArgs = {
  select: undefined;
  include: undefined;
};

/**
 * Check if select or include is defined
 */
export type HasSelectOrInclude<S, I> = S extends undefined ? (I extends undefined ? false : true) : true;
