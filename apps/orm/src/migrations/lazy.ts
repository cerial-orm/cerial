import type { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../errors';
import { applyPlan } from './apply';
import { withLease } from './lease';
import type { MigrationPlan } from './plan';
import { type MigrationState, readState } from './state';
import { bootstrapStateTables } from './state-tables';
import type { SchemaModel } from './types';
import { trimStatement } from './util';

/** One model as the generated client knows it: no schema, only the DDL it would run and the fingerprint it should leave. */
export interface LazyModel {
  readonly table: string;
  readonly statements: readonly string[];
  readonly fingerprint: string;
}

export interface LazyMigrationContext {
  readonly schemaName: string;
  readonly cerialVersion: string;
  readonly models: Readonly<Record<string, LazyModel>>;
}

/** The requested models whose persisted `applied` row carries the fingerprint the client was generated with. */
export function matchedModels(
  state: MigrationState,
  context: LazyMigrationContext,
  names: readonly string[],
): string[] {
  return names.filter((name) => {
    const model = context.models[name];

    return !!model && state.models.get(name)?.fingerprint === model.fingerprint;
  });
}

/** Reads the persisted state of the context's schema entry. */
export function readLazyState(surreal: Surreal, context: LazyMigrationContext): Promise<MigrationState> {
  return readState(surreal, context.schemaName);
}

export interface ApplyUnmatchedOptions {
  /** Apply every named model whatever the persisted state says (a deploy step, or after a state reset). */
  readonly force?: boolean;
  /** The fingerprint of the whole schema, written to the schema row; only a batch of every model may pass it. */
  readonly schemaFingerprint?: string;
  /**
   * The desired schema the client was generated with. The post-commit re-read then judges only the constructs it
   * declares, so a live-only field or index (which `auto` never removes) does not fail the apply. Without it the
   * re-read compares the whole live table with the generated fingerprint.
   */
  readonly manifest?: SchemaModel;
}

/**
 * Brings the named models to their generated shape as one batch under the one database lease: state is re-read after
 * the lease is held, only the models still unmatched are applied, and the schema row only grows `managedTables`.
 * Returns the models that are in place afterwards (matched by another client, or applied here).
 */
export async function applyUnmatched(
  surreal: Surreal,
  context: LazyMigrationContext,
  names: readonly string[],
  options: ApplyUnmatchedOptions = {},
): Promise<string[]> {
  await bootstrapStateTables(surreal);

  return withLease(surreal, async (lease) => {
    const state = await readLazyState(surreal, context);
    const matched = options.force ? [] : matchedModels(state, context, names);
    const unmatched = names.filter((name) => !matched.includes(name));
    if (!unmatched.length) return [...matched];

    const plan: MigrationPlan = unmatched.flatMap((name) =>
      context.models[name]!.statements.map((statement) => ({
        statement,
        class: 'additive' as const,
        reason: 'applied on first use',
        construct: name,
        table: context.models[name]!.table,
      })),
    );
    // Without the whole schema's fingerprint an existing row keeps its own.
    const tables = new Set([
      ...(state.schema?.managedTables ?? []),
      ...unmatched.map((name) => context.models[name]!.table),
    ]);
    const result = await applyPlan(surreal, plan, {
      schemaName: context.schemaName,
      cerialVersion: context.cerialVersion,
      lease,
      models: unmatched.map((name) => ({
        modelName: name,
        table: context.models[name]!.table,
        fingerprint: context.models[name]!.fingerprint,
        desired: options.manifest?.tables.find((t) => t.name === context.models[name]!.table),
      })),
      schema: {
        schemaName: context.schemaName,
        fingerprint: options.schemaFingerprint ?? state.schema?.fingerprint ?? '',
        managedTables: [...tables],
      },
    });

    return [...matched, ...result.applied];
  });
}

/** The models whose generated DDL contains the statement a failed apply names; every model when it names none. */
export function blameModels(error: unknown, context: LazyMigrationContext, names: readonly string[]): string[] {
  const text = error instanceof CerialMigrationError ? error.statement?.text : undefined;
  if (text === undefined) return [...names];
  const own = names.filter((name) =>
    context.models[name]?.statements.some((s) => trimStatement(s) === trimStatement(text)),
  );

  return own.length ? own : [...names];
}
