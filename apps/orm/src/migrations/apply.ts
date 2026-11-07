import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
import { escapeControl, escapeForTerminal } from '../utils/safe-text';
import { diffSchema } from './diff';
import { fingerprint } from './fingerprint';
import { type LeaseOptions, type MigrationLease, withLease } from './lease';
import type { MigrationPlan } from './plan';
import { readLiveSchema } from './reader';
import {
  buildModelStateWrite,
  buildSchemaStateWrite,
  readState,
  type SchemaStateInput,
  type StatePiece,
} from './state';
import type { TableModel } from './types';
import { describe, trimStatement } from './util';

/** One model the plan converges: its table, and the table as the schema describes it, which the re-read is judged against. */
export interface ApplyModel {
  readonly modelName: string;
  readonly table: string;
  readonly fingerprint: string;
  /**
   * The table as the schema describes it. The re-read judges only what it declares: a live-only field or index is
   * drift for status and verify, not a failed apply. Without it the re-read is judged against `fingerprint`.
   */
  readonly desired?: TableModel;
}

/** One schema entry of an apply: the models its plan steps converge and the schema row written once they all did. */
export interface ApplyEntry {
  readonly schemaName: string;
  /** Every model this apply may mark `applied`. A model whose statements did not all run stays unmarked. */
  readonly models: readonly ApplyModel[];
  /**
   * The schema row, written only when every statement ran. `statements` and `previousManagedTables` are filled in
   * here: the first is what ran, the second is read under the lease.
   */
  readonly schema?: Omit<SchemaStateInput, 'statements' | 'previousManagedTables'>;
}

interface ApplyBase {
  readonly cerialVersion: string;
  /** A lease the caller already holds (and releases). Without one, `applyPlan` takes the lease and releases it. */
  readonly lease?: MigrationLease;
  readonly leaseOptions?: LeaseOptions;
}

/**
 * One schema entry (`schemaName`, `models`, `schema`), or `entries`: several entries sharing the connection, applied
 * in one transaction so a failure in any of them rolls back all of them.
 */
export type ApplyOptions = ApplyBase &
  (
    | (ApplyEntry & { readonly entries?: never })
    | {
        readonly entries: readonly ApplyEntry[];
        readonly schemaName?: never;
        readonly models?: never;
        readonly schema?: never;
      }
  );

export interface ApplyEntryResult {
  readonly schemaName: string;
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export interface ApplyResult {
  /** The statements the transaction ran, in order. */
  readonly executed: readonly string[];
  /** Models marked `applied`, across every entry. */
  readonly applied: readonly string[];
  /** Models left without state because a statement of theirs was commented out. */
  readonly skipped: readonly string[];
  readonly entries: readonly ApplyEntryResult[];
}

// What the other statements of an aborted transaction answer; only the statement that caused it carries its own error.
// A COMMIT that fails on its own (a write conflict) answers differently and is the cause, not noise.
const GENERIC_FAILURE =
  /not executed due to a (?:failed|cancelled) transaction|Cannot COMMIT: the transaction was aborted/i;

/** A statement the plan carries as a `--` comment is not run, the way a file apply skips it. */
const isCommented = (statement: string): boolean => statement.trimStart().startsWith('--');

const entriesOf = (options: ApplyOptions): readonly ApplyEntry[] => options.entries ?? [options as ApplyEntry];

function merge(pieces: readonly StatePiece[]): StatePiece {
  const bindings: Record<string, unknown> = {};
  for (const piece of pieces) {
    for (const [key, value] of Object.entries(piece.bindings)) {
      if (key in bindings) throw new CerialMigrationError(`Cannot merge migration bindings: '${key}' is bound twice.`);
      bindings[key] = value;
    }
  }

  return { query: pieces.map((p) => p.query).join(';\n'), bindings };
}

/** Gives a piece's bindings a suffix, so the same builder can run once per entry inside one script. */
function suffixed(piece: StatePiece, suffix: string): StatePiece {
  let query = piece.query;
  const bindings: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(piece.bindings)) {
    query = query.replace(new RegExp(['\\$', key, '\\b'].join(''), 'g'), ['$', key, suffix].join(''));
    bindings[[key, suffix].join('')] = value;
  }

  return { query, bindings };
}

/** What the operator does about a refusal that asks for a data migration the plan could not derive. */
function hint(message: string): string {
  if (/MIGRATE EXISTING ROWS|Cannot migrate field/.test(message)) {
    return '. Existing rows need a conversion: add a @default or make the field optional, or migrate the rows by hand, then apply again';
  }
  if (/in the transaction that runs migration/.test(message)) {
    return '. Apply the schema twice: first without the index, then with it';
  }

  return '';
}

function reportFailure(
  responses: readonly { success: boolean; error?: { message: string } }[],
  statements: readonly string[],
): CerialMigrationError {
  // The first response answers BEGIN, so the statement behind response n is statement n - 1. A failure past the last
  // statement is COMMIT's own (a write conflict, say): the transaction is to blame, no statement, and the whole
  // batch is rolled back.
  const index = responses.findIndex((r) => !r.success && !GENERIC_FAILURE.test(r.error?.message ?? ''));
  // Server text can echo a stored value, so it is escaped before it reaches a log or a terminal
  const message = escapeControl(responses[index]?.error?.message ?? 'the transaction failed and was rolled back');
  const ddl = statements[index - 1];
  if (ddl === undefined) {
    return new CerialMigrationError(`The migration was rolled back: ${message}`, {
      cause: responses[index]?.error,
    });
  }

  return new CerialMigrationError(
    `The migration was rolled back; ${escapeForTerminal(ddl)} failed: ${message}${hint(message)}`,
    {
      cause: responses[index]?.error,
      statement: { text: ddl, vars: {} },
    },
  );
}

interface PendingRow {
  readonly schemaName: string;
  readonly model: ApplyModel;
}

async function writePending(surreal: Surreal, cerialVersion: string, rows: readonly PendingRow[]): Promise<void> {
  if (!rows.length) return;
  const piece = buildModelStateWrite(
    rows.map(({ schemaName, model }) => ({
      schemaName,
      modelName: model.modelName,
      fingerprint: model.fingerprint,
      cerialVersion,
      status: 'pending' as const,
    })),
  );
  const [response] = await surreal.query(piece.query, piece.bindings).responses();
  if (response && !response.success) {
    throw new CerialMigrationError(`Writing migration state failed: ${escapeControl(response.error.message)}`, {
      cause: response.error,
    });
  }
}

/** Whether the live table lacks, or defines differently, anything the schema declares. A live-only construct passes. */
function disagrees(model: ApplyModel, live: readonly TableModel[]): boolean {
  const found = live.find((t) => t.name === model.table);
  if (!found) return true;
  if (!model.desired) return fingerprint(found) !== model.fingerprint;
  try {
    return diffSchema(
      { tables: [model.desired], unmanaged: [] },
      { tables: [found], unmanaged: [] },
      { managedTables: [] },
    ).some((d) => d.kind !== 'field-extra' && d.kind !== 'index-extra');
  } catch {
    // A live definition the differ cannot classify is not the declared one.
    return true;
  }
}

async function applyUnderLease(
  surreal: Surreal,
  plan: MigrationPlan,
  options: ApplyOptions,
  lease: MigrationLease,
): Promise<ApplyResult> {
  const entries = entriesOf(options);
  const runnable: string[] = [];
  const skippedTables = new Set<string>();
  let anySkipped = false;
  for (const item of plan) {
    if (item.statement === undefined) continue;
    if (isCommented(item.statement)) {
      anySkipped = true;
      if (item.table !== undefined) skippedTables.add(item.table);
      continue;
    }
    runnable.push(trimStatement(item.statement));
  }

  const split = entries.map((entry) => ({
    entry,
    converged: entry.models.filter((m) => !skippedTables.has(m.table)),
    skipped: entry.models.filter((m) => skippedTables.has(m.table)),
  }));
  // A skipped statement of any table, a model's or not, leaves the database short of the schema.
  const complete = !anySkipped;

  await writePending(
    surreal,
    options.cerialVersion,
    entries.flatMap((entry) => entry.models.map((model) => ({ schemaName: entry.schemaName, model }))),
  );

  const pieces: StatePiece[] = [];
  const convergedRows = split.flatMap(({ entry, converged }) =>
    converged.map((m) => ({
      schemaName: entry.schemaName,
      modelName: m.modelName,
      fingerprint: m.fingerprint,
      cerialVersion: options.cerialVersion,
      status: 'applied' as const,
    })),
  );
  if (convergedRows.length) pieces.push(buildModelStateWrite(convergedRows));
  if (complete) {
    for (const [i, { entry }] of split.entries()) {
      if (!entry.schema) continue;
      const { schema } = await readState(surreal, entry.schemaName);
      const piece = buildSchemaStateWrite({
        ...entry.schema,
        statements: runnable,
        previousManagedTables: schema?.managedTables ?? [],
      });
      pieces.push(i ? suffixed(piece, String(i)) : piece);
    }
  }
  const tail = merge([lease.holderCheck(), ...pieces]);
  // The `;` sits on its own line so a statement ending in a `--` comment cannot swallow it.
  const script = ['BEGIN', ...runnable, tail.query, 'COMMIT', ''].join('\n;\n');

  let responses;
  try {
    responses = await surreal.query(script, tail.bindings).responses();
  } catch (cause) {
    throw new CerialMigrationError(`The migration was rolled back: ${escapeControl(describe(cause))}`, { cause });
  }
  if (responses.some((r) => !r.success)) throw reportFailure(responses, [...runnable, tail.query]);

  const convergedAll = split.flatMap(({ entry, converged }) =>
    converged.map((model) => ({ schemaName: entry.schemaName, model })),
  );
  if (convergedAll.length) {
    const live = await readLiveSchema(surreal);
    const bad = convergedAll.filter(({ model }) => disagrees(model, live.tables));
    if (bad.length) {
      await writePending(surreal, options.cerialVersion, bad);

      throw new CerialMigrationError(
        `The migration committed but the live table(s) ${bad.map(({ model }) => JSON.stringify(model.table)).join(', ')} do not match the schema; their state stays pending.`,
      );
    }
  }

  const perEntry = split.map(({ entry, converged, skipped }) => ({
    schemaName: entry.schemaName,
    applied: converged.map((m) => m.modelName),
    skipped: skipped.map((m) => m.modelName),
  }));

  return {
    executed: runnable,
    applied: perEntry.flatMap((e) => e.applied),
    skipped: perEntry.flatMap((e) => e.skipped),
    entries: perEntry,
  };
}

/**
 * Applies a plan under the migration lease: a `pending` state row for each model first, then one
 * `BEGIN ... COMMIT` script of the plan's statements, the lease's holder check, and the flip to `applied`, for every
 * entry at once. Rollback holds only for a single script, so the SDK transaction API is not used. A statement that is
 * a `--` comment is skipped, a model is marked `applied` only when none of its statements was, and no schema row is
 * written when any statement was skipped; a plan step belongs to the model whose `table` equals the step's `table`.
 * After the commit the touched tables are re-read and judged against `desired`, over the constructs the schema
 * declares only; a disagreement throws `CerialMigrationError` and puts the row back to `pending`.
 */
export async function applyPlan(surreal: Surreal, plan: MigrationPlan, options: ApplyOptions): Promise<ApplyResult> {
  if (options.lease) return applyUnderLease(surreal, plan, options, options.lease);

  return withLease(surreal, (lease) => applyUnderLease(surreal, plan, options, lease), options.leaseOptions);
}
