import type { CerialId } from 'cerial';

/** 1 when `K` may be omitted from `T`, 0 when it is required. */
// oxlint-disable-next-line typescript/no-empty-object-type -- {} is the empty object that an optional key must be assignable from
export type IsOptional<T, K extends keyof T> = {} extends Pick<T, K> ? 1 : 0;

/**
 * Collapses intersections and mapped wrappers so a type compares by shape
 * under `Test.check`. `CerialId` stays opaque so it is compared by identity.
 */
export type Flat<T> =
  T extends CerialId<infer _V>
    ? T
    : T extends Date
      ? T
      : T extends readonly (infer U)[]
        ? Flat<U>[]
        : T extends object
          ? { [K in keyof T]: Flat<T[K]> }
          : T;

/** The empty object type, for asserting that a type has narrowed to no keys. */
// oxlint-disable-next-line typescript/no-empty-object-type -- the empty object type is the value under test
export type Empty = {};
