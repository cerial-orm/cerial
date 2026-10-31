import { extendable } from './extends';
import type { Extendable } from './extends';
import { checkedIdentifier } from './identifier';
import type { RecordIdType, RecordIdValue } from './field';
import type { ExtendableLiteral, LiteralHandle } from './literal';
import { sharedWeakMap } from './shared-state';

/**
 * What a builder returns: the definition's name, plus the ID type of a model so a reference to it can type
 * relations against it. `idType` and `memberNames` are phantoms, never present at runtime.
 */
export interface Handle<Name extends string = string, Id = never, Members extends string = string> {
  readonly name: Name;
  readonly idType?: Id;
  /** The names the declaration declares, for checking a pick or omit list. Never present at runtime. */
  readonly memberNames?: Members;
}

declare const PRIVATE_MARK: unique symbol;

/** Type-only: a field builder's `!!private` state, so a child's field list can be checked against it. */
export interface PrivateMark<Hidden extends boolean> {
  readonly [PRIVATE_MARK]?: Hidden;
}

/** The keys of `Fields` whose builder was marked `.private()`. */
export type PrivateKeys<Fields extends object> = {
  [K in keyof Fields & string]: Fields[K] extends PrivateMark<infer H> ? ([H] extends [true] ? K : never) : never;
}[keyof Fields & string];

/** A reference in a field position: a handle by value, a thunk returning one, or a bare name */
export type Reference<Name extends string = string> = Handle<Name, unknown> | (() => Handle<Name, unknown>) | Name;

/**
 * Reduce a reference to the name it stands for. A thunk is called here and nowhere earlier, so a
 * reference to a `const` declared further down the module is safe until materialise time.
 */
export function referenceName(reference: Reference): string {
  if (typeof reference === 'string') return reference;
  if (typeof reference === 'function') return reference().name;

  return reference.name;
}

export type DslHandleKind = 'model' | 'object' | 'tuple' | 'enum' | 'literal';

/** What a DSL handle records at runtime; the type parameters carry the same names to the compiler. */
export interface DslHandleInfo {
  readonly kind: DslHandleKind;
  readonly name: string;
  readonly members: readonly string[];
  /** Tuple only: how many positions the tuple has, so a pick by index can be range-checked. */
  readonly size?: number;
  /** Model only: the `Record(...)` id types of its `@id` field, absent for a model with none. */
  readonly idTypes?: readonly RecordIdType[];
}

// Kept apart from the declaration tables (model.nodes and the rest): a DSL handle stands for a `.cerial`
// declaration, so generation must never find it in the TypeScript declarations it harvests.
const DSL_HANDLES = sharedWeakMap<DslHandleInfo>('dsl.handles');

/** Whether `value` came from `handle.model`, `handle.object`, `handle.tuple`, `handle.enum` or `handle.literal`. */
export function isDslHandle(value: unknown): boolean {
  return typeof value === 'object' && value !== null && DSL_HANDLES.has(value);
}

/** What `isDslHandle` recognised, or `undefined` for anything else. */
export function dslHandleInfo(value: unknown): DslHandleInfo | undefined {
  return typeof value === 'object' && value !== null ? DSL_HANDLES.get(value) : undefined;
}

function makeHandle(info: DslHandleInfo, memberKind: string): object {
  checkedIdentifier(info.kind, info.name);
  for (const member of info.members) checkedIdentifier(memberKind, member);
  const created = extendable(info.name);
  DSL_HANDLES.set(created, { ...info, members: [...info.members] });

  return created;
}

/** The members a handle lists, and the `!!private` ones among them, which a child may omit but not redeclare. */
interface MemberSpec<Members extends readonly string[], Private extends readonly string[]> {
  readonly members: Members;
  readonly private?: Private;
}

/**
 * A stand-in for a declaration that lives in a `.cerial` file, so a TypeScript schema can refer to it,
 * extend it, and have `pick` and `omit` lists checked against its member names. The generated
 * `cerial/handles.ts` calls these once per declaration. It is not a declaration: it adds nothing to the
 * schema, and generation harvests only what `model()`, `object()`, `tuple()`, `literal()` and `enum()`
 * returned. The members and the id type are all it carries; it never reads the generated client.
 */
export const handle = Object.freeze({
  /** `members` are the field names, including the foreign keys a relation names. `id` is the `Record(...)` list of the `@id` field. */
  model: <
    const Name extends string,
    const Members extends readonly string[],
    const Ids extends readonly RecordIdType[] = never,
    const Private extends readonly string[] = readonly [],
  >(
    name: Name,
    spec: MemberSpec<Members, Private> & { readonly id?: Ids },
  ): Extendable<
    Name,
    [Ids] extends [never] ? never : RecordIdValue<Ids>,
    Members[number],
    Members[number],
    Private[number]
  > => makeHandle({ kind: 'model', name, members: spec.members, idTypes: spec.id }, 'model field') as never,
  object: <
    const Name extends string,
    const Members extends readonly string[],
    const Private extends readonly string[] = readonly [],
  >(
    name: Name,
    spec: MemberSpec<Members, Private>,
  ): Extendable<Name, never, Members[number], Members[number], Private[number]> =>
    makeHandle({ kind: 'object', name, members: spec.members }, 'object field') as never,
  /** `members` are the element names; an unnamed element is reached by position, up to `size`. */
  tuple: <
    const Name extends string,
    const Members extends readonly string[],
    const Private extends readonly string[] = readonly [],
  >(
    name: Name,
    spec: MemberSpec<Members, Private> & { readonly size: number },
  ): Extendable<Name, never, Members[number], Members[number], Private[number], number> =>
    makeHandle({ kind: 'tuple', name, members: spec.members, size: spec.size }, 'tuple element') as never,
  enum: <const Name extends string, const Values extends readonly string[]>(
    name: Name,
    values: Values,
  ): LiteralHandle<Name, true> & Extendable<Name, never, Values[number], Values[number]> =>
    makeHandle({ kind: 'enum', name, members: values }, 'enum value') as never,
  /** `variants` are the identities `getVariantIdentity` gives: `"'low'"` for a string, `'1'`, `'true'`, `'Int'`, or a declaration's name. */
  literal: <const Name extends string, const Variants extends readonly string[], const Simple extends boolean>(
    name: Name,
    spec: { readonly variants: Variants; readonly simple: Simple },
  ): ExtendableLiteral<Name, Simple, Variants[number], Variants[number]> => {
    // Identities are not identifiers (`'low'` carries quotes), so only the name is checked
    checkedIdentifier('literal', name);
    const created = extendable(name);
    DSL_HANDLES.set(created, { kind: 'literal', name, members: [...spec.variants] });

    return created as never;
  },
});
