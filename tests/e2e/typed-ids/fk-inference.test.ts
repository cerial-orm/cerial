import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from '../../../src/utils/cerial-id';
import { createTestClient, testConfig, TYPED_ID_TABLES, CerialClient, cleanupTables, truncateTables } from '../test-helper';

describe('E2E Typed IDs: FK Type Inference', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TYPED_ID_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TYPED_ID_TABLES);
  });

  test('FK parentId output is CerialId<number> inferred from parent int @id', async () => {
    const parent = await client.db.FkTargetIntId.create({
      data: { id: 100, label: 'parent' },
    });

    const child = await client.db.FkChildModel.create({
      data: { parentId: parent.id, note: 'child-note' },
    });

    expect(child.parentId).toBeInstanceOf(CerialId);
    expect(child.parentId.id).toBe(100);
    expect(typeof child.parentId.id).toBe('number');
    expect(child.parentId.table).toBe('fk_target_int_id');
  });

  test('FK findOne round-trip preserves typed parentId', async () => {
    const parent = await client.db.FkTargetIntId.create({
      data: { id: 200, label: 'parent2' },
    });

    await client.db.FkChildModel.create({
      data: { parentId: parent.id, note: 'findme' },
    });

    const children = await client.db.FkChildModel.findMany({
      where: { parentId: parent.id },
    });

    expect(children).toHaveLength(1);
    expect(children[0]!.parentId.id).toBe(200);
    expect(children[0]!.note).toBe('findme');
  });

  test('FK with raw number as parentId input', async () => {
    await client.db.FkTargetIntId.create({
      data: { id: 300, label: 'parent3' },
    });

    const child = await client.db.FkChildModel.create({
      data: { parentId: 300 as any, note: 'raw-number' },
    });

    expect(child.parentId).toBeInstanceOf(CerialId);
    expect(child.parentId.id).toBe(300);
  });

  test('parent with include children', async () => {
    const parent = await client.db.FkTargetIntId.create({
      data: { id: 400, label: 'with-children' },
    });

    await client.db.FkChildModel.create({
      data: { parentId: parent.id, note: 'child-a' },
    });
    await client.db.FkChildModel.create({
      data: { parentId: parent.id, note: 'child-b' },
    });

    const found = await client.db.FkTargetIntId.findOne({
      where: { id: 400 },
      include: { children: true },
    });

    expect(found).not.toBeNull();
    expect(found!.id.id).toBe(400);
    expect(found!.children).toHaveLength(2);
  });
});
