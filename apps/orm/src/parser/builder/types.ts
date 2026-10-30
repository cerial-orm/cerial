/**
 * The builder's type-level surface. Every type here reads the registry's literal entry types, so a new
 * registry entry yields a method (or an options key) without an edit in this folder.
 */

import type { ASTCompositeDirective, ASTDecorator } from '../../types';
import type { ArgumentShape, DecoratorEntry, DecoratorTarget, LiteralForm, RegisteredDecorator } from '../registry';
import type { BuilderKind, NO_PUBLIC_METHOD, RELATION_ONLY_METHOD } from './exposure';

/** The TypeScript value each `@default` literal form takes; `raw` is a string such as a duration. */
interface LiteralFormValue {
  boolean: boolean;
  null: null;
  int: number;
  float: number;
  string: string;
  raw: string;
}

/** What `.default(...)` and `.defaultAlways(...)` accept. */
export type LiteralValue = LiteralFormValue[LiteralForm];

/** The node a builder produces: what the entry's `parse` handler returns for the same decorator. */
export type BuilderNode = ASTDecorator | ASTCompositeDirective;

/**
 * Arguments of a chain method, by argument shape; `never` for a shape that has several parts, which
 * goes to the options form instead. A new `ArgumentShape` member lands in neither until it is added here
 * and to the runtime switches, which fail to compile for it.
 */
export type MethodArgs<A extends ArgumentShape> = A extends { readonly kind: 'none' }
  ? []
  : A extends {
        readonly kind: 'choice';
        readonly choices: readonly (infer C extends string)[];
        readonly optional: true;
      }
    ? [value?: C]
    : A extends { readonly kind: 'choice'; readonly choices: readonly (infer C extends string)[] }
      ? [value: C]
      : A extends { readonly kind: 'name' }
        ? [name: string]
        : A extends { readonly kind: 'literal' }
          ? [value: LiteralValue]
          : never;

/** The value of an options key, by argument shape; `never` for a shape that chains. */
export type OptionValue<A extends ArgumentShape> = A extends { readonly kind: 'nameAndFields' }
  ? { readonly name: string; readonly fields: readonly string[] }
  : never;

/** A decorator name without its sigil: the chain method name or the options key. */
export type BareName<N extends string> = N extends `@@${infer X}` ? X : N extends `@${infer X}` ? X : never;

type MethodName<N extends string> = N extends `@@${string}` ? never : BareName<N>;

/** The entries that get a chain method on a `T` builder of kind `K`. */
export type ChainEntry<
  E extends DecoratorEntry,
  T extends DecoratorTarget,
  K extends BuilderKind,
> = E extends DecoratorEntry
  ? [MethodArgs<E['args']>] extends [never]
    ? never
    : [T] extends [E['targets'][number]]
      ? E['name'] extends (typeof NO_PUBLIC_METHOD)[number]
        ? never
        : K extends 'plain'
          ? E['name'] extends (typeof RELATION_ONLY_METHOD)[number]
            ? never
            : E
          : E
      : never
  : never;

/** The entries that take an options key on a `T` target. */
export type OptionEntry<E extends DecoratorEntry, T extends DecoratorTarget> = E extends DecoratorEntry
  ? [OptionValue<E['args']>] extends [never]
    ? never
    : [T] extends [E['targets'][number]]
      ? E
      : never
  : never;

/**
 * The entries of `E` that survive chaining `X`: those `X` does not list in its `excludes`. An entry never
 * excludes itself, so chaining the same method twice stays legal and is left to the runtime validators.
 */
export type Remaining<E extends DecoratorEntry, X extends DecoratorEntry> = E extends DecoratorEntry
  ? [E['name']] extends [X['excludes'][number]]
    ? never
    : E
  : never;

/**
 * A decorator chain. `E` is the set of entries still available: each method returns a chain over the
 * entries its own `excludes` leave, so an excluded method is absent from the returned type.
 */
export type Chain<
  T extends DecoratorTarget,
  K extends BuilderKind = 'plain',
  E extends DecoratorEntry = RegisteredDecorator,
> = {
  readonly [X in ChainEntry<E, T, K> as MethodName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => Chain<T, K, Remaining<E, X>>;
} & {
  /** The decorator nodes chained so far, in call order. */
  decorators(): BuilderNode[];
};

/** The options form for a `T` target: one optional key per multi-part registry entry. */
export type Options<T extends DecoratorTarget, E extends DecoratorEntry = RegisteredDecorator> = {
  readonly [X in OptionEntry<E, T> as BareName<X['name']>]?: OptionValue<X['args']>;
};
