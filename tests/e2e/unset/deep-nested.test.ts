/**
 * E2E: Unset — Deep Nested Objects (3+ levels)
 *
 * Tests unsetting fields at multiple depths within nested objects:
 *   UnsetDeepOuter { title, mid: UnsetDeepMid, desc? }
 *   UnsetDeepMid   { label, score?, deep: UnsetDeepInner }
 *   UnsetDeepInner { code, note? }
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, truncateTables, CerialClient, testConfig, tables } from '../relations/test-helper';

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };
const NESTED_FULL = { title: 'T', mid: { label: 'L', score: 99, deep: { code: 'C', note: 'N' } }, desc: 'D' };

describe('Unset: Deep Nested Objects', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, UNSET_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, UNSET_TABLES);
  });

  // ─── Required deep object (nested) ────────────────────────────────────────

  test('unsets 3rd level deep field (nested.mid.deep.note)', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'D1', address: { street: 'A', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED_FULL },
    });
    expect(record.nested.mid.deep.note).toBe('N');

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { nested: { mid: { deep: { note: true } } } },
    });

    expect(updated!.nested.mid.deep.note).toBeUndefined();
    expect(updated!.nested.mid.deep.code).toBe('C');
    expect(updated!.nested.mid.label).toBe('L');
    expect(updated!.nested.mid.score).toBe(99);
    expect(updated!.nested.title).toBe('T');
    expect(updated!.nested.desc).toBe('D');
  });

  test('unsets 2nd level field (nested.mid.score)', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'D2', address: { street: 'B', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED_FULL },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { nested: { mid: { score: true } } },
    });

    expect(updated!.nested.mid.score).toBeUndefined();
    expect(updated!.nested.mid.label).toBe('L');
    expect(updated!.nested.mid.deep.note).toBe('N');
  });

  test('unsets 1st level field (nested.desc)', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'D3', address: { street: 'C', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED_FULL },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { nested: { desc: true } },
    });

    expect(updated!.nested.desc).toBeUndefined();
    expect(updated!.nested.title).toBe('T');
    expect(updated!.nested.mid.score).toBe(99);
  });

  test('unsets all optional fields across all 3 levels', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'D4', address: { street: 'D', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED_FULL },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { nested: { desc: true, mid: { score: true, deep: { note: true } } } },
    });

    expect(updated!.nested.desc).toBeUndefined();
    expect(updated!.nested.mid.score).toBeUndefined();
    expect(updated!.nested.mid.deep.note).toBeUndefined();
    expect(updated!.nested.title).toBe('T');
    expect(updated!.nested.mid.label).toBe('L');
    expect(updated!.nested.mid.deep.code).toBe('C');
  });

  test('unset deep field that is already absent is a no-op', async () => {
    const record = await client.db.UnsetTest.create({
      data: { name: 'D5', address: { street: 'E', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
    });
    expect(record.nested.mid.deep.note).toBeUndefined();

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { nested: { mid: { deep: { note: true } } } },
    });

    expect(updated!.nested.mid.deep.note).toBeUndefined();
    expect(updated!.nested.mid.deep.code).toBe('C');
  });

  // ─── Optional deep object (optNested) ─────────────────────────────────────

  test('unsets entire optional deep object', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'D6',
        address: { street: 'F', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        optNested: NESTED_FULL,
      },
    });
    expect(record.optNested).toBeDefined();

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { optNested: true },
    });

    expect(updated!.optNested).toBeUndefined();
  });

  test('unsets 3rd level deep within optional object', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'D7',
        address: { street: 'G', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        optNested: NESTED_FULL,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { optNested: { mid: { deep: { note: true } } } },
    });

    expect(updated!.optNested).toBeDefined();
    expect(updated!.optNested!.mid.deep.note).toBeUndefined();
    expect(updated!.optNested!.mid.deep.code).toBe('C');
    expect(updated!.optNested!.mid.score).toBe(99);
    expect(updated!.optNested!.desc).toBe('D');
  });

  test('unsets 1st level of optional deep object', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'D8',
        address: { street: 'H', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        optNested: NESTED_FULL,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { optNested: { desc: true } },
    });

    expect(updated!.optNested).toBeDefined();
    expect(updated!.optNested!.desc).toBeUndefined();
    expect(updated!.optNested!.title).toBe('T');
  });

  // ─── updateMany with deep nested ──────────────────────────────────────────

  test('updateMany: deep unset on multiple records', async () => {
    await client.db.UnsetTest.create({
      data: { name: 'D9', address: { street: 'I', city: 'SF' }, pos: [37.0, -122.0], nested: NESTED_FULL },
    });
    await client.db.UnsetTest.create({
      data: { name: 'D10', address: { street: 'J', city: 'SF' }, pos: [37.1, -122.1], nested: NESTED_FULL },
    });

    const updated = await client.db.UnsetTest.updateMany({
      where: { address: { city: { eq: 'SF' } } },
      data: {},
      unset: { nested: { mid: { score: true, deep: { note: true } } } },
    });

    expect(updated).toHaveLength(2);
    for (const r of updated) {
      expect(r.nested.mid.score).toBeUndefined();
      expect(r.nested.mid.deep.note).toBeUndefined();
      expect(r.nested.mid.label).toBe('L');
      expect(r.nested.mid.deep.code).toBe('C');
    }
  });
});
