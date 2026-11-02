import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
import { buildFieldModel, canonicalType, splitTopLevel } from './canonical';
import { parseFieldIdiom, quoteIdent } from './quote';
import { isStateTable } from './state-tables';
import type { FieldModel, FieldPath, IndexModel, SchemaModel, TableModel, UnmanagedItem } from './types';

interface Permissions {
  readonly create: unknown;
  readonly select: unknown;
  readonly update: unknown;
  readonly delete?: unknown;
}

interface TableRow {
  readonly name: string;
  readonly drop?: boolean;
  readonly schemafull?: boolean;
  readonly kind?: { readonly kind?: string };
  readonly view?: unknown;
  readonly permissions?: Permissions;
}

interface FieldRow {
  readonly name: string;
  readonly kind?: string;
  readonly default?: string;
  readonly default_always?: boolean;
  readonly value?: string;
  readonly computed?: string;
  readonly assert?: string;
  readonly readonly?: boolean;
  readonly flexible?: boolean;
  readonly permissions?: Permissions;
}

interface IndexRow {
  readonly name: string;
  readonly cols?: readonly string[];
  readonly index?: unknown;
}

interface TableInfo {
  readonly fields?: readonly FieldRow[];
  readonly indexes?: readonly IndexRow[];
  readonly [key: string]: unknown;
}

type DbInfo = Record<string, unknown> & { readonly tables?: readonly TableRow[] };

/** Table-level `INFO` keys that are tables' own constructs: everything else beyond fields and indexes is unmanaged. */
const TABLE_OWN_KEYS: ReadonlySet<string> = new Set(['fields', 'indexes']);

async function runAll(surreal: Surreal, statements: readonly string[]): Promise<unknown[]> {
  const text = statements.join(';\n');
  const responses = await surreal.query(text).responses();

  return responses.map((response, index) => {
    if (response.success) return response.result;
    const failed = statements[index] ?? text;

    throw new CerialMigrationError(`Reading the live schema failed: ${response.error.message}`, {
      cause: response.error,
      statement: { text: failed, vars: {} },
    });
  });
}

function isFull(permissions: Permissions | undefined): boolean {
  return !permissions || (permissions.create === true && permissions.select === true && permissions.update === true);
}

function itemName(item: unknown, index: number): string {
  const name = (item as { name?: unknown } | null)?.name;

  return typeof name === 'string' ? name : String(index);
}

function pathKey(path: FieldPath): string {
  return JSON.stringify(path);
}

/** The element type an `array<T>` or `set<T>` parent defines by itself, or undefined for any other parent type. */
function impliedElementKind(parentKind: string): string | undefined {
  const containers = splitTopLevel(parentKind, '|').filter((member) => /^(array|set)<.*>$/s.test(member));
  if (containers.length !== 1) return undefined;
  const inner = containers[0]!.slice(containers[0]!.indexOf('<') + 1, -1);

  return splitTopLevel(inner, ',')[0];
}

/**
 * Whether a field is the `name.*` definition the server creates for an array or set parent. A hand-defined
 * one (another type, an `ASSERT`, a default) differs from the implied one and so stays, where drift shows.
 */
function isImpliedElement(row: FieldRow, path: FieldPath, parents: ReadonlyMap<string, FieldRow>): boolean {
  if (typeof path.at(-1) === 'string') return false;
  const parent = parents.get(pathKey(path.slice(0, -1)));
  if (!parent?.kind || !row.kind) return false;
  const implied = impliedElementKind(canonicalType(parent.kind));
  if (implied === undefined || canonicalType(row.kind) !== canonicalType(implied)) return false;

  return (
    row.default === undefined &&
    row.value === undefined &&
    row.computed === undefined &&
    row.assert === undefined &&
    !row.readonly &&
    // The server copies the parent's FLEXIBLE onto the `.*` element it creates for `array<object> FLEXIBLE`.
    !row.flexible === !parent.flexible &&
    isFull(row.permissions)
  );
}

/** The table's definition when it is not the ordinary SCHEMAFULL normal table Cerial defines; undefined for that one. */
function tableMode(row: TableRow): string | undefined {
  const kind = row.kind?.kind ?? 'NORMAL';
  if (!row.drop && row.schemafull !== false && kind === 'NORMAL' && !row.view) return undefined;

  return [kind, row.schemafull === false ? 'SCHEMALESS' : 'SCHEMAFULL', row.drop && 'DROP', row.view && 'VIEW']
    .filter(Boolean)
    .join(' ');
}

function readTable(row: TableRow, info: TableInfo, unmanaged: UnmanagedItem[]): TableModel {
  const name = row.name;
  const rows = info.fields ?? [];
  const parsed = rows.map((row) => ({ row, path: parseFieldIdiom(row.name) }));
  const byPath = new Map(parsed.map(({ row, path }) => [pathKey(path), row]));

  const fields: FieldModel[] = [];
  for (const { row, path } of parsed) {
    if (isImpliedElement(row, path, byPath)) continue;
    if (!isFull(row.permissions)) unmanaged.push({ kind: 'field-permissions', name: row.name, table: name });
    fields.push(
      buildFieldModel({
        path,
        kind: row.kind ?? 'any',
        default: row.default,
        defaultAlways: row.default_always,
        value: row.value,
        computed: row.computed,
        assert: row.assert,
        readonly: row.readonly,
        flexible: row.flexible,
      }),
    );
  }

  const indexes: IndexModel[] = (info.indexes ?? []).map((row) => ({
    name: row.name,
    columns: (row.cols ?? []).map(parseFieldIdiom),
    index: typeof row.index === 'string' ? row.index : JSON.stringify(row.index ?? ''),
  }));

  for (const [key, value] of Object.entries(info)) {
    if (TABLE_OWN_KEYS.has(key) || !Array.isArray(value)) continue;
    value.forEach((item, index) => unmanaged.push({ kind: key, name: itemName(item, index), table: name }));
  }

  const mode = tableMode(row);

  return { name, ...(mode !== undefined && { mode }), fields, indexes };
}

/**
 * Reads the live database into a `SchemaModel` through `INFO ... STRUCTURE`. Takes the socket and owns no
 * connection. The per-table reads go out as one multi-statement request: 200 tables take about 14 ms that way
 * and about 2200 ms one at a time. Table names reach query text only through `quoteIdent`.
 */
export async function readLiveSchema(surreal: Surreal): Promise<SchemaModel> {
  const [dbInfo] = await runAll(surreal, ['INFO FOR DB STRUCTURE']);
  const { tables: tableRows = [], ...rest } = dbInfo as DbInfo;
  const unmanaged: UnmanagedItem[] = [];

  for (const [kind, value] of Object.entries(rest)) {
    if (!Array.isArray(value)) continue;
    value.forEach((item, index) => unmanaged.push({ kind, name: itemName(item, index) }));
  }

  const managed = tableRows
    .filter((row) => !isStateTable(row.name))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  for (const row of managed) {
    // A table Cerial defines carries no PERMISSIONS clause, which the server reads back as every action false.
    if (Object.values(row.permissions ?? {}).some((value) => value !== false)) {
      unmanaged.push({ kind: 'table-permissions', name: row.name });
    }
    if (row.drop || row.schemafull === false || (row.kind?.kind ?? 'NORMAL') !== 'NORMAL' || row.view) {
      unmanaged.push({ kind: 'table-kind', name: row.name });
    }
  }

  if (!managed.length) return { tables: [], unmanaged };

  const infos = await runAll(
    surreal,
    managed.map((row) => `INFO FOR TABLE ${quoteIdent(row.name)} STRUCTURE`),
  );
  const tables = managed.map((row, index) => readTable(row, infos[index] as TableInfo, unmanaged));

  return { tables, unmanaged };
}
