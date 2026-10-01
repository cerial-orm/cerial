// Runs the file scans over paths on disk rather than over the index, for CI and
// for checking a tree that is not being committed. With no arguments it reads
// every tracked file. An argument may be a file or a directory.

import { readFileSync, statSync } from 'node:fs';
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

const refusals = scanFiles(files);
if (refusals.length) {
  printRefusals('The scans refuse this tree.', refusals);
  process.exit(1);
}
process.stdout.write(`${files.length} files read, no refusals.\n`);
