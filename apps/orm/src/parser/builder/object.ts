import type { ASTObject } from '../../types';
import { createObject } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { fieldNode } from './field';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget } from './extends';
import { isRelationBuilder } from './relation';

/** The field builders of an object body, keyed by field name. */
export type ObjectFields = Readonly<Record<string, object>>;

/** The second argument of `object()`: the parent to inherit from, as for a model. */
export interface ObjectOptions<Parent extends string = string> {
  readonly extends?: ExtendsTarget<Parent>;
}

// Read only by `objectNode`; the parent is also reachable through `extendsOf`.
const NODES = new WeakMap<object, { readonly name: string; readonly fields: ObjectFields }>();

/**
 * Declare an object type. Whether a field is flexible is a call on that field, never a property of the
 * object, so one object can be flexible from one field and strict from another. A self-reference goes
 * through `f.object(() => Self)` or a bare name, and whether it is legal is the schema validator's call.
 */
export function object<Name extends string, Fields extends ObjectFields, Parent extends string = never>(
  name: Name,
  fields: Fields,
  options: ObjectOptions<Parent> = {},
): Extendable<Name, never, keyof Fields & string, (keyof Fields & string) | Parent> {
  const handle = extendable<Name, never, keyof Fields & string, (keyof Fields & string) | Parent>(name);
  recordExtends(handle, options.extends);
  NODES.set(handle, { name, fields });

  return handle;
}

/** Materialise an object handle as the node the parser gives for the same declaration. */
export function objectNode(handle: object): ASTObject {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not an object handle: ${String(handle)}`);
  const fields = Object.entries(declared.fields).map(([key, builder]) => {
    if (isRelationBuilder(builder)) throw new Error(`Object ${declared.name} cannot hold relation field ${key}`);

    return fieldNode(builder, key);
  });

  const clause = extendsOf(handle);
  const [parentName, filter] = clause ? extendsFields(clause) : [];

  return createObject(declared.name, fields, BUILDER_RANGE, parentName, filter);
}
