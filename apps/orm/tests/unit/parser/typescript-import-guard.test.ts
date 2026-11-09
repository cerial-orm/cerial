/**
 * The parse sites load the bundled `typescript-5.9`, never the user's `typescript`: TypeScript 7's JS entry has no
 * compiler API, so a bare value import of `typescript` crashes `cerial generate` in a project that installs it.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(import.meta.dir, '../../../src');

/** Files under `root` with a value import, require or dynamic import of the bare `typescript` module. */
export function bareTypescriptImports(files: ReadonlyMap<string, string>): string[] {
  const value = [
    /(^|\n)\s*import\s+(?!type\b)[^'"\n]*?from\s*['"]typescript['"]/,
    /(^|\n)\s*import\s*['"]typescript['"]/,
    /(^|\n)\s*export\s+(?!type\b)[^'"\n]*?from\s*['"]typescript['"]/,
    /\bimport\(\s*['"]typescript['"]\s*\)(?!\s*\.)/,
    /\brequire\(\s*['"]typescript['"]\s*\)/,
  ];

  return [...files].filter(([, text]) => value.some((pattern) => pattern.test(valueOnly(text)))).map(([file]) => file);
}

/** The text with `typeof import('typescript')` and `import('typescript').X` type positions removed. */
function valueOnly(text: string): string {
  return text
    .replace(/typeof\s+import\(\s*['"]typescript['"]\s*\)/g, '')
    .replace(/import\(\s*['"]typescript['"]\s*\)\./g, '');
}

function sources(dir: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const entry of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (entry.endsWith('.ts')) found.set(entry, readFileSync(join(dir, entry), 'utf8'));
  }

  return found;
}

describe('bare typescript import guard', () => {
  it('finds none under src', () => {
    expect(bareTypescriptImports(sources(SRC))).toEqual([]);
  });

  it.each([
    ["const ts = await import('typescript');"],
    ["import ts from 'typescript';"],
    ["import * as ts from 'typescript';"],
    ["import { createSourceFile } from 'typescript';"],
    ["export { createSourceFile } from 'typescript';"],
    ["const ts = require('typescript');"],
  ])('catches %s', (line) => {
    expect(bareTypescriptImports(new Map([['a.ts', line]]))).toEqual(['a.ts']);
  });

  it.each([
    ["import type { Node } from 'typescript';"],
    ["import ts from 'typescript-5.9';"],
    ["const ts = await import('typescript-5.9');"],
    ["type TypeScript = typeof import('typescript-5.9');"],
    ["type Node = import('typescript-5.9').Node;"],
    ["type TypeScript = typeof import('typescript');"],
    ["type Node = import('typescript').Node;"],
  ])('allows %s', (line) => {
    expect(bareTypescriptImports(new Map([['a.ts', line]]))).toEqual([]);
  });
});
