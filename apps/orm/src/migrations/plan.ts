import { CerialMigrationError } from '../errors';
import type { SchemaDifference } from './diff';
import { emitRemove, type KeepIndex } from './emit-remove';
import { parseFieldIdiom, quoteIdent } from './quote';
import type { DifferenceClass, FieldPath, SchemaModel } from './types';

/** One step of a plan. A report has no `statement`: it is shown to the reader and never run. */
export interface MigrationPlanItem {
  readonly statement?: string;
  readonly class: DifferenceClass;
  readonly reason: string;
  readonly construct: string;
  /** The raw name of the table the step acts on, from the difference; absent for a report of a database-level item. */
  readonly table?: string;
}

export type MigrationPlan = readonly MigrationPlanItem[];

interface TableStatements {
  readonly define: string;
  readonly fields: ReadonlyMap<string, string>;
  readonly indexes: ReadonlyMap<string, string>;
}

/**
 * The generated `DEFINE ... OVERWRITE` text, keyed by the construct each statement defines, in generation order.
 * Build it with `indexDesiredStatements`, never by hand.
 */
export type DesiredStatements = ReadonlyMap<string, TableStatements>;

const pathKey = (path: FieldPath): string => JSON.stringify(path);

const DEFINE = /^DEFINE (TABLE|FIELD|INDEX)(?: OVERWRITE| IF NOT EXISTS)? (\S+)(?: ON TABLE (\S+))?/;

/**
 * Keys the flat output of `generateRegistryDefineStatements` (or one model's `generateModelDefineStatements`)
 * by table, field path and index name, so a plan can pick the statement for one difference instead of re-rendering
 * it. The generator is the one source of the text; this only reads which construct each statement names.
 */
export function indexDesiredStatements(statements: readonly string[]): DesiredStatements {
  const define = new Map<string, string>();
  const fields = new Map<string, Map<string, string>>();
  const indexes = new Map<string, Map<string, string>>();
  const put = (map: Map<string, string>, key: string, statement: string, what: string): void => {
    if (map.has(key)) throw new CerialMigrationError(`Cannot index desired statements: ${what} is defined twice.`);
    map.set(key, statement);
  };

  for (const statement of statements) {
    const match = DEFINE.exec(statement);
    if (!match) throw new CerialMigrationError(`Cannot index a statement that is not a DEFINE: ${statement}`);
    const [, kind, name, table] = match as unknown as [string, string, string, string | undefined];
    if (kind === 'TABLE') {
      put(define, name, statement, `table ${quoteIdent(name)}`);
      fields.set(name, new Map());
      indexes.set(name, new Map());
      continue;
    }
    const owner = table === undefined ? undefined : (kind === 'FIELD' ? fields : indexes).get(table);
    if (!owner) {
      throw new CerialMigrationError(
        `Cannot index a ${kind.toLowerCase()} statement of an undefined table: ${statement}`,
      );
    }
    if (kind === 'FIELD') put(owner, pathKey(parseFieldIdiom(name)), statement, `field ${quoteIdent(name)}`);
    else put(owner, name, statement, `index ${quoteIdent(name)}`);
  }

  return new Map(
    [...define].map(([name, text]) => [name, { define: text, fields: fields.get(name)!, indexes: indexes.get(name)! }]),
  );
}

const TYPE_CHANGE_NOTE =
  'Cerial writes no data step, so rows already holding the old type refuse writes until they are migrated';

const describe = (d: SchemaDifference): string =>
  [d.kind, d.table && quoteIdent(d.table), d.field && pathKey(d.field), d.index && quoteIdent(d.index)]
    .filter(Boolean)
    .join(' ');

function missing(d: SchemaDifference): never {
  throw new CerialMigrationError(`Cannot plan '${describe(d)}': the desired schema holds no statement for it.`);
}

const isElement = (path: FieldPath): boolean => typeof path.at(-1) !== 'string';

const isStrictPrefix = (prefix: FieldPath, path: FieldPath): boolean =>
  prefix.length < path.length && prefix.every((s, i) => JSON.stringify(s) === JSON.stringify(path[i]));

/**
 * Drops each difference a removal already covers: everything on a removed table, the children and `arr.*` element of a
 * removed field, and the indexes `emitRemove` clears with it. Left in, those statements would run twice and fail the
 * transaction.
 */
function dropCovered(
  differences: readonly SchemaDifference[],
  live: SchemaModel,
  keepIndex: KeepIndex,
): SchemaDifference[] {
  const removedTables = new Set(differences.filter((d) => d.kind === 'table-extra-managed').map((d) => d.table));
  const extras = differences.filter((d) => d.kind === 'field-extra' && !removedTables.has(d.table));
  const roots = extras.filter(
    (d) =>
      !extras.some((o) => o !== d && o.table === d.table && o.field && d.field && isStrictPrefix(o.field, d.field)),
  );
  const cleared = new Set(roots.flatMap((d) => emitRemove(d, live, keepIndex)));

  return differences.filter((d) => {
    if (d.kind !== 'table-extra-managed' && removedTables.has(d.table)) return false;
    if (d.kind === 'field-extra') return roots.includes(d);
    if (d.kind === 'index-extra') {
      return !cleared.has(`REMOVE INDEX ${quoteIdent(d.index ?? '')} ON ${quoteIdent(d.table ?? '')};`);
    }

    return true;
  });
}

/**
 * Turns a difference list into the ordered steps that converge the live schema on the desired one: new tables
 * (each with its fields), new fields, changed fields, indexes, then removals, then reports of what Cerial does not
 * manage. A forward step is the generated statement for exactly that construct; an unchanged index is never
 * reissued, since redefining one rebuilds it. A rename is one removal and one addition. Pure: it reads its inputs.
 * A difference with no desired statement throws `CerialMigrationError` naming it.
 */
export function buildMigrationPlan(
  differences: readonly SchemaDifference[],
  desired: DesiredStatements,
  live: SchemaModel,
): MigrationPlan {
  const keepIndex: KeepIndex = (table, index) => desired.get(table)?.indexes.has(index) ?? false;
  const kept = dropCovered(differences, live, keepIndex);
  const tableOf = (d: SchemaDifference): [string, TableStatements] => {
    const found = d.table === undefined ? undefined : desired.get(d.table);
    if (!found) return missing(d);

    return [d.table!, found];
  };
  const forward = (d: SchemaDifference, statement: string, reason = d.reason): MigrationPlanItem => ({
    statement,
    class: d.class,
    reason,
    construct: d.construct,
    table: d.table,
  });
  const order = (table: string, key: string, kind: 'fields' | 'indexes'): number =>
    [...desired.keys()].indexOf(table) * 1e6 + [...desired.get(table)![kind].keys()].indexOf(key);

  const stages: { at: number; item: MigrationPlanItem }[][] = [[], [], [], [], [], []];
  const fieldStatement = (d: SchemaDifference, table: string, t: TableStatements): string | undefined => {
    const key = pathKey(d.field ?? []);
    const statement = t.fields.get(key);
    if (statement !== undefined) return statement;
    // An element step is defined by its parent's type; the parent's own difference carries the statement.
    const parent = d.field?.slice(0, -1) ?? [];
    const parentPlanned =
      d.field &&
      isElement(d.field) &&
      kept.some((o) => o.table === table && o.field && pathKey(o.field) === pathKey(parent));
    if (parentPlanned) return undefined;

    return missing(d);
  };

  for (const d of kept) {
    switch (d.kind) {
      case 'table-missing': {
        const [table, t] = tableOf(d);
        stages[0]!.push({ at: order(table, '', 'fields'), item: forward(d, t.define) });
        for (const [key, statement] of t.fields) {
          stages[0]!.push({ at: order(table, key, 'fields'), item: forward(d, statement) });
        }
        for (const [key, statement] of t.indexes) {
          stages[3]!.push({ at: order(table, key, 'indexes'), item: { ...forward(d, statement), construct: 'index' } });
        }
        break;
      }
      case 'table-mode-changed': {
        const [table, t] = tableOf(d);
        stages[2]!.push({ at: order(table, '', 'fields'), item: forward(d, t.define) });
        break;
      }
      case 'field-missing':
      case 'field-missing-required':
      case 'field-changed': {
        const [table, t] = tableOf(d);
        const statement = fieldStatement(d, table, t);
        if (statement === undefined) break;
        const reason = d.changes?.includes('kind') ? [d.reason, TYPE_CHANGE_NOTE].join('. ') : d.reason;
        stages[d.kind === 'field-changed' ? 2 : 1]!.push({
          at: order(table, pathKey(d.field ?? []), 'fields'),
          item: forward(d, statement, reason),
        });
        break;
      }
      case 'index-missing':
      case 'index-changed':
      case 'index-unique-added': {
        const [table, t] = tableOf(d);
        const statement = t.indexes.get(d.index ?? '');
        if (statement === undefined) return missing(d);
        stages[3]!.push({ at: order(table, d.index!, 'indexes'), item: forward(d, statement) });
        break;
      }
      case 'field-extra':
      case 'index-extra':
      case 'table-extra-managed':
        for (const statement of emitRemove(d, live, keepIndex)) stages[4]!.push({ at: 0, item: forward(d, statement) });
        break;
      default:
        stages[5]!.push({ at: 0, item: { class: d.class, reason: d.reason, construct: d.construct, table: d.table } });
    }
  }

  return stages.flatMap((stage) => stage.sort((a, b) => a.at - b.at).map((entry) => entry.item));
}
