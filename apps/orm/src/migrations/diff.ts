import { CerialMigrationError } from '../errors';
import { acceptsNone } from './canonical';
import type { DifferenceClass, FieldModel, FieldPath, IndexModel, SchemaModel, TableModel } from './types';

/** Every kind of difference the differ can produce; a kind outside this list is refused, never defaulted. */
export type DifferenceKind =
  | 'table-missing'
  | 'table-mode-changed'
  | 'field-missing'
  | 'field-missing-required'
  | 'index-missing'
  | 'field-extra'
  | 'index-extra'
  | 'field-changed'
  | 'index-changed'
  | 'index-unique-added'
  | 'table-extra-managed'
  | 'table-extra-unmanaged'
  | 'unmanaged-item';

export interface SchemaDifference {
  readonly kind: DifferenceKind;
  /** `table`, `field` or `index`; for an unmanaged live construct, the server's own name for it (`functions`). */
  readonly construct: string;
  readonly class: DifferenceClass;
  readonly table?: string;
  readonly field?: FieldPath;
  readonly index?: string;
  /** Name of an unmanaged live construct that is not a table, field or index. */
  readonly name?: string;
  /** The attributes of a field that differ, for `field-changed`. */
  readonly changes?: readonly string[];
  /** The field as the schema defines it, for a field the plan adds or changes. */
  readonly desiredField?: FieldModel;
  /** The field as the database holds it, for `field-changed`. */
  readonly liveField?: FieldModel;
  /** The index as the schema defines it, for an index the plan adds or changes. */
  readonly desiredIndex?: IndexModel;
  /** Additive in effect, but applying it can be refused by data already stored. */
  readonly mayFailAtApply?: true;
  readonly reason: string;
}

export interface DiffOptions {
  /** Tables state says Cerial created; a live table outside `desired` is proposed for removal only if listed here. */
  readonly managedTables: ReadonlySet<string> | readonly string[];
}

interface Classification {
  readonly class: DifferenceClass;
  readonly construct: string;
  readonly reason: string;
}

const CLASSIFICATIONS: Readonly<Record<DifferenceKind, Classification>> = {
  'table-missing': {
    class: 'additive',
    construct: 'table',
    reason: 'defining a table creates it and touches nothing stored',
  },
  'table-mode-changed': {
    class: 'destructive',
    construct: 'table',
    reason:
      'the live table is defined differently from the schema (schema mode, kind or view), so its rows are held to other rules',
  },
  'field-missing': {
    class: 'additive',
    construct: 'field',
    reason: 'an optional or defaulted field is added without touching stored rows',
  },
  'field-missing-required': {
    class: 'destructive',
    construct: 'field',
    reason:
      'a required field with no default has no value for existing rows, so a table that holds rows cannot take it',
  },
  'index-missing': {
    class: 'additive',
    construct: 'index',
    reason: 'defining an index adds a structure and touches nothing stored',
  },
  'field-extra': {
    class: 'destructive',
    construct: 'field',
    reason: 'removing the field deletes its stored values from every row, and a deleted value cannot be restored',
  },
  'index-extra': {
    class: 'destructive',
    construct: 'index',
    reason: 'the live index is not in the schema, so converging removes it',
  },
  'field-changed': {
    class: 'destructive',
    construct: 'field',
    reason:
      'redefining a field changes how its stored values are read; a type that does not accept every stored value needs a conversion step',
  },
  'index-changed': {
    class: 'additive',
    construct: 'index',
    reason: 'redefining an index rebuilds it and leaves rows and sibling definitions alone',
  },
  'index-unique-added': {
    class: 'additive',
    construct: 'index',
    reason: 'a UNIQUE index over duplicate values fails and installs nothing; the plan rolls back with the rest',
  },
  'table-extra-managed': {
    class: 'data-loss',
    construct: 'table',
    reason: 'removing a table Cerial created destroys its rows with no separate data step',
  },
  'table-extra-unmanaged': {
    class: 'unmanaged',
    construct: 'table',
    reason: 'state does not say Cerial created this table, so it is reported and never proposed for removal',
  },
  'unmanaged-item': {
    class: 'unmanaged',
    construct: 'item',
    reason: 'Cerial has no concept for this construct, so it is reported and never acted on',
  },
};

/** Looks up a kind's class. An unknown kind throws: nothing falls through to additive. */
export function classifyDifference(kind: string): Classification {
  if (!Object.hasOwn(CLASSIFICATIONS, kind)) {
    throw new CerialMigrationError(`Cannot classify schema difference '${kind}'; refusing to guess its class.`);
  }

  return CLASSIFICATIONS[kind as DifferenceKind];
}

interface Subject {
  readonly table?: string;
  readonly field?: FieldPath;
  readonly index?: string;
  readonly name?: string;
  readonly construct?: string;
  readonly changes?: readonly string[];
  readonly desiredField?: FieldModel;
  readonly liveField?: FieldModel;
  readonly desiredIndex?: IndexModel;
  readonly mayFailAtApply?: true;
}

function difference(kind: string, subject: Subject): SchemaDifference {
  const { class: cls, construct, reason } = classifyDifference(kind);
  const { construct: named, ...rest } = subject;

  return { kind: kind as DifferenceKind, construct: named ?? construct, class: cls, ...rest, reason };
}

const pathKey = (path: FieldPath): string => JSON.stringify(path);

function indexBy<T>(items: readonly T[], key: (item: T) => string, what: string, owner?: string): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of items) {
    const id = key(item);
    if (map.has(id))
      throw new CerialMigrationError(
        `Cannot diff: ${what} '${id}'${owner === undefined ? '' : ` on '${owner}'`} is defined twice in one schema model.`,
      );
    map.set(id, item);
  }

  return map;
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Attribute names that differ between two fields, taken over every key either side carries. */
function changedAttributes(desired: FieldModel, live: FieldModel): string[] {
  const a = desired as unknown as Record<string, unknown>;
  const b = live as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  keys.delete('path');

  return [...keys].filter((key) => !sameValue(a[key], b[key])).sort();
}

/** A field is required when it admits no absent value and nothing fills one in; an array element never is. */
function isRequired(field: FieldModel): boolean {
  if (typeof field.path.at(-1) !== 'string') return false;

  return (
    !acceptsNone(field.kind) &&
    field.default === undefined &&
    field.value === undefined &&
    // A computed field stores nothing, so adding it asks nothing of existing rows.
    field.computed === undefined
  );
}

const KNOWN_INDEX_CLAUSES: ReadonlySet<string> = new Set(['', 'UNIQUE', 'UNIQUE NULLS NOT DISTINCT']);

function diffIndex(table: string, desired: IndexModel, live: IndexModel): SchemaDifference | undefined {
  const sameColumns = sameValue(desired.columns, live.columns);
  if (sameColumns && desired.index === live.index) return undefined;

  for (const clause of [desired.index, live.index]) {
    if (!KNOWN_INDEX_CLAUSES.has(clause)) {
      throw new CerialMigrationError(
        `Cannot classify the change to index '${desired.name}' on '${table}': index clause '${clause}' is not one Cerial defines.`,
      );
    }
  }
  // Dropping the option relaxes the index and cannot fail; adding UNIQUE or the option can meet duplicates.
  const tightens = desired.index.startsWith('UNIQUE') && live.index !== 'UNIQUE NULLS NOT DISTINCT';
  const kind = tightens ? 'index-unique-added' : 'index-changed';

  return difference(kind, {
    table,
    index: desired.name,
    desiredIndex: desired,
    ...(kind === 'index-unique-added' && { mayFailAtApply: true as const }),
  });
}

function diffTable(desired: TableModel, live: TableModel): SchemaDifference[] {
  const result: SchemaDifference[] = [];
  const table = desired.name;
  if (desired.mode !== live.mode) result.push(difference('table-mode-changed', { table }));
  const liveFields = indexBy(live.fields, (f) => pathKey(f.path), 'field', table);
  const desiredFields = indexBy(desired.fields, (f) => pathKey(f.path), 'field', table);
  const liveIndexes = indexBy(live.indexes, (i) => i.name, 'index', table);
  const desiredIndexes = indexBy(desired.indexes, (i) => i.name, 'index', table);

  for (const [key, field] of desiredFields) {
    const found = liveFields.get(key);
    if (!found) {
      result.push(
        difference(isRequired(field) ? 'field-missing-required' : 'field-missing', {
          table,
          field: field.path,
          desiredField: field,
        }),
      );
      continue;
    }
    const changes = changedAttributes(field, found);
    if (changes.length) {
      result.push(
        difference('field-changed', { table, field: field.path, changes, desiredField: field, liveField: found }),
      );
    }
  }
  for (const [key, field] of liveFields) {
    if (!desiredFields.has(key)) result.push(difference('field-extra', { table, field: field.path }));
  }

  for (const [name, index] of desiredIndexes) {
    const found = liveIndexes.get(name);
    if (!found) {
      result.push(difference('index-missing', { table, index: name, desiredIndex: index }));
      continue;
    }
    const changed = diffIndex(table, index, found);
    if (changed) result.push(changed);
  }
  for (const name of liveIndexes.keys()) {
    if (!desiredIndexes.has(name)) result.push(difference('index-extra', { table, index: name }));
  }

  return result;
}

/**
 * Compares the schema the models describe with the live database and classifies each difference. Pure: it reads
 * its inputs and nothing else. A table in `desired` counts as managed for its own fields and indexes whatever
 * `managedTables` says, so a first run against an adopted database classifies its live-only fields. A difference
 * the table above cannot classify throws `CerialMigrationError` naming it.
 */
export function diffSchema(desired: SchemaModel, live: SchemaModel, options: DiffOptions): readonly SchemaDifference[] {
  const managed = new Set(options.managedTables);
  const desiredTables = indexBy(desired.tables, (t) => t.name, 'table');
  const liveTables = indexBy(live.tables, (t) => t.name, 'table');
  const result: SchemaDifference[] = [];

  for (const [name, table] of desiredTables) {
    const found = liveTables.get(name);
    if (found) result.push(...diffTable(table, found));
    else result.push(difference('table-missing', { table: name }));
  }
  for (const name of [...liveTables.keys()].sort()) {
    if (desiredTables.has(name)) continue;
    result.push(difference(managed.has(name) ? 'table-extra-managed' : 'table-extra-unmanaged', { table: name }));
  }
  for (const item of live.unmanaged) {
    result.push(
      difference('unmanaged-item', {
        construct: item.kind,
        name: item.name,
        ...(item.table !== undefined && { table: item.table }),
      }),
    );
  }

  return result;
}
