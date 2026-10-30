import type { ASTModel } from '../../types';
import { createModel } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { fieldNode } from './field';
import type { IdOf } from './field';
import { isRelationBuilder, relationNodes } from './relation';
import type { RegisteredDecorator } from '../registry';
import { compositeDirectives } from './composite';
import type { Options } from './types';
import type { ObjectFields } from './object';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget, NoPrivateOverride } from './extends';
import type { PrivateKeys } from './handle';

/** The field builders of a model body, keyed by field name. */
export type ModelFields = ObjectFields;

/**
 * The third argument of `model()`: `abstract`, plus the composite directive keys the registry declares
 * for a model. `Key` is the model's own field names, which the directives' field paths must start from.
 */
export type ModelOptions<
  Key extends string = string,
  Parent extends string = string,
  Reserved extends string = string,
> = Options<'model', RegisteredDecorator, Key> & {
  /** `abstract model`: consumed by inheritance resolution, never given a table. */
  readonly abstract?: boolean;
  /** The parent to inherit from: its handle, or `Parent.pick(...)` and `Parent.omit(...)` of it. */
  readonly extends?: ExtendsTarget<Parent, Reserved>;
};

type StemOf<K extends string> = K extends `${infer S}s` ? S : K;

/** The foreign key a forward relation derives: `authorId`, or `tagIds` for an array (no `optional` method left). */
type DerivedKey<K extends string, B> = B extends { field(name: string): unknown }
  ? B extends { optional(): unknown }
    ? `${K}Id`
    : `${StemOf<K>}Ids`
  : never;

/**
 * The names a model declares, as its field list holds them: its own keys plus the key each forward
 * relation derives. A key renamed with `.field()` is not tracked here.
 */
export type MembersOf<Fields extends object> = {
  [K in keyof Fields & string]: K | DerivedKey<K, Fields[K]>;
}[keyof Fields & string];

interface ModelDeclaration {
  readonly name: string;
  readonly fields: ModelFields;
  readonly options: ModelOptions;
}

// Read only by `modelNode`; the parent is also reachable through `extendsOf`.
const NODES = new WeakMap<object, ModelDeclaration>();

/**
 * Declare a model. The handle's `Id` is the id type of the field marked `.id()`, whatever that field is
 * called, and `never` when none is marked.
 */
export function model<
  Name extends string,
  Fields extends ModelFields,
  Parent extends string = never,
  Reserved extends string = never,
>(
  name: Name,
  fields: Fields & NoPrivateOverride<NoInfer<Fields>, Reserved>,
  options: ModelOptions<MembersOf<Fields> | NoInfer<Parent>, Parent, Reserved> = {},
): Extendable<Name, IdOf<Fields>, MembersOf<Fields>, MembersOf<Fields> | Parent, PrivateKeys<Fields> | Reserved> {
  const handle = extendable<
    Name,
    IdOf<Fields>,
    MembersOf<Fields>,
    MembersOf<Fields> | Parent,
    PrivateKeys<Fields> | Reserved
  >(name);
  recordExtends(handle, options.extends);
  NODES.set(handle, { name, fields, options });

  return handle;
}

/** Materialise a model handle as the node the parser gives for the same declaration. */
export function modelNode(handle: object): ASTModel {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not a model handle: ${String(handle)}`);
  const fields = Object.entries(declared.fields).flatMap(([key, builder]) =>
    isRelationBuilder(builder) ? relationNodes(builder, key) : [fieldNode(builder, key)],
  );
  const seen = new Set<string>();
  for (const { name } of fields) {
    if (seen.has(name)) throw new Error(`Model ${declared.name} declares field ${name} twice`);
    seen.add(name);
  }
  const { abstract, extends: _parent, ...composite } = declared.options;
  const directives = compositeDirectives(composite);
  const clause = extendsOf(handle);
  const [parentName, filter] = clause ? extendsFields(clause) : [];

  return createModel(declared.name, fields, BUILDER_RANGE, directives, abstract, parentName, filter);
}
