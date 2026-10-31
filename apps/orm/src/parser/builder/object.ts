import type { ASTObject } from '../../types';
import { createObject } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { checkedIdentifier, checkedKeys } from './identifier';
import { fieldNode } from './field';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget, NoPrivateOverride } from './extends';
import type { PrivateKeys } from './handle';
import { isRelationBuilder } from './relation';
import { numberDeclaration, sharedWeakMap } from './shared-state';

/** The field builders of an object body, keyed by field name. */
export type ObjectFields = Readonly<Record<string, object>>;

/** The second argument of `object()`: the parent to inherit from, as for a model. */
export interface ObjectOptions<Parent extends string = string, Reserved extends string = string> {
  readonly extends?: ExtendsTarget<Parent, Reserved, 'object'>;
}

// Read only by `objectNode`; the parent is also reachable through `extendsOf`.
const NODES = sharedWeakMap<{ readonly name: string; readonly fields: ObjectFields }>('object.nodes');

/** Whether `handle` was declared by `object()`. */
export function isObjectHandle(handle: object): boolean {
  return NODES.has(handle);
}

/**
 * Declare an object type. Whether a field is flexible is a call on that field, never a property of the
 * object, so one object can be flexible from one field and strict from another. A self-reference goes
 * through `f.object(() => Self)` or a bare name, and whether it is legal is the schema validator's call.
 */
export function object<
  Name extends string,
  Fields extends ObjectFields,
  Parent extends string = never,
  Reserved extends string = never,
>(
  name: Name,
  fields: Fields & NoPrivateOverride<NoInfer<Fields>, Reserved>,
  options: ObjectOptions<Parent, Reserved> = {},
): Extendable<
  Name,
  never,
  keyof Fields & string,
  (keyof Fields & string) | Parent,
  PrivateKeys<Fields> | Reserved,
  never,
  'object'
> {
  checkedIdentifier('object', name);
  checkedKeys('object field', fields);
  const handle = extendable<
    Name,
    never,
    keyof Fields & string,
    (keyof Fields & string) | Parent,
    PrivateKeys<Fields> | Reserved,
    never,
    'object'
  >(name);
  recordExtends(handle, options.extends, 'object');
  NODES.set(handle, { name, fields });
  numberDeclaration(handle);

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
