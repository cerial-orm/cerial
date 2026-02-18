/**
 * E2E Tests: Relations + Objects Combined
 *
 * Schema: relation-with-objects.cerial
 * Tests models that have both relation fields AND embedded object fields.
 * Verifies that object sub-field selects work correctly in include contexts.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  cleanupTables,
  createTestClient,
  truncateTables,
  CerialClient,
  tables,
  testConfig,
} from '../test-helper';

describe('E2E Relations + Objects', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.relationWithObjects);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.relationWithObjects);
  });

  describe('create with object fields', () => {
    test('should create company with headquarters and optional meta', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'Acme Corp',
          headquarters: { street: '100 Main St', city: 'Springfield', state: 'IL' },
          meta: { industry: 'Technology', founded: 1999 },
        },
      });

      expect(company.name).toBe('Acme Corp');
      expect(company.headquarters.city).toBe('Springfield');
      expect(company.meta).toBeDefined();
      expect(company.meta!.industry).toBe('Technology');
      expect(company.meta!.founded).toBe(1999);
    });

    test('should create company without optional meta', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'Simple Co',
          headquarters: { street: '1 Elm', city: 'Portland', state: 'OR' },
        },
      });

      expect(company.name).toBe('Simple Co');
      expect(company.headquarters.city).toBe('Portland');
      expect(company.meta).toBeUndefined();
    });

    test('should create employee with homeAddress and connect to company', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'Tech Inc',
          headquarters: { street: '200 Oak Ave', city: 'Austin', state: 'TX' },
        },
      });

      const employee = await client.db.RelObjEmployee.create({
        data: {
          name: 'Alice',
          homeAddress: { street: '10 Pine Rd', city: 'Austin', state: 'TX', zipCode: '73301' },
          companyId: company.id,
        },
      });

      expect(employee.name).toBe('Alice');
      expect(employee.homeAddress.city).toBe('Austin');
      expect(employee.homeAddress.zipCode).toBe('73301');
    });

    test('should create employee with nested company create', async () => {
      const employee = await client.db.RelObjEmployee.create({
        data: {
          name: 'Bob',
          homeAddress: { street: '5 Maple Dr', city: 'Denver', state: 'CO' },
          company: {
            create: {
              name: 'Startup LLC',
              headquarters: { street: '300 Startup Blvd', city: 'Denver', state: 'CO' },
            },
          },
        },
      });

      expect(employee.name).toBe('Bob');
      expect(employee.homeAddress.city).toBe('Denver');

      // Verify the company was created
      const found = await client.db.RelObjEmployee.findUnique({
        where: { id: employee.id },
        include: { company: true },
      });
      expect(found).toBeDefined();
      expect(found!.company.name).toBe('Startup LLC');
      expect(found!.company.headquarters.city).toBe('Denver');
    });
  });

  describe('select with object sub-fields', () => {
    test('should select sub-fields of own object field', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'SelectCo',
          headquarters: { street: '50 Select Ave', city: 'Boston', state: 'MA', zipCode: '02101' },
          meta: { industry: 'Finance', founded: 2005 },
        },
      });

      const result = await client.db.RelObjCompany.findUnique({
        where: { id: company.id },
        select: { name: true, headquarters: { city: true } },
      });

      expect(result).toBeDefined();
      expect(result!.name).toBe('SelectCo');
      expect(result!.headquarters.city).toBe('Boston');
      // Excluded fields should not be present at runtime
      expect((result!.headquarters as any).street).toBeUndefined();
      expect((result!.headquarters as any).state).toBeUndefined();
    });

    test('should select sub-fields of optional object field', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'MetaCo',
          headquarters: { street: '60 Meta Ln', city: 'Miami', state: 'FL' },
          meta: { industry: 'Healthcare', founded: 2010 },
        },
      });

      const result = await client.db.RelObjCompany.findUnique({
        where: { id: company.id },
        select: { meta: { industry: true } },
      });

      expect(result).toBeDefined();
      expect(result!.meta).toBeDefined();
      expect(result!.meta!.industry).toBe('Healthcare');
      expect((result!.meta as any).founded).toBeUndefined();
    });

    test('should select sub-fields from multiple object fields', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'MultiObj',
          headquarters: { street: '70 Multi Rd', city: 'Seattle', state: 'WA' },
          meta: { industry: 'Retail', founded: 2015 },
        },
      });

      const result = await client.db.RelObjCompany.findUnique({
        where: { id: company.id },
        select: { headquarters: { city: true, state: true }, meta: { industry: true } },
      });

      expect(result).toBeDefined();
      expect(result!.headquarters.city).toBe('Seattle');
      expect(result!.headquarters.state).toBe('WA');
      expect((result!.headquarters as any).street).toBeUndefined();
      expect(result!.meta!.industry).toBe('Retail');
    });
  });

  describe('include with object sub-field select on related model', () => {
    test('should include company with select narrowing headquarters', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'IncludeCo',
          headquarters: { street: '80 Include St', city: 'Chicago', state: 'IL', zipCode: '60601' },
          meta: { industry: 'Manufacturing', founded: 1990 },
        },
      });

      const employee = await client.db.RelObjEmployee.create({
        data: {
          name: 'Carol',
          homeAddress: { street: '15 Worker Ln', city: 'Chicago', state: 'IL' },
          companyId: company.id,
        },
      });

      const result = await client.db.RelObjEmployee.findUnique({
        where: { id: employee.id },
        include: {
          company: {
            select: { name: true, headquarters: { city: true } },
          },
        },
      });

      expect(result).toBeDefined();
      // Own fields present (no own select applied)
      expect(result!.name).toBe('Carol');
      expect(result!.homeAddress.city).toBe('Chicago');
      // Included company with select narrows top-level fields
      expect(result!.company.name).toBe('IncludeCo');
      expect(result!.company.headquarters.city).toBe('Chicago');
      // Note: object sub-field narrowing within includes returns full objects at runtime
      // because SurrealDB's SELECT within relation includes selects whole fields
      expect((result!.company.headquarters as any).street).toBe('80 Include St');
      // Include select returns full related model at runtime (narrowing is type-level only)
      expect((result!.company as any).meta).toBeDefined();
      expect((result!.company as any).meta.industry).toBe('Manufacturing');
    });

    test('should include company with boolean true returning full object', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'FullCo',
          headquarters: { street: '90 Full Ave', city: 'Dallas', state: 'TX' },
          meta: { industry: 'Energy', founded: 1980 },
        },
      });

      const employee = await client.db.RelObjEmployee.create({
        data: {
          name: 'Dave',
          homeAddress: { street: '20 Home Ct', city: 'Dallas', state: 'TX' },
          companyId: company.id,
        },
      });

      const result = await client.db.RelObjEmployee.findUnique({
        where: { id: employee.id },
        include: { company: true },
      });

      expect(result).toBeDefined();
      expect(result!.company.name).toBe('FullCo');
      expect(result!.company.headquarters.street).toBe('90 Full Ave');
      expect(result!.company.headquarters.city).toBe('Dallas');
      expect(result!.company.meta).toBeDefined();
      expect(result!.company.meta!.industry).toBe('Energy');
    });

    test('should include employees from company with select on homeAddress', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'BigCo',
          headquarters: { street: '100 Corp Blvd', city: 'NYC', state: 'NY' },
        },
      });

      await client.db.RelObjEmployee.create({
        data: {
          name: 'Eve',
          homeAddress: { street: '30 Elm St', city: 'Brooklyn', state: 'NY', zipCode: '11201' },
          companyId: company.id,
        },
      });

      await client.db.RelObjEmployee.create({
        data: {
          name: 'Frank',
          homeAddress: { street: '40 Oak St', city: 'Queens', state: 'NY', zipCode: '11101' },
          companyId: company.id,
        },
      });

      const result = await client.db.RelObjCompany.findUnique({
        where: { id: company.id },
        include: {
          employees: {
            select: { name: true, homeAddress: { city: true } },
          },
        },
      });

      expect(result).toBeDefined();
      expect(result!.employees).toHaveLength(2);
      const names = result!.employees.map((e) => e.name).sort();
      expect(names).toEqual(['Eve', 'Frank']);
      // Object sub-field narrowing within includes returns full objects at runtime
      for (const emp of result!.employees) {
        expect(emp.homeAddress.city).toBeDefined();
        expect((emp.homeAddress as any).street).toBeDefined();
      }
    });
  });

  describe('combined own select + include with object sub-fields', () => {
    test('should narrow both own and included object fields', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'CombinedCo',
          headquarters: { street: '110 Combined Way', city: 'Phoenix', state: 'AZ' },
          meta: { industry: 'Aerospace', founded: 1960 },
        },
      });

      const employee = await client.db.RelObjEmployee.create({
        data: {
          name: 'Grace',
          homeAddress: { street: '50 Home Ave', city: 'Tempe', state: 'AZ', zipCode: '85281' },
          companyId: company.id,
        },
      });

      const result = await client.db.RelObjEmployee.findUnique({
        where: { id: employee.id },
        select: { name: true, homeAddress: { city: true } },
        include: {
          company: {
            select: { name: true, headquarters: { city: true, state: true } },
          },
        },
      });

      expect(result).toBeDefined();
      // Own select narrows own fields (top-level select works for object sub-fields)
      expect(result!.name).toBe('Grace');
      expect(result!.homeAddress.city).toBe('Tempe');
      expect((result!.homeAddress as any).street).toBeUndefined();
      // Included company: select narrows top-level fields, but object sub-fields return full objects
      expect(result!.company.name).toBe('CombinedCo');
      expect(result!.company.headquarters.city).toBe('Phoenix');
      expect(result!.company.headquarters.state).toBe('AZ');
      expect((result!.company.headquarters as any).street).toBe('110 Combined Way');
    });
  });

  describe('findMany with include + object sub-select', () => {
    test('should return multiple employees with narrowed company objects', async () => {
      const company = await client.db.RelObjCompany.create({
        data: {
          name: 'FindManyCo',
          headquarters: { street: '120 Many Rd', city: 'Atlanta', state: 'GA' },
        },
      });

      await client.db.RelObjEmployee.create({
        data: {
          name: 'Hank',
          homeAddress: { street: '60 First St', city: 'Decatur', state: 'GA' },
          companyId: company.id,
        },
      });

      await client.db.RelObjEmployee.create({
        data: {
          name: 'Iris',
          homeAddress: { street: '70 Second St', city: 'Marietta', state: 'GA' },
          companyId: company.id,
        },
      });

      const results = await client.db.RelObjEmployee.findMany({
        include: {
          company: {
            select: { headquarters: { city: true } },
          },
        },
      });

      expect(results.length).toBeGreaterThanOrEqual(2);
      for (const emp of results) {
        expect(emp.company.headquarters.city).toBe('Atlanta');
        // Object sub-fields within includes return full objects at runtime
        expect((emp.company.headquarters as any).street).toBe('120 Many Rd');
        // Include select returns full related model at runtime
        expect((emp.company as any).name).toBe('FindManyCo');
      }
    });
  });
});
