import type { ExtendsFilter } from '../../types';
import type { Handle } from './handle';

/**
 * A declaration other declarations can extend. `Own` is the names the declaration itself declares, which
 * is what a pick or omit list is checked against, as in a schema written in text. `Visible` is every name
 * a child can see once it extends this one: the own names plus whatever the declaration inherited.
 * `Reserved` is every `!!private` name the declaration or any ancestor holds, whether or not a filter
 * dropped it on the way: a child cannot redeclare one, though it may leave one out of a pick list.
 */
export interface Extendable<
  Name extends string = string,
  Id = never,
  Own extends string = string,
  Visible extends string = Own,
  Reserved extends string = never,
> extends Handle<Name, Id, Own> {
  readonly visibleMembers?: Visible;
  readonly reservedMembers?: Reserved;
  /** `extends Name[a, b]`: only these of the parent's own fields. */
  pick<Picked extends Own>(...fields: [Picked, ...Picked[]]): ExtendsFiltered<Name, Picked, Reserved>;
  /** `extends Name[!a, !b]`: every field of the parent but these. */
  omit<Omitted extends Own>(
    ...fields: [Omitted, ...Omitted[]]
  ): ExtendsFiltered<Name, Exclude<Visible, Omitted>, Reserved>;
}

/**
 * What `pick` and `omit` return. It has neither method, so a clause cannot carry both modes, which the
 * text form cannot write either.
 */
export interface ExtendsFiltered<
  Name extends string = string,
  Visible extends string = string,
  Reserved extends string = never,
> {
  readonly name: Name;
  readonly mode: 'pick' | 'omit';
  readonly fields: readonly string[];
  readonly visibleMembers?: Visible;
  readonly reservedMembers?: Reserved;
}

/** What an `extends` option takes: a parent, or a filtered view of one. */
export type ExtendsTarget<Visible extends string = string, Reserved extends string = string> =
  | Extendable<string, unknown, string, Visible, Reserved>
  | ExtendsFiltered<string, Visible, Reserved>;

/**
 * The check on a child's field list: a key the parent reserves must not appear. Naming the offending key
 * in the property type makes the error read as "cannot override private field 'id'".
 */
export type NoPrivateOverride<Fields extends object, Reserved extends string> = {
  readonly [K in Extract<keyof Fields, Reserved>]: `cannot override the private field '${K}'`;
};

/** The names a child inherits from `T`, which its composite field paths may start from. */
export type VisibleOf<T> = T extends { readonly visibleMembers?: infer V extends string } ? V : never;

/** An `extends` clause as declared: the raw parent, and the filter when one was given. */
export interface ExtendsClause {
  readonly parent: object;
  readonly filter?: ExtendsFilter;
}

const PARENTS = new WeakSet<object>();
const FILTERED = new WeakMap<object, ExtendsClause>();
const CLAUSES = new WeakMap<object, ExtendsClause>();

/** A fresh handle for `name` with `pick` and `omit`, which are not enumerable so the handle holds only its name. */
export function extendable<
  Name extends string,
  Id,
  Own extends string,
  Visible extends string,
  Reserved extends string,
>(name: Name): Extendable<Name, Id, Own, Visible, Reserved> {
  const handle = { name };
  const filtered = (mode: 'pick' | 'omit', fields: string[]): object => {
    const reference = Object.freeze({ name, mode, fields: Object.freeze([...fields]) });
    FILTERED.set(reference, { parent: handle, filter: { mode, fields: [...fields] } });

    return reference;
  };
  Object.defineProperties(handle, {
    pick: { value: (...fields: string[]) => filtered('pick', fields) },
    omit: { value: (...fields: string[]) => filtered('omit', fields) },
  });
  Object.freeze(handle);
  PARENTS.add(handle);

  return handle as unknown as Extendable<Name, Id, Own, Visible, Reserved>;
}

/** Resolve an `extends` option to the clause it declares, refusing anything that is not a parent or a filtered parent. */
export function extendsClause(target: object): ExtendsClause {
  const filtered = FILTERED.get(target);
  if (filtered) return filtered;
  if (!PARENTS.has(target)) throw new Error(`'extends' takes a model or object handle, got ${String(target)}`);

  return { parent: target };
}

/** Remember the clause a child was declared with, so a later pass can walk from the child to its raw parent. */
export function recordExtends(child: object, target: object | undefined): ExtendsClause | undefined {
  if (!target) return undefined;
  const clause = extendsClause(target);
  CLAUSES.set(child, clause);

  return clause;
}

/** The clause `child` was declared with, or undefined when it extends nothing. The parent is the raw handle. */
export function extendsOf(child: object): ExtendsClause | undefined {
  return CLAUSES.get(child);
}

/** The parent's name and the filter, as the parser writes them: no filter key without a filter. */
export function extendsFields(clause: ExtendsClause): [name: string, filter?: ExtendsFilter] {
  const { name } = clause.parent as { name: string };

  return [name, clause.filter && { mode: clause.filter.mode, fields: [...clause.filter.fields] }];
}
