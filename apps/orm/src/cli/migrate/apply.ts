import { createInterface } from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import type { Surreal } from 'surrealdb';
import pkg from '../../../package.json';
import { CerialValidationError } from '../../errors';
import {
  applyPlan,
  bootstrapStateTables,
  buildMigrationPlan,
  diffSchema,
  indexDesiredStatements,
  quoteIdent,
  readLiveSchema,
  readState,
  sanitiseReason,
  schemaFingerprint,
  withLease,
} from '../../migrations';
import type { MigrationLease, MigrationPlan, MigrationPlanItem } from '../../migrations';
import { parseMigrateArgs } from './args';
import type { MigrateArgs } from './args';
import type { MigrateEnv } from './connection';
import { loadDesired } from './load';
import type { MigrateEntryDesired, MigrateTarget } from './load';
import { connect, join, scrub, withLogsOnStderr } from './shared';

/** Exit codes: 0 applied or nothing to do, 1 refused (a flag is missing, or the operator said no), 2 failed */
export const APPLY_OK = 0;
export const APPLY_REFUSED = 1;
export const APPLY_FAILED = 2;

export interface ApplyResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface ApplyOptions {
  readonly argv: readonly string[];
  readonly env: MigrateEnv;
  readonly cwd?: string;
  /** Whether a person is at the terminal; defaults to stdin's. Tests inject it. */
  readonly isTTY?: boolean;
  /** Where the confirmation answer is read from, and where its question is written (stderr by default) */
  readonly input?: Readable;
  readonly prompt?: Writable;
}

type Flags = Pick<MigrateArgs, 'allow-destructive' | 'allow-data-loss'>;

interface PlannedTarget {
  readonly target: MigrateTarget;
  readonly plan: MigrationPlan;
  /** Managed tables each entry's state row holds now */
  readonly managed: ReadonlyMap<string, readonly string[]>;
}

const FLAG_FOR = { destructive: '--allow-destructive', 'data-loss': '--allow-data-loss' } as const;

const where = (target: MigrateTarget): string => join(target.connection.namespace, '/', target.connection.database);
const runnable = (plan: MigrationPlan): MigrationPlanItem[] => plan.filter((item) => item.statement !== undefined);

/** Re-reads the live schema and state, and builds the plan from them. Writes nothing. */
async function planTarget(target: MigrateTarget): Promise<PlannedTarget> {
  const surreal = await connect(target.credentials(), 'migrate apply');
  try {
    const live = await readLiveSchema(surreal);
    const managedTables = new Set<string>();
    const managed = new Map<string, readonly string[]>();
    for (const entry of target.entryModels) {
      const tables = (await readState(surreal, entry.schemaName)).schema?.managedTables ?? [];
      managed.set(entry.schemaName, tables);
      for (const table of tables) managedTables.add(table);
    }
    const differences = diffSchema(target.desired, live, { managedTables });

    return {
      target,
      plan: buildMigrationPlan(differences, indexDesiredStatements(target.desiredStatements), live),
      managed,
    };
  } finally {
    await surreal.close().catch(() => {});
  }
}

/** One line per step that needs a flag the operator did not pass, naming the flag, the construct and the table */
function missingFlags(planned: readonly PlannedTarget[], flags: Flags): string[] {
  const lines: string[] = [];
  for (const { target, plan } of planned) {
    for (const item of runnable(plan)) {
      const needed: Array<keyof typeof FLAG_FOR> = [];
      if (item.class === 'destructive' || item.class === 'data-loss') needed.push('destructive');
      if (item.class === 'data-loss') needed.push('data-loss');
      const absent = needed.filter((c) => !flags[c === 'destructive' ? 'allow-destructive' : 'allow-data-loss']);
      if (!absent.length) continue;

      lines.push(
        join(
          absent.map((c) => FLAG_FOR[c]).join(' and '),
          ' needed for ',
          item.construct,
          item.table === undefined ? '' : join(' on table ', quoteIdent(item.table)),
          ' in ',
          where(target),
          ': ',
          sanitiseReason(item.reason),
        ),
      );
    }
  }

  return lines;
}

function ask(input: Readable, output: Writable, question: string): Promise<string> {
  const rl = createInterface({ input, output });

  return new Promise((resolve) => {
    // A closed stream is no answer, which reads as "no"
    rl.once('close', () => resolve(''));
    rl.question(question, (answer) => {
      resolve(answer);
      rl.close();
    });
  });
}

/** The tables an applied `REMOVE TABLE` takes out; the only way a table leaves `managedTables` */
const removedTables = (items: readonly MigrationPlanItem[]): string[] =>
  items.flatMap((i) => (i.statement?.startsWith('REMOVE TABLE ') && i.table !== undefined ? [i.table] : []));

/** The entry a step belongs to: the one that declares its table, else the one whose state managed it */
function entryOf(item: MigrationPlanItem, planned: PlannedTarget): MigrateEntryDesired {
  const { entryModels } = planned.target;
  const declared = entryModels.find((e) => e.desired.tables.some((t) => t.name === item.table));
  const owner = entryModels.find((e) => planned.managed.get(e.schemaName)?.includes(item.table ?? ''));

  return declared ?? owner ?? entryModels[0]!;
}

async function applyEntry(
  surreal: Surreal,
  lease: MigrationLease,
  planned: PlannedTarget,
  entry: MigrateEntryDesired,
  items: readonly MigrationPlanItem[],
): Promise<string[]> {
  const touched = new Set(items.map((i) => i.table));
  const removed = removedTables(items);
  const previous = planned.managed.get(entry.schemaName) ?? [];
  const managedTables = [...new Set([...previous, ...entry.desired.tables.map((t) => t.name)])].filter(
    (t) => !removed.includes(t),
  );
  const result = await applyPlan(surreal, items, {
    schemaName: entry.schemaName,
    cerialVersion: pkg.version,
    lease,
    models: entry.models
      .filter((m) => touched.has(m.table))
      .map((m) => ({
        modelName: m.name,
        table: m.table,
        fingerprint: m.fingerprint,
        desired: entry.desired.tables.find((t) => t.name === m.table),
      })),
    schema: {
      schemaName: entry.schemaName,
      fingerprint: schemaFingerprint(entry.desired),
      managedTables,
      removedTables: removed,
    },
  });

  return [...result.executed];
}

async function applyTarget(planned: PlannedTarget): Promise<number> {
  const surreal = await connect(planned.target.credentials(), 'migrate apply');
  try {
    await bootstrapStateTables(surreal);
    const byEntry = new Map<MigrateEntryDesired, MigrationPlanItem[]>();
    for (const item of runnable(planned.plan)) {
      const entry = entryOf(item, planned);
      byEntry.set(entry, [...(byEntry.get(entry) ?? []), item]);
    }

    return await withLease(surreal, async (lease) => {
      let count = 0;
      for (const [entry, items] of byEntry) count += (await applyEntry(surreal, lease, planned, entry, items)).length;

      return count;
    });
  } finally {
    await surreal.close().catch(() => {});
  }
}

/**
 * `cerial migrate apply --from-schema`: re-diff the live database against the schema and apply what is pending.
 *
 * Additive steps need no flag. A destructive step needs `--allow-destructive`, and `REMOVE TABLE` needs
 * `--allow-data-loss` on top. One step lacking its flag refuses the whole plan before anything is written, so
 * the additive part is not applied either. On a terminal a plan with a destructive step is confirmed first;
 * off one, the flags are the authorisation.
 */
export async function migrateApply(options: ApplyOptions): Promise<ApplyResult> {
  const fail = (exitCode: number, message: string): ApplyResult => ({
    exitCode,
    stdout: '',
    stderr: join('cerial migrate apply: ', scrub(message, options.env.CERIAL_DB_PASSWORD), '\n'),
  });

  try {
    const { flags, positionals } = parseMigrateArgs(options.argv);
    if (!flags['from-schema'] || positionals.length) {
      throw new CerialValidationError('migrate apply needs --from-schema.');
    }
    const targets = await withLogsOnStderr(() => loadDesired({ flags, env: options.env, cwd: options.cwd }));
    const planned: PlannedTarget[] = [];
    for (const target of targets) planned.push(await planTarget(target));

    const missing = missingFlags(planned, flags);
    if (missing.length) {
      return fail(APPLY_REFUSED, join('refused, nothing was applied.\n  ', missing.join('\n  ')));
    }

    const said: string[] = [];
    const pending = planned.filter((p) => runnable(p.plan).length);
    for (const p of planned) {
      if (!runnable(p.plan).length) {
        said.push(join('Nothing to do for ', where(p.target), ': the database matches the schema.'));
      }
    }

    const destructive = pending.flatMap((p) => runnable(p.plan)).some((i) => i.class !== 'additive');
    const isTTY = options.isTTY ?? Boolean(process.stdin.isTTY);
    if (destructive && isTTY) {
      const count = pending.reduce((sum, p) => sum + runnable(p.plan).length, 0);
      const answer = await ask(
        options.input ?? process.stdin,
        options.prompt ?? process.stderr,
        join('Apply ', String(count), ' change(s) including destructive ones? [y/N] '),
      );
      if (!/^y(es)?$/i.test(answer.trim())) return fail(APPLY_REFUSED, 'not confirmed, nothing was applied.');
    }

    for (const p of pending) {
      const count = await applyTarget(p);
      said.push(join('Applied ', String(count), ' statement(s) to ', where(p.target), '.'));
    }

    return { exitCode: APPLY_OK, stdout: join(said.join('\n'), '\n'), stderr: '' };
  } catch (error) {
    return fail(APPLY_FAILED, error instanceof Error ? error.message : String(error));
  }
}
