/**
 * Operand values per field kind: the forms a caller can send (Cerial wrapper, SDK class, string form,
 * short date, upper-case uuid) and the malformed ones. Not split into good and bad: create decides.
 */

import { Decimal, Duration, GeometryPoint, RecordId, StringRecordId, Uuid } from 'surrealdb';
import { CerialBytes } from '../../../../src/utils/cerial-bytes';
import { CerialDecimal } from '../../../../src/utils/cerial-decimal';
import { CerialDuration } from '../../../../src/utils/cerial-duration';
import { CerialPoint } from '../../../../src/utils/cerial-geometry';
import { CerialId } from '../../../../src/utils/cerial-id';
import { CerialUuid } from '../../../../src/utils/cerial-uuid';

export const U0 = '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d';

const point = (x: number, y: number) => ({ type: 'Point', coordinates: [x, y] });
const line = {
  type: 'LineString',
  coordinates: [
    [0, 0],
    [1, 1],
  ],
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
const collection = { type: 'GeometryCollection', geometries: [point(5, 5), line] };

const geometry: unknown[] = [
  [1, 1],
  point(1, 1),
  line,
  polygon,
  collection,
  new CerialPoint([1, 1]),
  new GeometryPoint([1, 1]),
  { foo: 1 },
  [],
  [1, 2, 3],
  ['a', 'b'],
  [point(1, 1)],
  [
    [1, 1],
    [2, 2],
  ],
  { type: 'Point', coordinates: ['1', '1'] },
  { type: 'Point', coordinates: [1, 1], extra: 1 },
  { type: 'point', coordinates: [1, 1] },
  'x',
  5,
  true,
];

/** Keyed by SchemaFieldType, so object sub-fields and tuple elements draw on the same lists */
export const CORPUS: Record<string, unknown[]> = {
  string: ['a', '', 1, true, {}, [], ['a']],
  email: ['a@b.co', 'notmail', '', 5],
  int: [1, 0, -1, 1.5, '1', true, 1e20, 2 ** 53, {}, [1]],
  float: [1.5, 1, '1.5', true, NaN, Infinity, {}],
  number: [2, 1.5, '1', true, {}],
  bool: [true, false, 'true', 1, 0],
  date: [
    new Date(0),
    '2021-01-01T00:00:00.000Z',
    '2021-01-01',
    '2021',
    1609459200000,
    'garbage',
    '',
    {},
    [],
    '2021-01-01T00:00:00+05:00',
    ' 2021-01-01',
    new Date('nope'),
    true,
  ],
  uuid: [
    U0,
    U0.toUpperCase(),
    U0.replace(/-/g, ''),
    `{${U0}}`,
    `urn:uuid:${U0}`,
    new Uuid(U0),
    new CerialUuid(U0),
    'nope',
    5,
    {},
    '',
  ],
  duration: [
    '1h',
    '60m',
    '4h60m',
    '1h0m',
    'garbage',
    5,
    '',
    '1H',
    '-1h',
    ' 1h',
    '1.5h',
    '1h1h',
    new Duration('1h'),
    new CerialDuration('1h'),
  ],
  decimal: [
    '1.5',
    1.5,
    '1.50',
    '1e2',
    'abc',
    '',
    ' 1.5',
    '0x10',
    true,
    'Infinity',
    'NaN',
    '+1.5',
    '.5',
    '1.',
    '1e400',
    new Decimal('1.5'),
    new CerialDecimal('1.5'),
  ],
  int8: [5, 200, -129, '5', 1.5, -128],
  uint8: [5, -1, 256, '5', 1.5],
  int16: [5, 40000, '5'],
  uint16: [5, -1, 70000],
  int32: [5, 2 ** 31, '5'],
  uint32: [5, -1, 2 ** 32],
  uint64: [5, -1, '5', 1.5, 2 ** 64, 5n, 2 ** 53],
  float16: [0.1, 70000, '1', 65504, 1e-8],
  float32: [0.1, 1e39, '1'],
  bytes: [
    'AQI=',
    'AQI',
    'not base64!!',
    '',
    5,
    [1, 2],
    {},
    'AQ==',
    new Uint8Array([1, 2]),
    CerialBytes.fromBase64('AQI='),
  ],
  geometry,
  // A Record inside an object: no relation names its table, so the value carries it
  record: [
    'victim:v',
    'victim:w',
    'v',
    5,
    {},
    new RecordId('victim', 'v'),
    new StringRecordId('victim:v'),
    CerialId.parse('victim:v'),
  ],
  any: [1, '1', '2021-01-01T00:00:00.000Z', { a: 1 }, [1, 2], true, 'x'],
};

/** Keyed by the literal or enum name in the schema */
export const LITERAL_CORPUS: Record<string, unknown[]> = {
  Tier: ['LOW', 'low', 'MID', 1, '', {}],
  Status: ['active', 'nope', 1],
  Prio: [1, 2, '1', 4],
  Mixed: ['low', 1, true, '1', 'true', 2.5, 3],
  Broad: ['x', 1, 1.5, true, new Date(0)],
  Moment: [new Date(0), '2021-01-01T00:00:00.000Z', 'x', true, 1],
  Ratio: [0.5, 1, '0.5', 2.5],
  Shape: ['none', 'nope', [1, 'a'], { n: 1, s: 'a' }, { n: 'x' }, [1], { foo: 1 }],
};

/** Whole tuple values for a tuple field, in the array form a filter can compare */
export const WHOLE_TUPLE: unknown[] = [
  { 0: 1 },
  { 1: '2021-01-01T00:00:00.000Z' },
  {},
  [1, [2]],
  [1, 5],
  [1, '2021-01-01T00:00:00.000Z'],
  [1, new Date(0)],
  [1],
  [],
  ['x', 'y'],
  [1, 'nope'],
  [1, '2021-01-01T00:00:00.000Z', 3],
  5,
  'x',
  true,
];

const D = '2021-01-01T00:00:00.000Z';

/** Whole tuples that nest an object or tuple, well formed and not: the element is the wrong shape, short or long */
export const NESTED_WHOLE: Record<string, unknown[]> = {
  deepT: [
    [1, { t: [1, '1h'], fDec: '1.5' }],
    [1, 5],
    [1, 'x'],
    [1, { t: 5, fDec: '1.5' }],
    [1, { t: [1], fDec: '1.5' }],
    [1, { t: [1, '1h', 3], fDec: '1.5' }],
    [1, { t: [1, [2]], fDec: '1.5' }],
    [1, { t: [1, 'nope'], fDec: '1.5' }],
    [1, { t: [1, '1h'], fDec: 'abc' }],
    [1, { t: [1, '1h'], fDec: '1.5', extra: 1 }],
  ],
  boxT: [
    [1, { fUuid: U0, fDur: '1h' }],
    [1, 5],
    [1, { fUuid: 5, fDur: '1h' }],
    [1, { fUuid: U0, fDur: 'nope' }],
    [1, { fUuid: U0, fDur: '1h', extra: 1 }],
    [1, [U0, '1h']],
  ],
  objTup: [
    [D, { fInt: 1 }],
    [D, {}],
    [D, 5],
    [D, { fInt: 'x' }],
    [D, { fInt: 1, extra: 1 }],
    ['nope', { fInt: 1 }],
    [D, [1]],
  ],
};

/** Whole values for an object field: only a non-plain value is compared whole, a plain object holds sub-filters */
export const WHOLE_OBJECT: unknown[] = [5, 'x', true, [1], []];

/** Whole values for an array of objects: elements that leave out required sub-fields, which nothing fills in */
export const WHOLE_OBJECT_ARRAY: unknown[] = [[{}], [{ fInt: 1 }], [{ fInt: 1, extra: 1 }], [{}, {}], [5]];

/** Record ids of one table, as each id type reads them */
export function idCorpus(key: string, table: string): unknown[] {
  const foreign = new RecordId('other', 'k1');
  switch (key) {
    case 'Int':
      return [
        5,
        '5',
        `${table}:5`,
        'abc',
        1.5,
        true,
        -1,
        new RecordId(table, 5),
        foreign,
        new StringRecordId(`${table}:5`),
        new StringRecordId('other:5'),
        new CerialId(5),
        ['a'],
      ];
    case 'Uuid':
      return [
        U0,
        U0.toUpperCase(),
        `${table}:⟨${U0}⟩`,
        'nope',
        5,
        new Uuid(U0),
        new CerialUuid(U0),
        new RecordId(table, new Uuid(U0)),
        new RecordId(table, U0),
        foreign,
        new StringRecordId(`${table}:⟨${U0}⟩`),
        ['k'],
      ];
    case 'Str':
      return [
        'k1',
        '5',
        `${table}:k1`,
        5,
        true,
        new RecordId(table, 'k1'),
        foreign,
        new StringRecordId(`${table}:k1`),
        ['k'],
      ];
    case 'Union':
      return ['k1', '5', 5, `${table}:5`, 1.5, true, new RecordId(table, 5), new StringRecordId(`${table}:5`), ['k']];
    case 'UuidInt':
      return [
        U0,
        5,
        '5',
        'nope',
        1.5,
        true,
        new Uuid(U0),
        new RecordId(table, new Uuid(U0)),
        new StringRecordId(`${table}:5`),
      ];
    case 'Tuple':
      return [
        [1, '2021-01-01T00:00:00.000Z'],
        [1, new Date(0)],
        ['x', 'y'],
        [1],
        'k',
        new RecordId(table, [1, new Date(0)]),
        foreign,
      ];
    case 'Object':
      return [
        { service: 'a', stamp: 1 },
        { service: 1, stamp: 1 },
        { service: 'a' },
        'k',
        new RecordId(table, { service: 'a', stamp: 1 }),
        foreign,
      ];
    default:
      return [
        'k1',
        5,
        `${table}:k1`,
        'other:k1',
        true,
        '',
        new CerialId('k1'),
        new RecordId(table, 'k1'),
        foreign,
        new StringRecordId(`${table}:k1`),
        new StringRecordId('other:k1'),
        ['a', 'b'],
        { a: 1 },
        1.5,
      ];
  }
}
