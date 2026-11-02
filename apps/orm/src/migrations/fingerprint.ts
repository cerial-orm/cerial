import { createHash } from 'node:crypto';
import { buildFieldModel } from './canonical';
import type { FieldModel, IndexModel, SchemaModel, TableModel } from './types';

/** JSON with every object's keys sorted, so key order never reaches the hash. Arrays keep the order they are given. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return ['[', value.map(stableStringify).join(','), ']'].join('');
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, child]) => [JSON.stringify(key), stableStringify(child)].join(':'));

    return ['{', entries.join(','), '}'].join('');
  }

  return JSON.stringify(value) ?? 'null';
}

function byKey<T>(items: readonly T[], key: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, key: key(item) }))
    .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .map(({ item }) => item);
}

// Field and index order is how the server or the schema happens to list them, not part of the shape.
// An index's column order does matter, so columns stay as given.
function canonicalField(field: FieldModel): FieldModel {
  return buildFieldModel(field);
}

function canonicalTable(table: TableModel): TableModel {
  return {
    name: table.name,
    mode: table.mode,
    fields: byKey(table.fields.map(canonicalField), (field) => JSON.stringify(field.path)),
    indexes: byKey<IndexModel>(table.indexes, (index) => index.name),
  };
}

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/** SHA-256 hex of a table's canonical form; the same function for a desired and a live table. */
export function fingerprint(table: TableModel): string {
  return sha256(stableStringify(canonicalTable(table)));
}

/** One hash over every table, keyed by table name. `unmanaged` is deliberately not part of it. */
export function schemaFingerprint(model: SchemaModel): string {
  const tables = byKey(model.tables, (table) => table.name).map((table) => [table.name, fingerprint(table)]);

  return sha256(stableStringify(tables));
}

/** A model `readLiveSchema` returned has the shape the desired builder produces, so one function covers both. */
export const liveFingerprint: (model: SchemaModel) => string = schemaFingerprint;
