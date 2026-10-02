/**
 * E2E Tests: orderBy across two links and mixed with object sub-fields
 *
 * Schemas: self-ref-tree (CategoryTree), relation-with-objects (RelObjEmployee -> RelObjCompany)
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../test-helper';

const addr = (city: string) => ({ street: 's', city, state: 'x' });

describe('E2E orderBy: chained relations', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.selfRefTree);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.selfRefTree);

    // Grandparents sort Zed > Mid > Amy; the leaf names sort differently from both
    await client.db.CategoryTree.create({ data: { id: 'g-zed', name: 'Zed' } });
    await client.db.CategoryTree.create({ data: { id: 'g-amy', name: 'Amy' } });
    await client.db.CategoryTree.create({ data: { id: 'g-mid', name: 'Mid' } });
    await client.db.CategoryTree.create({ data: { id: 'p1', name: 'p1', parentId: 'g-zed' } });
    await client.db.CategoryTree.create({ data: { id: 'p2', name: 'p2', parentId: 'g-amy' } });
    await client.db.CategoryTree.create({ data: { id: 'p3', name: 'p3', parentId: 'g-mid' } });
    await client.db.CategoryTree.create({ data: { id: 'l1', name: 'leaf1', parentId: 'p1' } });
    await client.db.CategoryTree.create({ data: { id: 'l2', name: 'leaf2', parentId: 'p2' } });
    await client.db.CategoryTree.create({ data: { id: 'l3', name: 'leaf3', parentId: 'p3' } });
  });

  const leaves = { name: { startsWith: 'leaf' } };

  test('one hop sorts by the parent name', async () => {
    const rows = await client.db.CategoryTree.findMany({ where: leaves, orderBy: { parent: { name: 'asc' } } });

    expect(rows.map((r) => r.name)).toEqual(['leaf1', 'leaf2', 'leaf3']);
  });

  test('two hops sort by the grandparent name, ascending', async () => {
    const rows = await client.db.CategoryTree.findMany({
      where: leaves,
      orderBy: { parent: { parent: { name: 'asc' } } },
    });

    // Amy (leaf2), Mid (leaf3), Zed (leaf1)
    expect(rows.map((r) => r.name)).toEqual(['leaf2', 'leaf3', 'leaf1']);
  });

  test('two hops sort by the grandparent name, descending', async () => {
    const rows = await client.db.CategoryTree.findMany({
      where: leaves,
      orderBy: { parent: { parent: { name: 'desc' } } },
    });

    expect(rows.map((r) => r.name)).toEqual(['leaf1', 'leaf3', 'leaf2']);
  });

  test('rows whose chain breaks (no grandparent) sort first ascending', async () => {
    // Zed has no parent; p1 and p2 have a parent that has no parent. All three resolve to null.
    const rows = await client.db.CategoryTree.findMany({
      where: { name: { in: ['p1', 'p2', 'Zed'] } },
      orderBy: { parent: { parent: { name: 'asc' } }, name: 'asc' },
    });

    // The null group ties on the relation key, so the name key decides
    expect(rows.map((r) => r.name)).toEqual(['Zed', 'p1', 'p2']);
  });

  test('two hops with limit and offset page after sorting', async () => {
    const rows = await client.db.CategoryTree.findMany({
      where: leaves,
      orderBy: { parent: { parent: { name: 'asc' } } },
      limit: 1,
      offset: 1,
    });

    expect(rows.map((r) => r.name)).toEqual(['leaf3']);
  });

  test('two hops with select returns only the requested field', async () => {
    const rows = await client.db.CategoryTree.findMany({
      select: { name: true },
      where: leaves,
      orderBy: { parent: { parent: { name: 'asc' } } },
    });

    expect(rows.map((r) => r.name)).toEqual(['leaf2', 'leaf3', 'leaf1']);
    expect(rows.flatMap((r) => Object.keys(r)).filter((k) => k.startsWith('__'))).toEqual([]);
  });
});

describe('E2E orderBy: own, object and relation keys together', () => {
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

    await client.db.RelObjCompany.create({
      data: { id: 'c-b', name: 'Bravo', headquarters: addr('Oslo') },
    });
    await client.db.RelObjCompany.create({
      data: { id: 'c-a', name: 'Alpha', headquarters: addr('Rome') },
    });

    await client.db.RelObjEmployee.create({
      data: { id: 'e1', name: 'e1', homeAddress: addr('Paris'), companyId: 'c-b' },
    });
    await client.db.RelObjEmployee.create({
      data: { id: 'e2', name: 'e2', homeAddress: addr('Berlin'), companyId: 'c-a' },
    });
    await client.db.RelObjEmployee.create({
      data: { id: 'e3', name: 'e3', homeAddress: addr('Paris'), companyId: 'c-a' },
    });
    await client.db.RelObjEmployee.create({
      data: { id: 'e4', name: 'e4', homeAddress: addr('Berlin'), companyId: 'c-b' },
    });
  });

  test('relation key then object sub-field then own field', async () => {
    const rows = await client.db.RelObjEmployee.findMany({
      orderBy: { company: { name: 'asc' }, homeAddress: { city: 'desc' }, name: 'asc' },
    });

    // Alpha: Paris(e3) before Berlin(e2); Bravo: Paris(e1) before Berlin(e4)
    expect(rows.map((r) => r.name)).toEqual(['e3', 'e2', 'e1', 'e4']);
  });

  test('object sub-field first, then relation key', async () => {
    const rows = await client.db.RelObjEmployee.findMany({
      orderBy: { homeAddress: { city: 'asc' }, company: { name: 'desc' } },
    });

    // Berlin: Bravo(e4) before Alpha(e2); Paris: Bravo(e1) before Alpha(e3)
    expect(rows.map((r) => r.name)).toEqual(['e4', 'e2', 'e1', 'e3']);
  });

  test('an object sub-field on the target', async () => {
    const rows = await client.db.RelObjEmployee.findMany({
      orderBy: { company: { headquarters: { city: 'desc' } }, name: 'asc' },
    });

    // Rome (Alpha: e2, e3) before Oslo (Bravo: e1, e4)
    expect(rows.map((r) => r.name)).toEqual(['e2', 'e3', 'e1', 'e4']);
  });

  test('every key combined with select, limit and offset', async () => {
    const rows = await client.db.RelObjEmployee.findMany({
      select: { name: true },
      orderBy: { company: { name: 'asc' }, homeAddress: { city: 'desc' }, name: 'asc' },
      limit: 2,
      offset: 1,
    });

    expect(rows.map((r) => r.name)).toEqual(['e2', 'e1']);
  });
});
