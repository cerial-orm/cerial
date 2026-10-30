import type { ASTDecorator, ASTField } from '../../types';
import { createField } from '../types/ast';
import { DECORATOR_REGISTRY } from '../registry';
import type { DecoratorEntry, DecoratorName, RegisteredDecorator } from '../registry';
import { chainToken } from './argument-source';
import { BUILDER_RANGE, createChain } from './chain';
import { bareName, chainEntries } from './entries';
import { referenceName } from './handle';
import type { Reference } from './handle';
import type { BareName, BuilderNode, ChainEntry, MethodArgs, Remaining } from './types';

/**
 * Entries a relation builder does not chain: `@field` is the `.field(name)` override, and `@onDelete` is
 * not available until the builder can derive the foreign key's nullability from it.
 */
type NotChained = { readonly name: '@field' | '@onDelete' };

/**
 * A forward to-one relation under construction. Each call returns a new builder. The backing `Record`
 * is derived from the declaration, so the pair cannot disagree; the methods are the registry's chain
 * entries for a relation, and `.field(name)` names the foreign key when the default does not fit.
 */
export type RelationBuilder<E extends DecoratorEntry = RegisteredDecorator> = {
  readonly [X in ChainEntry<Exclude<E, NotChained>, 'modelField', 'relation'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => RelationBuilder<Remaining<E, X>>;
} & {
  /** `@field(name)`: the foreign key's name, instead of the relation's name plus `Id`. */
  field(name: string): RelationBuilder<E>;
};

interface ChainRuntime {
  decorators(): BuilderNode[];
  [method: string]: (...args: unknown[]) => unknown;
}

interface RelationState {
  readonly target: Reference;
  readonly foreignKey: string | undefined;
  readonly chain: ChainRuntime;
}

// Read only by `relationNodes`, so a builder carries nothing but its public methods.
const STATES = new WeakMap<object, RelationState>();

/** Chain methods that would emit a pair the parser could not, until the later work that derives them. */
const UNSUPPORTED = ['array', 'optional', 'private', 'onDelete'] as const;

function registered(name: DecoratorName): DecoratorEntry {
  const entry = DECORATOR_REGISTRY.get(name);
  if (!entry) throw new Error(`The decorator registry has no ${name}`);

  return entry;
}

function decoratorNode(name: DecoratorName, arg: string): ASTDecorator {
  const entry = registered(name);

  return entry.parse(chainToken(entry, arg), BUILDER_RANGE) as ASTDecorator;
}

function builderOf(state: RelationState): object {
  const methods: Record<string, unknown> = {
    field: (name: string) => builderOf({ ...state, foreignKey: name }),
  };
  for (const method of UNSUPPORTED) {
    methods[method] = () => {
      throw new Error(`.${method}() is not supported on f.relation() yet`);
    };
  }
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

  return builderOf({ target, foreignKey: undefined, chain }) as RelationBuilder;
}

/** Whether `builder` came from `f.relation`, which a model expands into two fields and an object refuses. */
export function isRelationBuilder(builder: object): boolean {
  return STATES.has(builder);
}

/**
 * The two nodes a relation declares, foreign key first: the parser's corpus puts the key directly before
 * its relation in 60 of 64 hand-written forward relations. The foreign key carries no `Record(Type)`,
 * because its id type is inferred from the target model.
 */
export function relationNodes(builder: object, name: string): [ASTField, ASTField] {
  const state = STATES.get(builder);
  if (!state) throw new Error(`Not a relation builder: ${String(builder)}`);
  const foreignKey = state.foreignKey ?? `${name}Id`;
  const decorators = [
    decoratorNode('@field', foreignKey),
    decoratorNode('@model', referenceName(state.target)),
    ...state.chain.decorators().filter((node): node is ASTDecorator => 'type' in node),
  ];

  return [
    createField(foreignKey, 'record', false, [], BUILDER_RANGE),
    createField(name, 'relation', false, decorators, BUILDER_RANGE),
  ];
}
