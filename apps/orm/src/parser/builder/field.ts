import type { ASTDecorator, ASTField, SchemaFieldType } from '../../types';
import { createField } from '../types/ast';
import { FIELD_TYPE_REGISTRY } from '../registry';
import type { DecoratorEntry, RegisteredDecorator } from '../registry';
import { BUILDER_RANGE, createChain } from './chain';
import { bareName, chainEntries } from './entries';
import { referenceName } from './handle';
import type { Reference } from './handle';
import type { BareName, BuilderNode, ChainEntry, MethodArgs, Remaining } from './types';

/**
 * A field under construction. Each call returns a new builder, so a partial chain can be reused, and the
 * methods are the registry's chain entries for a model field: nothing here names a decorator. `O` is false
 * for a type that cannot be optional.
 */
export type FieldBuilder<E extends DecoratorEntry = RegisteredDecorator, O extends boolean = true> = {
  readonly [X in ChainEntry<E, 'modelField', 'plain'> as BareName<X['name']>]: (
    ...args: MethodArgs<X['args']>
  ) => FieldBuilder<Remaining<E, X>, O>;
} & {
  /** `!!private`: hidden from the client's output types. */
  private(): FieldBuilder<E, O>;
  /** `Type[]`. */
  array(): FieldBuilder<E, O>;
} & (O extends true
    ? {
        /** `Type?` */
        optional(): FieldBuilder<E, O>;
      }
    : unknown);

/** `Any` takes neither `?` nor `@nullable`: SurrealDB `TYPE any` already accepts NONE and null. */
export type AnyFieldBuilder = FieldBuilder<Exclude<RegisteredDecorator, { readonly name: '@nullable' }>, false>;

/** The primitive id types `Record(...)` takes; an object or tuple id goes through a reference. */
export type RecordIdType = 'int' | 'number' | 'string' | 'uuid' | Reference;

type SimpleFieldType = Exclude<SchemaFieldType, 'record' | 'relation' | 'object' | 'tuple' | 'literal'>;

/** One factory per built-in field type except `record` and `relation`, keyed by what the parser records. */
export type FieldFactories = {
  readonly [T in SimpleFieldType]: () => T extends 'any' ? AnyFieldBuilder : FieldBuilder;
} & {
  readonly record: (...idTypes: RecordIdType[]) => FieldBuilder;
};

interface FieldSpec {
  readonly type: SchemaFieldType;
  readonly recordIdTypes?: readonly RecordIdType[];
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
    if (spec.any && name === 'nullable') continue;
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
    undefined,
    undefined,
    undefined,
    recordIdTypes,
    state.isPrivate || undefined,
  );
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

/** The field factories. `f.relation` is not here: it belongs to the relation helper. */
export const f = Object.freeze({
  ...simpleFactories(),
  record: (...idTypes: RecordIdType[]) => start({ type: 'record', recordIdTypes: idTypes, any: false }),
}) as unknown as FieldFactories;
