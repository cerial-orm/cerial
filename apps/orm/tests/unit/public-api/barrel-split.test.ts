/**
 * The root entry is the runtime surface: it must not reach the formatter or export the codegen writers.
 * Those live on `cerial/generators`.
 */

import { describe, expect, test } from 'bun:test';

const ENTRY = new URL('../../../src/index.ts', import.meta.url).pathname;
const GENERATORS_ENTRY = new URL('../../../src/generators/index.ts', import.meta.url).pathname;
const CODEGEN_NAMES = ['formatCode', 'writeClient', 'writeModelRegistry', 'writeMigrationFile', 'createRegistry'];

/**
 * Bundles the entry's own source graph and returns the bare package specifiers it still imports.
 * The optional `(` matches a dynamic `import('pkg')`, which a static-only pattern would miss and
 * so report a graph as clean while it still reaches the package at runtime.
 */
async function externalImports(entry: string): Promise<string[]> {
  const result = await Bun.build({ entrypoints: [entry], packages: 'external', target: 'node' });
  expect(result.success).toBe(true);
  const code = await result.outputs[0]!.text();

  return [...code.matchAll(/(?:from|import)\s*\(?\s*["']([^"'./][^"']*)["']/g)].map((m) => m[1]!);
}

describe('public API: root barrel excludes the codegen surface', () => {
  test('the root module graph never imports oxfmt', async () => {
    expect(await externalImports(ENTRY)).not.toContain('oxfmt');
  });

  test('the generators entry does import oxfmt (the check can fail)', async () => {
    expect(await externalImports(GENERATORS_ENTRY)).toContain('oxfmt');
  });

  test('the root exports none of the codegen names', async () => {
    const root = await import(ENTRY);

    for (const name of CODEGEN_NAMES) expect(name in root).toBe(false);
  });

  test('cerial/generators exports them', async () => {
    const generators = await import(GENERATORS_ENTRY);

    for (const name of CODEGEN_NAMES) expect(typeof generators[name]).toBe('function');
  });
});
