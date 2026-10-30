import type { ASTLiteral, ASTLiteralVariant } from '../../types';
import { createLiteral } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { getVariantIdentity } from '../../resolver';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsFiltered, ExtendsTarget, VisibleOf } from './extends';
import { referenceName } from './handle';
import type { Handle, Reference } from './handle';

/** The broad type names a literal variant may stand for, as the parser recognises them. */
export type BroadTypeName = 'String' | 'Int' | 'Float' | 'Bool' | 'Date';

type ComplexKind = 'tupleRef' | 'objectRef' | 'literalRef';

/** A variant under construction; references stay unresolved until the node is asked for. */
export type VariantSpec =
  | Extract<ASTLiteralVariant, { kind: 'string' | 'int' | 'float' | 'bool' | 'broadType' }>
  | { readonly kind: 'tupleRef'; readonly ref: Reference }
  | { readonly kind: 'objectRef'; readonly ref: Reference }
  | { readonly kind: 'literalRef'; readonly ref: Reference };

/**
 * A literal's handle. `Simple` is true when every variant is a primitive, a broad type, or nothing but
 * strings (an enum): the only literals an object or tuple may nest, because inline type syntax cannot
 * express a nested literal that holds a reference. `simple` is a phantom, never present at runtime.
 */
export interface LiteralHandle<Name extends string = string, Simple extends boolean = boolean> extends Handle<Name> {
  readonly simple?: Simple;
}

/** A reference an object or tuple field may hold when it points at a literal or enum. */
export type SimpleLiteralReference =
  // `call` is absent from a handle and present on a function, which would otherwise pass as a handle
  // through `Function.name`
  (LiteralHandle<string, true> & { readonly call?: never }) | (() => LiteralHandle<string, true>) | string;

/**
 * One factory per variant kind. `int` and `float` are separate because the parser tells them apart by
 * the decimal point, which a JavaScript number cannot carry.
 */
export const variant = Object.freeze({
  string: <const T extends string>(value: T) => ({ kind: 'string', value }) as const,
  int: <const T extends number>(value: T) => {
    if (!Number.isInteger(value)) throw new Error(`variant.int needs an integer, got ${value}`);

    return { kind: 'int', value } as const;
  },
  float: <const T extends number>(value: T) => {
    if (!Number.isFinite(value)) throw new Error(`variant.float needs a finite number, got ${value}`);

    return { kind: 'float', value } as const;
  },
  bool: <const T extends boolean>(value: T) => ({ kind: 'bool', value }) as const,
  broadType: <const T extends BroadTypeName>(typeName: T) => ({ kind: 'broadType', typeName }) as const,
  tuple: <const R extends Reference>(ref: R) => ({ kind: 'tupleRef', ref }) as const,
  object: <const R extends Reference>(ref: R) => ({ kind: 'objectRef', ref }) as const,
  literal: <const R extends Reference>(ref: R) => ({ kind: 'literalRef', ref }) as const,
});

type IsSimple<V extends VariantSpec> = [Extract<V, { kind: ComplexKind }>] extends [never] ? true : false;

type RefName<R> = R extends string
  ? R
  : R extends () => Handle<infer N, unknown>
    ? N
    : R extends Handle<infer N, unknown>
      ? N
      : string;

/**
 * The text a pick or omit list uses for a variant, as `getVariantIdentity` computes it: a string quoted,
 * a number or boolean as written, a broad type or reference by name. Derived only so a list is checked
 * at compile time; the runtime filter strings come from `getVariantIdentity` itself.
 */
export type VariantIdentity<S> = S extends { readonly kind: 'string'; readonly value: infer V extends string }
  ? `'${V}'`
  : S extends { readonly kind: 'int' | 'float'; readonly value: infer N extends number }
    ? `${N}`
    : S extends { readonly kind: 'bool'; readonly value: infer B extends boolean }
      ? `${B}`
      : S extends { readonly kind: 'broadType'; readonly typeName: infer T extends string }
        ? T
        : S extends { readonly kind: ComplexKind; readonly ref: infer R }
          ? RefName<R>
          : never;

/** Whether the parent an `extends` takes is simple. A parent that does not say (a plain model handle) is. */
type ParentSimple<Target> = [Target] extends [never]
  ? true
  : Target extends { readonly simple?: infer S }
    ? [NonNullable<S>] extends [true]
      ? true
      : false
    : true;

/**
 * A literal that can be extended. `pick` and `omit` return a view that still says whether the parent is
 * simple, because a child of a complex parent is complex and the filter alone does not tell which
 * variants survive.
 */
export type ExtendableLiteral<
  Name extends string,
  Simple extends boolean,
  Own extends string,
  Visible extends string,
> = {
  pick<Picked extends Own>(
    ...fields: [Picked, ...Picked[]]
  ): ExtendsFiltered<Name, Picked> & { readonly simple?: Simple };
  omit<Omitted extends Own>(
    ...fields: [Omitted, ...Omitted[]]
  ): ExtendsFiltered<Name, Exclude<Visible, Omitted>> & { readonly simple?: Simple };
} & LiteralHandle<Name, Simple> &
  Extendable<Name, never, Own, Visible>;

/** The second argument of `literal()`: the parent to inherit from, as for a model. */
export interface LiteralOptions<Target extends ExtendsTarget = ExtendsTarget> {
  readonly extends?: Target;
}

interface LiteralDefinition {
  readonly name: string;
  readonly variants: readonly VariantSpec[];
}

// Read only by `literalNode`, so a handle carries nothing but its name
const DEFINITIONS = new WeakMap<object, LiteralDefinition>();

/** Whether `handle` was declared by `literal()`. */
export function isLiteralHandle(handle: object): boolean {
  return DEFINITIONS.has(handle);
}

/**
 * `literal Name { ... }`, or `literal Name extends Parent[...] { ... }` through `options.extends`. A pick or
 * omit list names variants by their identity: `"'low'"` for a string (quoted, as in the schema text),
 * `'1'`, `'true'` for a number or boolean, `'Int'` for a broad type, and the declaration's name for a
 * reference. A variant can never be the literal itself: a handle does not exist before this call returns,
 * and a bare name or thunk that resolves to the literal's own name is refused when the node is built, as
 * the parser refuses it.
 */
export function literal<
  const Name extends string,
  const V extends readonly VariantSpec[],
  Target extends ExtendsTarget = never,
>(
  name: Name,
  variants: V,
  options: LiteralOptions<Target> = {},
): ExtendableLiteral<
  Name,
  IsSimple<V[number]> extends true ? ParentSimple<Target> : false,
  VariantIdentity<V[number]>,
  VariantIdentity<V[number]> | VisibleOf<Target>
> {
  const handle = extendable(name);
  recordExtends(handle, options.extends);
  DEFINITIONS.set(handle, { name, variants });

  return handle as never;
}

/** The identities a parent literal declares itself: what a child's pick or omit list is checked against. */
function declaredIdentities(parent: object): string[] {
  const definition = DEFINITIONS.get(parent);
  if (!definition) throw new Error(`'extends' on a literal takes a literal handle, got ${String(parent)}`);

  return definition.variants.map((spec) => getVariantIdentity(resolveVariant(spec, definition.name)));
}

function resolveVariant(spec: VariantSpec, literalName: string): ASTLiteralVariant {
  switch (spec.kind) {
    case 'tupleRef':
      return { kind: 'tupleRef', tupleName: referenceName(spec.ref) };
    case 'objectRef':
      return { kind: 'objectRef', objectName: referenceName(spec.ref) };
    case 'literalRef': {
      const target = referenceName(spec.ref);
      if (target === literalName) throw new Error(`Literal ${literalName} cannot reference itself`);

      return { kind: 'literalRef', literalName: target };
    }
    default:
      return { ...spec };
  }
}

/**
 * Materialise a literal handle as the node the parser gives for the same block. The origin is the
 * factory's placeholder: the materialise pass stamps `kind: 'ts'`.
 */
export function literalNode(handle: Handle): ASTLiteral {
  const definition = DEFINITIONS.get(handle);
  if (!definition) throw new Error(`Not a literal handle: ${handle.name}`);

  const clause = extendsOf(handle);
  const [parentName, filter] = clause ? extendsFields(clause) : [];
  if (clause) {
    const known = declaredIdentities(clause.parent);
    // An unmatched identity filters to nothing, so refuse it here with the form that would match
    for (const id of filter?.fields ?? []) {
      if (!known.includes(id)) {
        throw new Error(
          `Literal ${definition.name}: ${parentName} has no variant ${id}. Its variants are ${known.join(', ')}`,
        );
      }
    }
  }

  return createLiteral(
    definition.name,
    definition.variants.map((spec) => resolveVariant(spec, definition.name)),
    BUILDER_RANGE,
    parentName,
    filter,
  );
}
