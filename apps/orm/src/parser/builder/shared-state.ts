/**
 * The builder recognises a handle by looking it up in module-level tables. The built package can load
 * this code twice (the CLI bundle and a user's `cerial/schema` import, or its ESM and CJS builds), and two
 * copies with private tables would each find the other's handles unrecognisable, so generation would see no
 * declarations. Every table lives under one `Symbol.for` key on `globalThis`, shared by all copies.
 */
const KEY = Symbol.for('cerial.builder.tables');

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
