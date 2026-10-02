// Runs the file scans over paths on disk rather than over the index, for CI and
// for checking a tree that is not being committed. With no arguments it reads
// every tracked file. An argument may be a file or a directory.
//
// With no arguments it also reconciles baseline.json against the tree, counting
// as the commit gate does (the index, which a CI checkout makes equal to disk).

import { readFileSync, statSync } from 'node:fs';
import { checkRatchet } from './repo-scans.ts';
import { printRefusals } from './report.ts';
import { gitText, isSourcePath, type StagedFile, scanFiles } from './scan.ts';

const tracked = (): string[] => (gitText(['ls-files', '-z']) ?? '').split('\0').filter(Boolean);

function expand(argument: string): string[] {
  let isDirectory = false;
  try {
    isDirectory = statSync(argument).isDirectory();
  } catch {
    return [];
  }
  if (!isDirectory) return [argument];
  const prefix = argument.endsWith('/') ? argument : `${argument}/`;

  return tracked().filter((path) => path.startsWith(prefix));
}

const given = process.argv.slice(2);
const paths = given.length ? given.flatMap(expand) : tracked();
const files: StagedFile[] = [];
for (const path of paths) {
  if (!isSourcePath(path)) continue;
  files.push({ path, content: readFileSync(path, 'utf8') });
}

// Arguments that match nothing are an error, not a pass: a directory typed where a
// file was expected used to print success having read no files at all.
if (given.length && files.length === 0) {
  process.stderr.write(`No source files matched: ${given.join(', ')}\n`);
  process.exit(2);
}

// The recorded counts are a statement about the whole tree, so naming paths skips them.
// A count that fell is refused as firmly as one that rose: an unrecorded fall is a
// saving the next commit can spend a second time.
const refusals = [...scanFiles(files), ...(given.length ? [] : checkRatchet())];
if (refusals.length) {
  printRefusals('The scans refuse this tree.', refusals);
  process.exit(1);
}
process.stdout.write(`${files.length} files read, no refusals.\n`);
