/**
 * Runs the compile-time checks under `typechecks/` against a client generated somewhere other than
 * `generated/`.
 *
 * The check files import the client by relative path (`../../generated`), which a tsconfig `paths`
 * entry cannot redirect. So the tree is copied to a sibling directory, at the same depth so every
 * other relative import keeps resolving, with only the client specifier rewritten. The originals are
 * never edited and the copy is removed afterwards.
 */

import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const E2E_DIR = resolve(import.meta.dir);
const SOURCE_DIR = resolve(E2E_DIR, 'typechecks');
const CLIENT_SPECIFIER = /(['"])((?:\.\.\/)+)generated(?=['"/])/g;

export interface OverlayCount {
  readonly checks: number;
  readonly rewritten: number;
}

/** Rewrites every client import under `dir` to `client`; returns how many files and imports were seen */
export function redirectClientImports(dir: string, client: string): OverlayCount {
  let rewritten = 0;
  let checks = 0;
  for (const file of new Bun.Glob('**/*.check.ts').scanSync(dir)) {
    const path = resolve(dir, file);
    const source = readFileSync(path, 'utf8');
    const redirected = source.replace(CLIENT_SPECIFIER, (_match, quote, up) => {
      rewritten++;

      return `${quote}${up}${client}`;
    });
    checks++;
    if (redirected !== source) writeFileSync(path, redirected);
  }

  return { checks, rewritten };
}

/** Copies `typechecks/` to `overlayName`, redirects the client to `client` and runs `tsc` over it; returns the exit code */
export async function typecheckAgainst(label: string, overlayName: string, client: string): Promise<number> {
  const overlayDir = resolve(E2E_DIR, overlayName);
  rmSync(overlayDir, { recursive: true, force: true });
  cpSync(SOURCE_DIR, overlayDir, { recursive: true });

  try {
    const { checks, rewritten } = redirectClientImports(overlayDir, client);
    // A check that kept pointing at the default client would pass for the wrong reason
    if (!rewritten) throw new Error(`No client import was redirected to ${client}`);
    console.log(`[${label}] ${checks} check files, ${rewritten} client imports redirected to ${client}`);

    const proc = Bun.spawn(['bunx', 'tsc', '--noEmit', '-p', resolve(overlayDir, 'tsconfig.json')], {
      stdout: 'inherit',
      stderr: 'inherit',
    });

    return await proc.exited;
  } finally {
    rmSync(overlayDir, { recursive: true, force: true });
  }
}
