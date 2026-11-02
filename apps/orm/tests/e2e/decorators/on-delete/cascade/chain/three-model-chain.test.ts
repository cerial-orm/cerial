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
 * Cascade is transitive: deleting a grandparent removes its parents and continues to the parents' own children.
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

  test('deleting the grandparent also removes the grandchildren', async () => {
    const { grandparent, child } = await seed();

    await client.db.OdGrandparent.deleteMany({ where: { id: grandparent.id } });

    expect(await client.db.OdChild.findOne({ where: { id: child.id } })).toBeNull();
    expect(await client.db.OdChild.count()).toBe(0);
  });

  test('unrelated branches are untouched', async () => {
    const { grandparent } = await seed();
    const other = await client.db.OdGrandparent.create({ data: { name: 'other' } });
    const otherParent = await client.db.OdParent.create({ data: { name: 'op', grandparent: { connect: other.id } } });
    const otherChild = await client.db.OdChild.create({ data: { name: 'oc', parent: { connect: otherParent.id } } });

    await client.db.OdGrandparent.deleteMany({ where: { id: grandparent.id } });

    expect(await client.db.OdParent.findOne({ where: { id: otherParent.id } })).not.toBeNull();
    expect(await client.db.OdChild.findOne({ where: { id: otherChild.id } })).not.toBeNull();
  });
});
