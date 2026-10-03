import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  tables,
  testConfig,
  truncateTables,
} from '../../../../test-helper';

describe('E2E Self-referential @onDelete(SetNull)', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, tables.onDeleteSelfRef);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, tables.onDeleteSelfRef);
  });

  test('deleting a folder nulls the parent of its direct children', async () => {
    const root = await client.db.OdFolder.create({ data: { name: 'root' } });
    const a = await client.db.OdFolder.create({ data: { name: 'a', parent: { connect: root.id } } });
    const b = await client.db.OdFolder.create({ data: { name: 'b', parent: { connect: root.id } } });

    await client.db.OdFolder.deleteMany({ where: { id: root.id } });

    const children = await client.db.OdFolder.findMany({ where: { id: { in: [a.id, b.id] } } });
    expect(children).toHaveLength(2);
    for (const c of children) expect(c.parentId).toBeNull();
  });

  test('grandchildren keep their parent', async () => {
    const root = await client.db.OdFolder.create({ data: { name: 'root' } });
    const mid = await client.db.OdFolder.create({ data: { name: 'mid', parent: { connect: root.id } } });
    const leaf = await client.db.OdFolder.create({ data: { name: 'leaf', parent: { connect: mid.id } } });

    await client.db.OdFolder.deleteMany({ where: { id: root.id } });

    const leafAfter = await client.db.OdFolder.findOne({ where: { id: leaf.id } });
    expect(leafAfter?.parentId?.equals(mid.id)).toBe(true);
  });

  test('deleting a leaf touches nothing else', async () => {
    const root = await client.db.OdFolder.create({ data: { name: 'root' } });
    const leaf = await client.db.OdFolder.create({ data: { name: 'leaf', parent: { connect: root.id } } });

    await client.db.OdFolder.deleteMany({ where: { id: leaf.id } });

    expect(await client.db.OdFolder.count()).toBe(1);
    expect((await client.db.OdFolder.findOne({ where: { id: root.id } }))?.name).toBe('root');
  });
});
