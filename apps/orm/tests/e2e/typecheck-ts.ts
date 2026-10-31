/**
 * Runs the compile-time checks under `typechecks/` against the client generated from the
 * TypeScript corpus.
 *
 * The check files import the client by relative path (`../../generated`), which a tsconfig `paths`
 * entry cannot redirect. So the tree is copied to a sibling directory, at the same depth so every
 * other relative import keeps resolving, with only the client specifier rewritten to `generated-ts`.
 * The originals are never edited and the copy is removed afterwards.
 */

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const E2E_DIR = resolve(import.meta.dir);
const SOURCE_DIR = resolve(E2E_DIR, 'typechecks');
const OVERLAY_DIR = resolve(E2E_DIR, 'typechecks-ts');
const CLIENT_SPECIFIER = /(['"])((?:\.\.\/)+)generated(?=['"/])/g;

rmSync(OVERLAY_DIR, { recursive: true, force: true });
cpSync(SOURCE_DIR, OVERLAY_DIR, { recursive: true });

let rewritten = 0;
let checks = 0;
for (const file of new Bun.Glob('**/*.check.ts').scanSync(OVERLAY_DIR)) {
  const path = resolve(OVERLAY_DIR, file);
  const source = readFileSync(path, 'utf8');
  const redirected = source.replace(CLIENT_SPECIFIER, (_match, quote, up) => {
    rewritten++;

    return `${quote}${up}generated-ts`;
  });
  checks++;
  if (redirected !== source) writeFileSync(path, redirected);
}

let exitCode = 1;
try {
  // A check that kept pointing at the `.cerial` client would pass for the wrong reason
  if (!rewritten) throw new Error('No client import was redirected to generated-ts');
  console.log(`[typecheck:ts] ${checks} check files, ${rewritten} client imports redirected to generated-ts`);

  const proc = Bun.spawn(['bunx', 'tsc', '--noEmit', '-p', resolve(OVERLAY_DIR, 'tsconfig.json')], {
    stdout: 'inherit',
    stderr: 'inherit',
  });
  exitCode = await proc.exited;
} finally {
  rmSync(OVERLAY_DIR, { recursive: true, force: true });
}

process.exit(exitCode);
