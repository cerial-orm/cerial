/**
 * E2E: list operands on array fields convert each element the way create does
 *
 * `in` and `notIn` on an array field take a list of arrays. Uuid, Duration, Decimal, Date, Bytes and
 * Geometry elements inside those arrays are converted like the scalar ones, so a string element
 * selects the rows the typed element selects, on reads and on destructive writes.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { type CerialClient, cleanupTables, createTestClient, testConfig, truncateTables } from '../test-helper';

const loose = (value: unknown): never => value as never;

// A refusal can throw while the query is built, so the call runs inside an async function
const refuses = async (run: () => unknown, pattern: RegExp): Promise<void> => {
  await expect(
    (async () => {
      await run();
    })(),
  ).rejects.toThrow(pattern);
};

const polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
    ],
  ],
};
const line = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [1, 1],
  ],
};

interface Kind {
  model: 'UuidBasic' | 'DurationBasic' | 'DecimalBasic' | 'ArrayDecoratorTest' | 'BytesBasic' | 'GeometryBasic';
  table: string;
  field: string;
  base: Record<string, unknown>;
  one: unknown;
  two: unknown;
  /** An element create refuses for the field */
  bad: unknown;
  /** The row label lives in `name`, except on a model with none */
  labelField?: string;
  /** The two elements in the order the database stores them, when it reorders */
  stored?: unknown[];
}

const KINDS: Record<string, Kind> = {
  uuid: {
    model: 'UuidBasic',
    table: 'uuid_basic',
    field: 'tags',
    base: { token: '00000000-0000-4000-8000-0000000000ff' },
    one: '00000000-0000-4000-8000-000000000001',
    two: '00000000-0000-4000-8000-000000000002',
    bad: 'nope',
  },
  duration: {
    model: 'DurationBasic',
    table: 'duration_basic',
    field: 'intervals',
    base: { ttl: '1h', cooldown: '1h' },
    one: '1h',
    two: '2h',
    bad: 'nope',
  },
  decimal: {
    model: 'DecimalBasic',
    table: 'decimal_basic',
    field: 'amounts',
    base: { price: '1.5', tax: '1.5' },
    one: '1.5',
    two: '2.5',
    bad: 'abc',
  },
  date: {
    model: 'ArrayDecoratorTest',
    table: 'array_decorator_test',
    field: 'recentDates',
    base: {},
    one: '2021-01-01T00:00:00.000Z',
    two: '2022-01-01T00:00:00.000Z',
    bad: 'not a date',
    labelField: 'normalTags',
    // @sort(false) stores the dates newest first
    stored: ['2022-01-01T00:00:00.000Z', '2021-01-01T00:00:00.000Z'],
  },
  bytes: {
    model: 'BytesBasic',
    table: 'bytes_basic',
    field: 'chunks',
    base: { payload: 'AQI=', tag: 'AQI=' },
    one: 'AQI=',
    two: 'AwQ=',
    bad: 5,
  },
  geometry: {
    model: 'GeometryBasic',
    table: 'geometry_basic',
    field: 'geoArray',
    base: { location: [0, 0], area: polygon, shape: [0, 0], route: line, multi: [0, 0] },
    one: [1, 1],
    two: [2, 2],
    bad: { foo: 1 },
  },
};

describe.each(Object.entries(KINDS))('E2E: array list operands on %s', (_name, kind) => {
  let client: CerialClient;
  // The model accessors differ in type; the data and where shapes are exercised the same way for each
  const model = (): {
    create: (a: unknown) => Promise<unknown>;
    findMany: (a?: unknown) => Promise<Array<Record<string, unknown>>>;
    deleteMany: (a: unknown) => Promise<number>;
    updateMany: (a: unknown) => Promise<unknown>;
  } => (client.db as never)[kind.model];

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, [kind.table]);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, [kind.table]);
    const sets: Array<[string, unknown[]]> = [
      ['r1', [kind.one]],
      ['r2', [kind.two]],
      ['r3', both],
    ];
    for (const [rowName, values] of sets)
      await model().create({ data: { ...label(rowName), ...kind.base, [kind.field]: values } });
  });

  const both = kind.stored ?? [kind.one, kind.two];
  const label = (value: string): Record<string, unknown> =>
    kind.labelField ? { [kind.labelField]: [value] } : { name: value };
  const read = (row: Record<string, unknown>): string =>
    kind.labelField ? (row[kind.labelField] as string[])[0]! : (row.name as string);
  const marked = async (): Promise<string[]> =>
    (await model().findMany({ where: loose({ [kind.field]: { eq: [kind.one] } }) })).map(read);
  const names = async (where: unknown): Promise<string[]> =>
    (await model().findMany({ where: loose(where) })).map(read).sort();

  test('deleteMany notIn removes exactly the rows that differ', async () => {
    const n = await model().deleteMany({ where: loose({ [kind.field]: { notIn: [[kind.one]] } }) });
    expect(n).toBe(2);
    expect(await names({})).toEqual(['r1']);
  });

  test('deleteMany NOT in removes exactly the rows that differ', async () => {
    const n = await model().deleteMany({ where: loose({ NOT: { [kind.field]: { in: [[kind.one]] } } }) });
    expect(n).toBe(2);
    expect(await names({})).toEqual(['r1']);
  });

  test('updateMany changes only the rows the typed list selects', async () => {
    await model().updateMany({
      where: loose({ [kind.field]: { notIn: [[kind.one], [kind.two]] } }),
      data: label('hit'),
    });
    expect(await names({})).toEqual(['hit', 'r1', 'r2']);
  });

  test('in selects the rows holding exactly one of the arrays', async () => {
    expect(await names({ [kind.field]: { in: [[kind.one]] } })).toEqual(['r1']);
    expect(await names({ [kind.field]: { in: [[kind.one], both] } })).toEqual(['r1', 'r3']);
    expect(await names({ [kind.field]: { notIn: [[kind.one], both] } })).toEqual(['r2']);
  });

  test('eq on the whole array agrees', async () => {
    expect(await marked()).toEqual(['r1']);
  });

  test('a transaction applies the same conversion', async () => {
    await client.$transaction([
      (client.db as unknown as Record<string, { deleteMany: (a: unknown) => never }>)[kind.model]!.deleteMany({
        where: { [kind.field]: { notIn: [[kind.one]] } },
      }),
    ]);
    expect(await names({})).toEqual(['r1']);
  });

  test('a member create would refuse is still refused and nothing is deleted', async () => {
    const bad = kind.bad;
    await refuses(
      () => model().deleteMany({ where: loose({ NOT: { [kind.field]: { in: [[bad]] } } }) }),
      new RegExp(kind.field),
    );
    expect(await names({})).toEqual(['r1', 'r2', 'r3']);
  });
});
