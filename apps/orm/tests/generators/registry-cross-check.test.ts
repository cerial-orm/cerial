/**
 * Registry against parity manifest, in both directions.
 *
 * Keyed on the name as written in a schema (`@geoCollection`, `Record`), never on the parser file: one
 * parser file can produce several names (geometry produces seven), and each name has its own entry on
 * both sides. A failure lists every offending entry, not a count.
 */

import { describe, expect, test } from 'bun:test';
import { PARITY_MANIFEST, REGISTRY_FAMILIES } from '../../src/parity';
import { DECORATOR_REGISTRY, FIELD_TYPE_REGISTRY } from '../../src/parser/registry';

const families: readonly string[] = REGISTRY_FAMILIES;
const manifestById = new Map<string, (typeof PARITY_MANIFEST)[number]>(PARITY_MANIFEST.map((e) => [e.id, e]));
const registryEntries = [...DECORATOR_REGISTRY.values(), ...FIELD_TYPE_REGISTRY.values()];

describe('registry cross-check', () => {
  test('every registry entry resolves to a manifest entry in a registry family', () => {
    const offenders: string[] = [];

    for (const entry of registryEntries) {
      const manifestEntry = manifestById.get(entry.constructId);
      if (!manifestEntry) offenders.push(`${entry.name}: constructId '${entry.constructId}' has no manifest entry`);
      else if (!families.includes(manifestEntry.family))
        offenders.push(
          `${entry.name}: constructId '${entry.constructId}' is in family '${manifestEntry.family}', not a registry family`,
        );
    }

    expect(offenders).toEqual([]);
  });

  test('every in-reach manifest entry is claimed by exactly one registry entry', () => {
    const claimedBy = new Map<string, string[]>();
    for (const entry of registryEntries) {
      claimedBy.set(entry.constructId, [...(claimedBy.get(entry.constructId) ?? []), entry.name]);
    }

    const offenders: string[] = [];
    for (const manifestEntry of PARITY_MANIFEST) {
      if (!families.includes(manifestEntry.family) || 'outOfReach' in manifestEntry) continue;
      const names = claimedBy.get(manifestEntry.id) ?? [];
      if (!names.length) offenders.push(`${manifestEntry.id} (${manifestEntry.title}): no registry entry claims it`);
      else if (names.length > 1)
        offenders.push(
          `${manifestEntry.id} (${manifestEntry.title}): claimed ${names.length} times by ${names.join(', ')}`,
        );
    }

    expect(offenders).toEqual([]);
  });
});
