import type { ASTObject } from '../../types';
import { createObject } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { fieldNode } from './field';
import type { Handle } from './handle';

/** The field builders of an object body, keyed by field name. */
export type ObjectFields = Readonly<Record<string, object>>;

// Read only by `objectNode`, so a handle carries nothing but its name.
const NODES = new WeakMap<object, { readonly name: string; readonly fields: ObjectFields }>();

/**
 * Declare an object type. Whether a field is flexible is a call on that field, never a property of the
 * object, so one object can be flexible from one field and strict from another. A self-reference goes
 * through `f.object(() => Self)` or a bare name, and whether it is legal is the schema validator's call.
 */
export function object<Name extends string>(name: Name, fields: ObjectFields): Handle<Name> {
  const handle: Handle<Name> = Object.freeze({ name });
  NODES.set(handle, { name, fields });

  return handle;
}

/** Materialise an object handle as the node the parser gives for the same declaration. */
export function objectNode(handle: object): ASTObject {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not an object handle: ${String(handle)}`);
  const fields = Object.entries(declared.fields).map(([key, builder]) => fieldNode(builder, key));

  return createObject(declared.name, fields, BUILDER_RANGE);
}
