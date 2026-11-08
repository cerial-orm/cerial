/**
 * E2E: a where operand selects the rows create wrote from the same value
 *
 * The unit oracle compares what where binds with what create converts. This is the live check behind it:
 * per field kind, three rows are created from the forms a caller sends (strings, short dates, ids), and
 * counting by the first row's value finds exactly one row while NOT finds the other two. A kind whose
 * count differs today is listed in KNOWN_FAILING and must be removed from there once it is fixed.
 */

import { describe, expect, test } from 'bun:test';
import { tables } from '../test-helper';
import { setupDataTypeTests } from './test-factory';

const loose = (value: unknown): never => value as never;

interface Kind {
  readonly name: string;
  readonly model: string;
  readonly field: string;
  /** Required fields of the model besides the one under test */
  readonly extra?: (i: number) => Record<string, unknown>;
  /** The three values, in the form create takes */
  readonly values: [unknown, unknown, unknown];
  /** Rows to create first, for a foreign key */
  readonly parent?: { readonly model: string; readonly ids: [unknown, unknown, unknown] };
}

const U = (n: number): string => `0190c3f8-6c5d-7a3a-9d3a-12345678900${n}`;

const KINDS: Kind[] = [
  {
    name: 'Date',
    model: 'RoOwner',
    field: 'dt',
    extra: (i) => ({ id: `o${i}`, label: `o${i}` }),
    values: ['2021-01-01', '2021-06-01T00:00:00Z', '2022-01-01'],
  },
  {
    name: 'Duration',
    model: 'RoOwner',
    field: 'du',
    extra: (i) => ({ id: `o${i}`, label: `o${i}` }),
    values: ['4h60m', '2h', '3h'],
  },
  {
    name: 'Uuid',
    model: 'RoOwner',
    field: 'uu',
    extra: (i) => ({ id: `o${i}`, label: `o${i}` }),
    values: [U(0), U(1), U(2)],
  },
  {
    name: 'Decimal',
    model: 'RoOwner',
    field: 'de',
    extra: (i) => ({ id: `o${i}`, label: `o${i}` }),
    values: ['1.50', '2.5', '3.5'],
  },
  {
    name: 'Geometry',
    model: 'RoOwner',
    field: 'geo',
    extra: (i) => ({ id: `o${i}`, label: `o${i}` }),
    values: [
      [1, 1],
      [2, 2],
      [3, 3],
    ],
  },
  {
    name: 'Bytes',
    model: 'BytesBasic',
    field: 'payload',
    extra: (i) => ({ name: `b${i}`, tag: null, chunks: [] }),
    values: ['AQI=', 'AwQ=', 'BQY='],
  },
  {
    name: 'Number',
    model: 'NumberBasic',
    field: 'price',
    extra: (i) => ({ name: `n${i}`, weight: null, scores: [] }),
    values: [1.5, 2.5, 3.5],
  },
  {
    name: 'Float16',
    model: 'SzFloat16',
    field: 'reqVal',
    extra: () => ({ nullVal: null, objVal: { val: 1.5 }, tupVal: [1.5, null] }),
    values: [0.1, 0.5, 1.5],
  },
  {
    name: 'Uint64',
    model: 'SzUint64',
    field: 'reqVal',
    extra: () => ({ nullVal: null, objVal: { val: 1 }, tupVal: [1, null] }),
    values: [5, 6, 7],
  },
  { name: 'Int id', model: 'IntIdModel', field: 'id', extra: (i) => ({ name: `i${i}` }), values: [1, 2, 3] },
  { name: 'Uuid id', model: 'UuidIdModel', field: 'id', extra: (i) => ({ data: `u${i}` }), values: [U(0), U(1), U(2)] },
  {
    name: 'String id',
    model: 'StringIdModel',
    field: 'id',
    extra: (i) => ({ payload: `s${i}` }),
    values: ['a', 'b', 'c'],
  },
  { name: 'Union id', model: 'UnionIdModel', field: 'id', extra: (i) => ({ label: `m${i}` }), values: ['a', 2, 3] },
  {
    name: 'Foreign key to an int id',
    model: 'FkChildModel',
    field: 'parentId',
    extra: (i) => ({ id: `c${i}`, note: `c${i}` }),
    values: [1, 2, 3],
    parent: { model: 'FkTargetIntId', ids: [1, 2, 3] },
  },
];

/**
 * Kinds whose count by create's own value is not one today. The cause is each one's gap in the unit oracle's
 * known-gaps list; delete the name here when its count is right.
 */
const KNOWN_FAILING: ReadonlySet<string> = new Set<string>(['Uuid id']);

describe('E2E: where finds the rows create wrote', () => {
  const { getClient } = setupDataTypeTests([
    ...tables.relationOperands,
    ...tables.bytes,
    ...tables.number,
    ...tables.sizedNumbers,
    ...tables.typedIds,
  ]);

  type Api = {
    create: (a: unknown) => Promise<unknown>;
    count: (a?: unknown) => Promise<number>;
  };
  const api = (model: string): Api => (getClient().db as never as Record<string, Api>)[model]!;

  describe.each(KINDS.map((k) => [k.name, k] as const))('%s', (_name, kind) => {
    // Seeded inside each test so a kind whose create itself fails is held to KNOWN_FAILING too
    const seed = async (): Promise<void> => {
      if (kind.parent)
        for (const id of kind.parent.ids) await api(kind.parent.model).create({ data: loose({ id, label: `p${id}` }) });
      for (const [i, value] of kind.values.entries())
        await api(kind.model).create({ data: loose({ ...kind.extra?.(i), [kind.field]: value }) });
    };

    const body = KNOWN_FAILING.has(kind.name) ? test.failing : test;

    body('count by the first value is 1 and NOT is 2', async () => {
      await seed();
      const first = kind.values[0];
      expect(await api(kind.model).count(loose({ [kind.field]: first }))).toBe(1);
      expect(await api(kind.model).count(loose({ NOT: { [kind.field]: first } }))).toBe(2);
    });

    body('eq and in agree with the shorthand', async () => {
      await seed();
      const first = kind.values[0];
      expect(await api(kind.model).count(loose({ [kind.field]: { eq: first } }))).toBe(1);
      expect(await api(kind.model).count(loose({ [kind.field]: { in: [first] } }))).toBe(1);
      expect(await api(kind.model).count(loose({ [kind.field]: { neq: first } }))).toBe(2);
    });
  });
});
