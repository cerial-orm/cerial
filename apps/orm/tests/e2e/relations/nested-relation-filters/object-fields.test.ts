/**
 * E2E Tests: object-field filters inside a relation filter body
 *
 * A relation body used to bind an object sub-filter as a whole-object equality that no stored object matches,
 * so a NOT around it (or `none`) matched every row and deleteMany removed rows the filter excluded.
 *
 *   c1 Oslo,   meta tech   employees e1 (Oslo), e2 (Bergen)
 *   c2 Bergen, meta fin    employees e3 (Oslo)
 *   c3 Oslo,   no meta     employees e4 (Bergen), e5 (Bergen)
 *   c4 Bergen, meta fin    no employees
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  type RelObjCompanyWhere,
  type RelObjEmployeeWhere,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';
import { type Case, idOf, type Rows, runCases } from './helpers';

const TABLES = tables.relationWithObjects;
const EMPLOYEES = ['e1', 'e2', 'e3', 'e4', 'e5'] as const;
const COMPANIES = ['c1', 'c2', 'c3', 'c4'] as const;
const addr = (city: string) => ({ street: 's', city, state: 'x' });

const EMPLOYEE_ROWS = [
  { id: 'e1', city: 'Oslo', company: 'c1' },
  { id: 'e2', city: 'Bergen', company: 'c1' },
  { id: 'e3', city: 'Oslo', company: 'c2' },
  { id: 'e4', city: 'Bergen', company: 'c3' },
  { id: 'e5', city: 'Bergen', company: 'c3' },
] as const;

describe('E2E nested relation filters: object fields in the body', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TABLES);
    await client.db.RelObjCompany.create({
      data: { id: 'c1', name: 'c1', headquarters: addr('Oslo'), meta: { industry: 'tech' } },
    });
    await client.db.RelObjCompany.create({
      data: { id: 'c2', name: 'c2', headquarters: addr('Bergen'), meta: { industry: 'fin' } },
    });
    await client.db.RelObjCompany.create({ data: { id: 'c3', name: 'c3', headquarters: addr('Oslo') } });
    await client.db.RelObjCompany.create({
      data: { id: 'c4', name: 'c4', headquarters: addr('Bergen'), meta: { industry: 'fin' } },
    });
    for (const e of EMPLOYEE_ROWS) {
      await client.db.RelObjEmployee.create({
        data: { id: e.id, name: e.id, homeAddress: addr(e.city), companyId: e.company },
      });
    }
  });

  const employeeRows = (): Rows<RelObjEmployeeWhere> => ({
    find: async (where) => (await client.db.RelObjEmployee.findMany({ where })).map((r) => r.name),
    count: (where) => client.db.RelObjEmployee.count(where),
    update: async (where) => {
      await client.db.RelObjEmployee.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () => (await client.db.RelObjEmployee.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.RelObjEmployee.deleteMany({ where });
    },
    survivors: async () => (await client.db.RelObjEmployee.findMany()).map((r) => r.name),
    everything: EMPLOYEES,
  });

  const companyRows = (): Rows<RelObjCompanyWhere> => ({
    find: async (where) => (await client.db.RelObjCompany.findMany({ where })).map((r) => r.name),
    count: (where) => client.db.RelObjCompany.count(where),
    update: async (where) => {
      await client.db.RelObjCompany.updateMany({ where, data: { name: 'MARKED' } });
    },
    marked: async () => (await client.db.RelObjCompany.findMany({ where: { name: 'MARKED' } })).map((r) => idOf(r.id)),
    remove: async (where) => {
      await client.db.RelObjCompany.deleteMany({ where });
    },
    survivors: async () => (await client.db.RelObjCompany.findMany()).map((r) => r.name),
    everything: COMPANIES,
  });

  const forward: Case<RelObjEmployeeWhere>[] = [
    {
      label: 'NOT company.headquarters.city: the complement keeps only e3',
      where: { name: { neq: 'zz' }, NOT: { company: { headquarters: { city: 'Oslo' } } } },
      expected: ['e3'],
    },
    {
      label: 'company.headquarters.city shorthand',
      where: { company: { headquarters: { city: 'Oslo' } } },
      expected: ['e1', 'e2', 'e4', 'e5'],
    },
    {
      label: 'company.headquarters.city: { eq }',
      where: { company: { headquarters: { city: { eq: 'Oslo' } } } },
      expected: ['e1', 'e2', 'e4', 'e5'],
    },
    {
      label: 'company.headquarters.city: { neq }',
      where: { company: { headquarters: { city: { neq: 'Oslo' } } } },
      expected: ['e3'],
    },
    {
      label: 'NOT company.headquarters.city: { neq }',
      where: { NOT: { company: { headquarters: { city: { neq: 'Oslo' } } } } },
      expected: ['e1', 'e2', 'e4', 'e5'],
    },
    {
      label: 'NOT inside headquarters',
      where: { company: { headquarters: { NOT: { city: 'Oslo' } } } },
      expected: ['e3'],
    },
    {
      label: 'OR inside headquarters',
      where: { company: { headquarters: { OR: [{ city: 'Oslo' }, { city: 'Bergen' }] } } },
      expected: [...EMPLOYEES],
    },
    {
      label: 'OR of two relation bodies, one under NOT',
      where: { OR: [{ name: 'e3' }, { NOT: { company: { headquarters: { city: 'Oslo' } } } }] },
      expected: ['e3'],
    },
    {
      label: 'optional object: company.meta.industry',
      where: { company: { meta: { industry: 'tech' } } },
      expected: ['e1', 'e2'],
    },
    {
      label: 'NOT company.meta.industry keeps the company with no meta',
      where: { NOT: { company: { meta: { industry: 'tech' } } } },
      expected: ['e3', 'e4', 'e5'],
    },
    {
      label: 'two sub-fields, both must match',
      where: { company: { headquarters: { city: 'Oslo', state: 'nope' } } },
      expected: [],
    },
    {
      label: 'NOT two sub-fields that match nothing matches everything',
      where: { NOT: { company: { headquarters: { city: 'Oslo', state: 'nope' } } } },
      expected: [...EMPLOYEES],
    },
    {
      label: 'depth 2: company.employees.some.homeAddress.city',
      where: { company: { employees: { some: { homeAddress: { city: 'Oslo' } } } } },
      expected: ['e1', 'e2', 'e3'],
    },
    {
      label: 'NOT depth 2',
      where: { NOT: { company: { employees: { some: { homeAddress: { city: 'Oslo' } } } } } },
      expected: ['e4', 'e5'],
    },
  ];

  const reverse: Case<RelObjCompanyWhere>[] = [
    {
      label: 'employees.none.homeAddress.city: { neq }: c2 and c4 only',
      where: { name: { neq: 'zz' }, employees: { none: { homeAddress: { city: { neq: 'Oslo' } } } } },
      expected: ['c2', 'c4'],
    },
    {
      label: 'employees.some.homeAddress.city',
      where: { employees: { some: { homeAddress: { city: 'Oslo' } } } },
      expected: ['c1', 'c2'],
    },
    {
      label: 'employees.some shorthand',
      where: { employees: { homeAddress: { city: 'Oslo' } } },
      expected: ['c1', 'c2'],
    },
    {
      label: 'NOT employees.some.homeAddress.city',
      where: { NOT: { employees: { some: { homeAddress: { city: 'Oslo' } } } } },
      expected: ['c3', 'c4'],
    },
    {
      label: 'employees.none.homeAddress.city',
      where: { employees: { none: { homeAddress: { city: 'Oslo' } } } },
      expected: ['c3', 'c4'],
    },
    {
      label: 'employees.every.homeAddress.city needs a related row',
      where: { employees: { every: { homeAddress: { city: 'Oslo' } } } },
      expected: ['c2'],
    },
    {
      label: 'employees.every.homeAddress.city: { neq }',
      where: { employees: { every: { homeAddress: { city: { neq: 'Oslo' } } } } },
      expected: ['c3'],
    },
    {
      label: 'NOT inside the object body',
      where: { employees: { some: { homeAddress: { NOT: { city: 'Oslo' } } } } },
      expected: ['c1', 'c3'],
    },
    {
      label: 'employees.some.company.headquarters.city: depth 2',
      where: { employees: { some: { company: { headquarters: { city: 'Oslo' } } } } },
      expected: ['c1', 'c3'],
    },
    {
      label: 'NOT employees.some.company.headquarters.city keeps the company with no employees',
      where: { NOT: { employees: { some: { company: { headquarters: { city: 'Oslo' } } } } } },
      expected: ['c2', 'c4'],
    },
  ];

  runCases('RelObjEmployee', employeeRows, forward);
  runCases('RelObjCompany', companyRows, reverse);

  test('a body with a bad sub-field of an object is still refused, data intact', async () => {
    await expect(
      (async () => {
        // @ts-expect-error negative test: 'nope' is not a field of Address
        await client.db.RelObjEmployee.deleteMany({ where: { company: { headquarters: { nope: 'x' } } } });
      })(),
    ).rejects.toThrow();
    expect(await client.db.RelObjEmployee.count()).toBe(5);
  });
});
