/**
 * Tallies the oracle's findings per key, in the form the known-gap list records them
 */

import { findings, shapeFindings } from './oracle';
import { SLOTS } from './slots';

export const tally = (list: readonly { key: string }[]): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const { key } of list) counts[key] = (counts[key] ?? 0) + 1;

  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
};

export const slotOf = (id: string) => {
  const found = SLOTS.find((s) => s.id === id);
  if (!found) throw new Error(`no slot ${id}`);

  return found;
};

export const operandFindings = (slotId: string) => tally(findings(slotOf(slotId)));
export const shapeTally = () => tally(shapeFindings(slotOf));

/** The slot id a gap key belongs to (shape keys carry the operator before it) */
export const slotIdOfKey = (key: string): string => {
  const parts = key.split('|');

  return parts[1]!.startsWith('shape:') ? parts[2]! : parts[1]!;
};
