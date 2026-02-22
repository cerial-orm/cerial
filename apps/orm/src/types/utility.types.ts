/**
 * Utility types for dynamic return type inference
 *
 * These types enable:
 * - Select: Only return fields where select[field] = true or sub-field select
 * - Include: Add populated relations to the result
 * - Nested: Support nested select/include within includes
 *
 * Note: The generated code inlines equivalent logic per-model via derived-generator.ts.
 * These types are provided for reference and potential direct use.
 */

/**
 * Resolve a field's return type based on its select value
 * - true: return full type
 * - Record (sub-field select): recursively narrow to selected sub-fields
 * - false/undefined: excluded (never)
 */
export type ResolveFieldSelect<FieldType, SelectValue> = SelectValue extends true
  ? FieldType
  : SelectValue extends Record<string, any>
    ? FieldType extends (infer E)[]
      ? ApplyObjectSelect<NonNullable<E>, SelectValue>[]
      : undefined extends FieldType
        ? ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | undefined
        : ApplyObjectSelect<NonNullable<FieldType>, SelectValue>
    : never;

/**
 * Recursively apply sub-field selection to an object type
 * Filters out keys set to false/undefined, resolves remaining via ResolveFieldSelect
 */
export type ApplyObjectSelect<T, S extends Record<string, any>> = {
  [K in keyof S as S[K] extends false | undefined ? never : K]: K extends keyof T
    ? ResolveFieldSelect<T[K], S[K]>
    : never;
};

/**
 * Extract keys from Select object where value is truthy (true or sub-field select)
 * { id: true, name: true, email: false, address: { city: true } } -> 'id' | 'name' | 'address'
 */
export type SelectedKeys<T> = {
  [K in keyof T]: T[K] extends false | undefined ? never : K;
}[keyof T];

/**
 * Pick fields from T based on Select object S
 * Supports both boolean true and object sub-field selects via ResolveFieldSelect
 */
export type SelectSubset<T, S> = S extends undefined
  ? T
  : S extends Record<string, any>
    ? { [K in SelectedKeys<S> & keyof T]: ResolveFieldSelect<T[K], S[K]> }
    : T;

/**
 * Check if a type is a boolean include (true) or object include ({...})
 */
export type IsBooleanInclude<T> = T extends true ? true : false;

/**
 * Get the payload type for a single relation based on include options
 * - true: Return full relation type
 * - { select: {...} }: Return selected fields only (with sub-field support)
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
export type GetIncludePayload<_Model, ModelRelations, Include> = Include extends undefined
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
  Select extends Record<string, any>
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
