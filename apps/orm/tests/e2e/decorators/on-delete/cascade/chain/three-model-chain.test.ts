import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

/**
 * Cascade is applied to direct dependents only: deleting a grandparent removes its parents and
 * does not continue to the parents' own children. This pins the current behaviour.
 */
describe('E2E three-model @onDelete(Cascade) chain', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.onDeleteChain);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.onDeleteChain);
  });

  async function seed() {
    const grandparent = await client.db.OdGrandparent.create({ data: { name: 'gp' } });
    const parent = await client.db.OdParent.create({ data: { name: 'p', grandparent: { connect: grandparent.id } } });
    const child = await client.db.OdChild.create({ data: { name: 'c', parent: { connect: parent.id } } });

    return { grandparent, parent, child };
  }

  test('deleting the middle model cascades to its children', async () => {
    const { parent, child } = await seed();

    await client.db.OdParent.deleteMany({ where: { id: parent.id } });

    expect(await client.db.OdChild.findOne({ where: { id: child.id } })).toBeNull();
  });

  test('deleting the grandparent cascades to its direct dependents', async () => {
    const { grandparent, parent } = await seed();

    await client.db.OdGrandparent.deleteMany({ where: { id: grandparent.id } });

    expect(await client.db.OdParent.findOne({ where: { id: parent.id } })).toBeNull();
  });

  test('deleting the grandparent does not reach the grandchildren', async () => {
    const { grandparent, parent, child } = await seed();

    await client.db.OdGrandparent.deleteMany({ where: { id: grandparent.id } });

    const orphan = await client.db.OdChild.findOne({ where: { id: child.id } });
    expect(orphan).not.toBeNull();
    expect(orphan?.parentId?.equals(parent.id)).toBe(true);
  });

  test('unrelated branches are untouched', async () => {
    const { grandparent } = await seed();
    const other = await client.db.OdGrandparent.create({ data: { name: 'other' } });
    const otherParent = await client.db.OdParent.create({ data: { name: 'op', grandparent: { connect: other.id } } });

    await client.db.OdGrandparent.deleteMany({ where: { id: grandparent.id } });

    expect(await client.db.OdParent.findOne({ where: { id: otherParent.id } })).not.toBeNull();
  });
});
