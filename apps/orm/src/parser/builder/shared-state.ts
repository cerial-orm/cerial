/**
 * The builder recognises a handle by looking it up in module-level tables. The built package can load
 * this code twice (the CLI bundle and a user's `cerial/schema` import, or its ESM and CJS builds), and two
 * copies with private tables would each find the other's handles unrecognisable, so generation would see no
 * declarations. Every table lives under one `Symbol.for` key on `globalThis`, shared by all copies.
 */
const KEY = Symbol.for('cerial.builder.tables');
const COUNTER = Symbol.for('cerial.builder.declarations');

type Tables = Map<string, WeakMap<object, unknown> | WeakSet<object>>;

function tables(): Tables {
  const holder = globalThis as { [KEY]?: Tables };

  return (holder[KEY] ??= new Map());
}

/** The table named `name`, created on first use and the same object in every copy of the builder. */
export function sharedWeakMap<V>(name: string): WeakMap<object, V> {
  const all = tables();
  let table = all.get(name);
  if (!table) all.set(name, (table = new WeakMap<object, V>()));

  return table as WeakMap<object, V>;
}

/** The set named `name`, created on first use and the same object in every copy of the builder. */
export function sharedWeakSet(name: string): WeakSet<object> {
  const all = tables();
  let table = all.get(name);
  if (!table) all.set(name, (table = new WeakSet<object>()));

  return table as WeakSet<object>;
}

const ORDER = sharedWeakMap<number>('declaration.order');

/**
 * Number a declaration from one counter shared by every copy of the builder. A module's declarations run
 * in source order, so within one file the numbers follow the text; across files they follow import order,
 * which is why the number is only ever compared inside a single module.
 */
export function numberDeclaration(handle: object): void {
  const holder = globalThis as { [COUNTER]?: number };
  const next = (holder[COUNTER] ?? 0) + 1;
  holder[COUNTER] = next;
  ORDER.set(handle, next);
}

/** The number `numberDeclaration` gave `handle`, or 0 for an object that was never numbered. */
export function declarationNumber(handle: object): number {
  return ORDER.get(handle) ?? 0;
}
