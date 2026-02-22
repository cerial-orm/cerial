/**
 * Utility types - static TypeScript type string templates for the generated client index
 *
 * These are type definitions that don't depend on model metadata and are
 * written verbatim into the generated index.ts file.
 */

/** Select/field resolution utility types */
export const SELECT_UTILITY_TYPES = `
/** Check if a type is a tuple (fixed-length array) rather than a dynamic array */
export type IsTuple<T> = T extends readonly any[]
  ? number extends T['length'] ? false : true
  : false;

/** Apply per-element select to a tuple type, narrowing object sub-fields within selected elements.
 * The length intersection preserves tuple identity through A.Compute. */
export type ApplyTupleSelect<T extends any[], S extends Record<string | number, any>> = {
  [K in keyof T]: K extends \`\${infer N extends number}\`
    ? N extends keyof S
      ? S[N] extends true ? T[K]
        : S[N] extends Record<string, any> ? ResolveFieldSelect<T[K], S[N]> : T[K]
      : T[K]
    : T[K]
} & { readonly length: T['length'] };

/** Resolve a field's return type based on its select value (true = full type, object = sub-field select) */
export type ResolveFieldSelect<FieldType, SelectValue> = SelectValue extends true
  ? FieldType
  : SelectValue extends Record<string, any>
    ? IsTuple<NonNullable<FieldType>> extends true
      ? null extends FieldType
        ? undefined extends FieldType
          ? ApplyTupleSelect<NonNullable<FieldType> & any[], SelectValue> | null | undefined
          : ApplyTupleSelect<NonNullable<FieldType> & any[], SelectValue> | null
        : undefined extends FieldType
          ? ApplyTupleSelect<NonNullable<FieldType> & any[], SelectValue> | undefined
          : ApplyTupleSelect<NonNullable<FieldType> & any[], SelectValue>
      : FieldType extends (infer E)[]
        ? ApplyObjectSelect<NonNullable<E>, SelectValue>[]
        : null extends FieldType
          ? undefined extends FieldType
            ? ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | null | undefined
            : ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | null
          : undefined extends FieldType
            ? ApplyObjectSelect<NonNullable<FieldType>, SelectValue> | undefined
            : ApplyObjectSelect<NonNullable<FieldType>, SelectValue>
    : never;

/** Recursively apply sub-field selection to an object type */
export type ApplyObjectSelect<T, S extends Record<string, any>> = {
  [K in keyof S as S[K] extends false | undefined ? never : K]: K extends keyof T
    ? ResolveFieldSelect<T[K], S[K]>
    : never;
};`;

/** SafeUnset cross-exclude utility type */
export const SAFE_UNSET_TYPE = `
/**
 * Cross-exclude utility for unset — removes fields from Unset that conflict
 * with fields being set in Data. Recursively narrows for nested objects/tuples.
 *
 * Rules:
 * - Field NOT in Data -> fully available in Unset
 * - Field in Data AND Data[K] is array -> excluded (array replace in data)
 * - Field in Data AND Unset[K] is only \`true\` -> excluded (leaf conflict)
 * - Field in Data AND Unset[K] has sub-structure -> recurse into sub-fields
 */
export type SafeUnset<Unset, Data> = {
  [K in keyof Unset as K extends keyof Data
    ? Data[K] extends any[]
      ? never
      : NonNullable<Exclude<Unset[K], true>> extends never
        ? never
        : NonNullable<Exclude<Unset[K], true>> extends Record<string, any>
          ? K
          : never
    : K
  ]?: K extends keyof Data
    ? NonNullable<Exclude<Unset[K], true>> extends infer Clean
      ? Clean extends Record<string, any>
        ? Data[K] extends Record<string, any>
          ? SafeUnset<Clean, Data[K]>
          : never
        : never
      : never
    : Unset[K];
};`;

/** Return type utility types for deleteUnique, updateUnique, and upsert */
export const RETURN_UTILITY_TYPES = `
/**
 * DeleteUnique return option
 * - undefined/null: RETURN NONE, always returns true (operation completed)
 * - true: RETURN BEFORE, returns boolean (true if existed, false if not)
 * - 'before': RETURN BEFORE, returns Model | null (no schema validation)
 */
export type DeleteUniqueReturn = null | undefined | true | 'before';

/**
 * Infer deleteUnique return type based on return option
 * @template T - The model type
 * @template R - The return option
 */
export type DeleteUniqueReturnType<T, R extends DeleteUniqueReturn> = R extends null | undefined
  ? boolean
  : R extends true
    ? boolean
    : R extends 'before'
      ? T | null
      : boolean;

/**
 * UpdateUnique return option
 * - undefined/null/'after': returns updated record (supports select/include)
 * - true: returns boolean (true if found and updated, false if not)
 * - 'before': returns pre-update record (no select/include support)
 */
export type UpdateUniqueReturn = null | undefined | true | 'before' | 'after';

/**
 * Infer updateUnique return type based on return option
 * @template T - The model type (or payload type with select/include)
 * @template R - The return option
 */
export type UpdateUniqueReturnType<T, R extends UpdateUniqueReturn> = R extends true ? boolean : T | null;

/**
 * Upsert return option
 * - undefined/null/'after': returns upserted record (supports select/include)
 * - true: returns boolean (true if record was created or updated)
 * - 'before': returns pre-upsert record state (null for new records, no select/include support)
 */
export type UpsertReturn = null | undefined | true | 'before' | 'after';

/**
 * Infer upsert return type based on return option (single record variant)
 * @template T - The model type (or payload type with select/include)
 * @template R - The return option
 */
export type UpsertReturnType<T, R extends UpsertReturn> = R extends true ? boolean : T | null;

/**
 * Infer upsert return type based on return option (array variant for non-unique where)
 * @template T - The model type (or payload type with select/include)
 * @template R - The return option
 */
export type UpsertArrayReturnType<T, R extends UpsertReturn> = R extends true ? boolean : T[];`;
