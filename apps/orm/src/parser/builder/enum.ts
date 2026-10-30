import type { ASTEnum } from '../../types';
import { createEnum } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import type { LiteralHandle } from './literal';

const IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

interface EnumDefinition {
  readonly name: string;
  readonly values: readonly string[];
}

// Read only by `enumNode`, so a handle carries nothing but its name
const DEFINITIONS = new WeakMap<object, EnumDefinition>();

/**
 * `enum Name { A, B }`. Values are strings only, so a number or boolean is a compile error: mixed types
 * mean `literal` instead. The handle is a simple literal handle, since an enum nests like a primitive-only
 * literal. (`enum` is reserved, so the barrel exports this under that name.)
 */
export function enumeration<const Name extends string>(
  name: Name,
  values: readonly string[],
): LiteralHandle<Name, true> {
  // Same rule as the parser: bare identifiers, never a boolean word, which also keeps quotes and separators out
  for (const value of values) {
    if (typeof value !== 'string' || !IDENTIFIER.test(value) || value === 'true' || value === 'false') {
      throw new Error(`Enum ${name}: invalid value '${value}'. Values must be valid identifiers`);
    }
  }
  const handle = Object.freeze({ name }) as LiteralHandle<Name, true>;
  DEFINITIONS.set(handle, { name, values: [...values] });

  return handle;
}

/** Materialise an enum handle as the node the parser gives for the same block. */
export function enumNode(handle: LiteralHandle): ASTEnum {
  const definition = DEFINITIONS.get(handle);
  if (!definition) throw new Error(`Not an enum handle: ${handle.name}`);

  return createEnum(definition.name, [...definition.values], BUILDER_RANGE);
}
