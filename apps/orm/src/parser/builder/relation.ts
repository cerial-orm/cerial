import type { ASTDecorator, ASTField } from '../../types';
import { createField } from '../types/ast';
import { DECORATOR_REGISTRY } from '../registry';
import type { DecoratorEntry, DecoratorName, RegisteredDecorator } from '../registry';
import { chainToken } from './argument-source';
import { BUILDER_RANGE, createChain } from './chain';
import { bareName, chainEntries } from './entries';
import { referenceName } from './handle';
import type { PrivateMark, Reference } from './handle';
import type { BareName, BuilderNode, ChainEntry, MethodArgs, Remaining } from './types';

/** Entries a relation builder does not chain with the rest: `@field` is the `.field(name)` override. */
type NotChained = { readonly name: '@field' | '@onDelete' };

/** The chain method of `@onDelete`, read from the registry so its accepted values are not restated. */
type OnDeleteEntry<E extends DecoratorEntry> = Extract<E, { readonly name: '@onDelete' }>;

/**
 * Whether `.onDelete()` exists: the validator accepts `@onDelete` on a singular relation that is optional
 * or nullable, and refuses a required one (it auto-cascades) and an array one.
 */
type OnDeleteAllowed<O extends boolean, A extends boolean, N extends boolean> = A extends true
  ? false
  : O extends true
    ? true
    : N;

/**
 * A forward relation under construction. Each call returns a new builder. The backing `Record` is derived
 * from the declaration, so the pair cannot disagree: `O`, `A` and `N` are optional, array and nullable.
 * The methods are the registry's chain entries for a relation, and `.field(name)` names the foreign key
 * when the default does not fit.
 */
export type RelationBuilder<
  E extends DecoratorEntry = RegisteredDecorator,
  O extends boolean = false,
  A extends boolean = false,
  N extends boolean = false,
  Hidden extends boolean = false,
> = {
  readonly [X in ChainEntry<Exclude<E, NotChained>, 'modelField', 'relation'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => RelationBuilder<Remaining<E, X>, O, A, X['name'] extends '@nullable' ? true : N, Hidden>;
} & {
  /** `!!private`: hides the relation from the client's output types. */
  private(): RelationBuilder<E, O, A, N, true>;
  /** `@field(name)`: the foreign key's name, instead of the relation's name plus `Id`. */
  field(name: string): RelationBuilder<E, O, A, N, Hidden>;
} & PrivateMark<Hidden> &
  (A extends true
    ? unknown
    : O extends true
      ? unknown
      : {
          /** `Relation[]`; the key becomes a `Record[]` named with an `Ids` suffix. The schema has no optional array relation. */
          array(): RelationBuilder<E, O, true, N, Hidden>;
        }) &
  (A extends true
    ? unknown
    : {
        /** `Relation?`; the key becomes `Record?` too. */
        optional(): RelationBuilder<E, true, A, N, Hidden>;
      }) &
  (OnDeleteAllowed<O, A, N> extends true
    ? {
        /** `@onDelete(action)`: `SetNull` makes the key nullable and `SetNone` makes it optional. */
        onDelete(...args: MethodArgs<OnDeleteEntry<E>['args']>): RelationBuilder<E, O, A, N, Hidden>;
      }
    : unknown);

/**
 * The reverse side of a relation under construction. It stores nothing, so it has no foreign key to name
 * (`.field()`) and no deletion rule (`.onDelete()`), and `@nullable` is refused on any relation. What is
 * left is `@key`, which pairs it with its forward side, plus the array, optional and private forms.
 */
export type ReverseBuilder<
  E extends DecoratorEntry = RegisteredDecorator,
  O extends boolean = false,
  A extends boolean = false,
  Hidden extends boolean = false,
> = {
  readonly [X in ChainEntry<Extract<E, { readonly name: '@key' }>, 'modelField', 'relation'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => ReverseBuilder<Remaining<E, X>, O, A, Hidden>;
} & {
  /** `!!private`: hides the relation from the client's output types. */
  private(): ReverseBuilder<E, O, A, true>;
} & PrivateMark<Hidden> &
  (A extends true
    ? unknown
    : O extends true
      ? unknown
      : {
          /** `Relation[]`: every record that points back at this one. */
          array(): ReverseBuilder<E, O, true, Hidden>;
        }) &
  (A extends true
    ? unknown
    : {
        /** `Relation?` */
        optional(): ReverseBuilder<E, true, A, Hidden>;
      });

interface ChainRuntime {
  decorators(): BuilderNode[];
  [method: string]: (...args: unknown[]) => unknown;
}

interface RelationState {
  readonly target: Reference;
  readonly foreignKey: string | undefined;
  readonly isOptional: boolean;
  readonly isArray: boolean;
  readonly isPrivate: boolean;
  readonly chain: ChainRuntime;
}

// Read only by `relationNodes`, so a builder carries nothing but its public methods.
const STATES = new WeakMap<object, RelationState>();
const REVERSE_STATES = new WeakMap<object, RelationState>();

function registered(name: DecoratorName): DecoratorEntry {
  const entry = DECORATOR_REGISTRY.get(name);
  if (!entry) throw new Error(`The decorator registry has no ${name}`);

  return entry;
}

function decoratorNode(name: DecoratorName, arg?: string): ASTDecorator {
  const entry = registered(name);

  return entry.parse(chainToken(entry, arg), BUILDER_RANGE) as ASTDecorator;
}

function builderOf(state: RelationState): object {
  const methods: Record<string, unknown> = {
    field: (name: string) => builderOf({ ...state, foreignKey: name }),
    array: () => builderOf({ ...state, isArray: true }),
    optional: () => builderOf({ ...state, isOptional: true }),
    private: () => builderOf({ ...state, isPrivate: true }),
  };
  for (const entry of chainEntries('modelField', 'relation')) {
    const name = bareName(entry.name);
    if (name in methods) continue;
    methods[name] = (...args: unknown[]) => builderOf({ ...state, chain: state.chain[name]!(...args) as ChainRuntime });
  }
  const builder = Object.freeze(methods);
  STATES.set(builder, state);

  return builder;
}

/**
 * A relation to `target`: a handle, a thunk returning one, or a bare name (only for a module graph that
 * is cyclic). The target is not read until the model is materialised, so a thunk may name a later `const`.
 */
export function relation(target: Reference): RelationBuilder {
  const chain = createChain('modelField', { kind: 'relation' }) as unknown as ChainRuntime;

  return builderOf({
    target,
    foreignKey: undefined,
    isOptional: false,
    isArray: false,
    isPrivate: false,
    chain,
  }) as RelationBuilder;
}

function reverseBuilderOf(state: RelationState): object {
  const methods: Record<string, unknown> = {
    array: () => reverseBuilderOf({ ...state, isArray: true }),
    optional: () => reverseBuilderOf({ ...state, isOptional: true }),
    private: () => reverseBuilderOf({ ...state, isPrivate: true }),
    key: (name: string) => reverseBuilderOf({ ...state, chain: state.chain.key!(name) as ChainRuntime }),
  };
  const builder = Object.freeze(methods);
  REVERSE_STATES.set(builder, state);

  return builder;
}

/**
 * The reverse side of a relation to `target`: no foreign key is derived, because the forward side owns
 * it. `f.relation` is always the forward side.
 */
export function reverse(target: Reference): ReverseBuilder {
  const chain = createChain('modelField', { kind: 'relation' }) as unknown as ChainRuntime;

  return reverseBuilderOf({
    target,
    foreignKey: undefined,
    isOptional: false,
    isArray: false,
    isPrivate: false,
    chain,
  }) as ReverseBuilder;
}

/** Whether `builder` came from `f.relation` or `f.reverse`, which a model expands and an object refuses. */
export function isRelationBuilder(builder: object): boolean {
  return STATES.has(builder) || REVERSE_STATES.has(builder);
}

/** `tags` is keyed by `tagIds`, `following` by `followingIds`: one trailing `s` goes before the suffix. */
function derivedKey(name: string, isArray: boolean): string {
  if (!isArray) return `${name}Id`;

  return `${name.endsWith('s') ? name.slice(0, -1) : name}Ids`;
}

function reverseNode(state: RelationState, name: string): ASTField {
  const decorators = [
    decoratorNode('@model', referenceName(state.target)),
    ...state.chain.decorators().filter((node): node is ASTDecorator => 'type' in node),
  ];

  return createField(
    name,
    'relation',
    state.isOptional,
    decorators,
    BUILDER_RANGE,
    state.isArray,
    undefined,
    undefined,
    undefined,
    undefined,
    state.isPrivate || undefined,
  );
}

/**
 * The two nodes a forward relation declares, foreign key first: the parser's corpus puts the key directly before
 * its relation in 60 of 64 hand-written forward relations. The foreign key carries no `Record(Type)`,
 * because its id type is inferred from the target model. It follows the relation's optionality and array
 * form, and `@onDelete` decides the rest: `SetNull` needs a nullable key and `SetNone` an optional one.
 */
export function relationNodes(builder: object, name: string): ASTField[] {
  const reversed = REVERSE_STATES.get(builder);
  if (reversed) return [reverseNode(reversed, name)];
  const state = STATES.get(builder);
  if (!state) throw new Error(`Not a relation builder: ${String(builder)}`);
  const foreignKey = state.foreignKey ?? derivedKey(name, state.isArray);
  const decorators = [
    decoratorNode('@field', foreignKey),
    decoratorNode('@model', referenceName(state.target)),
    ...state.chain.decorators().filter((node): node is ASTDecorator => 'type' in node),
  ];
  const onDelete = decorators.find((d) => d.type === 'onDelete')?.value;
  const keyDecorators = onDelete === 'SetNull' ? [decoratorNode('@nullable')] : [];

  return [
    createField(
      foreignKey,
      'record',
      state.isOptional || onDelete === 'SetNone',
      keyDecorators,
      BUILDER_RANGE,
      state.isArray,
    ),
    createField(
      name,
      'relation',
      state.isOptional,
      decorators,
      BUILDER_RANGE,
      state.isArray,
      undefined,
      undefined,
      undefined,
      undefined,
      state.isPrivate || undefined,
    ),
  ];
}
