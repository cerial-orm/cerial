import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CerialValidationError } from '../../errors';
import {
  buildMigrationPlan,
  commentOut,
  diffSchema,
  indexDesiredStatements,
  liveFingerprint,
  readLiveSchema,
  readState,
  sanitiseReason,
} from '../../migrations';
import type { MigrationPlan } from '../../migrations';
import { parseMigrateArgs } from './args';
import type { MigrateEnv } from './connection';
import { loadDesired } from './load';
import type { MigrateTarget } from './load';
import { connect, join, scrub, withLogsOnStderr } from './shared';

export const PLAN_OK = 0;
export const PLAN_FAILED = 2;

export const DEFAULT_PLAN_DIR = 'cerial/migrations';

export interface PlanResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Absolute paths of the files written, one per target with something to do */
  readonly files: readonly string[];
}

export interface PlanOptions {
  readonly argv: readonly string[];
  readonly env: MigrateEnv;
  readonly cwd?: string;
  /** Clock for the file name; tests pin it to force a same-second collision */
  readonly now?: () => Date;
}

const FLAG_FOR: Readonly<Record<string, string>> = {
  destructive: '--allow-destructive',
  'data-loss': '--allow-data-loss',
};

/** A schema name as one safe file name part: no separator, no dot-leading hidden or `..` name, no control character */
export function fileSafe(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9._+-]/g, '_').replace(/^\.+/, '_');

  return cleaned.slice(0, 64) || 'schema';
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/** `--out` is a directory: it may not exist yet (it is created on the first write), but it may not be a file or hold a NUL */
async function ensureOutDir(out: string | undefined, cwd: string): Promise<string> {
  if (out?.includes('\0')) throw new CerialValidationError('--out must not contain a NUL character.');
  const dir = resolve(cwd, out ?? DEFAULT_PLAN_DIR);
  const existing = await stat(dir).catch(() => undefined);
  if (existing && !existing.isDirectory()) {
    throw new CerialValidationError('--out must be a directory, but the path names a file.');
  }

  return dir;
}

/**
 * The text of a plan file. Additive statements are live; destructive and data-loss ones are comments, each
 * under a `-- cerial:<class> <reason>` line, so running the file unedited can only add. Every comment line goes
 * through `sanitiseReason` and `commentOut`, because a name can hold a line terminator that would end the
 * comment and leave the rest of the line to run as a statement.
 */
export function renderPlanFile(
  target: Pick<MigrateTarget, 'connection' | 'entries' | 'schemaFingerprint'>,
  plan: MigrationPlan,
  live: string,
): string {
  const comment = (text: string): string => commentOut(sanitiseReason(text));
  const classes = new Set(plan.filter((i) => i.statement !== undefined).map((i) => i.class));
  // A data-loss statement needs both flags: the second is the one that names the rows at risk
  const needed = classes.has('data-loss')
    ? ['destructive', 'data-loss']
    : classes.has('destructive')
      ? ['destructive']
      : [];
  const lines = [
    comment('cerial migration plan'),
    comment(join('schemas: ', target.entries.join(', '))),
    comment(join('database: ', target.connection.namespace, '/', target.connection.database)),
    comment(join('desired fingerprint: ', target.schemaFingerprint)),
    comment(join('live fingerprint: ', live)),
  ];
  if (needed.length) {
    lines.push(
      comment(
        join(
          'Commented statements are not applied. Review them, then uncomment and apply with ',
          needed.map((c) => FLAG_FOR[c]).join(' and '),
          '.',
        ),
      ),
    );
  }
  lines.push('');

  for (const item of plan) {
    const commented = item.class === 'destructive' || item.class === 'data-loss';
    if (item.statement === undefined) {
      lines.push(comment(join('cerial:', item.class, ' ', item.reason)));
      continue;
    }
    if (!commented) {
      lines.push(item.statement);
      continue;
    }
    lines.push(comment(join('cerial:', item.class, ' ', item.reason)), comment(item.statement));
  }

  return join(lines.join('\n'), '\n');
}

/** Writes a new file, never over an existing one: a taken name gets a numeric suffix */
async function writeNew(dir: string, stem: string, text: string): Promise<string> {
  await mkdir(dir, { recursive: true });
  for (let attempt = 0; ; attempt++) {
    const path = resolve(dir, join(stem, attempt ? join('-', String(attempt)) : '', '.surql'));
    try {
      await writeFile(path, text, { flag: 'wx', mode: 0o644 });

      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }
}

async function planTarget(target: MigrateTarget): Promise<{ plan: MigrationPlan; live: string }> {
  const surreal = await connect(target.credentials(), 'migrate plan');
  try {
    const live = await readLiveSchema(surreal);
    const managedTables = new Set<string>();
    for (const entry of target.entryModels) {
      const state = await readState(surreal, entry.name);
      for (const table of state.schema?.managedTables ?? []) managedTables.add(table);
    }
    const differences = diffSchema(target.desired, live, { managedTables });
    const plan = buildMigrationPlan(differences, indexDesiredStatements(target.desiredStatements), live);

    return { plan, live: liveFingerprint(live) };
  } finally {
    await surreal.close().catch(() => {});
  }
}

/**
 * `cerial migrate plan`: write what a migration would do as a reviewable `.surql` file, one per target.
 * Reads the database and writes nothing to it.
 */
export async function migratePlan(options: PlanOptions): Promise<PlanResult> {
  const cwd = options.cwd ?? process.cwd();
  try {
    const { flags } = parseMigrateArgs(options.argv);
    const targets = await withLogsOnStderr(() => loadDesired({ flags, env: options.env, cwd }));
    const dir = await ensureOutDir(flags.out, cwd);
    const stamp = timestamp((options.now ?? (() => new Date()))());
    const files: string[] = [];
    const said: string[] = [];

    for (const target of targets) {
      const { plan, live } = await planTarget(target);
      const where = join(target.connection.namespace, '/', target.connection.database);
      if (!plan.some((item) => item.statement !== undefined)) {
        said.push(join('Nothing to do for ', where, ': the database matches the schema.'));
        continue;
      }
      const stem = join(stamp, '-', fileSafe(target.entries.join('+')));
      const file = await writeNew(dir, stem, renderPlanFile(target, plan, live));
      files.push(file);
      said.push(join('Wrote ', file));
    }

    return { exitCode: PLAN_OK, stdout: join(said.join('\n'), '\n'), stderr: '', files };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    return {
      exitCode: PLAN_FAILED,
      stdout: '',
      stderr: join('cerial migrate plan: ', scrub(message, options.env.CERIAL_DB_PASSWORD), '\n'),
      files: [],
    };
  }
}
