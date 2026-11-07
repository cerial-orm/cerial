/**
 * Unit Tests: object and tuple fields inside a relation filter body
 *
 * A body field that is an object (or tuple) compiles through the builders the top level uses, prefixed with the
 * path to the related row. It never binds the sub-filter as a whole-object value (`addr = $addr_eq_0`), which no
 * stored object equals and which let a NOT or `none` around it match every row.
 */

import { describe, expect, test } from 'bun:test';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createTupleRegistry,
  resolveObjectFields,
} from '../../../src/generators/metadata';
import { createObjectRegistry, createRegistry } from '../../../src/generators/metadata/registry-generator';
import { parse } from '../../../src/parser/parser';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import type { WhereClause } from '../../../src/types';

const schema = `
object Addr {
  city String
  zip Int
  geo Geo?
}

object Geo {
  lat Float
}

tuple Pair {
  label String,
  addr Addr
}

model Emp {
  id Record @id
  name String
  addr Addr
  addrs Addr[]
  pair Pair
  managerId Record?
  manager Relation? @field(managerId) @model(Emp) @key(mgr)
  reports Relation[] @model(Emp) @key(mgr)
  courseIds Record[]
  courses Relation[] @field(courseIds) @model(Course)
}

model Course {
  id Record @id
  addr Addr
  empIds Record[]
  emps Relation[] @field(empIds) @model(Emp)
}
`;

const { ast } = parse(schema);
const models = convertModels(ast.models);
const objects = convertObjects(ast.objects);
const tuples = convertTuples(ast.tuples);
resolveObjectFields(models, objects, createObjectRegistry(objects), createTupleRegistry(tuples));
const registry = createRegistry(models);

const compile = (model: string, where: WhereClause) =>
  buildConditions(createCompileContext(), where, registry[model]!, registry);

interface Shape {
  readonly label: string;
  readonly model: string;
  readonly where: WhereClause;
  readonly text: string;
  readonly vars: Record<string, unknown>;
}

const shapes: Shape[] = [
  {
    label: 'forward to-one: a sub-field of an object',
    model: 'Emp',
    where: { manager: { addr: { city: 'osl' } } },
    text: '(managerId.id != NONE AND managerId.addr.city = $managerId_addr_city_eq_0)',
    vars: { managerId_addr_city_eq_0: 'osl' },
  },
  {
    label: 'forward to-one under NOT: the guard stays inside the NOT, the sub-field stays a sub-field',
    model: 'Emp',
    where: { NOT: { manager: { addr: { city: 'osl' } } } },
    text: 'NOT ((managerId.id != NONE AND managerId.addr.city = $managerId_addr_city_eq_0))',
    vars: { managerId_addr_city_eq_0: 'osl' },
  },
  {
    label: 'forward to-one: operators and a nested object',
    model: 'Emp',
    where: { manager: { addr: { city: { neq: 'osl' }, geo: { lat: { gt: 1 } } } } },
    text: '(managerId.id != NONE AND managerId.addr.city != $managerId_addr_city_neq_0 AND managerId.addr.geo.lat > $managerId_addr_geo_lat_gt_1)',
    vars: { managerId_addr_city_neq_0: 'osl', managerId_addr_geo_lat_gt_1: 1 },
  },
  {
    label: 'forward to-one: an object array with a quantifier',
    model: 'Emp',
    where: { manager: { addrs: { some: { city: 'osl' } } } },
    text: '(managerId.id != NONE AND managerId.addrs.any(|$v| $v.city = $_v_city_eq_0))',
    vars: { _v_city_eq_0: 'osl' },
  },
  {
    label: 'forward to-one: an object element of a tuple',
    model: 'Emp',
    where: { manager: { pair: { addr: { city: 'osl' } } } },
    text: '(managerId.id != NONE AND managerId.pair[1].city = $managerId_pair_1__city_eq_0)',
    vars: { managerId_pair_1__city_eq_0: 'osl' },
  },
  {
    label: 'forward at depth 2',
    model: 'Emp',
    where: { manager: { manager: { addr: { city: 'osl' } } } },
    text: '(managerId.id != NONE AND managerId IN (SELECT VALUE id FROM emp WHERE (managerId.id != NONE AND managerId.addr.city = $managerId_addr_city_eq_0)))',
    vars: { managerId_addr_city_eq_0: 'osl' },
  },
  {
    label: 'reverse none: NOT around an object sub-field filter keeps only the complement',
    model: 'Emp',
    where: { reports: { none: { addr: { city: { neq: 'osl' } } } } },
    text: 'id NOT IN (SELECT VALUE managerId FROM emp WHERE addr.city != $addr_city_neq_0)',
    vars: { addr_city_neq_0: 'osl' },
  },
  {
    label: 'reverse some: OR and NOT around object sub-fields',
    model: 'Emp',
    where: { reports: { some: { OR: [{ addr: { city: 'a' } }, { NOT: { addr: { zip: 2 } } }] } } },
    text: 'id IN (SELECT VALUE managerId FROM emp WHERE (addr.city = $addr_city_eq_0 OR NOT (addr.zip = $addr_zip_eq_1)))',
    vars: { addr_city_eq_0: 'a', addr_zip_eq_1: 2 },
  },
  {
    label: 'array-FK some',
    model: 'Emp',
    where: { courses: { some: { addr: { city: 'osl' } } } },
    text: 'courseIds ANYINSIDE (SELECT VALUE id FROM course WHERE addr.city = $addr_city_eq_0)',
    vars: { addr_city_eq_0: 'osl' },
  },
  {
    label: 'array-FK every',
    model: 'Course',
    where: { emps: { every: { addr: { city: 'osl' } } } },
    text: '(empIds ANYINSIDE (SELECT VALUE id FROM emp) AND NOT (empIds ANYINSIDE (SELECT VALUE id FROM emp WHERE NOT (addr.city = $addr_city_eq_0))))',
    vars: { addr_city_eq_0: 'osl' },
  },
];

describe('relation body object fields', () => {
  test.each(shapes)('$label', ({ model, where, text, vars }) => {
    const fragment = compile(model, where);

    expect(fragment.text).toBe(text);
    expect(fragment.vars).toEqual(vars);
  });

  test.each(shapes)('$label never binds an object as a value', ({ model, where }) => {
    const fragment = compile(model, where);

    expect(Object.values(fragment.vars).some((v) => typeof v === 'object' && v !== null)).toBe(false);
    expect(fragment.text).not.toMatch(/addr = \$/);
  });
});
