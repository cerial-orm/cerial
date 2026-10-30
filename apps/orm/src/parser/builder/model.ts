import type { ASTModel } from '../../types';
import { createModel } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { fieldNode } from './field';
import type { Handle } from './handle';
import type { Options } from './types';
import type { ObjectFields } from './object';

/** The field builders of a model body, keyed by field name. */
export type ModelFields = ObjectFields;

/**
 * The third argument of `model()`: `abstract`, plus the composite directive keys the registry declares
 * for a model. Those keys are accepted by type here and built where directives are applied.
 */
export type ModelOptions = Options<'model'> & {
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
 * Declare a model. The handle's `Id` stays `never`: a field builder does not record its `Record(...)` id
 * type, so deriving it from the `id` field waits on the builder carrying that type.
 */
export function model<Name extends string>(name: Name, fields: ModelFields, options: ModelOptions = {}): Handle<Name> {
  const handle: Handle<Name> = Object.freeze({ name });
  NODES.set(handle, { name, fields, options });

  return handle;
}

/** Materialise a model handle as the node the parser gives for the same declaration. */
export function modelNode(handle: object): ASTModel {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not a model handle: ${String(handle)}`);
  const fields = Object.entries(declared.fields).map(([key, builder]) => fieldNode(builder, key));
  // Directives are built from `declared.options` once composite directives are applied; until then every
  // model carries the parser's default of none.
  const directives: ASTModel['directives'] = [];

  return createModel(declared.name, fields, BUILDER_RANGE, directives, declared.options.abstract);
}
