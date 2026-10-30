import type { ASTEnum } from '../../types';
import { createEnum } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget, VisibleOf } from './extends';
import type { LiteralHandle } from './literal';
import { sharedWeakMap } from './shared-state';

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface EnumDefinition {
  readonly name: string;
  readonly values: readonly string[];
}

// Read only by `enumNode`, so a handle carries nothing but its name
const DEFINITIONS = sharedWeakMap<EnumDefinition>('enum.definitions');

/** Whether `handle` was declared by `enumeration()`. */
export function isEnumHandle(handle: object): boolean {
  return DEFINITIONS.has(handle);
}

/**
 * `enum Name { A, B }`. Values are strings only, so a number or boolean is a compile error: mixed types
 * mean `literal` instead. The handle is a simple literal handle, since an enum nests like a primitive-only
 * literal, and so does a child of one. A pick or omit list takes the parent's own values, written as the
 * bare names the schema text uses. (`enum` is reserved, so the barrel exports this under that name.)
 */
export function enumeration<
  const Name extends string,
  const V extends readonly string[],
  Target extends ExtendsTarget = never,
>(
  name: Name,
  values: V,
  options: { readonly extends?: Target } = {},
): LiteralHandle<Name, true> & Extendable<Name, never, V[number], V[number] | VisibleOf<Target>> {
  // Same rule as the parser: bare identifiers, never a boolean word, which also keeps quotes and separators out
  for (const value of values) {
    if (typeof value !== 'string' || !IDENTIFIER.test(value) || value === 'true' || value === 'false') {
      throw new Error(`Enum ${name}: invalid value '${value}'. Values must be valid identifiers`);
    }
  }
  const handle = extendable(name);
  recordExtends(handle, options.extends);
  DEFINITIONS.set(handle, { name, values: [...values] });

  return handle as never;
}

/** Materialise an enum handle as the node the parser gives for the same block. */
export function enumNode(handle: LiteralHandle): ASTEnum {
  const definition = DEFINITIONS.get(handle);
  if (!definition) throw new Error(`Not an enum handle: ${handle.name}`);

  const clause = extendsOf(handle);
  if (clause && !DEFINITIONS.has(clause.parent)) {
    throw new Error(`'extends' on an enum takes an enum handle, got ${String(clause.parent)}`);
  }
  const [parentName, filter] = clause ? extendsFields(clause) : [];

  return createEnum(definition.name, [...definition.values], BUILDER_RANGE, parentName, filter);
}
