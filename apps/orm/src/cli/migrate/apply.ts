import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
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
  fingerprint,
  indexDesiredStatements,
  liveFingerprint,
  quoteIdent,
  sanitiseReason,
  schemaFingerprint,
  withLease,
} from '../../migrations';
import type { ApplyEntry, MigrationPlan, MigrationPlanItem, SchemaModel } from '../../migrations';
import { parseMigrateArgs } from './args';
import type { MigrateArgs } from './args';
import type { MigrateEnv } from './connection';
import { loadDesired } from './load';
import type { MigrateEntryDesired, MigrateTarget } from './load';
import { parsePlanFile } from './plan-file';
import type { FileStatement } from './plan-file';
import { connect, createDatabase, databaseExists, join, readLiveTarget, scrub, withLogsOnStderr } from './shared';
import { escapeForTerminal } from '../../utils/safe-text';

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
  /** Called after planning and confirmation, before the lease is taken; tests use it to move the database in between */
  readonly beforeApply?: () => Promise<void>;
}

type Flags = Pick<MigrateArgs, 'allow-destructive' | 'allow-data-loss'>;

interface PlannedTarget {
  readonly target: MigrateTarget;
  readonly plan: MigrationPlan;
  /** Managed tables each entry's state row holds now */
  readonly managed: ReadonlyMap<string, readonly string[]>;
  readonly live: SchemaModel;
  /** Set for a plan file: its statements left commented out, which are reported and leave their models unmatched */
  readonly skipped?: readonly MigrationPlanItem[];
}

/** A plan file the operator must fix or regenerate: a refusal, not a failure */
class Refused extends Error {}

const FLAG_FOR = { destructive: '--allow-destructive', 'data-loss': '--allow-data-loss' } as const;

const where = (target: MigrateTarget): string => join(target.connection.namespace, '/', target.connection.database);
const runnable = (plan: MigrationPlan): MigrationPlanItem[] =>
  plan.filter((item) => item.statement !== undefined && !item.statement.startsWith('--'));

/** Re-reads the live schema and state, and builds the plan from them. Writes nothing. */
async function planTarget(target: MigrateTarget): Promise<PlannedTarget> {
  const surreal = await connect(target.credentials(), 'migrate apply');
  try {
    const { live, managed, managedTables } = await readLiveTarget(surreal, target);
    const differences = diffSchema(target.desired, live, { managedTables });

    return {
      target,
      plan: buildMigrationPlan(differences, indexDesiredStatements(target.desiredStatements), live),
      managed,
      live,
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

function toApplyEntry(
  planned: PlannedTarget,
  entry: MigrateEntryDesired,
  items: readonly MigrationPlanItem[],
): ApplyEntry {
  const touched = new Set(items.map((i) => i.table));
  const removed = removedTables(items);
  const previous = planned.managed.get(entry.schemaName) ?? [];
  const managedTables = [...new Set([...previous, ...entry.desired.tables.map((t) => t.name)])].filter(
    (t) => !removed.includes(t),
  );

  return {
    schemaName: entry.schemaName,
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
  };
}

/** The tables that appeared, vanished or changed between two reads of the live schema, one line each */
function movedTables(before: SchemaModel, after: SchemaModel): string[] {
  const was = new Map(before.tables.map((t) => [t.name, fingerprint(t)]));
  const is = new Map(after.tables.map((t) => [t.name, fingerprint(t)]));
  const lines: string[] = [];
  for (const name of [...new Set([...was.keys(), ...is.keys()])].sort()) {
    if (!is.has(name)) lines.push(join('table ', quoteIdent(name), ' is gone'));
    else if (!was.has(name)) lines.push(join('table ', quoteIdent(name), ' appeared'));
    else if (was.get(name) !== is.get(name)) lines.push(join('table ', quoteIdent(name), ' changed'));
  }

  return lines;
}

/**
 * Re-reads live under the lease and refuses when it is not what the plan was made from. Anything written between
 * the plan and the lease (another apply, a person) would make the plan's statements wrong for the database.
 */
async function assertUnchanged(surreal: Surreal, planned: PlannedTarget): Promise<void> {
  const now = await readLiveTarget(surreal, planned.target);
  const sameState = JSON.stringify([...planned.managed]) === JSON.stringify([...now.managed]);
  if (liveFingerprint(now.live) === liveFingerprint(planned.live) && sameState) return;

  const moved = movedTables(planned.live, now.live);
  throw new Refused(
    join(
      'the live schema of ',
      where(planned.target),
      ' changed after it was planned (',
      moved.length ? moved.join('; ') : 'the migration state or an unmanaged object changed',
      '), so nothing was applied. Plan again.',
    ),
  );
}

async function applyTarget(planned: PlannedTarget, beforeApply: (() => Promise<void>) | undefined): Promise<number> {
  const surreal = await connect(planned.target.credentials(), 'migrate apply');
  try {
    if (!(await databaseExists(surreal))) await createDatabase(surreal, planned.target.connection.database);
    await bootstrapStateTables(surreal);
    const byEntry = new Map<MigrateEntryDesired, MigrationPlanItem[]>();
    for (const item of [...runnable(planned.plan), ...(planned.skipped ?? [])]) {
      const entry = entryOf(item, planned);
      byEntry.set(entry, [...(byEntry.get(entry) ?? []), item]);
    }
    await beforeApply?.();

    // One call for every entry on this connection: they are one transaction, so a failure in any rolls back all
    return await withLease(surreal, async (lease) => {
      await assertUnchanged(surreal, planned);
      const result = await applyPlan(surreal, [...byEntry.values()].flat(), {
        cerialVersion: pkg.version,
        lease,
        entries: [...byEntry].map(([entry, items]) => toApplyEntry(planned, entry, items)),
      });

      return result.executed.length;
    });
  } finally {
    await surreal.close().catch(() => {});
  }
}

const RANK: Readonly<Record<MigrationPlanItem['class'], number>> = {
  additive: 0,
  destructive: 1,
  'data-loss': 2,
  unmanaged: 0,
};

const normalise = (statement: string): string => statement.trim().replace(/;+\s*$/, '');

/**
 * The step for one file statement, classed from its own text and the fresh plan, never from the annotation above
 * it. A removal is classed by its verb. A definition keeps the class of the plan step with the same text (found by
 * re-diffing the schema against live, which is where a type change is destructive).
 */
function classifyStatement(s: FileStatement, fresh: ReadonlyMap<string, MigrationPlanItem>): MigrationPlanItem {
  const base = { statement: s.text, table: s.table };
  switch (s.verb) {
    case 'REMOVE TABLE':
      return {
        ...base,
        class: 'data-loss',
        construct: 'table',
        reason: 'removing a table destroys its rows with no separate data step',
      };
    case 'REMOVE FIELD':
      return {
        ...base,
        class: 'destructive',
        construct: 'field',
        reason: 'removing a field deletes its stored values',
      };
    case 'REMOVE INDEX':
      return { ...base, class: 'destructive', construct: 'index', reason: 'removing an index drops a structure' };
    case 'UPDATE UNSET':
      return {
        ...base,
        class: 'destructive',
        construct: 'field',
        reason: 'unsetting a field deletes its stored values',
      };
  }

  // A definition reaching here is one the schema generates (planFromFile refuses the rest); it keeps the class of the
  // fresh plan's step for it, and one the plan does not need, because live already holds it, only restates live
  return {
    ...(fresh.get(s.text) ?? { class: 'additive', construct: 'definition', reason: 'it restates the schema' }),
    ...base,
  };
}

async function readPlanFile(file: string, cwd: string | undefined) {
  let text: string;
  try {
    text = await readFile(resolve(cwd ?? process.cwd(), file), 'utf8');
  } catch (error) {
    throw new CerialValidationError(
      join('Could not read plan file ', file, ': ', (error as NodeJS.ErrnoException).code ?? 'unreadable'),
    );
  }
  const parsed = parsePlanFile(text);
  if (parsed.refusals.length) {
    throw new Refused(join('refused plan file ', file, ', nothing was applied.\n  ', parsed.refusals.join('\n  ')));
  }

  return parsed;
}

/** Plans a target from a reviewed file: the file must match the live schema it was written against */
async function planFromFile(
  file: string,
  parsed: ReturnType<typeof parsePlanFile>,
  targets: readonly MigrateTarget[],
): Promise<PlannedTarget> {
  if (!parsed.liveFingerprint) {
    throw new Refused(
      join(
        'plan file ',
        file,
        ' has no live fingerprint in its header, so it cannot be checked. Run migrate plan again.',
      ),
    );
  }
  const target = parsed.database
    ? targets.find((t) => sanitiseReason(where(t)) === parsed.database)
    : targets.length === 1
      ? targets[0]
      : undefined;
  if (!target) {
    throw new Refused(
      join(
        'plan file ',
        file,
        ' was written for ',
        parsed.database ?? 'an unnamed database',
        ', which is not a target here.',
      ),
    );
  }

  const planned = await planTarget(target);
  if (liveFingerprint(planned.live) !== parsed.liveFingerprint) {
    throw new Refused(
      join(
        'plan file ',
        file,
        ' is stale: the live schema of ',
        where(target),
        ' changed after it was written. Run migrate plan again.',
      ),
    );
  }

  const fresh = new Map<string, MigrationPlanItem>();
  for (const item of runnable(planned.plan)) {
    const key = normalise(item.statement!);
    const held = fresh.get(key);
    if (!held || RANK[item.class] > RANK[held.class]) fresh.set(key, item);
  }
  // Only text Cerial generates may be defined: an expression in a hand-written definition can run a statement
  // of its own whenever a row is written. A removal or an UNSET must be a step the fresh plan makes itself, since
  // a tampered file could otherwise drop a table or unset a field the schema never managed.
  const generated = new Set(target.desiredStatements.map(normalise));
  const refused = parsed.statements
    .flatMap((s) => {
      if (s.verb.startsWith('DEFINE')) {
        // A MIGRATE clause is added by the plan itself, so a definition the fresh plan carries is Cerial's own text.
        return generated.has(s.text) || fresh.has(normalise(s.text))
          ? []
          : [{ line: s.line, why: 'this definition is hand-written, not one Cerial generates for the schema' }];
      }

      return fresh.has(normalise(s.text))
        ? []
        : [{ line: s.line, why: join('this ', s.verb, ' is not a step the schema needs against the live database') }];
    })
    .sort((a, b) => a.line - b.line);
  if (refused.length) {
    throw new Refused(
      join(
        'refused plan file ',
        file,
        ', nothing was applied.\n  ',
        refused.map((r) => join('line ', String(r.line), ': ', r.why)).join('\n  '),
      ),
    );
  }
  // A commented line is a commented statement only when it is one Cerial writes; any other is prose
  const commented = parsed.commented.filter((s) => !s.verb.startsWith('DEFINE') || generated.has(s.text));
  const step = (s: FileStatement) => classifyStatement(s, fresh);

  return {
    ...planned,
    plan: parsed.statements.map(step),
    skipped: commented.map((s) => ({
      ...step(s),
      statement: join('-- ', s.text),
      reason: join('left commented out at line ', String(s.line)),
    })),
  };
}

/**
 * `cerial migrate apply --from-schema`: re-diff the live database against the schema and apply what is pending.
 *
 * Additive steps need no flag. A destructive step needs `--allow-destructive`, and `REMOVE TABLE` needs
 * `--allow-data-loss` on top. One step lacking its flag refuses the whole plan before anything is written, so
 * the additive part is not applied either. On a terminal a plan with a destructive step is confirmed first;
 * off one, the flags are the authorisation.
 *
 * `cerial migrate apply <file>` applies a reviewed plan file the same way. The file is checked against the live
 * schema it was written for, only table, field and index definitions and removals are run, and each statement's class
 * is read from the statement and the live schema. Statements left commented out stay unapplied, and their models
 * stay unmatched.
 */
export async function migrateApply(options: ApplyOptions): Promise<ApplyResult> {
  const fail = (exitCode: number, message: string): ApplyResult => ({
    exitCode,
    stdout: '',
    stderr: join('cerial migrate apply: ', escapeForTerminal(scrub(message, options.env.CERIAL_DB_PASSWORD)), '\n'),
  });

  try {
    const { flags, positionals } = parseMigrateArgs(options.argv, 'apply');
    const file = positionals[0];
    if (Boolean(flags['from-schema']) === (file !== undefined)) {
      throw new CerialValidationError('migrate apply needs either --from-schema or one plan file.');
    }
    const parsed = file === undefined ? undefined : await readPlanFile(file, options.cwd);
    const targets = await withLogsOnStderr(() => loadDesired({ flags, env: options.env, cwd: options.cwd }));
    const planned: PlannedTarget[] = [];
    if (file !== undefined && parsed) planned.push(await planFromFile(file, parsed, targets));
    else for (const target of targets) planned.push(await planTarget(target));

    const missing = missingFlags(planned, flags);
    if (missing.length) {
      return fail(APPLY_REFUSED, join('refused, nothing was applied.\n  ', missing.join('\n  ')));
    }

    const said: string[] = [];
    const pending = planned.filter((p) => runnable(p.plan).length);
    for (const p of planned) {
      if (!runnable(p.plan).length) {
        const idle = p.skipped
          ? p.skipped.length
            ? ': every statement in the file is commented out.'
            : ': the file holds no statements.'
          : ': the database matches the schema.';
        said.push(join('Nothing to do for ', where(p.target), idle));
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

    const applied: string[] = [];
    for (const p of pending) {
      try {
        const count = await applyTarget(p, options.beforeApply);
        applied.push(join('Applied ', String(count), ' statement(s) to ', where(p.target), '.'));
      } catch (error) {
        // Another database's transaction already committed; the output must say so rather than read as all-or-nothing
        if (!applied.length || !(error instanceof Error)) throw error;
        const message = join(error.message, '\nAlready applied before this failure:\n  ', applied.join('\n  '));
        throw error instanceof Refused ? new Refused(message) : new Error(message, { cause: error });
      }
    }
    said.push(...applied);
    for (const p of planned) {
      if (!p.skipped?.length) continue;
      said.push(join('Left ', String(p.skipped.length), ' commented-out statement(s) unapplied:'));
      for (const item of p.skipped) {
        said.push(join('  ', item.construct, ' on table ', quoteIdent(item.table ?? ''), ' (', item.reason, ')'));
      }
    }

    return { exitCode: APPLY_OK, stdout: join(said.join('\n'), '\n'), stderr: '' };
  } catch (error) {
    if (error instanceof Refused) return fail(APPLY_REFUSED, error.message);

    return fail(APPLY_FAILED, error instanceof Error ? error.message : String(error));
  }
}
