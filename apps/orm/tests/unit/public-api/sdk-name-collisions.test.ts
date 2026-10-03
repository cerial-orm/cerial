/**
 * The package entry must not export a name the surrealdb SDK also exports.
 *
 * This is asserted against the entry's export statements rather than at the type level, because
 * TypeScript cannot reflect over type-only exports: `keyof` on a namespace import lists value
 * exports only, so a type-level check passes whether or not the name is back.
 */

import { describe, expect, test } from 'bun:test';

const ENTRY = new URL('../../../src/index.ts', import.meta.url).pathname;

/** Every name the entry re-exports, from both `export {}` and `export type {}` blocks. */
async function exportedNames(): Promise<Set<string>> {
  const source = await Bun.file(ENTRY).text();
  const names = new Set<string>();

  for (const block of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const entry of block[1]!.split(',')) {
      const name = entry
        .replace(/\btype\b/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }

  return names;
}

// Names surrealdb exports that Cerial must not shadow: a consumer imports from both in one module.
const SDK_OWNED = ['Token', 'ValidationError'];

describe('public API: no name collides with the surrealdb SDK', () => {
  test('the entry exports none of the SDK-owned names', async () => {
    const names = await exportedNames();

    for (const owned of SDK_OWNED) expect(names.has(owned)).toBe(false);
  });

  test('the renamed Cerial equivalents are exported instead', async () => {
    const names = await exportedNames();

    expect(names.has('CerialToken')).toBe(true);
    expect(names.has('CerialValidationIssue')).toBe(true);
  });

  test('the parser is not fooled by an aliased re-export', async () => {
    const names = await exportedNames();

    expect(names.has('CerialValidationError')).toBe(true);
  });
});
