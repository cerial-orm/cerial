import type { DifferenceKind, SchemaDifference } from './diff';
import { sanitiseReason } from './comment';
import { quoteFieldPath, quoteIdent } from './quote';
import type { FieldPath } from './types';

/** A live construct the schema does not hold (`extra`) or defines differently (`changed`). */
export interface DriftItem {
  readonly construct: 'table' | 'field' | 'index';
  readonly change: 'extra' | 'changed';
  readonly table: string;
  readonly field?: FieldPath;
  readonly index?: string;
  /** One line naming the construct, with every line terminator rendered visibly. */
  readonly line: string;
}

export interface DriftReport {
  /** Live state that disagrees with the schema; what makes `status` fail. */
  readonly drift: readonly DriftItem[];
  /** Schema constructs the live database lacks yet: the ordinary additive case, never drift. */
  readonly pending: readonly SchemaDifference[];
  readonly hasDrift: boolean;
}

const DRIFT_KINDS: Readonly<Partial<Record<DifferenceKind, DriftItem['change']>>> = {
  'field-extra': 'extra',
  'index-extra': 'extra',
  'table-extra-managed': 'extra',
  'field-changed': 'changed',
  'index-changed': 'changed',
  'index-unique-added': 'changed',
};

const PENDING_KINDS: ReadonlySet<DifferenceKind> = new Set([
  'table-missing',
  'field-missing',
  'field-missing-required',
  'index-missing',
]);

function toDriftItem(d: SchemaDifference, change: DriftItem['change']): DriftItem {
  const table = d.table ?? '';
  const verb = change === 'extra' ? 'is live but not in the schema' : 'differs from the schema';
  const subject =
    d.construct === 'table'
      ? `table ${quoteIdent(table)}`
      : d.construct === 'field'
        ? `field ${quoteFieldPath(d.field ?? [])} on table ${quoteIdent(table)}`
        : `index ${quoteIdent(d.index ?? '')} on table ${quoteIdent(table)}`;
  const changes = change === 'changed' && d.changes?.length ? ` (${d.changes.join(', ')})` : '';

  return {
    construct: d.construct as DriftItem['construct'],
    change,
    table,
    ...(d.field !== undefined && { field: d.field }),
    ...(d.index !== undefined && { index: d.index }),
    line: sanitiseReason(`${subject} ${verb}${changes}`),
  };
}

/**
 * Splits the differ's output into drift and pending. Pure: it reads the differences and nothing else.
 * Unmanaged constructs (events, functions, unmanaged tables) are in neither list, so a database using them passes.
 */
export function findDrift(differences: readonly SchemaDifference[]): DriftReport {
  const drift: DriftItem[] = [];
  const pending: SchemaDifference[] = [];

  for (const d of differences) {
    const change = DRIFT_KINDS[d.kind];
    if (change) drift.push(toDriftItem(d, change));
    else if (PENDING_KINDS.has(d.kind)) pending.push(d);
  }

  return { drift, pending, hasDrift: drift.length > 0 };
}
