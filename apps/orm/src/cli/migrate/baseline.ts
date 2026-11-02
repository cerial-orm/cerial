import pkg from '../../../package.json';
import { CerialMigrationError } from '../../errors';
import {
  bootstrapStateTables,
  buildModelStateWrite,
  buildSchemaStateWrite,
  diffSchema,
  findDrift,
  quoteFieldPath,
  quoteIdent,
  sanitiseReason,
  schemaFingerprint,
  withLease,
} from '../../migrations';
import type { SchemaDifference, SchemaModel } from '../../migrations';
import { parseMigrateArgs } from './args';
import type { MigrateEnv } from './connection';
import { loadDesired } from './load';
import type { MigrateTarget } from './load';
import { connect, join, readLiveTarget, scrub, suffixed, withLogsOnStderr } from './shared';

/** Exit codes: 0 recorded, 1 refused because the live schema differs, 2 failed */
export const BASELINE_OK = 0;
export const BASELINE_REFUSED = 1;
export const BASELINE_FAILED = 2;

export interface BaselineResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface BaselineOptions {
  readonly argv: readonly string[];
  readonly env: MigrateEnv;
  readonly cwd?: string;
}

interface CheckedTarget {
  readonly target: MigrateTarget;
  /** False when the database is not defined yet: there is no live schema to record */
  readonly exists: boolean;
  readonly live: SchemaModel;
  /** Managed tables each entry's state row holds now, which a baseline keeps */
  readonly managed: ReadonlyMap<string, readonly string[]>;
  /** What differs between live and the schema, one line each; empty when they match */
  readonly differences: readonly string[];
}

const where = (target: MigrateTarget): string => join(target.connection.namespace, '/', target.connection.database);

function describePending(d: SchemaDifference): string {
  const table = quoteIdent(d.table ?? '');
  if (d.construct === 'table') return join('table ', table, ' is not live yet');
  if (d.construct === 'field')
    return join('field ', quoteFieldPath(d.field ?? []), ' on table ', table, ' is not live yet');

  return join('index ', quoteIdent(d.index ?? ''), ' on table ', table, ' is not live yet');
}

/** Reads the live schema and state and lists how live differs from the schema. Writes nothing. */
async function checkTarget(target: MigrateTarget): Promise<CheckedTarget> {
  const surreal = await connect(target.credentials(), 'migrate baseline');
  try {
    const { exists, live, managed, managedTables } = await readLiveTarget(surreal, target);
    const report = findDrift(diffSchema(target.desired, live, { managedTables }));

    return {
      target,
      exists,
      live,
      managed,
      differences: [...report.drift.map((d) => d.line), ...report.pending.map(describePending)].map(sanitiseReason),
    };
  } finally {
    await surreal.close().catch(() => {});
  }
}

/**
 * Writes the state of every entry on the target in one transaction under the lease: the schema's fingerprint for
 * every model whose table is live, and one schema row per entry. A model whose table is absent gets no row, so the
 * lazy path still creates it. One transaction, so a failure leaves no entry recorded.
 */
async function recordTarget(checked: CheckedTarget): Promise<number> {
  const surreal = await connect(checked.target.credentials(), 'migrate baseline');
  try {
    await bootstrapStateTables(surreal);

    return await withLease(surreal, async (lease) => {
      const liveTables = new Set(checked.live.tables.map((t) => t.name));
      const rows = checked.target.entryModels.flatMap((entry) =>
        entry.models
          .filter((m) => liveTables.has(m.table))
          .map((m) => ({
            schemaName: entry.schemaName,
            modelName: m.name,
            fingerprint: m.fingerprint,
            cerialVersion: pkg.version,
            status: 'applied' as const,
          })),
      );
      const pieces = [lease.holderCheck()];
      if (rows.length) pieces.push(buildModelStateWrite(rows));
      checked.target.entryModels.forEach((entry, index) => {
        const declared = entry.desired.tables.map((t) => t.name).filter((t) => liveTables.has(t));
        const previous = checked.managed.get(entry.schemaName) ?? [];
        const piece = buildSchemaStateWrite({
          schemaName: entry.schemaName,
          fingerprint: schemaFingerprint(entry.desired),
          statements: [],
          managedTables: [...new Set([...previous, ...declared])],
          previousManagedTables: previous,
        });
        pieces.push(suffixed(piece, String(index)));
      });
      const script = join('BEGIN;\n', pieces.map((p) => p.query).join(';\n'), ';\nCOMMIT;\n');
      const responses = await surreal.query(script, Object.assign({}, ...pieces.map((p) => p.bindings))).responses();
      const failed = responses.find((r) => !r.success);
      if (failed && !failed.success) {
        throw new CerialMigrationError(
          join('Recording the baseline failed and was rolled back: ', failed.error.message),
          { cause: failed.error },
        );
      }

      return rows.length;
    });
  } finally {
    await surreal.close().catch(() => {});
  }
}

/**
 * `cerial migrate baseline`: record the live schema as applied and run no DDL. The only write is migration state.
 *
 * A live schema that differs from the schema files refuses, listing the differences, before anything is written.
 * `--accept-drift` records anyway: each model whose table is live is recorded with the fingerprint the schema
 * gives it, which is the one the generated client compares, so the client's lazy start finds it matched and
 * leaves the table alone; `status` keeps reporting the difference. Only tables the schema declares become managed.
 */
export async function migrateBaseline(options: BaselineOptions): Promise<BaselineResult> {
  const fail = (exitCode: number, message: string): BaselineResult => ({
    exitCode,
    stdout: '',
    stderr: join('cerial migrate baseline: ', scrub(message, options.env.CERIAL_DB_PASSWORD), '\n'),
  });

  try {
    const { flags, positionals } = parseMigrateArgs(options.argv);
    if (positionals.length) throw new Error('migrate baseline takes no arguments.');
    const targets = await withLogsOnStderr(() => loadDesired({ flags, env: options.env, cwd: options.cwd }));
    const checked: CheckedTarget[] = [];
    for (const target of targets) checked.push(await checkTarget(target));

    const missing = checked.filter((c) => !c.exists);
    if (missing.length) {
      // Recording a schema that is not there would say a database was migrated that does not exist
      return fail(
        BASELINE_REFUSED,
        join(
          'refused, the database ',
          missing.map((c) => where(c.target)).join(', '),
          ' does not exist, so there is no live schema to record and nothing was recorded. Run migrate apply --from-schema to create it.',
        ),
      );
    }

    const said: string[] = [];
    const differing = checked.filter((c) => c.differences.length);
    if (differing.length && !flags['accept-drift']) {
      const lines = differing.flatMap((c) => [
        join('  ', where(c.target), ':'),
        ...c.differences.map((d) => join('    ', d)),
      ]);

      return fail(
        BASELINE_REFUSED,
        join(
          'refused, the live schema differs from the schema and nothing was recorded. Pass --accept-drift to record it anyway.\n',
          lines.join('\n'),
        ),
      );
    }
    for (const c of differing) {
      said.push(join('Accepted ', String(c.differences.length), ' difference(s) in ', where(c.target), ':'));
      said.push(...c.differences.map((d) => join('  ', d)));
    }

    for (const c of checked) {
      const count = await recordTarget(c);
      said.push(join('Recorded ', String(count), ' model(s) as applied for ', where(c.target), '.'));
    }

    return { exitCode: BASELINE_OK, stdout: join(said.join('\n'), '\n'), stderr: '' };
  } catch (error) {
    return fail(BASELINE_FAILED, error instanceof Error ? error.message : String(error));
  }
}
