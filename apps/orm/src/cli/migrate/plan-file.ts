import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CerialValidationError } from '../../errors';
import {
  buildMigrationPlan,
  commentOut,
  diffSchema,
  indexDesiredStatements,
  liveFingerprint,
  parseFieldIdiom,
  quoteIdent,
  sanitiseReason,
} from '../../migrations';
import type { FieldPath, MigrationPlan } from '../../migrations';
import { parseMigrateArgs } from './args';
import type { MigrateEnv } from './connection';
import { loadDesired } from './load';
import type { MigrateTarget } from './load';
import { connect, join, readLiveTarget, scrub, withLogsOnStderr } from './shared';

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
    const { live, managedTables } = await readLiveTarget(surreal, target);
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
    const { flags } = parseMigrateArgs(options.argv, 'plan');
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

export type FileVerb =
  | 'DEFINE TABLE'
  | 'DEFINE FIELD'
  | 'DEFINE INDEX'
  | 'REMOVE TABLE'
  | 'REMOVE FIELD'
  | 'REMOVE INDEX'
  | 'UPDATE UNSET';

/** A statement of a plan file that the allowlist accepts, with the table (and field or index) it names decoded */
export interface FileStatement {
  readonly line: number;
  /** The statement with its comments replaced by a space and no trailing `;`: exactly what is sent to the database */
  readonly text: string;
  readonly verb: FileVerb;
  readonly table: string;
  readonly field?: FieldPath;
  readonly index?: string;
}

export interface ParsedPlanFile {
  readonly liveFingerprint?: string;
  /** The `namespace/database` the header says the file was planned against */
  readonly database?: string;
  /** Statements that run */
  readonly statements: readonly FileStatement[];
  /** Statements written as `-- DEFINE ...` comments, which are not run */
  readonly commented: readonly FileStatement[];
  /** One line per statement the allowlist or the splitter refused, each naming its line */
  readonly refusals: readonly string[];
}

interface RawStatement {
  readonly line: number;
  readonly text: string;
}

interface RawComment {
  readonly line: number;
  readonly text: string;
  /** How many statements came before it, so the header (0) is told from a note further down */
  readonly after: number;
}

class ScanError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(message);
  }
}

const STATE_TABLE_PREFIX = '_cerial_';
const OPENERS = '([{';
const CLOSERS = ')]}';
const isTerminator = (char: string): boolean => char !== '\t' && /^[\p{Cc}\p{Zl}\p{Zp}]$/u.test(char);
const lineBreaks = (text: string): number => (text.match(/\r\n|\r|\n/g) ?? []).length;

/** Index after the quote that closes the one opening at `start`, honouring backslash escapes; -1 when it never closes */
function skipQuoted(text: string, start: number, close: string): number {
  for (let i = start + 1; i < text.length; i++) {
    if (text[i] === '\\') i++;
    else if (text[i] === close) return i + 1;
  }

  return -1;
}

const QUOTES: Readonly<Record<string, string>> = { '`': '`', "'": "'", '"': '"', '⟨': '⟩' };

/**
 * Splits plan-file text at the `;` that end statements. A `;` inside a backtick name (with the quoter's
 * backslash escapes), a string, brackets or a comment does not split. Comments are taken out of the statement
 * text, so what is checked is what is sent. The server's comment forms `--`, `//`, `#` and block comments are
 * all treated as comments, and a line comment ends at any line terminator the quoter escapes.
 */
export function splitStatements(text: string): { statements: RawStatement[]; comments: RawComment[] } {
  const statements: RawStatement[] = [];
  const comments: RawComment[] = [];
  let current = '';
  let startLine = 1;
  let line = 1;
  let depth = 0;
  let i = 0;

  const take = (chunk: string): void => {
    if (!current.trim() && chunk.trim()) startLine = line;
    current = join(current, chunk);
    line += lineBreaks(chunk);
  };
  const flush = (): void => {
    if (current.trim()) statements.push({ line: startLine, text: current.trim() });
    current = '';
  };

  while (i < text.length) {
    const char = text[i]!;
    const pair = text.slice(i, i + 2);
    const close = QUOTES[char];
    if (close !== undefined) {
      const end = skipQuoted(text, i, close);
      if (end < 0) throw new ScanError(line, 'a quoted name or string is never closed');
      take(text.slice(i, end));
      i = end;
    } else if (pair === '--' || pair === '//' || char === '#') {
      let end = i;
      while (end < text.length && !isTerminator(text[end]!)) end++;
      comments.push({ line, text: text.slice(i, end), after: statements.length });
      current = join(current, ' ');
      i = end;
    } else if (pair === '/*') {
      const end = text.indexOf('*/', i + 2);
      if (end < 0) throw new ScanError(line, 'a block comment is never closed');
      const block = text.slice(i, end + 2);
      current = join(current, ' ');
      line += lineBreaks(block);
      i = end + 2;
    } else if (pair === '\r\n') {
      take(pair);
      i += 2;
    } else if (isTerminator(char) && char !== '\n' && char !== '\r') {
      // Whitespace to the server's lexer and not to `\s`, so it is made a plain space before the text is checked
      take(' ');
      i++;
    } else {
      if (OPENERS.includes(char)) depth++;
      else if (CLOSERS.includes(char)) depth = Math.max(0, depth - 1);
      if (char === ';' && depth === 0) flush();
      else take(char);
      i++;
    }
  }
  if (depth > 0) throw new ScanError(startLine, 'brackets are never closed');
  flush();

  return { statements, comments };
}

/** Reads one statement against the allowlist; throws `ScanError` naming the line when it is not allowed */
function allow(raw: RawStatement): FileStatement {
  const { text, line } = raw;
  let i = 0;
  const skip = (): void => {
    while (i < text.length && /\s/.test(text[i]!)) i++;
  };
  const word = (): string => {
    skip();
    const found = /^[A-Za-z]+/.exec(text.slice(i))?.[0] ?? '';
    i += found.length;

    return found.toUpperCase();
  };
  const optional = (...words: string[]): void => {
    const saved = i;
    if (words.some((expected) => word() !== expected)) i = saved;
  };
  const path = (what: string): FieldPath => {
    skip();
    const start = i;
    while (i < text.length) {
      if (text[i] === '`') {
        const end = skipQuoted(text, i, '`');
        if (end < 0) throw new ScanError(line, 'a quoted name is never closed');
        i = end;
      } else if (/[A-Za-z0-9_.*]/.test(text[i]!)) i++;
      else break;
    }
    if (i === start) throw new ScanError(line, join('expected ', what));
    try {
      return parseFieldIdiom(text.slice(start, i));
    } catch (error) {
      throw new ScanError(line, error instanceof Error ? sanitiseReason(error.message) : 'unreadable name');
    }
  };
  const single = (what: string): string => {
    const found = path(what);
    if (found.length !== 1 || typeof found[0] !== 'string') throw new ScanError(line, join(what, ' must be one name'));

    return found[0];
  };
  const end = (): void => {
    skip();
    if (i < text.length) throw new ScanError(line, 'unexpected text after the statement');
  };
  const on = (): string => {
    if (word() !== 'ON') throw new ScanError(line, 'expected ON');
    optional('TABLE');

    return single('the table');
  };
  const checked = (
    verb: FileVerb,
    table: string,
    rest: Omit<FileStatement, 'line' | 'text' | 'verb' | 'table'> = {},
  ) => {
    if (table.startsWith(STATE_TABLE_PREFIX)) {
      throw new ScanError(line, join('a statement may not touch the migration state table ', quoteIdent(table)));
    }

    return { line, text, verb, table, ...rest };
  };

  const first = word();
  if (first === 'UPDATE') {
    const table = single('the table');
    if (word() !== 'UNSET') throw new ScanError(line, 'only UPDATE ... UNSET is allowed');
    const field = path('the field');
    end();

    return checked('UPDATE UNSET', table, { field });
  }
  const verb = join(first, ' ', word());
  const define = first === 'DEFINE';
  switch (verb) {
    case 'DEFINE TABLE':
    case 'REMOVE TABLE': {
      optional('OVERWRITE');
      optional('IF', 'NOT', 'EXISTS');
      optional('IF', 'EXISTS');
      const table = single('the table');
      if (!define) end();

      return checked(verb, table);
    }
    case 'DEFINE FIELD':
    case 'REMOVE FIELD': {
      optional('OVERWRITE');
      optional('IF', 'NOT', 'EXISTS');
      optional('IF', 'EXISTS');
      const field = path('the field');
      const table = on();
      if (!define) end();

      return checked(verb, table, { field });
    }
    case 'DEFINE INDEX':
    case 'REMOVE INDEX': {
      optional('OVERWRITE');
      optional('IF', 'NOT', 'EXISTS');
      optional('IF', 'EXISTS');
      const index = single('the index');
      const table = on();
      if (!define) end();

      return checked(verb, table, { index });
    }
    default:
      throw new ScanError(line, join(verb.trim() || first || 'this statement', ' is not allowed in a plan file'));
  }
}

const refusal = (line: number, message: string): string => join('line ', String(line), ': ', message);

/**
 * Reads a plan file: the header it was written with, the statements that run and the ones left commented out.
 * Only `DEFINE` and `REMOVE` of `TABLE`, `FIELD` and `INDEX`, and `UPDATE x UNSET path`, are accepted; every other
 * statement is a refusal naming its line. The annotations are not read, because an operator may have edited them.
 */
export function parsePlanFile(text: string): ParsedPlanFile {
  const statements: FileStatement[] = [];
  const commented: FileStatement[] = [];
  const refusals: string[] = [];
  let split: ReturnType<typeof splitStatements>;
  try {
    split = splitStatements(text);
  } catch (error) {
    if (!(error instanceof ScanError)) throw error;

    return { statements, commented, refusals: [refusal(error.line, error.message)] };
  }

  for (const raw of split.statements) {
    try {
      statements.push(allow(raw));
    } catch (error) {
      if (!(error instanceof ScanError)) throw error;
      refusals.push(refusal(error.line, error.message));
    }
  }

  let liveFingerprint: string | undefined;
  let database: string | undefined;
  for (const comment of split.comments) {
    const body = comment.text.replace(/^--\s?/, '');
    if (comment.after === 0 && comment.text.startsWith('--')) {
      liveFingerprint ??= /^live fingerprint: (\S+)$/.exec(body)?.[1];
      database ??= /^database: (.+)$/.exec(body)?.[1];
    }
    if (!comment.text.startsWith('--') || !/^(DEFINE|REMOVE|UPDATE)\s/i.test(body)) continue;
    try {
      commented.push(allow({ line: comment.line, text: body.trim().replace(/;+$/, '') }));
    } catch (error) {
      // A note that merely begins with one of these words is still only a comment
      if (!(error instanceof ScanError)) throw error;
    }
  }

  return { liveFingerprint, database, statements, commented, refusals };
}
