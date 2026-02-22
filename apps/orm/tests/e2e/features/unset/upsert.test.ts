/**
 * E2E: Unset — Upsert
 *
 * Tests the `unset` parameter on upsert across all field types.
 * Key behavior: unset only applies to the UPDATE branch; the CREATE
 * branch ignores unset entirely.
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

const UNSET_TABLES = tables.unset;
const NESTED = { title: 'T', mid: { label: 'L', deep: { code: 'C' } } };
const NESTED_FULL = { title: 'T', mid: { label: 'L', score: 99, deep: { code: 'C', note: 'N' } }, desc: 'D' };
const CREATE_BASE = {
  name: 'New',
  address: { street: 'X', city: 'X' },
  pos: [0, 0] as [number, number],
  nested: NESTED,
};

describe('Unset: Upsert', () => {
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

  // ─── Primitive ────────────────────────────────────────────────────────────

  describe('primitive', () => {
    test('unset applies to update branch (record exists)', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'Existing',
          bio: 'Old bio',
          address: { street: 'D', city: 'Chicago' },
          pos: [41.8, -87.6],
          nested: NESTED,
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: { ...CREATE_BASE, bio: 'Created bio' },
        update: { name: 'Updated Existing' },
        unset: { bio: true },
      });

      expect(result!.name).toBe('Updated Existing');
      expect(result!.bio).toBeUndefined();
    });

    test('unset does not apply to create branch (new record)', async () => {
      const result = await client.db.UnsetTest.upsert({
        where: { id: 'upsert-prim-new' },
        create: { ...CREATE_BASE, name: 'Fresh', bio: 'Fresh bio' },
        update: { name: 'Should not happen' },
        unset: { bio: true },
      });

      expect(result!.name).toBe('Fresh');
      expect(result!.bio).toBe('Fresh bio');
    });

    test('unsets multiple primitives on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'Multi',
          bio: 'Bio',
          age: 42,
          address: { street: 'G', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { bio: true, age: true },
      });

      expect(result!.bio).toBeUndefined();
      expect(result!.age).toBeUndefined();
      expect(result!.name).toBe('Multi');
    });
  });

  // ─── Object fields ────────────────────────────────────────────────────────

  describe('object fields', () => {
    test('unsets entire optional object on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'ObjU1',
          address: { street: 'A', city: 'NYC' },
          shipping: { street: 'Ship', city: 'Boston' },
          pos: [40.0, -74.0],
          nested: NESTED,
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { shipping: true },
      });

      expect(result!.shipping).toBeUndefined();
    });

    test('unsets object sub-field on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'ObjU2',
          address: { street: 'A', city: 'NYC', zip: '10001' },
          pos: [40.0, -74.0],
          nested: NESTED,
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { address: { zip: true } },
      });

      expect(result!.address.zip).toBeUndefined();
      expect(result!.address.street).toBe('A');
    });

    test('create branch ignores object sub-field unset', async () => {
      const result = await client.db.UnsetTest.upsert({
        where: { id: 'upsert-obj-new' },
        create: { ...CREATE_BASE, address: { street: 'Main', city: 'LA', zip: '90001' } },
        update: {},
        unset: { address: { zip: true } },
      });

      expect(result!.address.zip).toBe('90001');
    });
  });

  // ─── Deep nested (3 levels) ───────────────────────────────────────────────

  describe('deep nested', () => {
    test('unsets 3rd level deep on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: { name: 'DeepU1', address: { street: 'A', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED_FULL },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: { ...CREATE_BASE, nested: NESTED_FULL },
        update: {},
        unset: { nested: { mid: { deep: { note: true } } } },
      });

      expect(result!.nested.mid.deep.note).toBeUndefined();
      expect(result!.nested.mid.deep.code).toBe('C');
      expect(result!.nested.mid.score).toBe(99);
    });

    test('create branch ignores deep nested unset', async () => {
      const result = await client.db.UnsetTest.upsert({
        where: { id: 'upsert-deep-new' },
        create: { ...CREATE_BASE, nested: NESTED_FULL },
        update: {},
        unset: { nested: { mid: { deep: { note: true } } } },
      });

      expect(result!.nested.mid.deep.note).toBe('N');
    });

    test('unsets multiple deep levels on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: { name: 'DeepU2', address: { street: 'B', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED_FULL },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: { ...CREATE_BASE, nested: NESTED_FULL },
        update: {},
        unset: { nested: { desc: true, mid: { score: true, deep: { note: true } } } },
      });

      expect(result!.nested.desc).toBeUndefined();
      expect(result!.nested.mid.score).toBeUndefined();
      expect(result!.nested.mid.deep.note).toBeUndefined();
      expect(result!.nested.title).toBe('T');
      expect(result!.nested.mid.label).toBe('L');
      expect(result!.nested.mid.deep.code).toBe('C');
    });
  });

  // ─── Tuple fields ─────────────────────────────────────────────────────────

  describe('tuple fields', () => {
    test('unsets entire optional tuple on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'TupleU1',
          address: { street: 'A', city: 'NYC' },
          pos: [40.0, -74.0],
          backup: [37.0, -122.0],
          nested: NESTED,
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { backup: true },
      });

      expect(result!.backup).toBeUndefined();
    });

    test('create branch ignores tuple unset', async () => {
      const result = await client.db.UnsetTest.upsert({
        where: { id: 'upsert-tuple-new' },
        create: { ...CREATE_BASE, backup: [1.0, 2.0] },
        update: {},
        unset: { backup: true },
      });

      expect(result!.backup).toEqual([1.0, 2.0]);
    });

    test('unsets deep field within tuple object on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'TupleU2',
          address: { street: 'A', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          deepTuple: ['tag', { label: 'L', score: 42, deep: { code: 'C', note: 'N' } }],
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { deepTuple: { 1: { score: true, deep: { note: true } } } },
      });

      expect(result!.deepTuple).toBeDefined();
      const mid = result!.deepTuple![1];
      expect(mid.label).toBe('L');
      expect(mid.score).toBeUndefined();
      expect(mid.deep.note).toBeUndefined();
    });
  });

  // ─── Self-referencing types in upsert ─────────────────────────────────────

  describe('self-referencing', () => {
    test('unsets self-referencing object on update branch', async () => {
      const record = await client.db.UnsetTest.create({
        data: {
          name: 'SRU1',
          address: { street: 'A', city: 'NYC' },
          pos: [40.0, -74.0],
          nested: NESTED,
          tree: { value: 'root', extra: 'note' },
        },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { tree: { extra: true } },
      });

      expect(result!.tree!.value).toBe('root');
      expect(result!.tree!.extra).toBeUndefined();
    });

    test('create branch ignores self-referencing unset', async () => {
      const result = await client.db.UnsetTest.upsert({
        where: { id: 'upsert-sr-new' },
        create: { ...CREATE_BASE, tree: { value: 'root', extra: 'keep' } },
        update: {},
        unset: { tree: { extra: true } },
      });

      expect(result!.tree!.extra).toBe('keep');
    });
  });

  // ─── Select + Return options ──────────────────────────────────────────────

  describe('select and return', () => {
    test('unset with select returns only selected fields', async () => {
      const record = await client.db.UnsetTest.create({
        data: { name: 'SelU1', bio: 'Bio', address: { street: 'A', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: { name: 'SelU1 Updated' },
        unset: { bio: true },
        select: { id: true, name: true, bio: true },
      });

      expect(result!.name).toBe('SelU1 Updated');
      expect(result!.bio).toBeUndefined();
    });

    test('unset with return: true returns boolean', async () => {
      const record = await client.db.UnsetTest.create({
        data: { name: 'RetU1', bio: 'Bio', address: { street: 'A', city: 'NYC' }, pos: [40.0, -74.0], nested: NESTED },
      });

      const result = await client.db.UnsetTest.upsert({
        where: { id: record.id },
        create: CREATE_BASE,
        update: {},
        unset: { bio: true },
        return: true,
      });

      expect(result).toBe(true);

      const fetched = await client.db.UnsetTest.findUnique({ where: { id: record.id } });
      expect(fetched!.bio).toBeUndefined();
    });
  });
});
