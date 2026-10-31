import type { ASTDecorator, ASTTuple, ASTTupleElement, SchemaFieldType } from '../../types';
import { CerialGenerationError } from '../../errors';
import { createTuple, createTupleElement } from '../types/ast';
import { FIELD_TYPE_REGISTRY } from '../registry';
import type { DecoratorEntry, RegisteredDecorator } from '../registry';
import { BUILDER_RANGE, createChain } from './chain';
import { bareName, chainEntries } from './entries';
import { checkedIdentifier } from './identifier';
import { referenceName } from './handle';
import type { PrivateMark, Reference } from './handle';
import { extendable, extendsFields, extendsOf, recordExtends } from './extends';
import type { Extendable, ExtendsTarget, NoPrivateOverride } from './extends';
import type { BareName, BuilderNode, ChainEntry, MethodArgs, Remaining } from './types';
import { numberDeclaration, sharedWeakMap } from './shared-state';

declare const ELEMENT: unique symbol;
declare const ELEMENT_NAME: unique symbol;

/** Type-only: the name `.named()` gave an element, `never` for an unnamed one. */
type NamedMark<Name extends string> = [Name] extends [never] ? unknown : { readonly [ELEMENT_NAME]: Name };

/** What `tuple(...)` accepts as an element; a self-reference that is not yet nullable does not carry it. */
export interface Element {
  readonly [ELEMENT]: true;
}

/**
 * A tuple element under construction. The methods are the registry's chain entries for a tuple element,
 * so `@uuid` and the other decorators a tuple element refuses are absent. There is no `optional()`: the
 * schema validator rejects `?` on every element, because SurrealDB returns null for an absent position.
 */
export type ElementBuilder<
  E extends DecoratorEntry = RegisteredDecorator,
  Hidden extends boolean = false,
  Name extends string = never,
> = Element & {
  readonly [X in ChainEntry<E, 'tupleElement', 'plain'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => ElementBuilder<Remaining<E, X>, Hidden, Name>;
} & {
  /** `!!private`: hidden from the client's output types, and a child cannot redeclare it. */
  private(): ElementBuilder<E, true, Name>;
  /**
   * Name this element in the array form, so a tuple can mix named and unnamed elements. The record form
   * already names its elements by key and refuses a name given here.
   */
  named<N extends string>(name: N): ElementBuilder<E, Hidden, N>;
} & PrivateMark<Hidden> &
  NamedMark<Name>;

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
  readonly name?: string;
  readonly chain: ChainRuntime;
}

interface ChainRuntime {
  decorators(): BuilderNode[];
  [method: string]: (...args: unknown[]) => unknown;
}

const INTEGER_KEY = /^(0|[1-9]\d*)$/;

// Read only by `tupleNode`, so a builder carries nothing but its public methods.
const STATES = sharedWeakMap<ElementState>('tuple.states');

function builderOf(state: ElementState): object {
  const { spec } = state;
  const methods: Record<string, unknown> = {
    private: () => builderOf({ ...state, isPrivate: true }),
    named: (name: unknown) => builderOf({ ...state, name: checkedIdentifier('tuple element', name) }),
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
const NODES = sharedWeakMap<{ readonly name: string; readonly elements: TupleElements }>('tuple.nodes');

/** Whether `handle` was declared by `tuple()`. */
export function isTupleHandle(handle: object): boolean {
  return NODES.has(handle);
}

/** The second argument of `tuple()`: the parent to inherit from, as for a model. */
export interface TupleOptions<Parent extends string = string, Reserved extends string = string> {
  readonly extends?: ExtendsTarget<Parent, Reserved>;
}

/** The name `.named()` gave an element, or `never`. */
type NameOf<El> = El extends { readonly [ELEMENT_NAME]: infer N extends string } ? N : never;

/** The element names a tuple body declares: its keys, or what `.named()` gave the elements of an array. */
type NamesOf<Elements extends TupleElements> = Elements extends readonly Element[]
  ? NameOf<Elements[number]>
  : keyof Elements & string;

/** The names of the elements marked `.private()`. */
type PrivateNamesOf<Elements extends TupleElements> = Elements extends readonly Element[]
  ? Elements[number] extends infer El
    ? El extends PrivateMark<true>
      ? NameOf<El>
      : never
    : never
  : {
      [K in keyof Elements & string]: Elements[K] extends PrivateMark<infer H>
        ? [H] extends [true]
          ? K
          : never
        : never;
    }[keyof Elements & string];

/** The record form names by key, so a `.named()` element there is refused with the offending key in the message. */
type NoNamedInRecord<Elements extends TupleElements> = Elements extends readonly Element[]
  ? unknown
  : {
      readonly [K in keyof Elements]: [NameOf<Elements[K]>] extends [never]
        ? unknown
        : `'${K & string}' is named by its key; drop .named()`;
    };

/**
 * Declare a tuple type. Element order is position, and a named element is also reachable by index, so a
 * pick or omit list takes names and, for any parent, positions. A parent's private element is refused by
 * name only; a positional one is left to the schema validator, as positions are not tracked in types.
 */
export function tuple<
  Name extends string,
  // const keeps each array element's own type; a plain array would reduce them to one and lose their names
  const Elements extends TupleElements,
  Parent extends string = never,
  Reserved extends string = never,
>(
  name: Name,
  elements: Elements & NoPrivateOverride<NoInfer<Elements>, Reserved> & NoNamedInRecord<NoInfer<Elements>>,
  options: TupleOptions<Parent, Reserved> = {},
): Extendable<Name, never, NamesOf<Elements>, NamesOf<Elements> | Parent, PrivateNamesOf<Elements> | Reserved, number> {
  checkedIdentifier('tuple', name);
  // An integer-like key is left to `tupleNode`, whose message says to name the element instead
  if (!Array.isArray(elements)) {
    for (const key of Object.keys(elements)) if (!INTEGER_KEY.test(key)) checkedIdentifier('tuple element', key);
  }
  const handle = extendable<
    Name,
    never,
    NamesOf<Elements>,
    NamesOf<Elements> | Parent,
    PrivateNamesOf<Elements> | Reserved,
    number
  >(name);
  recordExtends(handle, options.extends);
  NODES.set(handle, { name, elements });
  numberDeclaration(handle);

  return handle;
}

function elementNode(builder: Element, tupleName: string, key?: string): ASTTupleElement {
  const state = STATES.get(builder);
  if (!state) throw new Error(`Not a tuple element builder: ${String(builder)}`);
  if (key !== undefined && state.name !== undefined) {
    throw new CerialGenerationError(
      `Tuple ${tupleName}: element '${key}' is named by its key, so .named('${state.name}') is not allowed there`,
    );
  }
  const { spec } = state;
  // Only field decorators chain on a tuple element; a directive never reaches here
  const decorators = state.chain.decorators().filter((node): node is ASTDecorator => 'type' in node);
  const tupleRef = spec.self ? tupleName : spec.tupleReference && referenceName(spec.tupleReference);

  return createTupleElement(
    spec.type,
    false,
    key ?? state.name,
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
  // Integer-like keys are moved to the front of an object by the language, which would reorder positions
  const reordered = Array.isArray(elements) ? undefined : Object.keys(elements).find((key) => INTEGER_KEY.test(key));
  if (reordered !== undefined) {
    throw new CerialGenerationError(
      `Tuple ${name}: key '${reordered}' is integer-like and JavaScript would reorder it; give the element a name, or use the array form with .named()`,
    );
  }
  const nodes = Array.isArray(elements)
    ? (elements as readonly Element[]).map((element) => elementNode(element, name))
    : Object.entries(elements).map(([key, element]) => elementNode(element as Element, name, key));

  const clause = extendsOf(handle);
  const [parentName, filter] = clause ? extendsFields(clause) : [];

  return createTuple(name, nodes, BUILDER_RANGE, parentName, filter);
}
