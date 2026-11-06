import { describe, expect, test } from 'bun:test';

export interface Case<W> {
  readonly label: string;
  readonly where: W;
  /** Ids of the rows the filter means */
  readonly expected: readonly string[];
  /** The shape is ambiguous on a write: updateMany and deleteMany must refuse it and leave every row alone */
  readonly refusedOnWrite?: boolean;
}

/** One model's four entry points, reduced to ids, so one case can run through all of them */
export interface Rows<W> {
  readonly find: (where: W) => Promise<string[]>;
  readonly count: (where: W) => PromiseLike<number>;
  readonly update: (where: W) => Promise<unknown>;
  readonly remove: (where: W) => Promise<unknown>;
  /** ids of the rows an updateMany marked */
  readonly marked: () => Promise<string[]>;
  readonly survivors: () => Promise<string[]>;
  readonly everything: readonly string[];
}

/** The bare id of a row (`p1`), without the table prefix or the angle brackets of a complex id */
export const idOf = (id: { toString(): string }): string =>
  id
    .toString()
    .replace(/^[^:]+:⟨?/, '')
    .replace(/⟩$/, '');

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

/**
 * Runs each case through findMany, count, updateMany and deleteMany and asserts the exact rows. The caller
 * reseeds in a beforeEach, so a destructive case starts from the same rows as a read.
 */
export function runCases<W>(title: string, getRows: () => Rows<W>, cases: readonly Case<W>[]): void {
  describe.each(cases)(`${title}: $label`, ({ where, expected, refusedOnWrite }) => {
    test('findMany and count match exactly the rows the filter means', async () => {
      const rows = getRows();

      expect(sorted(await rows.find(where))).toEqual(sorted(expected));
      expect(await rows.count(where)).toBe(expected.length);
    });

    test('updateMany changes exactly those rows and no others', async () => {
      const rows = getRows();
      if (refusedOnWrite) {
        await expect((async () => rows.update(where))()).rejects.toThrow(/ambiguous on a write/);
        expect(await rows.marked()).toEqual([]);

        return;
      }
      await rows.update(where);

      expect(sorted(await rows.marked())).toEqual(sorted(expected));
    });

    test('deleteMany removes exactly those rows and keeps the others', async () => {
      const rows = getRows();
      if (refusedOnWrite) {
        await expect((async () => rows.remove(where))()).rejects.toThrow(/ambiguous on a write/);
        expect(sorted(await rows.survivors())).toEqual(sorted(rows.everything));

        return;
      }
      await rows.remove(where);

      expect(sorted(await rows.survivors())).toEqual(sorted(rows.everything.filter((id) => !expected.includes(id))));
    });
  });
}
