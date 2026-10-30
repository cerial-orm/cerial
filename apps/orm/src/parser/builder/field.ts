import type { ASTDecorator, ASTField, SchemaFieldType } from '../../types';
import { createField } from '../types/ast';
import { FIELD_TYPE_REGISTRY } from '../registry';
import type { DecoratorEntry, RegisteredDecorator } from '../registry';
import { BUILDER_RANGE, createChain } from './chain';
import { bareName, chainEntries } from './entries';
import { referenceName } from './handle';
import { relation, reverse } from './relation';
import type { RelationBuilder, ReverseBuilder } from './relation';
import type { Reference } from './handle';
import type { BareName, BuilderNode, ChainEntry, MethodArgs, Remaining } from './types';

/** Type-only key: a field builder's `Record(...)` id type, present only after `.id()`. Never exists at runtime. */
declare const ID_MARK: unique symbol;

/**
 * A field under construction. Each call returns a new builder, so a partial chain can be reused, and the
 * methods are the registry's chain entries for a model field: nothing here names a decorator but `@id`,
 * which also marks the builder so `model()` can read the id type. `O` is false for a type that cannot be
 * optional; `Id` is the TypeScript type of a `Record(...)` id and `Marked` is true once `.id()` ran.
 */
export type FieldBuilder<
  E extends DecoratorEntry = RegisteredDecorator,
  O extends boolean = true,
  Id = never,
  Marked extends boolean = false,
> = {
  readonly [X in ChainEntry<E, 'modelField', 'plain'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => FieldBuilder<Remaining<E, X>, O, Id, X['name'] extends '@id' ? true : Marked>;
} & {
  /** `!!private`: hidden from the client's output types. */
  private(): FieldBuilder<E, O, Id, Marked>;
  /** `Type[]`. */
  array(): FieldBuilder<E, O, Id, Marked>;
  readonly [ID_MARK]?: Marked extends true ? { readonly id: Id } : never;
} & (O extends true
    ? {
        /** `Type?` */
        optional(): FieldBuilder<E, O, Id, Marked>;
      }
    : unknown);

/** The id type a model's `.id()` field declares, or `never` when no field is marked. */
export type IdOf<Fields extends object> = [IdMarkOf<Fields[keyof Fields]>] extends [never]
  ? never
  : IdMarkOf<Fields[keyof Fields]> extends { readonly id: infer I }
    ? I
    : never;

type IdMarkOf<B> = B extends { readonly [ID_MARK]?: infer M } ? NonNullable<M> : never;

/** `Any` takes neither `?` nor `@nullable`: SurrealDB `TYPE any` already accepts NONE and null. */
export type AnyFieldBuilder = FieldBuilder<Exclude<RegisteredDecorator, { readonly name: '@nullable' }>, false>;

/** The primitive id types `Record(...)` takes. */
export type PrimitiveIdType = 'int' | 'number' | 'string' | 'uuid';

/** Primitive names the schema refuses as an id type; a bare string reaches `Reference`, so these are barred by name. */
type RefusedIdType =
  | 'float'
  | 'bool'
  | 'date'
  | 'datetime'
  | 'decimal'
  | 'duration'
  | 'literal'
  | 'enum'
  | 'relation'
  | 'email'
  | 'bytes'
  | 'geometry'
  | 'any';

/** A primitive, or an object or tuple id named by handle, thunk or bare name. */
export type RecordIdType = PrimitiveIdType | Reference;

type ValidIdType<T> = T extends RefusedIdType ? never : T;

type IdTypeValue<T> = T extends 'int' | 'number' ? number : T extends 'string' | 'uuid' ? string : unknown;

/** The TypeScript type of a `Record(...)` id: `string` when plain, else the union of the listed types. */
export type RecordIdValue<Ids extends readonly RecordIdType[]> = Ids extends readonly []
  ? string
  : IdTypeValue<Ids[number]>;

/** An object-typed field takes `?` and `[]` but not `@nullable`: SurrealDB cannot define sub-fields on a nullable parent. */
export type ObjectFieldBuilder = FieldBuilder<Exclude<RegisteredDecorator, { readonly name: '@nullable' }>>;

type SimpleFieldType = Exclude<SchemaFieldType, 'record' | 'relation' | 'object' | 'tuple' | 'literal'>;

/** One factory per built-in field type except `record` and `relation`, keyed by what the parser records. */
export type FieldFactories = {
  readonly [T in SimpleFieldType]: () => T extends 'any' ? AnyFieldBuilder : FieldBuilder;
} & {
  readonly record: <const Ids extends readonly RecordIdType[]>(
    ...idTypes: Ids & { [K in keyof Ids]: ValidIdType<Ids[K]> }
  ) => FieldBuilder<RegisteredDecorator, true, RecordIdValue<Ids>>;
  /** A field typed as an object definition, named by handle, thunk or bare name. */
  readonly object: (reference: Reference) => ObjectFieldBuilder;
  /** A forward to-one relation; its backing `Record` is derived. Models only. */
  readonly relation: (target: Reference) => RelationBuilder;
  /** The reverse side of a relation: no foreign key, since the forward side owns it. Models only. */
  readonly reverse: (target: Reference) => ReverseBuilder;
};

interface FieldSpec {
  readonly type: SchemaFieldType;
  readonly recordIdTypes?: readonly RecordIdType[];
  /** Set for a field typed by a literal or an enum, which the parser records the same way. */
  readonly literalName?: Reference;
  readonly objectReference?: Reference;
  /** `Any` rejects `?` and `@nullable`. */
  readonly any: boolean;
}

interface FieldState {
  readonly spec: FieldSpec;
  readonly isOptional: boolean;
  readonly isArray: boolean;
  readonly isPrivate: boolean;
  readonly chain: ChainRuntime;
}

interface ChainRuntime {
  decorators(): BuilderNode[];
  [method: string]: (...args: unknown[]) => unknown;
}

// Read only by `fieldNode`, so a builder carries nothing but its public methods.
const STATES = new WeakMap<object, FieldState>();

function builderOf(state: FieldState): object {
  const { spec } = state;
  const methods: Record<string, unknown> = {
    array: () => builderOf({ ...state, isArray: true }),
    private: () => builderOf({ ...state, isPrivate: true }),
  };
  if (!spec.any) methods.optional = () => builderOf({ ...state, isOptional: true });
  for (const entry of chainEntries('modelField')) {
    const name = bareName(entry.name);
    if ((spec.any || spec.objectReference !== undefined) && name === 'nullable') continue;
    methods[name] = (...args: unknown[]) => builderOf({ ...state, chain: state.chain[name]!(...args) as ChainRuntime });
  }
  const builder = Object.freeze(methods);
  STATES.set(builder, state);

  return builder;
}

function start(spec: FieldSpec): object {
  const chain = createChain('modelField') as unknown as ChainRuntime;

  return builderOf({ spec, isOptional: false, isArray: false, isPrivate: false, chain });
}

/**
 * Materialise a field builder as the node the parser gives for the same line. It is built through
 * `createField`, so optional keys are omitted rather than false. The origin is the factory's placeholder:
 * a builder knows neither its file nor its export, so the materialise pass stamps `kind: 'ts'`.
 */
export function fieldNode(builder: object, name: string): ASTField {
  const state = STATES.get(builder);
  if (!state) throw new Error(`Not a field builder: ${String(builder)}`);
  const { spec } = state;
  // Only field decorators chain on a model field; a directive never reaches here
  const decorators = state.chain.decorators().filter((node): node is ASTDecorator => 'type' in node);
  const recordIdTypes = spec.recordIdTypes?.map((id) => referenceName(id));

  return createField(
    name,
    spec.type,
    state.isOptional,
    decorators,
    BUILDER_RANGE,
    state.isArray,
    spec.objectReference === undefined ? undefined : referenceName(spec.objectReference),
    undefined,
    spec.literalName === undefined ? undefined : referenceName(spec.literalName),
    recordIdTypes,
    state.isPrivate || undefined,
  );
}

/** A field typed by a literal or an enum; the reference may be a handle, a thunk or a bare name. */
export function literalField(reference: Reference): FieldBuilder {
  return start({ type: 'literal', literalName: reference, any: false }) as FieldBuilder;
}

const SPECIAL: readonly SchemaFieldType[] = ['record', 'relation'];

function simpleFactories(): Record<string, () => object> {
  const factories: Record<string, () => object> = {};
  for (const entry of FIELD_TYPE_REGISTRY.values()) {
    if (SPECIAL.includes(entry.fieldType)) continue;
    factories[entry.fieldType] = () => start({ type: entry.fieldType, any: entry.fieldType === 'any' });
  }

  return factories;
}

/** The field factories. */
export const f = Object.freeze({
  ...simpleFactories(),
  record: (...idTypes: readonly RecordIdType[]) => start({ type: 'record', recordIdTypes: idTypes, any: false }),
  object: (reference: Reference) => start({ type: 'object', objectReference: reference, any: false }),
  relation,
  reverse,
}) as unknown as FieldFactories;
