/**
 * Utility types - static TypeScript type string templates for the generated client index
 *
 * These are type definitions that don't depend on model metadata and are
 * written verbatim into the generated index.ts file.
 */

/**
 * How many select nesting levels get the unknown-key refusal (the model's own keys are level 1). Deeper sub-selects
 * still compile and narrow; only the typo check stops there, which bounds the recursion on every compiler.
 */
export const SELECT_ARG_DEPTH = 6;

/** Select/field resolution utility types */
export const SELECT_UTILITY_TYPES = `
/** A select object with at least one key: each key in turn required, the others optional. Required<T> keeps the
 * per-key value types free of the \`undefined\` an optional property would add. */
export type AtLeastOne<T, R extends Required<T> = Required<T>> = {
  [K in keyof R]: { [P in K]: R[P] } & { [P in Exclude<keyof R, K>]?: R[P] };
}[keyof R];
/** The select argument: S as written and the declared fields for completion. When S adds a key beyond the declared
 * ones within the first ${SELECT_ARG_DEPTH} levels, or S fell back to its constraint, SelectRefusal is intersected to refuse it at its
 * position; otherwise the check is the key set alone, computed once per S. */
export type SelectArg<S, T> = S &
  NoInfer<T> &
  (undefined extends S ? SelectRefusal<S, T> : [SelectExcessKeys<S, T>] extends [never] ? unknown : SelectRefusal<S, T>);
/** Every key S adds beyond T, at any of the first ${SELECT_ARG_DEPTH} levels (never when there is none) */
export type SelectExcessKeys<S, T, D extends unknown[] = []> =
  | Exclude<keyof S, keyof T>
  | ([...D, 0]['length'] extends ${SELECT_ARG_DEPTH}
      ? never
      : { [K in SelectObjectKeys<S>]: SelectExcessKeys<S[K], Exclude<T[K & keyof T], boolean | undefined>, [...D, 0]> }[SelectObjectKeys<S>]);
/** S with every key it adds beyond T refused, level by level through the first ${SELECT_ARG_DEPTH} */
export type SelectRefusal<S, T, D extends unknown[] = []> = S &
  NoInfer<T> & { [K in Exclude<keyof S, keyof T>]: never } & ([...D, 0]['length'] extends ${SELECT_ARG_DEPTH}
    ? unknown
    : { [K in SelectObjectKeys<S>]: SelectRefusal<S[K], Exclude<T[K & keyof T], boolean | undefined>, [...D, 0]> });
/** The data argument, gated the same way as SelectArg. [T] extends [D] holds when D fell back to its constraint. */
export type DataArg<D, T> = D &
  NoInfer<T> &
  ([T] extends [D] ? DataRefusal<D, T> : [DataExcessKeys<D, T>] extends [never] ? unknown : DataRefusal<D, T>);
/** Every key D adds beyond T, nested values included, mirroring DataRefusal level for level */
export type DataExcessKeys<D, T, N extends unknown[] = []> =
  | ExtraKeys<D, T>
  | ([...N, 0]['length'] extends ${SELECT_ARG_DEPTH}
      ? never
      : { [K in DataObjectKeys<D>]: DataValueExcessKeys<NonNullable<D[K]>, UnionValue<T, K>, [...N, 0]> }[DataObjectKeys<D>]);
export type DataValueExcessKeys<V, TV, N extends unknown[]> = unknown extends TV
  ? never
  : N['length'] extends ${SELECT_ARG_DEPTH}
    ? never
    : V extends (...args: never[]) => unknown
      ? never
      : V extends readonly unknown[]
        ? { [I in keyof V]: DataValueExcessKeys<V[I], DataElementTarget<TV, I>, [...N, 0]> }[number]
        : V extends object
          ? DataExcessKeys<V, Exclude<Extract<TV, object>, readonly unknown[]>, N>
          : never;
export type DataRefusal<D, T, N extends unknown[] = []> = D &
  NoInfer<T> & { [K in ExtraKeys<D, T>]: never } & ([...N, 0]['length'] extends ${SELECT_ARG_DEPTH}
    ? unknown
    : { [K in DataObjectKeys<D>]: DataValueArg<NonNullable<D[K]>, UnionValue<T, K>, [...N, 0]> });
export type DataValueArg<V, TV, N extends unknown[]> = unknown extends TV
  ? unknown
  : N['length'] extends ${SELECT_ARG_DEPTH}
    ? unknown
    : V extends (...args: never[]) => unknown
      ? unknown
      : V extends readonly unknown[]
        ? { [I in keyof V]: DataValueArg<V[I], DataElementTarget<TV, I>, [...N, 0]> }
        : V extends object
          ? DataRefusal<V, Exclude<Extract<TV, object>, readonly unknown[]>, N>
          : unknown;
export type DataElementTarget<TV, I> = TV extends readonly unknown[]
  ? I extends keyof TV
    ? TV[I]
    : TV[number]
  : never;
export type UnionValue<T, K> = T extends unknown ? (K extends keyof T ? T[K] : never) : never;
export type DataObjectKeys<D> = {
  [K in keyof D]-?: [NonNullable<D[K]>] extends [never] ? never : NonNullable<D[K]> extends object ? K : never;
}[keyof D];
export type ExtraKeys<D, T> = Exclude<keyof D, UnionKeys<T> | (string extends UnionKeys<T> ? number : never)>;
export type UnionKeys<T> = T extends unknown ? keyof T : never;
/** The include argument, gated the same way as SelectArg */
export type IncludeArg<I, T> = I &
  NoInfer<T> &
  (undefined extends I ? IncludeRefusal<I, T> : [IncludeExcessKeys<I, T>] extends [never] ? unknown : IncludeRefusal<I, T>);
export type IncludeExcessKeys<I, T, D extends unknown[] = []> =
  | Exclude<keyof I, keyof T>
  | ([...D, 0]['length'] extends ${SELECT_ARG_DEPTH}
      ? never
      : { [K in SelectObjectKeys<I>]: IncludeEntryExcessKeys<I[K], Exclude<T[K & keyof T], boolean | undefined>, [...D, 0]> }[SelectObjectKeys<I>]);
export type IncludeEntryExcessKeys<E, T, D extends unknown[]> =
  | Exclude<keyof E, keyof T>
  | (E extends { select: infer S } ? SelectExcessKeys<S, NonNullable<T['select' & keyof T]>> : never)
  | (E extends { include: infer N } ? IncludeExcessKeys<N, NonNullable<T['include' & keyof T]>, D> : never);
export type IncludeRefusal<I, T, D extends unknown[] = []> = I &
  NoInfer<T> & { [K in Exclude<keyof I, keyof T>]: never } & ([...D, 0]['length'] extends ${SELECT_ARG_DEPTH}
    ? unknown
    : { [K in SelectObjectKeys<I>]: IncludeEntryArg<I[K], Exclude<T[K & keyof T], boolean | undefined>, [...D, 0]> });
export type IncludeEntryArg<E, T, D extends unknown[]> = E & { [K in Exclude<keyof E, keyof T>]: never } & (E extends {
    select: infer S;
  }
    ? { select: SelectRefusal<S, NonNullable<T['select' & keyof T]>> }
    : unknown) &
  (E extends { include: infer N } ? { include: IncludeRefusal<N, NonNullable<T['include' & keyof T]>, D> } : unknown);
export type SelectObjectKeys<S> = { [K in keyof S]-?: S[K] extends object ? K : never }[keyof S];
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
 * - 'before': returns pre-update record (select and include read before the write)
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
 * - 'before': returns pre-upsert record state (null for new records, select and include read before the write)
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
