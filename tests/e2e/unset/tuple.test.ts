/**
 * E2E: Unset — Tuple Fields
 *
 * Tests unsetting entire optional tuples, optional tuple elements via
 * $this reconstruction, and optional sub-fields within object-in-tuple.
 * Also covers deep tuple (UnsetDeepTuple with nested object).
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { cleanupTables, createTestClient, CerialClient, testConfig, tables } from '../relations/test-helper';

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };

describe('Unset: Tuple Fields', () => {
  let client: CerialClient;

  beforeEach(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, UNSET_TABLES);
  });

  afterEach(async () => {
    await client.disconnect();
  });

  // ─── Entire optional tuple ────────────────────────────────────────────────

  test('unsets an entire optional tuple (backup)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T1',
        address: { street: 'A', city: 'SF' },
        pos: [37.7, -122.4],
        backup: [34.0, -118.2],
        nested: NESTED,
      },
    });
    expect(record.backup).toBeDefined();

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { backup: true },
    });

    expect(updated!.backup).toBeUndefined();
    expect(updated!.pos).toEqual([37.7, -122.4]);
  });

  // ─── Optional tuple element via $this reconstruction ──────────────────────

  test('unsets optional tuple element (UnsetOptTuple[1])', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T2',
        address: { street: 'B', city: 'NYC' },
        pos: [40.0, -74.0],
        opt: ['label', 42.5],
        nested: NESTED,
      },
    });
    expect(record.opt).toEqual(['label', 42.5]);

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { opt: { 1: true } },
    });

    expect(updated!.opt).toBeDefined();
    expect(updated!.opt![0]).toBe('label');
    expect(updated!.opt![1]).toBeUndefined();
  });

  // ─── Object-in-tuple sub-field unset ──────────────────────────────────────

  test('unsets optional sub-field of object within tuple (UnsetObjTuple[1].extra)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T3',
        address: { street: 'C', city: 'NYC' },
        pos: [40.0, -74.0],
        tagged: ['my-tag', { value: 'hello', extra: 'world' }],
        nested: NESTED,
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { tagged: { 1: { extra: true } } },
    });

    expect(updated!.tagged).toBeDefined();
    expect(updated!.tagged![0]).toBe('my-tag');
    const inner = updated!.tagged![1] as unknown as Record<string, unknown>;
    expect(inner.value).toBe('hello');
    expect(inner.extra).toBeUndefined();
  });

  // ─── Deep tuple (UnsetDeepTuple) ──────────────────────────────────────────

  test('unsets entire optional deep tuple', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T4',
        address: { street: 'D', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        deepTuple: ['tag', { label: 'L', deep: { code: 'C' } }],
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { deepTuple: true },
    });

    expect(updated!.deepTuple).toBeUndefined();
  });

  test('unsets 2nd level field within deep tuple object (deepTuple[1].score)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T5',
        address: { street: 'E', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        deepTuple: ['tag', { label: 'L', score: 77, deep: { code: 'C', note: 'N' } }],
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { deepTuple: { 1: { score: true } } },
    });

    expect(updated!.deepTuple).toBeDefined();
    expect(updated!.deepTuple![0]).toBe('tag');
    const mid = updated!.deepTuple![1] as unknown as Record<string, unknown>;
    expect(mid.label).toBe('L');
    expect(mid.score).toBeUndefined();
    const deep = mid.deep as Record<string, unknown>;
    expect(deep.code).toBe('C');
    expect(deep.note).toBe('N');
  });

  test('unsets 3rd level field within deep tuple object (deepTuple[1].deep.note)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T6',
        address: { street: 'F', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        deepTuple: ['tag', { label: 'L', score: 88, deep: { code: 'C', note: 'N' } }],
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { deepTuple: { 1: { deep: { note: true } } } },
    });

    const mid = updated!.deepTuple![1] as unknown as Record<string, unknown>;
    expect(mid.score).toBe(88);
    const deep = mid.deep as Record<string, unknown>;
    expect(deep.code).toBe('C');
    expect(deep.note).toBeUndefined();
  });

  test('unsets multiple deep fields within tuple (score + note)', async () => {
    const record = await client.db.UnsetTest.create({
      data: {
        name: 'T7',
        address: { street: 'G', city: 'NYC' },
        pos: [40.0, -74.0],
        nested: NESTED,
        deepTuple: ['tag', { label: 'L', score: 55, deep: { code: 'C', note: 'keep' } }],
      },
    });

    const updated = await client.db.UnsetTest.updateUnique({
      where: { id: record.id },
      data: {},
      unset: { deepTuple: { 1: { score: true, deep: { note: true } } } },
    });

    const mid = updated!.deepTuple![1] as unknown as Record<string, unknown>;
    expect(mid.label).toBe('L');
    expect(mid.score).toBeUndefined();
    const deep = mid.deep as Record<string, unknown>;
    expect(deep.code).toBe('C');
    expect(deep.note).toBeUndefined();
  });
});
