/**
 * Unit Tests: a where operand is held to the rules create applies to the same field
 *
 * For every field kind, the values create refuses are refused by where too, naming the field, at the top
 * level and inside a relation sub-filter; the values create accepts bind exactly as create converts them.
 */

import { describe, expect, test } from 'bun:test';
import { Geometry, Uuid } from 'surrealdb';
import {
  convertEnums,
  convertLiterals,
  convertModels,
  createLiteralRegistry,
  convertObjects,
  convertTuples,
  inferFKTypes,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { transformData, transformValue } from '../../../src/query/transformers';
import { validateCreateData } from '../../../src/query/validators/data-validator';
import { validateWhere } from '../../../src/query/validators';
import type { SchemaFieldType, WhereClause } from '../../../src/types';
import { CerialGeometry, CerialPoint } from '../../../src/utils/cerial-geometry';
import { CerialUuid } from '../../../src/utils/cerial-uuid';

const schema = `
enum Tier { LOW, HIGH }

literal Mixed { 'a', 1, true }

literal DateOrFlag { Date, Bool }

literal DateOrText { Date, String }

literal DateOrTag { Date, 'tag' }

object Inner {
  n Int
  when Date
  du Duration
  pt Geometry @point
}

object SelfNode {
  n Int
  when Date
  child SelfNode?
}

object WithPair {
  p Pair
  ps Pair[]
}

object SetBag {
  tags Int[] @set
}

tuple Pair {
  Int,
  Date
}

model Owner {
  id Record @id
  str String
  mail Email
  int Int
  flt Float
  num Number
  bool Bool
  date Date
  uuid Uuid
  du Duration
  dec Decimal
  i8 Int8
  u8 Uint8
  i16 Int16
  u16 Uint16
  i32 Int32
  u32 Uint32
  u64 Uint64
  f16 Float16
  f32 Float32
  bytes Bytes
  pt Geometry @point
  poly Geometry @polygon
  anyGeo Geometry
  multi Geometry @point @line
  tier Tier
  mixed Mixed
  inner Inner
  bag SetBag
  chain SelfNode
  holder WithPair
  ld DateOrFlag
  ldText DateOrText
  ldTag DateOrTag
  oInt Int?
  oStr String?
  pair Pair
  nInt Int? @nullable
  nDate Date? @nullable
  nGeo Geometry? @point @nullable
  ints Int[]
  dates Date[]
  strs String[]
  dus Duration[]
  uuids Uuid[]
  decs Decimal[]
  bytess Bytes[]
  pts Geometry[] @point
  pairs Pair[]
  sets Int[] @set
  strSets String[] @set
  places Relation[] @model(Place)
}

model Place {
  id Record @id
  ownerId Record
  owner Relation @field(ownerId) @model(Owner)
}

model UuidOwner {
  id Record(uuid) @id
  n Int
  kids Relation[] @model(UuidKid)
}

model UuidKid {
  id Record @id
  parentId Record
  parent Relation @field(parentId) @model(UuidOwner)
}

model IntOwner {
  id Record(int) @id
  n Int
}

model StringOwner {
  id Record(string) @id
  n Int
}

model UnionOwner {
  id Record(string, int) @id
  n Int
}

model UuidIntOwner {
  id Record(int, uuid) @id
  n Int
}

model TupleIdOwner {
  id Record(Pair) @id
  n Int
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
const literals = createLiteralRegistry([...convertLiterals(ast.literals), ...convertEnums(ast.enums)]);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples), literals);
const registry = createRegistry(models);
inferFKTypes(models, registry);
const owner = registry.Owner!;
const place = registry.Place!;
const uuidOwner = registry.UuidOwner!;
const uuidKid = registry.UuidKid!;

const w = (value: unknown): WhereClause => value as WhereClause;
const errorsAt = (model: typeof owner, where: unknown): string[] =>
  validateWhere(w(where), model, registry).errors.map((e) => e.message);
const varsFor = (model: typeof owner, where: unknown): unknown[] =>
  Object.values(buildConditions(createCompileContext(), w(where), model, registry).vars);
const textFor = (model: typeof owner, where: unknown): string =>
  buildConditions(createCompileContext(), w(where), model, registry).text;
const varsOf = (where: unknown): unknown[] => varsFor(owner, where);

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

interface Kind {
  field: string;
  type: SchemaFieldType;
  bad: unknown[];
  good: unknown[];
}

const scalars: Kind[] = [
  { field: 'str', type: 'string', bad: [1, true, {}, ['a']], good: ['a'] },
  { field: 'int', type: 'int', bad: ['1', 1.5, true, {}], good: [1] },
  { field: 'flt', type: 'float', bad: ['1', true, {}], good: [1.5] },
  { field: 'num', type: 'number', bad: ['1', true, {}], good: [2] },
  { field: 'bool', type: 'bool', bad: ['true', 1, {}], good: [true] },
  { field: 'date', type: 'date', bad: ['not a date', 5, true], good: [new Date(0), '2024-01-02T00:00:00Z'] },
  { field: 'uuid', type: 'uuid', bad: ['nope', 5, {}], good: ['0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d'] },
  { field: 'du', type: 'duration', bad: ['nope', 5, {}], good: ['1h'] },
  { field: 'dec', type: 'decimal', bad: ['abc', true, {}], good: ['1.5', 2] },
  { field: 'i8', type: 'int8', bad: [200, '1', 1.5], good: [5] },
  { field: 'u8', type: 'uint8', bad: [-1, 256, '1'], good: [5] },
  { field: 'i16', type: 'int16', bad: [40000, '1'], good: [5] },
  { field: 'u16', type: 'uint16', bad: [-1, 70000], good: [5] },
  { field: 'i32', type: 'int32', bad: [2 ** 31, '1'], good: [5] },
  { field: 'u32', type: 'uint32', bad: [-1, 2 ** 32], good: [5] },
  { field: 'u64', type: 'uint64', bad: [-1, '1'], good: [5] },
  { field: 'f16', type: 'float16', bad: [70000, '1'], good: [0.1] },
  { field: 'f32', type: 'float32', bad: [1e39, '1'], good: [0.1] },
  { field: 'bytes', type: 'bytes', bad: [5, {}], good: [new Uint8Array([1]), 'AQI='] },
  { field: 'nInt', type: 'int', bad: ['1'], good: [1, null] },
  { field: 'nDate', type: 'date', bad: ['nope'], good: [new Date(0), null] },
  { field: 'mixed', type: 'literal', bad: ['b', 2, {}], good: ['a', 1, true] },
  { field: 'tier', type: 'literal', bad: ['MID', 3], good: ['LOW'] },
  { field: 'inner.n', type: 'int', bad: ['1'], good: [1] },
  { field: 'inner.when', type: 'date', bad: ['nope'], good: ['2024-01-02T00:00:00Z'] },
  { field: 'inner.du', type: 'duration', bad: ['nope'], good: ['1h'] },
  { field: 'inner.pt', type: 'geometry', bad: [{ foo: 1 }, [], [1, 2, 3], line], good: [[1, 1], point(1, 1)] },
];

const geometries: Kind[] = [
  {
    field: 'pt',
    type: 'geometry',
    bad: [{ foo: 1 }, [], [1, 2, 3], [point(1, 1)], line, polygon, 'x', 5, true],
    good: [[1, 1], point(1, 1), new CerialPoint([1, 1])],
  },
  { field: 'poly', type: 'geometry', bad: [[1, 1], point(1, 1), line, { foo: 1 }], good: [polygon] },
  { field: 'anyGeo', type: 'geometry', bad: [{ foo: 1 }, [], [1, 2, 3], 'x'], good: [[1, 1], line, polygon] },
  { field: 'multi', type: 'geometry', bad: [polygon, { foo: 1 }], good: [point(1, 1), line, [1, 1]] },
  { field: 'nGeo', type: 'geometry', bad: [{ foo: 1 }, line], good: [[1, 1], null] },
];

// Where rounds floats the way the server stores them and binds a u64 as the SDK class, which create leaves to the server
const CONVERTED_BY_WHERE: SchemaFieldType[] = ['float16', 'float32', 'uint64'];

const nameOf = (field: string): string => field;
const wrap = (field: string, filter: unknown): Record<string, unknown> => {
  const [head, sub] = field.split('.');

  return sub ? { [head!]: { [sub]: filter } } : { [head!]: filter };
};
const viaRelation = (field: string, filter: unknown): Record<string, unknown> => ({ owner: wrap(field, filter) });

const create = (value: unknown, type: SchemaFieldType): unknown =>
  type === 'geometry'
    ? CerialGeometry.is(value)
      ? value.toNative()
      : value instanceof Geometry
        ? value
        : CerialGeometry.from(value as [number, number]).toNative()
    : transformValue(value, type);

describe('where refuses what create refuses, naming the field', () => {
  describe.each([...scalars, ...geometries])('$field', ({ field, bad }) => {
    const values = bad.map((v) => [typeof v === 'object' ? JSON.stringify(v) : String(v), v] as const);

    test.each(values)('eq/neq refuse %s', (_label, value) => {
      for (const op of ['eq', 'neq']) {
        const msgs = errorsAt(owner, wrap(field, { [op]: value }));
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain(nameOf(field));
      }
    });

    test.each(values)('in/notIn refuse a list holding %s', (_label, value) => {
      for (const op of ['in', 'notIn']) {
        const msgs = errorsAt(owner, wrap(field, { [op]: [value] }));
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain(nameOf(field));
      }
    });

    test.each(values)('a relation sub-filter refuses %s', (_label, value) => {
      for (const filter of [{ eq: value }, { neq: value }, { in: [value] }, { notIn: [value] }]) {
        const msgs = errorsAt(place, viaRelation(field, filter));
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain(nameOf(field));
      }
    });
  });
});

describe('where converts what create accepts, the way create converts it', () => {
  describe.each([...scalars, ...geometries])('$field', ({ field, type, good }) => {
    test.each(good.map((v, i) => [i, v] as const))('operand %#', (_i, value) => {
      const same = (bound: unknown): void => {
        expect(JSON.stringify(bound)).toEqual(JSON.stringify(create(value, type)));
      };

      for (const op of ['eq', 'neq']) {
        expect(errorsAt(owner, wrap(field, { [op]: value }))).toEqual([]);
        if (!field.includes('.') && value !== null && !CONVERTED_BY_WHERE.includes(type))
          same(varsOf(wrap(field, { [op]: value }))[0]);
      }
      // A bool takes no list operator, as its generated Where type shows
      for (const op of type === 'bool' ? [] : ['in', 'notIn']) {
        expect(errorsAt(owner, wrap(field, { [op]: [value] }))).toEqual([]);
        if (!field.includes('.') && value !== null && !CONVERTED_BY_WHERE.includes(type))
          same((varsOf(wrap(field, { [op]: [value] }))[0] as unknown[])[0]);
      }
      expect(errorsAt(place, viaRelation(field, { eq: value }))).toEqual([]);
    });
  });
});

const arrays: Kind[] = [
  { field: 'ints', type: 'int', bad: ['1', 1.5], good: [1] },
  { field: 'dates', type: 'date', bad: ['nope', 5], good: ['2024-01-02T00:00:00Z'] },
  { field: 'strs', type: 'string', bad: [1], good: ['a'] },
  { field: 'dus', type: 'duration', bad: ['nope'], good: ['1h'] },
  { field: 'uuids', type: 'uuid', bad: ['nope'], good: ['0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d'] },
  { field: 'decs', type: 'decimal', bad: ['abc'], good: ['1.5'] },
  { field: 'bytess', type: 'bytes', bad: [5], good: ['AQI='] },
  { field: 'pts', type: 'geometry', bad: [{ foo: 1 }, [], [1, 2, 3], line], good: [[1, 1], point(1, 1)] },
];

describe('array fields hold each element to the element rules', () => {
  describe.each(arrays)('$field', ({ field, type, bad, good }) => {
    test.each(bad.map((v, i) => [i, v] as const))('refuses bad element %#', (_i, value) => {
      for (const filter of [
        { has: value },
        { hasAll: [value] },
        { hasAny: [value] },
        { eq: [value] },
        { neq: [value] },
      ]) {
        const msgs = errorsAt(owner, { [field]: filter });
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain(field);
        expect(errorsAt(place, viaRelation(field, filter)).length).toBe(1);
      }
    });

    test.each(good.map((v, i) => [i, v] as const))('accepts and converts good element %#', (_i, value) => {
      for (const filter of [
        { has: value },
        { hasAll: [value] },
        { hasAny: [value] },
        { eq: [value] },
        { neq: [value] },
      ]) {
        expect(errorsAt(owner, { [field]: filter })).toEqual([]);
        expect(errorsAt(place, viaRelation(field, filter))).toEqual([]);
      }
      const bound = varsOf({ [field]: { has: value } })[0];
      expect(JSON.stringify(bound)).toEqual(JSON.stringify(create(value, type)));
    });

    test('refuses a non-array eq', () => {
      expect(errorsAt(owner, { [field]: { eq: good[0] } }).length).toBe(1);
    });
  });
});

describe('tuple elements', () => {
  test('refuse a mistyped element and accept a valid one', () => {
    expect(errorsAt(owner, { pair: { 0: 'x' } }).join()).toContain('pair');
    expect(errorsAt(owner, { pair: { 1: 'nope' } }).join()).toContain('pair');
    expect(errorsAt(owner, { pair: { 0: 1, 1: '2024-01-02T00:00:00Z' } })).toEqual([]);
  });
});

describe('geometry list operators take a list of valid geometries only', () => {
  test('a valid list passes and a list with one bad member is refused', () => {
    expect(errorsAt(owner, { pt: { in: [[1, 1], point(2, 2)] } })).toEqual([]);
    expect(errorsAt(owner, { pt: { notIn: [[1, 1], { foo: 1 }] } }).length).toBe(1);
    expect(
      errorsAt(owner, {
        pt: {
          notIn: [
            [
              [1, 1],
              [2, 2],
            ],
          ],
        },
      }).length,
    ).toBe(1);
    expect(
      errorsAt(owner, {
        pt: {
          neq: [
            [1, 1],
            [2, 2],
          ],
        },
      }).length,
    ).toBe(1);
  });
});

describe('a whole value compared to an object or tuple field is checked like create checks it', () => {
  const badInner = [5, 'x', true, [1], []];
  const badPair = [
    5,
    'x',
    true,
    [],
    [1],
    [{ foo: 1 }, 'garbage', 5],
    ['1', '2024-01-02T00:00:00Z'],
    [1, 'nope'],
    [1, '2024-01-02T00:00:00Z', 3],
  ];
  const label = (v: unknown): string => JSON.stringify(v);

  test.each(badInner.map((v) => [label(v), v] as const))('object field refuses %s', (_l, value) => {
    for (const where of [{ inner: value }, { NOT: { inner: value } }]) {
      const msgs = errorsAt(owner, where);
      expect(msgs.length).toBe(1);
      expect(msgs[0]).toContain('inner');
    }
    expect(errorsAt(place, viaRelation('inner', value)).length).toBe(1);
  });

  test.each(badPair.map((v) => [label(v), v] as const))('tuple field refuses %s', (_l, value) => {
    for (const where of [{ pair: value }, { NOT: { pair: value } }, { OR: [{ pair: value }] }]) {
      const msgs = errorsAt(owner, where);
      expect(msgs.length).toBe(1);
      expect(msgs[0]).toContain('pair');
    }
    expect(errorsAt(place, viaRelation('pair', value)).length).toBe(1);
    expect(errorsAt(place, { owner: { NOT: { pair: value } } }).length).toBe(1);
  });

  test('an array of tuples refuses a bad member and a non-array', () => {
    expect(errorsAt(owner, { pairs: [[1, '2024-01-02T00:00:00Z'], [1]] }).length).toBe(1);
    expect(errorsAt(owner, { pairs: 5 }).length).toBe(1);
    expect(errorsAt(owner, { pairs: [[1, '2024-01-02T00:00:00Z']] })).toEqual([]);
  });

  test('a valid tuple in array form is accepted and bound the way create converts it', () => {
    const where = { pair: [1, '2024-01-02T00:00:00Z'] };
    expect(errorsAt(owner, where)).toEqual([]);
    expect(errorsAt(owner, { NOT: where })).toEqual([]);
    expect(errorsAt(place, viaRelation('pair', where.pair))).toEqual([]);
    expect(JSON.stringify(varsOf(where)[0])).toEqual(JSON.stringify([1, new Date('2024-01-02T00:00:00Z')]));
  });

  test('an array of tuples is converted member by member', () => {
    const bound = varsOf({ pairs: [[1, '2024-01-02T00:00:00Z']] })[0] as unknown[][];
    expect(bound[0]![1]).toBeInstanceOf(Date);
  });

  test('null and the structural forms are untouched', () => {
    expect(errorsAt(owner, { pair: { 0: 1 } })).toEqual([]);
    expect(errorsAt(owner, { inner: { n: 1 } })).toEqual([]);
    expect(errorsAt(owner, { inner: { isNone: true } }).join()).not.toContain('must be of type');
  });
});

describe('array fields convert every member of every list operand', () => {
  const cases: Array<[string, SchemaFieldType, unknown]> = [
    ['uuids', 'uuid', '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d'],
    ['dus', 'duration', '1h'],
    ['decs', 'decimal', '1.5'],
    ['dates', 'date', '2024-01-02T00:00:00Z'],
    ['bytess', 'bytes', 'AQI='],
    ['pts', 'geometry', [1, 1]],
  ];

  describe.each(cases)('%s', (field, type, good) => {
    const converted = JSON.stringify([create(good, type)]);

    test.each(['in', 'notIn'])('%s binds each member as a converted list', (op) => {
      const bound = varsOf({ [field]: { [op]: [[good]] } })[0] as unknown[];
      expect(JSON.stringify(bound[0])).toEqual(converted);
    });

    test.each(['eq', 'neq'])('%s binds the whole array converted', (op) => {
      expect(JSON.stringify(varsOf({ [field]: { [op]: [good] } })[0])).toEqual(converted);
    });

    test('a negated list is converted the same way', () => {
      const bound = varsOf({ NOT: { [field]: { notIn: [[good]] } } })[0] as unknown[];
      expect(JSON.stringify(bound[0])).toEqual(converted);
    });

    test('the same holds through a relation sub-filter', () => {
      const bound = Object.values(
        buildConditions(createCompileContext(), w({ owner: { [field]: { notIn: [[good]] } } }), place, registry).vars,
      )[0] as unknown[];
      expect(JSON.stringify(bound[0])).toEqual(converted);
    });
  });

  test('has, hasAll and hasAny still convert', () => {
    const u = '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d';
    expect(JSON.stringify(varsOf({ uuids: { hasAll: [u] } })[0])).toEqual(JSON.stringify([create(u, 'uuid')]));
    expect(JSON.stringify(varsOf({ uuids: { has: u } })[0])).toEqual(JSON.stringify(create(u, 'uuid')));
  });

  test('a member that create would refuse is still refused inside the nested list', () => {
    expect(errorsAt(owner, { uuids: { notIn: [['nope']] } }).length).toBe(1);
    expect(errorsAt(owner, { dus: { in: [['nope']] } }).length).toBe(1);
  });
});

describe('a set field compares as the set create stores', () => {
  test.each(['eq', 'neq', 'not'])('%s casts an array operand to a set', (op) => {
    const text = textFor(owner, { sets: { [op]: [2, 1, 1] } });
    expect(text).toContain('<set>$');
  });

  test('the shorthand and NOT cast it too', () => {
    expect(textFor(owner, { sets: [1, 2] })).toContain('<set>$');
    expect(textFor(owner, { NOT: { sets: [1, 2] } })).toContain('<set>$');
    expect(textFor(owner, { strSets: ['b', 'a'] })).toContain('<set>$');
  });

  test.each(['in', 'notIn'])('%s casts each array member', (op) => {
    const text = textFor(owner, { sets: { [op]: [[1, 2], [3]] } });
    expect(text).toContain('<set>$m');
  });

  test('a relation sub-filter casts it', () => {
    expect(textFor(place, { owner: { sets: { neq: [1, 2] } } })).toContain('<set>$');
  });

  test('a plain array field is not cast, and has/hasAll keep their form', () => {
    expect(textFor(owner, { ints: { eq: [1, 2] } })).not.toContain('<set>');
    expect(textFor(owner, { ints: { in: [[1, 2]] } })).not.toContain('<set>');
    expect(textFor(owner, { sets: { has: 1 } })).not.toContain('<set>');
    expect(textFor(owner, { sets: { hasAll: [1, 2] } })).not.toContain('<set>');
  });

  test('a set sub-field of an object is compared as the plain array it is stored as', () => {
    expect(textFor(owner, { bag: { tags: { eq: [1, 2] } } })).not.toContain('<set>');
    expect(textFor(owner, { bag: { tags: { in: [[1, 2]] } } })).not.toContain('<set>');
  });

  test('only the whole value and each list member are cast, never a lone element', () => {
    expect(textFor(owner, { sets: { eq: [1] } })).toContain('<set>$');
    expect(textFor(owner, { sets: { hasAny: [1] } })).not.toContain('<set>');
  });

  test('a null operand on the required set is refused naming the field, not cast', () => {
    expect(() => textFor(owner, { sets: { eq: null } })).toThrow(/sets/);
  });
});

describe('id operands are converted the way create builds the id', () => {
  const U = '0190c3f8-6c5d-7a3a-9d3a-1e1f2a3b4c5d';
  const idOf = (model: typeof owner, where: unknown): unknown => varsFor(model, where)[0];
  const keyOf = (v: unknown): unknown => (v as { id: unknown }).id;

  test.each([
    ['shorthand', U],
    ['eq', { eq: U }],
    ['neq', { neq: U }],
    ['not', { not: U }],
  ])('a uuid string on a Record(uuid) id binds a Uuid key (%s)', (_op, filter) => {
    expect(keyOf(idOf(uuidOwner, { id: filter }))).toBeInstanceOf(Uuid);
  });

  test('in and notIn bind a Uuid key per member, and NOT does too', () => {
    for (const where of [{ id: { in: [U] } }, { id: { notIn: [U] } }, { NOT: { id: { in: [U] } } }]) {
      const bound = idOf(uuidOwner, where) as unknown[];
      expect(keyOf(bound[0])).toBeInstanceOf(Uuid);
    }
  });

  test('a CerialUuid and an SDK Uuid bind the same key', () => {
    expect(keyOf(idOf(uuidOwner, { id: { neq: new CerialUuid(U) } }))).toBeInstanceOf(Uuid);
    expect(keyOf(idOf(uuidOwner, { id: { neq: new Uuid(U) } }))).toBeInstanceOf(Uuid);
  });

  test('a foreign key to a Record(uuid) id binds a Uuid key too', () => {
    expect(keyOf(idOf(uuidKid, { parentId: { neq: U } }))).toBeInstanceOf(Uuid);
    expect(keyOf(idOf(uuidKid, { parentId: U }))).toBeInstanceOf(Uuid);
    expect(keyOf(idOf(uuidOwner, { kids: { some: { parentId: { neq: U } } } }))).toBeInstanceOf(Uuid);
    expect(keyOf(idOf(uuidKid, { parent: { id: { neq: U } } }))).toBeInstanceOf(Uuid);
  });

  test('a string id stays a string, an int stays an int', () => {
    expect(keyOf(idOf(registry.StringOwner!, { id: { neq: 'k' } }))).toBe('k');
    expect(keyOf(idOf(registry.IntOwner!, { id: { neq: 5 } }))).toBe(5);
    expect(keyOf(idOf(registry.UnionOwner!, { id: { neq: '5' } }))).toBe('5');
    expect(keyOf(idOf(registry.UnionOwner!, { id: { neq: 5 } }))).toBe(5);
  });

  test('a union of int and uuid binds a uuid string as a Uuid and an int as an int', () => {
    expect(keyOf(idOf(registry.UuidIntOwner!, { id: { neq: U } }))).toBeInstanceOf(Uuid);
    expect(keyOf(idOf(registry.UuidIntOwner!, { id: { neq: 5 } }))).toBe(5);
  });

  test('an array where one id is required is refused naming the field', () => {
    for (const model of [uuidOwner, registry.IntOwner!, registry.StringOwner!, registry.UnionOwner!]) {
      for (const where of [
        { id: { neq: ['k'] } },
        { id: ['k'] },
        { id: { eq: [1] } },
        { NOT: { id: { not: ['k'] } } },
      ]) {
        const msgs = errorsAt(model, where);
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain('id');
      }
    }
    expect(errorsAt(uuidKid, { parentId: { neq: ['k'] } }).join()).toContain('parentId');
    expect(errorsAt(uuidOwner, { kids: { some: { parentId: ['k'] } } }).join()).toContain('parentId');
  });

  test('an id operand that is not a uuid is refused on a Record(uuid) id', () => {
    expect(errorsAt(uuidOwner, { id: { neq: 'nope' } }).join()).toContain('id');
    expect(errorsAt(uuidOwner, { id: { notIn: ['nope'] } }).join()).toContain('id');
  });

  test('on a plain or tuple id an array is one array-typed id, and a list is only for in and notIn', () => {
    const single = idOf(registry.TupleIdOwner!, { id: { neq: [1, '2024-01-02T00:00:00Z'] } }) as {
      id: unknown;
    };
    expect(Array.isArray(single.id)).toBe(true);
    const listed = idOf(registry.TupleIdOwner!, { id: { in: [[1, 'a']] } }) as Array<{ id: unknown }>;
    expect(Array.isArray(listed)).toBe(true);
    expect(Array.isArray(listed[0]!.id)).toBe(true);
    const plain = idOf(owner, { id: { neq: ['k'] } }) as { id: unknown };
    expect(plain.id).toEqual(['k']);
  });
});

describe('between is refused on a string, as its generated Where type omits it', () => {
  test.each([
    ['direct', { str: { between: ['a', 'b'] } }],
    ['in NOT', { NOT: { str: { between: ['a', 'b'] } } }],
  ])('%s', (_label, where) => {
    const msgs = errorsAt(owner, where);

    expect(msgs.length).toBe(1);
    expect(msgs[0]).toContain('str');
    expect(msgs[0]).toContain('between');
  });
});

describe('between takes exactly two valid bounds', () => {
  const fields: Array<[string, unknown, unknown]> = [
    ['int', 1, 2],
    ['date', '2024-01-01T00:00:00Z', '2024-12-01T00:00:00Z'],
    ['du', '1h', '2h'],
  ];

  describe.each(fields)('%s', (field, lo, hi) => {
    test.each([[[]], [[lo]], [[lo, hi, hi]]])('refuses %j bounds', (bounds) => {
      for (const where of [
        { [field]: { between: bounds } },
        { NOT: { [field]: { between: bounds } } },
        { OR: [{ [field]: { between: bounds } }] },
      ]) {
        const msgs = errorsAt(owner, where);
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain(field);
        expect(msgs[0]).toContain('two bounds');
      }
      expect(errorsAt(place, viaRelation(field, { between: bounds })).length).toBe(1);
    });

    test('accepts two valid bounds', () => {
      expect(errorsAt(owner, { [field]: { between: [lo, hi] } })).toEqual([]);
      expect(errorsAt(place, viaRelation(field, { between: [lo, hi] }))).toEqual([]);
    });

    test('still refuses a bad bound among two', () => {
      expect(errorsAt(owner, { [field]: { between: [lo, { foo: 1 }] } }).length).toBe(1);
    });
  });

  test('a non-array between is refused', () => {
    expect(errorsAt(owner, { int: { between: 1 } }).length).toBe(1);
  });
});

describe('ordering is refused on array and @set fields', () => {
  const ops = ['gt', 'gte', 'lt', 'lte'];

  describe.each([
    ['ints', [3]],
    ['sets', [3]],
    ['strSets', ['a']],
    ['dates', ['2024-01-01T00:00:00Z']],
  ] as const)('%s', (field, operand) => {
    test.each(ops)('%s is refused naming the field, on every path', (op) => {
      for (const where of [
        { [field]: { [op]: operand } },
        { NOT: { [field]: { [op]: operand } } },
        { OR: [{ [field]: { [op]: operand } }] },
      ]) {
        const msgs = errorsAt(owner, where);
        expect(msgs.length).toBe(1);
        expect(msgs[0]).toContain(field);
        expect(msgs[0]).toContain(op);
      }
      expect(errorsAt(place, viaRelation(field, { [op]: operand })).length).toBe(1);
      expect(() => textFor(owner, { [field]: { [op]: operand } })).toThrow(new RegExp(field));
    });

    test('between is refused', () => {
      expect(errorsAt(owner, { [field]: { between: [operand, operand] } }).join()).toContain('between');
    });
  });

  test('the operators an array field does take stay accepted', () => {
    expect(
      errorsAt(owner, { sets: { eq: [1], neq: [2], in: [[1]], has: 1, hasAll: [1], hasAny: [1], isEmpty: true } }),
    ).toEqual([]);
    expect(errorsAt(owner, { ints: { eq: [1], has: 1 } })).toEqual([]);
  });

  test('a scalar keeps its ordering', () => {
    expect(errorsAt(owner, { int: { gt: 1, between: [1, 2] }, date: { lte: new Date(0) } })).toEqual([]);
  });
});

describe('a null operand on an optional field that is not @nullable is refused', () => {
  test.each([
    ['shorthand', { oInt: null }],
    ['eq', { oInt: { eq: null } }],
    ['neq', { oInt: { neq: null } }],
    ['not', { oInt: { not: null } }],
    ['in', { oInt: { in: [1, null] } }],
    ['notIn', { oStr: { notIn: ['a', null] } }],
    ['NOT', { NOT: { oInt: null } }],
    ['sub-filter', { inner: { n: { eq: null } } }],
  ])('%s', (_label, where) => {
    const msgs = errorsAt(owner, where);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs[0]).toMatch(/oInt|oStr|inner\.n/);
    expect(msgs[0]).toContain('null');
  });

  test('through a relation', () => {
    expect(errorsAt(place, viaRelation('oInt', { eq: null })).length).toBe(1);
  });

  test('the builder refuses it alone', () => {
    expect(() => textFor(owner, { oInt: { eq: null } })).toThrow(/oInt/);
  });

  test('a required field keeps its own message', () => {
    expect(errorsAt(owner, { int: { eq: null } })[0]).toContain('is required and not @nullable');
  });

  test('a @nullable field and isNull / isNone are unaffected', () => {
    expect(errorsAt(owner, { nInt: null })).toEqual([]);
    expect(errorsAt(owner, { nInt: { eq: null, in: [1, null] } })).toEqual([]);
    expect(errorsAt(owner, { oInt: { isNull: true, isNone: true, isDefined: true } })).toEqual([]);
  });
});

describe('a literal with a Date variant converts an ISO string as create does', () => {
  const ISO = '2022-01-01T00:00:00.000Z';
  const createOf = (field: string, value: unknown): unknown => {
    const data = { [field]: value };
    const stored = transformData(data, owner)[field];
    // A value create stores is one it accepted
    expect(validateCreateData({ ...minimalCreate, ...data }, owner).errors.filter((e) => e.field === field)).toEqual(
      [],
    );

    return stored;
  };
  const minimalCreate = {};

  test.each(['ld', 'ldText', 'ldTag'])(
    '%s: create stores a Date for the ISO string unless a String variant takes it',
    (field) => {
      const stored = createOf(field, ISO);
      if (field === 'ldText') expect(stored).toBe(ISO);
      else expect(stored).toEqual(new Date(ISO));
    },
  );

  test('a string variant that equals the value keeps the string', () => {
    expect(createOf('ldTag', 'tag')).toBe('tag');
  });

  test('a Date and a boolean are stored as given', () => {
    expect(createOf('ld', new Date(0))).toEqual(new Date(0));
    expect(createOf('ld', true)).toBe(true);
  });

  test.each(['eq', 'neq', 'not'])('where %s binds the same Date create stores', (op) => {
    const bound = varsOf({ ld: { [op]: ISO } })[0];
    expect(bound).toBeInstanceOf(Date);
    expect((bound as Date).toISOString()).toBe(ISO);
  });

  test('NOT and a list convert too, and a String variant leaves the string alone', () => {
    expect(varsOf({ NOT: { ld: ISO } })[0]).toBeInstanceOf(Date);
    expect((varsOf({ ld: { in: [ISO] } })[0] as unknown[])[0]).toBeInstanceOf(Date);
    expect(varsOf({ ldText: ISO })[0]).toBe(ISO);
  });

  test('a string that is neither a date nor a variant is refused by create and where', () => {
    expect(errorsAt(owner, { ld: 'nope' }).length).toBe(1);
    expect(validateCreateData({ ld: 'nope' }, owner).errors.filter((e) => e.field === 'ld').length).toBe(1);
  });
});

describe('between bounds are never null', () => {
  test.each([
    ['int', { between: [1, null] }],
    ['int', { between: [null, 2] }],
    ['nInt', { between: [1, null] }],
    ['nDate', { between: [new Date(0), null] }],
  ])('%s %j is refused, even on a @nullable field', (field, filter) => {
    for (const where of [{ [field]: filter }, { NOT: { [field]: filter } }]) {
      const msgs = errorsAt(owner, where);
      expect(msgs.length).toBeGreaterThan(0);
      expect(msgs.join()).toContain(field);
    }
  });

  test('the builder refuses it alone', () => {
    expect(() => textFor(owner, { NOT: { int: { between: [1, null] } } })).toThrow(/int/);
  });
});

describe('key paths through self-referencing objects and nested tuples are resolved as create resolves them', () => {
  const DATE = '2021-01-01T00:00:00.000Z';

  test.each([1, 2, 5])('a self-referencing object is walked %i levels down', (depth) => {
    const nest = (leaf: unknown): unknown => {
      let node: unknown = leaf;
      for (let i = 0; i < depth; i++) node = { child: node };

      return node;
    };
    expect(errorsAt(owner, { chain: nest({ n: 1 }) })).toEqual([]);
    expect(errorsAt(owner, { chain: nest({ n: { gt: 1 } }) })).toEqual([]);
    expect(errorsAt(owner, { NOT: { chain: nest({ n: 1 }) } })).toEqual([]);
    expect(errorsAt(owner, { chain: nest({ nope: 1 }) }).join()).toContain('nope');
    expect(errorsAt(owner, { chain: nest({ n: 'x' }) }).join()).toContain('n');
  });

  test('below the first level the filter holds what create stores there', () => {
    // The database checks nothing under a self-referencing object, so create keeps the string it was given
    const stored = (transformData({ chain: { child: { when: DATE } } }, owner).chain as { child: { when: unknown } })
      .child.when;
    expect(varsOf({ chain: { child: { when: DATE } } })[0]).toEqual(stored);
    expect(errorsAt(owner, { chain: { child: { child: { n: 'x' } } } }).join()).toContain('n');
  });

  test('a tuple held by an object is walked by element', () => {
    expect(errorsAt(owner, { holder: { p: { 0: 1, 1: DATE } } })).toEqual([]);
    expect(errorsAt(owner, { holder: { p: { 0: 'x' } } }).join()).toContain('holder.p.0');
    expect(errorsAt(owner, { holder: { p: { 9: 1 } } }).join()).toContain('holder.p.9');
    expect(errorsAt(owner, { holder: { ps: { some: { 1: DATE } } } })).toEqual([]);
    expect(errorsAt(owner, { holder: { ps: { some: { 0: 'x' } } } }).join()).toContain('holder.ps');
  });

  test('a tuple element inside an object is bound as create converts it', () => {
    const bound = varsOf({ holder: { p: { 1: DATE } } })[0];
    expect(bound).toBeInstanceOf(Date);
    expect(textFor(owner, { holder: { p: { 1: DATE } } })).toContain('holder.p[1]');
    expect(textFor(owner, { holder: { ps: { some: { 1: DATE } } } })).toContain('.any(|$v|');
  });
});
