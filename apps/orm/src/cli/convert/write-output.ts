import type { Stats } from 'node:fs';
import { randomBytes } from 'node:crypto';
import {
  chmod,
  copyFile,
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  rmdir,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative } from 'node:path';
import { CerialGenerationError } from '../../errors';
import { isInside, type OutputPlan } from './output-paths';

export interface StagedFile {
  readonly source: string;
  readonly target: string;
  /** Where the file sits in the stage. */
  readonly path: string;
}

export interface StagedTree {
  readonly dir: string;
  readonly files: readonly StagedFile[];
}

export interface WriteOutputsOptions {
  /** Output text keyed by source path. */
  readonly contents: ReadonlyMap<string, string>;
  readonly force?: boolean;
  readonly dryRun?: boolean;
  /** Runs against the stage; throwing refuses the run and nothing is written. */
  readonly verify?: (tree: StagedTree) => void | Promise<void>;
  /** Replaces `fs.rename` so a failure at file N can be injected. */
  readonly rename?: (from: string, to: string) => Promise<void>;
}

export interface WriteOutputsResult {
  readonly dryRun: boolean;
  readonly plan: OutputPlan;
  /** Targets created or replaced; empty for a dry run. */
  readonly written: readonly string[];
}

interface Checked {
  readonly source: string;
  readonly target: string;
  readonly existing: { readonly mode: number } | undefined;
}

async function realpathLoose(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    const parent = dirname(path);
    if (parent === path) return path;

    return join(await realpathLoose(parent), basename(path));
  }
}

function errno(error: unknown): string | undefined {
  return (error as NodeJS.ErrnoException | undefined)?.code;
}

async function lstatOrUndefined(path: string): Promise<Stats | undefined> {
  try {
    return await lstat(path);
  } catch (error) {
    if (errno(error) === 'ENOENT') return undefined;
    if (errno(error) === 'ENOTDIR') return undefined;
    throw error;
  }
}

/** The nearest ancestor of `dir` that exists, or undefined when none does. */
async function nearestExisting(dir: string): Promise<string> {
  let current = dir;
  while (!(await lstatOrUndefined(current))) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }

  return current;
}

/** Reads only; every refusal is collected so one run reports them all. */
async function preflight(plan: OutputPlan, force: boolean): Promise<Checked[]> {
  const problems: string[] = [];
  const checked: Checked[] = [];

  const protectedReal = new Set<string>();
  for (const path of [...plan.protectedSources, ...plan.outputs.map((o) => o.source)]) {
    protectedReal.add(await realpathLoose(path));
  }

  if (plan.keptModules.length && plan.outDir && !isInside(plan.entryRoot, plan.outDir)) {
    problems.push(`${plan.outDir}: -o is outside the entry, so imports of kept TypeScript modules cannot resolve`);
  }

  for (const { source, target } of plan.outputs) {
    const anchor = await nearestExisting(dirname(target));
    const anchorStat = await stat(anchor).catch(() => undefined);
    if (anchorStat && !anchorStat.isDirectory()) {
      problems.push(`${target}: ${anchor} is a file, so nothing can be written under it`);
      continue;
    }

    const info = await lstatOrUndefined(target);
    if (!info) {
      if (protectedReal.has(await realpathLoose(target)))
        problems.push(`${target}: is a schema source and is never overwritten`);
      else checked.push({ source, target, existing: undefined });
      continue;
    }
    if (info.isSymbolicLink()) {
      problems.push(`${target}: is a symbolic link`);
      continue;
    }
    if (info.isDirectory()) {
      problems.push(`${target}: is a directory`);
      continue;
    }
    if (protectedReal.has(await realpathLoose(target))) {
      problems.push(`${target}: is a schema source and is never overwritten`);
      continue;
    }
    if (!force) {
      problems.push(`${target}: already exists (pass --force to replace it)`);
      continue;
    }
    checked.push({ source, target, existing: { mode: info.mode & 0o7777 } });
  }

  if (problems.length) {
    throw new CerialGenerationError(
      `Nothing was written. ${problems.length} problem(s):\n${problems.map((p) => `  ${p}`).join('\n')}`,
    );
  }

  return checked;
}

async function stageTree(
  plan: OutputPlan,
  checked: readonly Checked[],
  options: WriteOutputsOptions,
  stageDir: string,
): Promise<StagedFile[]> {
  const files: StagedFile[] = [];
  for (const { source, target } of checked) {
    const content = options.contents.get(source);
    if (content === undefined) throw new CerialGenerationError(`No output text was produced for ${source}`);
    const base = isInside(plan.entryRoot, target) ? plan.entryRoot : (plan.outDir ?? plan.entryRoot);
    const path = join(stageDir, relative(base, target));
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
    files.push({ source, target, path });
  }

  for (const kept of plan.keptModules) {
    if (!isInside(plan.entryRoot, kept)) continue;
    const path = join(stageDir, relative(plan.entryRoot, kept));
    if (files.some((f) => f.path === path)) continue;
    await mkdir(dirname(path), { recursive: true });
    await symlink(kept, path);
  }

  return files;
}

async function missingDirs(dir: string): Promise<string[]> {
  const missing: string[] = [];
  let current = dir;
  while (!(await lstatOrUndefined(current))) {
    missing.push(current);
    current = dirname(current);
  }

  return missing.reverse();
}

type State = 'not written' | 'unchanged' | 'created' | 'replaced' | 'removed' | 'restored' | string;

/**
 * Writes every planned output or none: preflight, stage, verify, then a copy to a temp name beside each target
 * and a rename. A failure while renaming removes what this run created and restores what it replaced.
 */
export async function writeOutputs(plan: OutputPlan, options: WriteOutputsOptions): Promise<WriteOutputsResult> {
  const checked = await preflight(plan, options.force === true);
  if (options.dryRun) return { dryRun: true, plan, written: [] };

  const id = randomBytes(6).toString('hex');
  const stageDir = join(plan.entryRoot, `.cerial-convert-${id}`);
  const doRename = options.rename ?? rename;

  try {
    const files = await stageTree(plan, checked, options, stageDir);
    await options.verify?.({ dir: stageDir, files });

    return { dryRun: false, plan, written: await commit(checked, files, id, doRename) };
  } finally {
    await rm(stageDir, { recursive: true, force: true });
  }
}

async function commit(
  checked: readonly Checked[],
  files: readonly StagedFile[],
  id: string,
  doRename: (from: string, to: string) => Promise<void>,
): Promise<string[]> {
  const createdDirs: string[] = [];
  const temps = new Map<string, string>();
  const backups = new Map<string, Buffer>();
  const states = new Map<string, State>(checked.map((c) => [c.target, 'not written']));
  const renamed: Checked[] = [];

  const cleanup = async (): Promise<void> => {
    for (const temp of temps.values()) await rm(temp, { force: true });
    temps.clear();
    for (const dir of createdDirs.reverse()) await rmdir(dir).catch(() => undefined);
  };

  try {
    for (const entry of checked) {
      const dir = dirname(entry.target);
      const fresh = await missingDirs(dir);
      await mkdir(dir, { recursive: true });
      createdDirs.push(...fresh);
      const temp = join(dir, `.${basename(entry.target)}.cerial-tmp-${id}`);
      temps.set(entry.target, temp);
      const staged = files.find((f) => f.target === entry.target);
      if (!staged) throw new CerialGenerationError(`Internal: ${entry.target} was not staged`);
      await copyFile(staged.path, temp);
      if (entry.existing) {
        await chmod(temp, entry.existing.mode);
        backups.set(entry.target, await readFile(entry.target));
        states.set(entry.target, 'unchanged');
      }
    }
  } catch (error) {
    await cleanup();
    throw error;
  }

  for (const [index, entry] of checked.entries()) {
    try {
      await doRename(temps.get(entry.target) as string, entry.target);
      temps.delete(entry.target);
      renamed.push(entry);
      states.set(entry.target, entry.existing ? 'replaced' : 'created');
    } catch (error) {
      await cleanup();
      for (const done of renamed.reverse())
        states.set(done.target, await rollback(done, backups.get(done.target), id, doRename));
      if (createdDirs.length) for (const dir of createdDirs) await rmdir(dir).catch(() => undefined);
      const lines = checked.map((c) => `  ${c.target}: ${states.get(c.target)}`);
      throw new CerialGenerationError(
        `Writing file ${index + 1} of ${checked.length} (${entry.target}) failed: ${(error as Error).message}\nFinal state of each target:\n${lines.join('\n')}`,
        { cause: error },
      );
    }
  }

  return checked.map((c) => c.target);
}

async function rollback(
  entry: Checked,
  original: Buffer | undefined,
  id: string,
  doRename: (from: string, to: string) => Promise<void>,
): Promise<State> {
  if (!entry.existing || !original) {
    try {
      await rm(entry.target);

      return 'created, then removed';
    } catch (error) {
      return `NOT REMOVED, still holds the converted output (${(error as Error).message})`;
    }
  }

  const temp = join(dirname(entry.target), `.${basename(entry.target)}.cerial-restore-${id}`);
  try {
    await writeFile(temp, original, { mode: entry.existing.mode });
    await chmod(temp, entry.existing.mode);
    await doRename(temp, entry.target);

    return 'replaced, then restored';
  } catch (error) {
    await rm(temp, { force: true });

    return `NOT RESTORED, still holds the converted output (${(error as Error).message})`;
  }
}
