/**
 * Unit Tests: a fragment in a value position
 *
 * A `sql` fragment is only meaningful as the `$raw` where key. Anywhere else it would bind as an opaque
 * object and match nothing or store garbage, so every non-`$raw` where value and every create and update
 * body refuses it, naming the path. The same shapes with plain values must keep working.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../../src/errors';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../../src/generators/metadata/registry-generator';
import { parse } from '../../../../src/parser/parser';
import { sql } from '../../../../src/query';
import { compileCreate, compileUpdateMany, compileUpdateUnique, compileUpsert } from '../../../../src/query/builder';
import { refuseFragmentInValue, validateWhere } from '../../../../src/query/validators';
import type { WhereClause } from '../../../../src/types';

const schema = `
object Addr {
  city String
}

tuple Coord {
  lat Float,
  lng Float
}

model Doc {
  id Record @id
  name String
  tags String[]
  meta Any
  addr Addr
  free Addr @flexible
  loc Coord
  places Addr[]
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));
const registry = createRegistry(models);
const doc = registry.Doc!;

const f = sql`x`;
const where = (value: unknown): WhereClause => value as WhereClause;
const check = (w: unknown): void => {
  validateWhere(where(w), doc, registry);
};

const whereShapes: Array<[string, unknown, string]> = [
  ['a bare field value', { name: f }, 'where.name'],
  ['an operator value', { name: { eq: f } }, 'where.name.eq'],
  ['an in array', { name: { in: ['a', f] } }, 'where.name.in[1]'],
  ['an object sub-field', { addr: { city: f } }, 'where.addr.city'],
  ['an object sub-field operator', { addr: { city: { eq: f } } }, 'where.addr.city.eq'],
  ['a tuple element by name', { loc: { lat: f } }, 'where.loc.lat'],
  ['a tuple element by index', { loc: { 0: { gt: f } } }, 'where.loc.0.gt'],
  ['a flexible sub-key', { free: { anything: f } }, 'where.free.anything'],
  ['a flexible sub-key named $raw', { free: { $raw: f } }, 'where.free.$raw'],
  ['an array object quantifier', { places: { some: { city: f } } }, 'where.places.some.city'],
  ['an Any value', { meta: { eq: { deep: [f] } } }, 'where.meta.eq.deep[0]'],
  ['under AND', { AND: [{ name: 'a' }, { name: f }] }, 'where.AND[1].name'],
  ['under OR', { OR: [{ name: f }] }, 'where.OR[0].name'],
  ['under NOT', { NOT: { name: f } }, 'where.NOT.name'],
  ['three levels down', { OR: [{ AND: [{ NOT: { addr: { city: f } } }] }] }, 'where.OR[0].AND[0].NOT.addr.city'],
];

describe('a fragment in a where value refuses (negative first)', () => {
  test.each(whereShapes)('%s', (_label, w, path) => {
    expect(() => check(w)).toThrow(CerialValidationError);
    expect(() => check(w)).toThrow(path);
  });

  test('the error names the model and the path', () => {
    try {
      check({ name: f });
    } catch (error) {
      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).model).toBe('Doc');
      expect((error as CerialValidationError).field).toBe('where.name');
    }
    expect.assertions(3);
  });
});

describe('the same shapes with plain values still validate', () => {
  const plain: Array<[string, unknown]> = [
    ['a bare field value', { name: 'a' }],
    ['an operator value', { name: { eq: 'a' } }],
    ['an in array', { name: { in: ['a', 'b'] } }],
    ['an object sub-field', { addr: { city: 'x' } }],
    ['a tuple element', { loc: { lat: { gt: 1 } } }],
    ['a flexible sub-key', { free: { anything: 'x' } }],
    ['a flexible sub-key named $raw with a plain value', { free: { $raw: 'x' } }],
    ['an Any value', { meta: { eq: { deep: [1, 'a'] } } }],
    ['$raw itself, at depth', { OR: [{ name: 'a' }, { $raw: f }], $raw: sql`true` }],
    ['a Date and a wrapper-free value', { name: { eq: 'a' }, AND: [{ name: { not: 'b' } }] }],
  ];

  test.each(plain)('%s', (_label, w) => {
    expect(() => check(w)).not.toThrow();
    expect(validateWhere(where(w), doc, registry).valid).toBe(true);
  });
});

describe('refuseFragmentInValue', () => {
  test('stops at class instances', () => {
    class Opaque {
      constructor(readonly inner: unknown) {}
    }

    expect(() => refuseFragmentInValue({ at: new Date(), x: new Opaque(f) }, 'data')).not.toThrow();
  });

  test('survives a cyclic plain object', () => {
    const loop: Record<string, unknown> = { a: 1 };
    loop.self = loop;

    expect(() => refuseFragmentInValue(loop, 'data')).not.toThrow();
  });

  test('names an array index and a nested key', () => {
    expect(() => refuseFragmentInValue({ list: [{ k: f }] }, 'data')).toThrow('data.list[0].k');
  });
});

const dataShapes: Array<[string, unknown, string]> = [
  ['a plain field', { name: f }, 'data.name'],
  ['an Any field', { meta: { nested: [f] } }, 'data.meta.nested[0]'],
  ['an array element', { tags: ['a', f] }, 'data.tags[1]'],
  ['an object sub-field', { addr: { city: f } }, 'data.addr.city'],
  ['a tuple element', { loc: [1, f] }, 'data.loc[1]'],
  ['a nested array of objects', { places: [{ city: f }] }, 'data.places[0].city'],
  ['a push', { tags: { push: f } }, 'data.tags.push'],
  ['a set', { tags: { set: [f] } }, 'data.tags.set[0]'],
  [
    'an updateWhere',
    { places: { updateWhere: { where: { city: 'a' }, data: { city: f } } } },
    'data.places.updateWhere',
  ],
];

const base = { name: 'n', tags: [], meta: 1, addr: { city: 'c' }, free: { city: 'c' }, loc: [1, 2], places: [] };

describe('a fragment in create and update data refuses (negative first)', () => {
  test.each(dataShapes)('create: %s', (_label, data, path) => {
    expect(() => compileCreate(doc, { data: { ...base, ...(data as object) } }, registry)).toThrow(path);
  });

  test.each(dataShapes)('updateMany: %s', (_label, data, path) => {
    expect(() => compileUpdateMany(doc, { where: { name: 'n' }, data: data as never }, registry)).toThrow(path);
  });

  test.each(dataShapes)('updateUnique: %s', (_label, data, path) => {
    expect(() =>
      compileUpdateUnique(doc, { where: { id: 'a' }, data: data as Record<string, unknown> }, registry),
    ).toThrow(path);
  });

  test.each(dataShapes)('upsert create: %s', (_label, data, path) => {
    expect(() =>
      compileUpsert(doc, { where: { id: 'a' }, create: { ...base, ...(data as object) } }, registry),
    ).toThrow(path.replace('data.', 'create.'));
  });

  test.each(dataShapes)('upsert update: %s', (_label, data, path) => {
    expect(() =>
      compileUpsert(doc, { where: { id: 'a' }, create: base, update: data as Record<string, unknown> }, registry),
    ).toThrow(path.replace('data.', 'update.'));
  });
});

describe('plain data still compiles', () => {
  test('create, updateMany, updateUnique and upsert', () => {
    expect(() => compileCreate(doc, { data: base }, registry)).not.toThrow();
    expect(() =>
      compileUpdateMany(doc, { where: { name: 'n' }, data: { tags: { push: 'a' } } }, registry),
    ).not.toThrow();
    expect(() => compileUpdateUnique(doc, { where: { id: 'a' }, data: { name: 'm' } }, registry)).not.toThrow();
    expect(() =>
      compileUpsert(doc, { where: { id: 'a' }, create: base, update: { name: 'm' } }, registry),
    ).not.toThrow();
  });
});
