import { CerialMigrationError } from '../errors';
import type { SchemaDifference } from './diff';
import { quoteFieldPath, quoteIdent } from './quote';
import { isStateTable } from './state-tables';
import type { FieldPath, SchemaModel, TableModel } from './types';

const isPrefix = (prefix: FieldPath, path: FieldPath): boolean =>
  prefix.length <= path.length && prefix.every((segment, i) => JSON.stringify(segment) === JSON.stringify(path[i]));

function requireTable(difference: SchemaDifference): string {
  const name = difference.table;
  if (name === undefined) throw new CerialMigrationError(`Cannot remove: '${difference.kind}' names no table.`);
  if (isStateTable(name)) {
    throw new CerialMigrationError(`Cannot remove anything of '${name}': migration state tables are never removed.`);
  }

  return name;
}

function liveTable(live: SchemaModel, name: string): TableModel {
  const found = live.tables.find((t) => t.name === name);
  if (!found) throw new CerialMigrationError(`Cannot remove from '${name}': the live schema has no such table.`);

  return found;
}

function removeField(difference: SchemaDifference, table: string, live: SchemaModel): readonly string[] {
  const path = difference.field;
  if (!path?.length) throw new CerialMigrationError(`Cannot remove a field of '${table}': the difference names none.`);
  // An array element is defined by its parent's type and is removed together with the parent.
  if (typeof path.at(-1) !== 'string') return [];

  const model = liveTable(live, table);
  const covered = model.fields.map((f) => f.path).filter((p) => isPrefix(path, p));
  const descendants = covered.filter((p) => p.length > path.length).sort((a, b) => b.length - a.length);
  const indexes = model.indexes.filter((ix) => ix.columns.some((column) => covered.some((p) => isPrefix(p, column))));
  const on = quoteIdent(table);

  // Indexes first, then children deepest first, then the field; the UNSET comes last because it fails while the
  // field is still defined, and removing the field alone leaves every stored value write-blocking its row.
  return [
    ...indexes.map((ix) => `REMOVE INDEX ${quoteIdent(ix.name)} ON ${on};`),
    ...descendants.map((p) => `REMOVE FIELD ${quoteFieldPath(p)} ON ${on};`),
    `REMOVE FIELD ${quoteFieldPath(path)} ON ${on};`,
    `UPDATE ${on} UNSET ${quoteFieldPath(path)};`,
  ];
}

/**
 * The `REMOVE` statements for one difference that removes something live: a live-only field (with the indexes over
 * it and the fields beneath it, then an `UPDATE ... UNSET`), a live-only index, or a managed table Cerial created.
 * Any other difference throws, including a changed field or a missing required one, which redefine rather than
 * remove. `live` supplies the children and indexes a field removal must clear first; nothing here reads a database.
 * The differ also reports each child of a removed field as its own difference; the caller drops those the parent covers.
 */
export function emitRemove(difference: SchemaDifference, live: SchemaModel): readonly string[] {
  switch (difference.kind) {
    case 'field-extra':
      return removeField(difference, requireTable(difference), live);
    case 'index-extra': {
      const table = requireTable(difference);
      if (difference.index === undefined)
        throw new CerialMigrationError(`Cannot remove an index of '${table}': none named.`);

      return [`REMOVE INDEX ${quoteIdent(difference.index)} ON ${quoteIdent(table)};`];
    }
    case 'table-extra-managed':
      return [`REMOVE TABLE ${quoteIdent(requireTable(difference))};`];
    default:
      throw new CerialMigrationError(
        `Cannot emit a removal for '${difference.kind}' (${difference.class}): only a live-only field, index or managed table is removed.`,
      );
  }
}
