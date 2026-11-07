/**
 * Unit tests: the exported builders, `compile*` functions and `QueryBuilder` refuse a relation filter or a
 * nested relation operation when no registry is passed, as the where helpers do. Without the registry the
 * target model is unknown, so the filter compiled against the virtual relation field (always NONE) and the
 * nested operation was dropped while the write reported success.
 *
 * Also pins the id path of findUnique (relation filters beside the id are compiled) and the one-row guard
 * (a unique key that is undefined does not name a row).
 */

import { describe, expect, test } from 'bun:test';
import type { Surreal } from 'surrealdb';
import {
  buildDeleteQuery,
  buildDeleteQueryWithReturn,
  buildFindManyQuery,
  buildUpdateManyQuery,
  compileCreate,
  compileDeleteMany,
  compileDeleteUnique,
  compileFindUnique,
  compileUpdateMany,
  compileUpdateUnique,
  QueryBuilderStatic,
} from '../../../src';
import { compileUpsert } from '../../../src/query/builder';
import { hasUniqueKeyInWhere } from '../../../src/query/builders';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { CerialValidationError } from '../../../src/errors';
import { parse } from '../../../src/parser/parser';

const schema = `
model Dept {
  id Record @id
  name String
  emps Relation[] @model(Emp)
}

model Emp {
  id Record @id
  email String @unique
  name String
  deptId Record?
  dept Relation? @field(deptId) @model(Dept)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));
const registry = createRegistry(models);
const emp = registry.Emp!;

const NEEDS_REGISTRY = /a model registry is required to filter on a relation/;
const NESTED_NEEDS_REGISTRY = /nested relation operation on 'dept' needs a model registry/;
const db = {} as Surreal;

const RELATION_WHERES = [
  { NOT: { dept: { name: 'ops' } } },
  { dept: { name: 'ops' } },
  { AND: [{ OR: [{ dept: { name: 'ops' } }] }] },
  { name: 'a', dept: { name: 'ops' } },
];

describe('relation filters need a registry in every exported builder', () => {
  for (const where of RELATION_WHERES) {
    const label = JSON.stringify(where);

    test(`negative: ${label} is refused by the build functions`, () => {
      expect(() => buildDeleteQuery(emp, where as never)).toThrow(NEEDS_REGISTRY);
      expect(() => buildDeleteQueryWithReturn(emp, where as never)).toThrow(NEEDS_REGISTRY);
      expect(() => buildUpdateManyQuery(emp, where as never, { name: 'x' })).toThrow(NEEDS_REGISTRY);
      expect(() => buildFindManyQuery(emp, { where: where as never })).toThrow(NEEDS_REGISTRY);
    });

    test(`negative: ${label} is refused by the compile functions`, () => {
      expect(() => compileDeleteMany(emp, { where: where as never })).toThrow(NEEDS_REGISTRY);
      expect(() => compileUpdateMany(emp, { where: where as never, data: { name: 'x' } })).toThrow(NEEDS_REGISTRY);
      expect(() => compileFindUnique(emp, { where: { id: 'e1', ...where } as never })).toThrow(NEEDS_REGISTRY);
    });

    test(`negative: ${label} is refused by QueryBuilderStatic`, async () => {
      await expect(QueryBuilderStatic.deleteMany(db, emp, { where: where as never })).rejects.toThrow(NEEDS_REGISTRY);
      await expect(
        QueryBuilderStatic.updateMany(db, emp, { where: where as never, data: { name: 'x' } }),
      ).rejects.toThrow(NEEDS_REGISTRY);
      await expect(QueryBuilderStatic.findMany(db, emp, { where: where as never })).rejects.toThrow(NEEDS_REGISTRY);
    });

    test(`positive: ${label} compiles with a registry`, () => {
      expect(() => buildDeleteQuery(emp, where as never, registry)).not.toThrow();
      expect(() => compileDeleteMany(emp, { where: where as never }, registry)).not.toThrow();
    });
  }

  test('positive: a plain field filter still compiles without a registry', () => {
    expect(buildDeleteQuery(emp, { name: 'a' }).text).toContain('name = $name_eq_0');
    expect(() => compileDeleteMany(emp, { where: { name: 'a' } })).not.toThrow();
  });
});

describe('nested relation operations need a registry', () => {
  const createData = { email: 'e@x.io', name: 'a', dept: { connect: 'dept:d1' } };

  test('negative: create', async () => {
    expect(() => compileCreate(emp, { data: createData })).toThrow(NESTED_NEEDS_REGISTRY);
    await expect(QueryBuilderStatic.create(db, emp, { data: createData })).rejects.toThrow(NESTED_NEEDS_REGISTRY);
  });

  test('negative: updateMany and updateUnique, connect and disconnect', async () => {
    const connect = { dept: { connect: 'dept:d1' } };
    const disconnect = { dept: { disconnect: true } };

    expect(() => compileUpdateMany(emp, { where: { name: 'a' }, data: connect })).toThrow(NESTED_NEEDS_REGISTRY);
    expect(() => compileUpdateUnique(emp, { where: { id: 'e1' }, data: disconnect })).toThrow(NESTED_NEEDS_REGISTRY);
    await expect(QueryBuilderStatic.updateMany(db, emp, { where: { name: 'a' }, data: connect })).rejects.toThrow(
      NESTED_NEEDS_REGISTRY,
    );
    await expect(QueryBuilderStatic.updateUnique(db, emp, { where: { id: 'e1' }, data: disconnect })).rejects.toThrow(
      NESTED_NEEDS_REGISTRY,
    );
  });

  test('negative: upsert, in create and in update', () => {
    const where = { email: 'e@x.io' };

    expect(() => compileUpsert(emp, { where, create: createData, update: { name: 'b' } })).toThrow(
      NESTED_NEEDS_REGISTRY,
    );
    expect(() =>
      compileUpsert(emp, {
        where,
        create: { email: 'e@x.io', name: 'a' },
        update: { dept: { connect: 'dept:d1' } },
      }),
    ).toThrow(NESTED_NEEDS_REGISTRY);
  });

  test('positive: the same operations compile with a registry', () => {
    expect(() => compileCreate(emp, { data: createData }, registry)).not.toThrow();
    expect(() =>
      compileUpdateMany(emp, { where: { name: 'a' }, data: { dept: { connect: 'dept:d1' } } }, registry),
    ).not.toThrow();
    expect(() =>
      compileUpsert(emp, { where: { email: 'e@x.io' }, create: createData, update: { name: 'b' } }, registry),
    ).not.toThrow();
  });

  test('positive: a write without a nested operation compiles without a registry', () => {
    expect(() => compileCreate(emp, { data: { email: 'e@x.io', name: 'a' } })).not.toThrow();
    expect(() => compileUpdateMany(emp, { where: { name: 'a' }, data: { name: 'b' } })).not.toThrow();
  });
});

describe('findUnique by id keeps the relation filters beside the id', () => {
  test('positive: the relation filter is compiled against the target, not the virtual field', () => {
    const { text } = compileFindUnique(emp, { where: { id: 'e1', NOT: { dept: { name: 'ops' } } } }, registry).query;

    expect(text).not.toContain('dept = $dept');
    expect(text).toContain('deptId.name');
  });

  test('positive: a positive relation filter is compiled too', () => {
    const { text } = compileFindUnique(emp, { where: { id: 'e1', dept: { name: 'ops' } } }, registry).query;

    expect(text).not.toContain('dept = $dept');
    expect(text).toContain('deptId.name');
  });
});

describe('a unique key that is undefined is a lost value', () => {
  const UNDEFINED_KEY = /where\.email is undefined; pass a value or leave the key out/;
  const lost = { email: undefined, name: 'shared' } as never;

  test('negative: every unique-key method refuses it before any query', () => {
    expect(() => compileFindUnique(emp, { where: lost }, registry)).toThrow(UNDEFINED_KEY);
    expect(() => compileUpdateUnique(emp, { where: lost, data: { name: 'b' } }, registry)).toThrow(UNDEFINED_KEY);
    expect(() => compileDeleteUnique(emp, { where: lost }, registry)).toThrow(UNDEFINED_KEY);
    expect(() =>
      compileFindUnique(emp, { where: { id: 'e1', email: undefined, name: 'shared' } as never }, registry),
    ).toThrow(UNDEFINED_KEY);
  });

  test('negative: upsert refuses it with and without a relation op', () => {
    const create = { email: 'n@x.io', name: 'shared' };

    expect(() => compileUpsert(emp, { where: lost, create, update: { name: 'b' } }, registry)).toThrow(UNDEFINED_KEY);
    expect(() =>
      compileUpsert(emp, { where: lost, create, update: { dept: { connect: 'dept:d1' } } }, registry),
    ).toThrow(UNDEFINED_KEY);
  });

  test('negative: the refusal is a validation error naming the field', () => {
    try {
      compileUpsert(emp, { where: lost, create: { email: 'n@x.io', name: 's' } }, registry);
      throw new Error('not refused');
    } catch (error) {
      expect(error).toBeInstanceOf(CerialValidationError);
      expect((error as CerialValidationError).field).toBe('email');
    }
  });

  test('positive: a defined unique key still compiles and counts as naming a row', () => {
    const where = { email: 'a@x.io', name: 'shared' };

    expect(() => compileFindUnique(emp, { where }, registry)).not.toThrow();
    expect(hasUniqueKeyInWhere(where, emp)).toBe(true);
    expect(
      compileUpsert(emp, { where, create: { email: 'a@x.io', name: 'shared' }, update: { name: 'b' } }, registry)
        .resultType,
    ).toBe('single');
  });

  test('positive: a where without the key is a non-unique where', () => {
    expect(hasUniqueKeyInWhere({ name: 'shared' }, emp)).toBe(false);
  });

  test('null is kept as a present key, so a null upsert still fails closed on several rows', () => {
    expect(hasUniqueKeyInWhere({ email: null, name: 'shared' } as never, emp)).toBe(true);
  });
});
