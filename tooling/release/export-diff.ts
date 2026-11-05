// Compares the exported names of two built packages, per `exports` subpath. The baseline is the published
// tarball extracted into its own directory; its declaration files are read as text and nothing in it is run.
//
//   bun run tooling/release/export-diff.ts <baseline-package-dir> <current-package-dir>
//
// Prints one `name | kind | source | section` row per removed subpath or removed name, ready to paste into the breaking-change ledger.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

export type ExportKind = 'type' | 'value';

export interface LedgerRow {
  readonly name: string;
  readonly kind: string;
  readonly source: string;
  readonly section: string;
}

const DECLARATION =
  /^export\s+(?:declare\s+)?(const|let|var|function|class|interface|type|enum|namespace|abstract\s+class)\s+([A-Za-z_$][\w$]*)/gm;
const NAMED = /export\s+(type\s+)?\{([^}]*)\}(?:\s*from\s*["']([^"']+)["'])?/g;
const STAR = /export\s+\*\s+(?:as\s+([A-Za-z_$][\w$]*)\s+)?from\s*["']([^"']+)["']/g;

function declarationFile(from: string, specifier: string): string | undefined {
  const base = resolve(dirname(from), specifier);
  const candidates = [base.replace(/\.m?js$/, '.d.mts'), `${base}.d.mts`, join(base, 'index.d.mts')];

  return candidates.find((candidate) => existsSync(candidate));
}

/** Exported names of one declaration file, following `export * from` into relative files. */
export function exportedNames(file: string, seen = new Set<string>()): Map<string, ExportKind> {
  const names = new Map<string, ExportKind>();
  if (seen.has(file) || !existsSync(file)) return names;
  seen.add(file);
  const text = readFileSync(file, 'utf8');

  for (const match of text.matchAll(DECLARATION)) {
    const word = match[1]!;
    names.set(match[2]!, word === 'interface' || word === 'type' ? 'type' : 'value');
  }
  for (const match of text.matchAll(NAMED)) {
    for (const part of match[2]!.split(',')) {
      const item = part.trim();
      if (!item) continue;
      const isType = Boolean(match[1]) || item.startsWith('type ');
      const bare = item.replace(/^type\s+/, '');
      const exported = bare
        .split(/\s+as\s+/)
        .pop()!
        .trim();
      names.set(exported, isType ? 'type' : 'value');
    }
  }
  for (const match of text.matchAll(STAR)) {
    if (match[1]) {
      names.set(match[1], 'value');
      continue;
    }
    const target = match[2]!.startsWith('.') ? declarationFile(file, match[2]!) : undefined;
    if (target) for (const [name, kind] of exportedNames(target, seen)) names.set(name, kind);
  }

  return names;
}

interface Subpaths {
  readonly [subpath: string]: string;
}

/** `exports` subpath to its ESM declaration file, relative to the package directory. */
export function typeEntries(packageDir: string): Subpaths {
  const manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as {
    exports?: Record<string, { import?: { types?: string } } | string>;
  };
  const entries: Record<string, string> = {};
  for (const [subpath, target] of Object.entries(manifest.exports ?? {})) {
    if (typeof target === 'object' && target.import?.types) entries[subpath] = target.import.types;
  }

  return entries;
}

export function diffExports(baselineDir: string, currentDir: string): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const baseline = typeEntries(baselineDir);
  const current = typeEntries(currentDir);

  for (const [subpath, types] of Object.entries(baseline)) {
    const source = `cerial 0.2.0 exports ${subpath}`;
    if (!(subpath in current)) {
      rows.push({ name: subpath, kind: 'export-path', source, section: 'Removed' });
      continue;
    }
    const before = exportedNames(join(baselineDir, types));
    const after = exportedNames(join(currentDir, current[subpath]!));
    for (const name of before.keys()) {
      if (!after.has(name)) rows.push({ name, kind: 'export-removed', source, section: 'Removed' });
    }
  }

  return rows;
}

if (import.meta.main) {
  const [baseline, current] = process.argv.slice(2);
  if (!baseline || !current) {
    console.error('usage: export-diff.ts <baseline-package-dir> <current-package-dir>');
    process.exit(2);
  }
  for (const row of diffExports(resolve(baseline), resolve(current))) {
    console.log(`| ${row.name} | ${row.kind} | ${row.source} | ${row.section} |`);
  }
}
