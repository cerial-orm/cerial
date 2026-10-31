import type { ASTModel } from '../../types';
import { createModel } from '../types/ast';
import { BUILDER_RANGE } from './chain';
import { checkedIdentifier, checkedKeys } from './identifier';
import { fieldNode } from './field';
import type { IdOf } from './field';
import { foreignKeyOf, isRelationBuilder, relationNodes } from './relation';
import type { NamedOf } from './relation';
import type { RegisteredDecorator } from '../registry';
import { compositeDirectives } from './composite';
import type { Options } from './types';
import type { ObjectFields } from './object';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget, NoPrivateOverride } from './extends';
import type { PrivateKeys } from './handle';
import { numberDeclaration, sharedWeakMap } from './shared-state';

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

/**
 * The foreign key a forward relation names: the one `.field()` gave, else the derived `authorId`, or
 * `tagIds` for an array (no `optional` method left).
 */
type DerivedKey<K extends string, B> = B extends { field(name: string): unknown }
  ? [NamedOf<B>] extends [never]
    ? B extends { optional(): unknown }
      ? `${K}Id`
      : `${StemOf<K>}Ids`
    : NamedOf<B>
  : never;

/**
 * The names a model declares, as its field list holds them: its own keys plus the key each forward
 * relation names or derives.
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
const NODES = sharedWeakMap<ModelDeclaration>('model.nodes');

/** Whether `handle` was declared by `model()`. */
export function isModelHandle(handle: object): boolean {
  return NODES.has(handle);
}

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
  checkedIdentifier('model', name);
  checkedKeys('model field', fields);
  const handle = extendable<
    Name,
    IdOf<Fields>,
    MembersOf<Fields>,
    MembersOf<Fields> | Parent,
    PrivateKeys<Fields> | Reserved
  >(name);
  recordExtends(handle, options.extends);
  NODES.set(handle, { name, fields, options });
  numberDeclaration(handle);

  return handle;
}

/** The names a model inherits through `extends`, with the child's pick or omit applied at each step. */
function inheritedNames(handle: object, seen: ReadonlySet<object> = new Set()): Set<string> {
  const clause = extendsOf(handle);
  const parent = clause && NODES.get(clause.parent);
  const names = new Set<string>();
  if (!clause || !parent || seen.has(handle)) return names;
  const visible = inheritedNames(clause.parent, new Set([...seen, handle]));
  for (const [key, builder] of Object.entries(parent.fields)) {
    visible.add(key);
    const foreignKey = foreignKeyOf(builder, key);
    if (foreignKey) visible.add(foreignKey);
  }
  const listed = new Set(clause.filter?.fields);
  for (const name of visible) {
    if (!clause.filter || (clause.filter.mode === 'pick') === listed.has(name)) names.add(name);
  }

  return names;
}

/** Materialise a model handle as the node the parser gives for the same declaration. */
export function modelNode(handle: object): ASTModel {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not a model handle: ${String(handle)}`);
  // A `.field(name)` binds only to a field written on the model or inherited through `extends`
  const bindable = new Set([...Object.keys(declared.fields), ...inheritedNames(handle)]);
  const fields = Object.entries(declared.fields).flatMap(([key, builder]) =>
    isRelationBuilder(builder) ? relationNodes(builder, key, bindable) : [fieldNode(builder, key)],
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
