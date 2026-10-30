import type { ASTDecorator, ASTTuple, ASTTupleElement, SchemaFieldType } from '../../types';
import { createTuple, createTupleElement } from '../types/ast';
import { FIELD_TYPE_REGISTRY } from '../registry';
import type { DecoratorEntry, RegisteredDecorator } from '../registry';
import { BUILDER_RANGE, createChain } from './chain';
import { bareName, chainEntries } from './entries';
import { referenceName } from './handle';
import type { PrivateKeys, PrivateMark, Reference } from './handle';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget, NoPrivateOverride } from './extends';
import type { BareName, BuilderNode, ChainEntry, MethodArgs, Remaining } from './types';

declare const ELEMENT: unique symbol;

/** What `tuple(...)` accepts as an element; a self-reference that is not yet nullable does not carry it. */
export interface Element {
  readonly [ELEMENT]: true;
}

/**
 * A tuple element under construction. The methods are the registry's chain entries for a tuple element,
 * so `@uuid` and the other decorators a tuple element refuses are absent. There is no `optional()`: the
 * schema validator rejects `?` on every element, because SurrealDB returns null for an absent position.
 */
export type ElementBuilder<E extends DecoratorEntry = RegisteredDecorator, Hidden extends boolean = false> = Element & {
  readonly [X in ChainEntry<E, 'tupleElement', 'plain'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => ElementBuilder<Remaining<E, X>, Hidden>;
} & {
  /** `!!private`: hidden from the client's output types, and a child cannot redeclare it. */
  private(): ElementBuilder<E, true>;
} & PrivateMark<Hidden>;

type NullableEntry = Extract<RegisteredDecorator, { readonly name: '@nullable' }>;

/** An object element takes no `@nullable`: SurrealDB cannot define sub-fields on a nullable object. */
export type ObjectElementBuilder = ElementBuilder<Exclude<RegisteredDecorator, NullableEntry>>;

/**
 * A reference to the tuple being declared. It is not an element until `.nullable()`, because a required
 * self-reference has no finite value and `?` is refused on elements, so `@nullable` is the only legal form.
 */
export interface SelfElementBuilder {
  nullable(): ElementBuilder<Remaining<RegisteredDecorator, NullableEntry>>;
}

type SimpleElementType = Exclude<SchemaFieldType, 'record' | 'relation' | 'object' | 'tuple' | 'literal'>;

/** One factory per element type: the built-in types except `record` and `relation`, plus references. */
export type ElementFactories = {
  readonly [T in SimpleElementType]: () => ElementBuilder;
} & {
  /** An element typed as an object definition. */
  readonly object: (reference: Reference) => ObjectElementBuilder;
  /** An element typed as another tuple. */
  readonly tuple: (reference: Reference) => ElementBuilder;
  /** An element typed as a literal or an enum, which the parser records the same way. */
  readonly literal: (reference: Reference) => ElementBuilder;
  /** An element typed as the tuple being declared. */
  readonly self: () => SelfElementBuilder;
};

interface ElementSpec {
  readonly type: SchemaFieldType;
  readonly objectReference?: Reference;
  readonly tupleReference?: Reference;
  readonly literalReference?: Reference;
  readonly self?: true;
}

interface ElementState {
  readonly spec: ElementSpec;
  readonly isPrivate: boolean;
  readonly chain: ChainRuntime;
}

interface ChainRuntime {
  decorators(): BuilderNode[];
  [method: string]: (...args: unknown[]) => unknown;
}

// Read only by `tupleNode`, so a builder carries nothing but its public methods.
const STATES = new WeakMap<object, ElementState>();

function builderOf(state: ElementState): object {
  const { spec } = state;
  const methods: Record<string, unknown> = {
    private: () => builderOf({ ...state, isPrivate: true }),
  };
  for (const entry of chainEntries('tupleElement')) {
    const name = bareName(entry.name);
    if (spec.type === 'object' && name === 'nullable') continue;
    methods[name] = (...args: unknown[]) => builderOf({ ...state, chain: state.chain[name]!(...args) as ChainRuntime });
  }
  const builder = Object.freeze(methods);
  STATES.set(builder, state);

  return builder;
}

function start(spec: ElementSpec): object {
  return builderOf({ spec, isPrivate: false, chain: createChain('tupleElement') as unknown as ChainRuntime });
}

function selfBuilder(): object {
  const chain = createChain('tupleElement') as unknown as ChainRuntime;

  return Object.freeze({
    nullable: () =>
      builderOf({
        spec: { type: 'tuple', self: true },
        isPrivate: false,
        chain: chain.nullable!() as ChainRuntime,
      }),
  });
}

function simpleFactories(): Record<string, () => object> {
  const factories: Record<string, () => object> = {};
  for (const entry of FIELD_TYPE_REGISTRY.values()) {
    if (entry.fieldType === 'record' || entry.fieldType === 'relation') continue;
    factories[entry.fieldType] = () => start({ type: entry.fieldType });
  }

  return factories;
}

/** The element factories, for use inside `tuple(...)`. */
export const e = Object.freeze({
  ...simpleFactories(),
  object: (reference: Reference) => start({ type: 'object', objectReference: reference }),
  tuple: (reference: Reference) => start({ type: 'tuple', tupleReference: reference }),
  literal: (reference: Reference) => start({ type: 'literal', literalReference: reference }),
  self: selfBuilder,
}) as unknown as ElementFactories;

/**
 * Elements of a tuple body: an array for positional elements, or a record keyed by element name for
 * named ones. Named elements keep their key order.
 */
export type TupleElements = readonly Element[] | Readonly<Record<string, Element>>;

// Read only by `tupleNode`, so a handle carries nothing but its name.
const NODES = new WeakMap<object, { readonly name: string; readonly elements: TupleElements }>();

/** The second argument of `tuple()`: the parent to inherit from, as for a model. */
export interface TupleOptions<Parent extends string = string, Reserved extends string = string> {
  readonly extends?: ExtendsTarget<Parent, Reserved>;
}

/** The element names a tuple body declares: none for a positional body. */
type NamesOf<Elements extends TupleElements> = Elements extends readonly Element[] ? never : keyof Elements & string;

/**
 * Declare a tuple type. Element order is position, and a named element is also reachable by index, so a
 * pick or omit list takes names and, for any parent, positions. A parent's private element is refused by
 * name only; a positional one is left to the schema validator, as positions are not tracked in types.
 */
export function tuple<
  Name extends string,
  Elements extends TupleElements,
  Parent extends string = never,
  Reserved extends string = never,
>(
  name: Name,
  elements: Elements & NoPrivateOverride<NoInfer<Elements>, Reserved>,
  options: TupleOptions<Parent, Reserved> = {},
): Extendable<
  Name,
  never,
  NamesOf<Elements>,
  NamesOf<Elements> | Parent,
  PrivateKeys<Elements extends readonly Element[] ? object : Elements> | Reserved,
  number
> {
  const handle = extendable<
    Name,
    never,
    NamesOf<Elements>,
    NamesOf<Elements> | Parent,
    PrivateKeys<Elements extends readonly Element[] ? object : Elements> | Reserved,
    number
  >(name);
  recordExtends(handle, options.extends);
  NODES.set(handle, { name, elements });

  return handle;
}

function elementNode(builder: Element, tupleName: string, name?: string): ASTTupleElement {
  const state = STATES.get(builder);
  if (!state) throw new Error(`Not a tuple element builder: ${String(builder)}`);
  const { spec } = state;
  // Only field decorators chain on a tuple element; a directive never reaches here
  const decorators = state.chain.decorators().filter((node): node is ASTDecorator => 'type' in node);
  const tupleRef = spec.self ? tupleName : spec.tupleReference && referenceName(spec.tupleReference);

  return createTupleElement(
    spec.type,
    false,
    name,
    spec.objectReference && referenceName(spec.objectReference),
    tupleRef,
    decorators,
    spec.literalReference && referenceName(spec.literalReference),
    state.isPrivate || undefined,
  );
}

/** Materialise a tuple handle as the node the parser gives for the same declaration. */
export function tupleNode(handle: object): ASTTuple {
  const declared = NODES.get(handle);
  if (!declared) throw new Error(`Not a tuple handle: ${String(handle)}`);
  const { name, elements } = declared;
  const nodes = Array.isArray(elements)
    ? (elements as readonly Element[]).map((element) => elementNode(element, name))
    : Object.entries(elements).map(([key, element]) => elementNode(element as Element, name, key));

  const clause = extendsOf(handle);
  const [parentName, filter] = clause ? extendsFields(clause) : [];

  return createTuple(name, nodes, BUILDER_RANGE, parentName, filter);
}
