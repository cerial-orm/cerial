/**
 * Unit Tests: a where operand is held to create's rules, on every field kind, operator and path
 *
 * Create decides what a value is. For each place a value can sit in the schema, each operator that place
 * takes and each path that reaches it, where must accept exactly what create accepts, bind the value create
 * converted, and name the field when it refuses. Any disagreement would be listed in known-gaps.ts, which is empty.
 */

import { describe, expect, test } from 'bun:test';
import { operandFindings, shapeTally, slotIdOfKey } from './gaps';
import { KNOWN_GAPS } from './known-gaps';
import { SLOTS } from './slots';

const knownFor = (slotId: string, shape: boolean): Record<string, number> =>
  Object.fromEntries(
    Object.entries(KNOWN_GAPS).filter(
      ([key]) => slotIdOfKey(key) === slotId && key.split('|')[1]!.startsWith('shape:') === shape,
    ),
  );

describe('where agrees with create', () => {
  describe.each(SLOTS.map((s) => [s.id, s] as const))('%s', (id) => {
    test('matches the known gaps exactly', () => {
      expect(operandFindings(id)).toEqual(knownFor(id, false));
    });
  });
});

describe('operators that take a flag, text or a list of a given shape', () => {
  test('match the known gaps exactly', () => {
    const shapeKnown = Object.fromEntries(
      Object.entries(KNOWN_GAPS).filter(([key]) => key.split('|')[1]!.startsWith('shape:')),
    );
    expect(shapeTally()).toEqual(shapeKnown);
  });
});

describe('the known gap list', () => {
  test('is empty: where and create agree everywhere the oracle looks', () => {
    expect(KNOWN_GAPS).toEqual({});
  });

  test('names only places the oracle visits', () => {
    const ids = new Set(SLOTS.map((s) => s.id));
    const stale = Object.keys(KNOWN_GAPS).filter((key) => !ids.has(slotIdOfKey(key)));
    expect(stale).toEqual([]);
  });
});
