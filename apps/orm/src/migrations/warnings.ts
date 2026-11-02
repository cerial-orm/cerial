import type { Surreal } from 'surrealdb';
import { sanitiseReason } from './comment';
import { diffSchema } from './diff';
import { buildMigrationPlan, indexDesiredStatements } from './plan';
import { readLiveSchema } from './reader';
import type { MigrationState } from './state';
import type { SchemaModel } from './types';
import { describe } from './util';

/** Held on `globalThis` so a second copy of the package in the process shares the flag instead of warning again. */
const PRODUCTION_WARNED = Symbol.for('cerial.migrations.productionWarned');

/** Warns once per process that `'auto'` runs DDL in production, naming `'verify'` as the production setting. */
export function warnAutoInProduction(): void {
  const holder = globalThis as { [PRODUCTION_WARNED]?: boolean };
  if (process.env.NODE_ENV !== 'production' || holder[PRODUCTION_WARNED]) return;

  holder[PRODUCTION_WARNED] = true;
  console.warn(
    "[cerial] migrations: 'auto' applies schema changes on first use while NODE_ENV is 'production'. " +
      "Set migrations: 'verify' (and migrate in a deploy step) so a mismatched schema fails fast instead of being altered.",
  );
}

/** @internal Clears the once-per-process record, for tests. */
export function resetProductionWarning(): void {
  delete (globalThis as { [PRODUCTION_WARNED]?: boolean })[PRODUCTION_WARNED];
}

export interface AutoChangeInput {
  /** The desired schema as the generated client carries it. */
  readonly manifest: SchemaModel;
  /** Every generated `DEFINE` statement, flat. */
  readonly statements: readonly string[];
  /** Tables of the models whose persisted fingerprint differs from the generated one. */
  readonly tables: readonly string[];
}

/**
 * Under `'auto'`, once a model's fingerprint is known to have changed: reads the live schema, diffs it for the changed
 * tables and warns with the plan that is about to be applied. Warns only; the caller applies as it always did.
 */
export async function warnAutoChange(surreal: Surreal, state: MigrationState, input: AutoChangeInput): Promise<void> {
  try {
    await warnPlan(surreal, state, input);
  } catch (cause) {
    // Only a notice: failing here would block the apply the warning is about.
    console.warn(
      sanitiseReason(
        [
          '[cerial] migrations: could not compute the plan for the schema change about to be applied: ',
          describe(cause),
        ].join(''),
      ),
    );
  }
}

async function warnPlan(surreal: Surreal, state: MigrationState, input: AutoChangeInput): Promise<void> {
  const live = await readLiveSchema(surreal);
  const changed = new Set(input.tables);
  const differences = diffSchema(input.manifest, live, { managedTables: state.schema?.managedTables ?? [] }).filter(
    (d) => d.class !== 'unmanaged' && d.table !== undefined && changed.has(d.table),
  );
  if (!differences.length) return;

  const plan = buildMigrationPlan(differences, indexDesiredStatements(input.statements), live);
  const lines = plan.map((item) =>
    sanitiseReason(['  - [', item.class, '] ', item.statement ?? item.reason, ' (', item.reason, ')'].join('')),
  );
  console.warn(
    [
      "[cerial] migrations: 'auto' is about to change a schema that differs from the generated one. Plan:\n",
      lines.join('\n'),
    ].join(''),
  );
}
