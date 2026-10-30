import type { ASTModel } from '../../types';
import { createModel } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { fieldNode } from './field';
import type { IdOf } from './field';
import type { Handle } from './handle';
import type { RegisteredDecorator } from '../registry';
import { compositeDirectives } from './composite';
import type { Options } from './types';
import type { ObjectFields } from './object';

/** The field builders of a model body, keyed by field name. */
export type ModelFields = ObjectFields;

/**
 * The third argument of `model()`: `abstract`, plus the composite directive keys the registry declares
 * for a model. `Key` is the model's own field names, which the directives' field paths must start from.
 */
export type ModelOptions<Key extends string = string> = Options<'model', RegisteredDecorator, Key> & {
  /** `abstract model`: consumed by inheritance resolution, never given a table. */
  readonly abstract?: boolean;
};

interface ModelDeclaration {
  readonly name: string;
  readonly fields: ModelFields;
  readonly options: ModelOptions;
}

// Read only by `modelNode`, so a handle carries nothing but its name.
const NODES = new WeakMap<object, ModelDeclaration>();

/**
 * Declare a model. The handle's `Id` is the id type of the field marked `.id()`, whatever that field is
 * called, and `never` when none is marked.
 */
export function model<Name extends string, Fields extends ModelFields>(
  name: Name,
  fields: Fields,
  options: ModelOptions<keyof Fields & string> = {},
): Handle<Name, IdOf<Fields>> {
  const handle: Handle<Name, IdOf<Fields>> = Object.freeze({ name });
  NODES.set(handle, { name, fields, options });

  return handle;
}

/** Materialise a model handle as the node the parser gives for the same declaration. */
export function modelNode(handle: object): ASTModel {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not a model handle: ${String(handle)}`);
  const fields = Object.entries(declared.fields).map(([key, builder]) => fieldNode(builder, key));
  const { abstract, ...composite } = declared.options;
  const directives = compositeDirectives(composite);

  return createModel(declared.name, fields, BUILDER_RANGE, directives, abstract);
}
