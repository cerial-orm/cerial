import type { ASTLiteral, ASTLiteralVariant } from '../../types';
import { createLiteral } from '../types/ast';
import { BUILDER_RANGE } from './chain';
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
  string: (value: string) => ({ kind: 'string', value }) as const,
  int: (value: number) => {
    if (!Number.isInteger(value)) throw new Error(`variant.int needs an integer, got ${value}`);

    return { kind: 'int', value } as const;
  },
  float: (value: number) => {
    if (!Number.isFinite(value)) throw new Error(`variant.float needs a finite number, got ${value}`);

    return { kind: 'float', value } as const;
  },
  bool: (value: boolean) => ({ kind: 'bool', value }) as const,
  broadType: (typeName: BroadTypeName) => ({ kind: 'broadType', typeName }) as const,
  tuple: (ref: Reference) => ({ kind: 'tupleRef', ref }) as const,
  object: (ref: Reference) => ({ kind: 'objectRef', ref }) as const,
  literal: (ref: Reference) => ({ kind: 'literalRef', ref }) as const,
});

type IsSimple<V extends VariantSpec> = [Extract<V, { kind: ComplexKind }>] extends [never] ? true : false;

interface LiteralDefinition {
  readonly name: string;
  readonly variants: readonly VariantSpec[];
}

// Read only by `literalNode`, so a handle carries nothing but its name
const DEFINITIONS = new WeakMap<object, LiteralDefinition>();

/**
 * `literal Name { ... }`. A variant can never be the literal itself: a handle does not exist before this
 * call returns, and a bare name or thunk that resolves to the literal's own name is refused when the node is
 * built, as the parser refuses it.
 */
export function literal<const Name extends string, const V extends readonly VariantSpec[]>(
  name: Name,
  variants: V,
): LiteralHandle<Name, IsSimple<V[number]>> {
  const handle = Object.freeze({ name }) as LiteralHandle<Name, IsSimple<V[number]>>;
  DEFINITIONS.set(handle, { name, variants });

  return handle;
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

  return createLiteral(
    definition.name,
    definition.variants.map((spec) => resolveVariant(spec, definition.name)),
    BUILDER_RANGE,
  );
}
