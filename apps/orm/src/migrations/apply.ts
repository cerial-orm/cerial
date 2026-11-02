import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
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

export interface ApplyOptions {
  readonly schemaName: string;
  readonly cerialVersion: string;
  /** Every model this apply may mark `applied`. A model whose statements did not all run stays unmarked. */
  readonly models: readonly ApplyModel[];
  /**
   * The schema row, written only when every statement ran. `statements` and `previousManagedTables` are filled in
   * here: the first is what ran, the second is read under the lease.
   */
  readonly schema?: Omit<SchemaStateInput, 'statements' | 'previousManagedTables'>;
  /** A lease the caller already holds (and releases). Without one, `applyPlan` takes the lease and releases it. */
  readonly lease?: MigrationLease;
  readonly leaseOptions?: LeaseOptions;
}

export interface ApplyResult {
  /** The statements the transaction ran, in order. */
  readonly executed: readonly string[];
  /** Models marked `applied`. */
  readonly applied: readonly string[];
  /** Models left without state because a statement of theirs was commented out. */
  readonly skipped: readonly string[];
}

// What the other statements of an aborted transaction answer; only the statement that caused it carries its own error.
// A COMMIT that fails on its own (a write conflict) answers differently and is the cause, not noise.
const GENERIC_FAILURE =
  /not executed due to a (?:failed|cancelled) transaction|Cannot COMMIT: the transaction was aborted/i;

/** A statement the plan carries as a `--` comment is not run, the way a file apply skips it. */
const isCommented = (statement: string): boolean => statement.trimStart().startsWith('--');

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

function reportFailure(
  responses: readonly { success: boolean; error?: { message: string } }[],
  statements: readonly string[],
): CerialMigrationError {
  // The first response answers BEGIN, so the statement behind response n is statement n - 1. A failure past the last
  // statement is COMMIT's own (a write conflict, say): the transaction is to blame, no statement, and the whole
  // batch is rolled back.
  const index = responses.findIndex((r) => !r.success && !GENERIC_FAILURE.test(r.error?.message ?? ''));
  const message = responses[index]?.error?.message ?? 'the transaction failed and was rolled back';
  const ddl = statements[index - 1];
  if (ddl === undefined) {
    return new CerialMigrationError(`The migration was rolled back: ${message}`, {
      cause: responses[index]?.error,
    });
  }

  return new CerialMigrationError(`The migration was rolled back; ${ddl} failed: ${message}`, {
    cause: responses[index]?.error,
    statement: { text: ddl, vars: {} },
  });
}

async function writePending(surreal: Surreal, options: ApplyOptions, models: readonly ApplyModel[]): Promise<void> {
  if (!models.length) return;
  const piece = buildModelStateWrite(
    models.map((m) => ({
      schemaName: options.schemaName,
      modelName: m.modelName,
      fingerprint: m.fingerprint,
      cerialVersion: options.cerialVersion,
      status: 'pending' as const,
    })),
  );
  const [response] = await surreal.query(piece.query, piece.bindings).responses();
  if (response && !response.success) {
    throw new CerialMigrationError(`Writing migration state failed: ${response.error.message}`, {
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
  const runnable: string[] = [];
  const skippedTables = new Set<string>();
  for (const item of plan) {
    if (item.statement === undefined) continue;
    if (isCommented(item.statement)) {
      if (item.table !== undefined) skippedTables.add(item.table);
      continue;
    }
    runnable.push(trimStatement(item.statement));
  }

  const converged = options.models.filter((m) => !skippedTables.has(m.table));
  const skipped = options.models.filter((m) => skippedTables.has(m.table));
  const complete = !skipped.length;

  await writePending(surreal, options, options.models);

  const pieces: StatePiece[] = [];
  if (converged.length) {
    pieces.push(
      buildModelStateWrite(
        converged.map((m) => ({
          schemaName: options.schemaName,
          modelName: m.modelName,
          fingerprint: m.fingerprint,
          cerialVersion: options.cerialVersion,
          status: 'applied' as const,
        })),
      ),
    );
  }
  if (complete && options.schema) {
    const { schema } = await readState(surreal, options.schemaName);
    pieces.push(
      buildSchemaStateWrite({
        ...options.schema,
        statements: runnable,
        previousManagedTables: schema?.managedTables ?? [],
      }),
    );
  }
  const tail = merge([lease.holderCheck(), ...pieces]);
  const script = ['BEGIN', ...runnable, tail.query, 'COMMIT', ''].join(';\n');

  let responses;
  try {
    responses = await surreal.query(script, tail.bindings).responses();
  } catch (cause) {
    throw new CerialMigrationError(`The migration was rolled back: ${describe(cause)}`, { cause });
  }
  if (responses.some((r) => !r.success)) throw reportFailure(responses, [...runnable, tail.query]);

  const touched = converged.map((m) => m.table);
  if (touched.length) {
    const live = await readLiveSchema(surreal);
    const bad = converged.filter((m) => disagrees(m, live.tables));
    if (bad.length) {
      await writePending(surreal, options, bad);

      throw new CerialMigrationError(
        `The migration committed but the live table(s) ${bad.map((m) => JSON.stringify(m.table)).join(', ')} do not match the schema; their state stays pending.`,
      );
    }
  }

  return {
    executed: runnable,
    applied: converged.map((m) => m.modelName),
    skipped: skipped.map((m) => m.modelName),
  };
}

/**
 * Applies a plan under the migration lease: a `pending` state row for each model first, then one
 * `BEGIN ... COMMIT` script of the plan's statements, the lease's holder check, and the flip to `applied`. Rollback
 * holds only for a single script, so the SDK transaction API is not used. A statement that is a `--` comment is
 * skipped, and a model is marked `applied` only when none of its statements was; a plan step belongs to the
 * model whose `table` equals the step's `table`. After the commit the touched tables are re-read and judged against `desired`,
 * over the constructs the schema declares only; a disagreement throws `CerialMigrationError` and puts the row back to `pending`.
 */
export async function applyPlan(surreal: Surreal, plan: MigrationPlan, options: ApplyOptions): Promise<ApplyResult> {
  if (options.lease) return applyUnderLease(surreal, plan, options, options.lease);

  return withLease(surreal, (lease) => applyUnderLease(surreal, plan, options, lease), options.leaseOptions);
}
