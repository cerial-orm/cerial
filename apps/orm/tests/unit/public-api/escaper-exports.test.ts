/**
 * The package entry must not export the SDK's identifier escapers.
 *
 * `escapeIdent` leaves a backslash unescaped, so a value passed through it can end the identifier early and
 * run as code (see tests/integration/escaper-payload.test.ts). Asserted at runtime and against the entry's
 * export statements, because a type-only re-export would not show up at runtime.
 */

import { describe, expect, test } from 'bun:test';
import * as entry from '../../../src/index';

const ENTRY = new URL('../../../src/index.ts', import.meta.url).pathname;

async function exportedNames(): Promise<Set<string>> {
  const source = await Bun.file(ENTRY).text();
  const names = new Set<string>();

  for (const block of source.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g)) {
    for (const item of block[1]!.split(',')) {
      const name = item
        .replace(/\btype\b/, '')
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name) names.add(name);
    }
  }

  return names;
}

const DROPPED = ['escapeIdent', 'escapeIdPart'];
const KEPT = ['equals', 'RecordId', 'StringRecordId', 'Table'];

describe('public API: the SDK identifier escapers are not exported', () => {
  test('neither name is on the entry at runtime', () => {
    for (const name of DROPPED) expect(name in entry).toBe(false);
  });

  test('neither name is in an export statement', async () => {
    const names = await exportedNames();

    for (const name of DROPPED) expect(names.has(name)).toBe(false);
  });

  test('the rest of the SDK re-export is still there', async () => {
    const names = await exportedNames();

    for (const name of KEPT) {
      expect(names.has(name)).toBe(true);
      expect(name in entry).toBe(true);
    }
  });
});
