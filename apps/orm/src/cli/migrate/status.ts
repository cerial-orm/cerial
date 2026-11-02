import { diffSchema, findDrift, quoteFieldPath, quoteIdent, sanitiseReason } from '../../migrations';
import type { FieldPath, SchemaDifference } from '../../migrations';
import { parseMigrateArgs } from './args';
import type { MigrateEnv } from './connection';
import { loadDesired } from './load';
import type { MigrateTarget } from './load';
import { connect, join, readLiveTarget, scrub, withLogsOnStderr } from './shared';

/** Exit codes: 0 in sync, 1 drift or pending changes, 2 the check itself could not run */
export const STATUS_IN_SYNC = 0;
export const STATUS_DIFFERS = 1;
export const STATUS_FAILED = 2;

export interface StatusItem {
  readonly construct: string;
  readonly table?: string;
  readonly field?: FieldPath;
  readonly index?: string;
  readonly name?: string;
  /** The additive, destructive or data-loss class a pending change would carry; absent for the other two lists */
  readonly class?: string;
  readonly description: string;
}

export interface TargetStatus {
  readonly connection: MigrateTarget['connection'];
  readonly schemas: readonly string[];
  readonly inSync: boolean;
  /** Schema constructs the live database lacks yet */
  readonly pending: readonly StatusItem[];
  /** Live constructs that are not in the schema, or whose definition differs from it */
  readonly drift: readonly StatusItem[];
  /** Live constructs Cerial has no concept for; listed, never a failure */
  readonly unmanaged: readonly StatusItem[];
}

export interface StatusResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface StatusOptions {
  readonly argv: readonly string[];
  readonly env: MigrateEnv;
  readonly cwd?: string;
}

function subject(d: SchemaDifference): string {
  const table = d.table === undefined ? '' : quoteIdent(d.table);
  if (d.construct === 'table') return join('table ', table);
  if (d.construct === 'field') return join('field ', quoteFieldPath(d.field ?? []), ' on table ', table);
  if (d.construct === 'index') return join('index ', quoteIdent(d.index ?? ''), ' on table ', table);

  return join(d.construct, ' ', quoteIdent(d.name ?? ''), d.table === undefined ? '' : join(' on table ', table));
}

function toItem(d: SchemaDifference, description: string): StatusItem {
  return {
    construct: d.construct,
    ...(d.table !== undefined && { table: d.table }),
    ...(d.field !== undefined && { field: d.field }),
    ...(d.index !== undefined && { index: d.index }),
    ...(d.name !== undefined && { name: d.name }),
    class: d.class,
    description: sanitiseReason(description),
  };
}

/** Reads the target's live schema and state and classifies the difference. Writes nothing. */
async function statusOfTarget(target: MigrateTarget): Promise<TargetStatus> {
  const surreal = await connect(target.credentials(), 'migrate status');
  try {
    const { live, managedTables } = await readLiveTarget(surreal, target);

    const differences = diffSchema(target.desired, live, { managedTables });
    const report = findDrift(differences);
    const pending = report.pending.map((d) => toItem(d, join(subject(d), ' is not live yet')));
    const drift = report.drift.map((d): StatusItem => ({
      construct: d.construct,
      table: d.table,
      ...(d.field !== undefined && { field: d.field }),
      ...(d.index !== undefined && { index: d.index }),
      class: d.change === 'changed' ? 'definition-differs' : 'live-only',
      description: d.line,
    }));
    const unmanaged = differences
      .filter((d) => d.class === 'unmanaged')
      .map((d) => toItem(d, join(subject(d), ' is not managed by Cerial')));

    return {
      connection: target.connection,
      schemas: target.entries,
      inSync: !pending.length && !drift.length,
      pending,
      drift,
      unmanaged,
    };
  } finally {
    await surreal.close().catch(() => {});
  }
}

function section(lines: string[], title: string, items: readonly StatusItem[], label: (i: StatusItem) => string) {
  if (!items.length) return;
  lines.push(join('  ', title, ' (', String(items.length), '):'));
  for (const item of items) lines.push(join('    ', label(item), ' ', item.description));
}

function render(targets: readonly TargetStatus[]): string {
  const lines: string[] = [];
  for (const t of targets) {
    const c = t.connection;
    lines.push(join('Target ', c.url, ' (', c.namespace, '/', c.database, '), schemas: ', t.schemas.join(', ')));
    section(lines, 'Pending', t.pending, (i) => join('[', i.class ?? '', ']'));
    section(lines, 'Drift', t.drift, (i) =>
      i.class === 'definition-differs' ? '[definition differs]' : '[live only]',
    );
    section(lines, 'Unmanaged', t.unmanaged, () => '[unmanaged]');
    lines.push(t.inSync ? '  In sync.' : '  Not in sync.');
  }

  return join(lines.join('\n'), '\n');
}

/**
 * `cerial migrate status`: report how each target's live schema stands against the schema files.
 * Returns the output and exit code instead of printing and exiting, so the command wrapper owns `process.exit`.
 */
export async function migrateStatus(options: StatusOptions): Promise<StatusResult> {
  try {
    const { flags } = parseMigrateArgs(options.argv, 'status');
    const targets = await withLogsOnStderr(() => loadDesired({ flags, env: options.env, cwd: options.cwd }));
    const statuses: TargetStatus[] = [];
    for (const target of targets) statuses.push(await statusOfTarget(target));

    const inSync = statuses.every((s) => s.inSync);
    const stdout = flags.json ? join(JSON.stringify({ inSync, targets: statuses }, null, 2), '\n') : render(statuses);

    return { exitCode: inSync ? STATUS_IN_SYNC : STATUS_DIFFERS, stdout, stderr: '' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      exitCode: STATUS_FAILED,
      stdout: '',
      stderr: join('cerial migrate status: ', scrub(message, options.env.CERIAL_DB_PASSWORD), '\n'),
    };
  }
}
