/**
 * What `generate` may delete and where it may write.
 *
 * Deletion is limited to files the previous run recorded in its own manifest, and an output
 * directory that holds schema sources or lies outside the project is refused unless allowed.
 */

import { lstat, readFile, realpath, rm, rmdir } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** Flag that lets `generate` write to an output directory it would otherwise refuse */
export const ALLOW_UNSAFE_OUTPUT_FLAG = '--allow-unsafe-output';

/** Name of the file in the output directory that lists what the run wrote */
export const OUTPUT_MANIFEST_NAME = '.cerial-output.json';

/** Realpath of a path that may not exist yet: the nearest existing ancestor resolved, the rest appended */
async function realpathLoose(path: string): Promise<string> {
  const abs = resolve(path);
  try {
    return await realpath(abs);
  } catch {
    const parent = dirname(abs);
    if (parent === abs) return abs;

    return join(await realpathLoose(parent), basename(abs));
  }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);

  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

export interface OutputGuardOptions {
  outputDir: string;
  /** Absolute paths of the run's schema sources (`.cerial` files and TypeScript schema modules) */
  sources: string[];
  /** Other paths the output must not contain: every schema entry's folder, entry module and listed files */
  protectedPaths?: string[];
  /** Directory the output must stay inside; absent means no containment check */
  projectRoot?: string;
  allowUnsafeOutput?: boolean;
}

/** Throws, naming the path and the flag, when the output directory is outside the project or holds a schema source */
export async function assertSafeOutput(options: OutputGuardOptions): Promise<void> {
  if (options.allowUnsafeOutput) return;
  const output = await realpathLoose(options.outputDir);

  if (options.projectRoot) {
    const root = await realpathLoose(options.projectRoot);
    if (!isInside(root, output)) {
      throw new Error(
        `Refusing output directory '${output}': it lies outside the project root '${root}'. Pass ${ALLOW_UNSAFE_OUTPUT_FLAG} to allow it.`,
      );
    }
  }

  for (const source of [...options.sources, ...(options.protectedPaths ?? [])]) {
    const real = await realpathLoose(source);
    if (isInside(output, real)) {
      throw new Error(
        `Refusing output directory '${output}': it contains the schema source '${real}', which generate would overwrite or delete. Pass ${ALLOW_UNSAFE_OUTPUT_FLAG} to allow it.`,
      );
    }
  }
}

/** Paths, relative to the output directory, that the previous run wrote; null when there is no usable manifest */
export async function readOutputManifest(outputDir: string): Promise<string[] | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(join(outputDir, OUTPUT_MANIFEST_NAME), 'utf8'));
    if (!parsed || typeof parsed !== 'object') return null;
    const files = (parsed as { files?: unknown }).files;
    if (!Array.isArray(files) || !files.every((f) => typeof f === 'string')) return null;

    return files as string[];
  } catch {
    return null;
  }
}

/** Manifest content for the files a run wrote, as paths relative to the output directory */
export function outputManifestContent(outputDir: string, files: string[]): string {
  const rel = files.map((f) => relative(outputDir, f).split(sep).join('/')).sort();

  return `${JSON.stringify({ files: rel }, null, 2)}\n`;
}

/**
 * Files a run is about to write that already exist and that the previous run did not record: they are the
 * user's, and writing them would overwrite them and then claim them in the new manifest.
 */
export async function unclaimedTargets(
  outputDir: string,
  files: string[],
  previous: string[] | null,
): Promise<string[]> {
  const claimed = new Set((previous ?? []).map((rel) => resolve(outputDir, rel)));
  const clashes: string[] = [];
  for (const file of files) {
    if (claimed.has(resolve(file))) continue;
    try {
      await lstat(file);
      clashes.push(file);
    } catch {
      // Not there: a new file
    }
  }

  return clashes;
}

/** Throws, naming the files, when a run would overwrite files it did not write itself */
export async function assertNoUnclaimedTargets(
  outputDir: string,
  files: string[],
  previous: string[] | null,
  allowUnsafeOutput?: boolean,
): Promise<void> {
  if (allowUnsafeOutput) return;
  const clashes = await unclaimedTargets(outputDir, files, previous);
  if (!clashes.length) return;
  const shown = clashes.slice(0, 5).join(', ');
  const more = clashes.length > 5 ? ` and ${clashes.length - 5} more` : '';
  if (previous === null) {
    throw new Error(
      `Refusing to overwrite ${clashes.length} existing file(s) in '${outputDir}': ${shown}${more}. ` +
        `This folder has no ${OUTPUT_MANIFEST_NAME}, so cerial cannot tell which files it wrote (the usual cause is output from cerial 0.2.0 or earlier). ` +
        `Delete '${outputDir}' and run generate again. ` +
        `${ALLOW_UNSAFE_OUTPUT_FLAG} overwrites these files in place, but it leaves behind old files this run does not write, and those can shadow the new types.`,
    );
  }
  throw new Error(
    `Refusing to overwrite ${clashes.length} existing file(s) in '${outputDir}' that a previous generate did not write: ${shown}${more}. Pass ${ALLOW_UNSAFE_OUTPUT_FLAG} to overwrite them.`,
  );
}

/**
 * Delete the listed files, except those in `keep`, then the directories that removal left empty.
 * An entry that resolves outside the output directory (a hand-edited manifest, a symlinked folder) is skipped;
 * the real path is checked again immediately before each delete, and a directory is removed only when it is empty.
 */
export async function removeListedFiles(outputDir: string, listed: string[], keep: Set<string>): Promise<string[]> {
  const root = await realpathLoose(outputDir);
  const base = resolve(outputDir);
  const removed: string[] = [];
  const dirs = new Set<string>();

  for (const rel of listed) {
    const full = resolve(outputDir, rel);
    if (keep.has(full) || full === base || !isInside(base, full)) continue;

    try {
      if (!(await lstat(full)).isFile()) continue;
      // Resolved last so a link swapped in since the manifest was read is caught
      if (!isInside(root, await realpath(full))) continue;
      await rm(full, { force: true });
    } catch {
      continue;
    }
    removed.push(full);
    for (let dir = dirname(full); dir !== base && isInside(base, dir); dir = dirname(dir)) dirs.add(dir);
  }

  // Deepest first, so a directory emptied by its children going is removed too; rmdir refuses a non-empty one
  for (const dir of [...dirs].sort((a, b) => b.length - a.length)) {
    try {
      await rmdir(dir);
    } catch {
      // Not empty, or already gone
    }
  }

  return removed;
}
