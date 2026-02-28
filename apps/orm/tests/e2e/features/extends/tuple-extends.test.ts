import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { CerialId } from 'cerial';
import {
  type CerialClient,
  cleanupTables,
  createTestClient,
  TUPLE_TABLES,
  testConfig,
  truncateTables,
} from './helpers';

describe('E2E Extends: Tuple Inheritance', () => {
  let client: CerialClient;

  beforeAll(async () => {
    client = createTestClient();
    await client.connect(testConfig);
    await cleanupTables(client, TUPLE_TABLES);
  });

  afterAll(async () => {
    await client.disconnect();
  });

  beforeEach(async () => {
    await truncateTables(client, TUPLE_TABLES);
  });

  describe('create with ExtTriple (append inheritance)', () => {
    test('creates with parent elements + appended Bool', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['hello', 42],
          triple: ['world', 99, true],
          namedTriple: ['Alice', 30, true],
          quad: ['test', 1, false, 3.14],
          coordPair: [
            { x: 1.0, y: 2.0 },
            { x: 3.0, y: 4.0 },
          ],
        },
      });

      expect(result.id).toBeInstanceOf(CerialId);
      // ExtTriple = ExtBasePair(String, Int) + Bool
      expect(result.triple).toEqual(['world', 99, true]);
      expect(result.triple[0]).toBe('world'); // from parent [0]
      expect(result.triple[1]).toBe(99); // from parent [1]
      expect(result.triple[2]).toBe(true); // appended
    });

    test('element order: parent elements first then child', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['a', 1],
          triple: ['first', 2, false],
          namedTriple: ['name', 10, false],
          quad: ['q', 0, true, 0.0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 1, y: 1 },
          ],
        },
      });

      // Position 0 = String (from parent), Position 1 = Int (from parent), Position 2 = Bool (child)
      expect(typeof result.triple[0]).toBe('string');
      expect(typeof result.triple[1]).toBe('number');
      expect(typeof result.triple[2]).toBe('boolean');
    });
  });

  describe('create with ExtNamedTriple (named elements)', () => {
    test('creates with named element input (array form)', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 2, true],
          namedTriple: ['Bob', 25, false],
          quad: ['q', 0, true, 1.0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      // ExtNamedTriple = ExtNamedPair(name: String, age: Int) + active: Bool
      expect(result.namedTriple).toEqual(['Bob', 25, false]);
    });

    test('creates with named element input (object form)', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 2, true],
          namedTriple: { name: 'Carol', age: 40, active: true },
          quad: ['q', 0, true, 1.0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      // Output is always array form
      expect(result.namedTriple).toEqual(['Carol', 40, true]);
    });

    test('output is always array form even with named input', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 2, true],
          namedTriple: { name: 'Named', age: 50, active: false },
          quad: ['q', 0, true, 1.0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      expect(Array.isArray(result.namedTriple)).toBe(true);
      expect(result.namedTriple[0]).toBe('Named');
      expect(result.namedTriple[1]).toBe(50);
      expect(result.namedTriple[2]).toBe(false);
    });
  });

  describe('create with ExtQuad (multi-level inheritance)', () => {
    test('creates with 4 elements from multi-level chain', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 2, true],
          namedTriple: ['n', 3, false],
          // biome-ignore lint/suspicious/noApproximativeNumericConstant: 2.718 is a deliberate test value, not Math.E
          quad: ['multi', 10, true, 2.718],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      // ExtQuad = ExtTriple(ExtBasePair(String, Int) + Bool) + Float
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: 2.718 is a deliberate test value, not Math.E
      expect(result.quad).toEqual(['multi', 10, true, 2.718]);
      expect(result.quad[0]).toBe('multi'); // from ExtBasePair
      expect(result.quad[1]).toBe(10); // from ExtBasePair
      expect(result.quad[2]).toBe(true); // from ExtTriple
      // biome-ignore lint/suspicious/noApproximativeNumericConstant: 2.718 is a deliberate test value, not Math.E
      expect(result.quad[3]).toBe(2.718); // own element
    });

    test('quad preserves element order through inheritance chain', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['a', 0],
          triple: ['b', 0, false],
          namedTriple: ['c', 0, false],
          quad: ['str', 42, false, 9.99],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      expect(typeof result.quad[0]).toBe('string');
      expect(typeof result.quad[1]).toBe('number');
      expect(typeof result.quad[2]).toBe('boolean');
      expect(typeof result.quad[3]).toBe('number');
    });
  });

  describe('create with ExtCoordPair (object elements)', () => {
    test('creates tuple with object elements', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 2, true],
          namedTriple: ['n', 3, false],
          quad: ['q', 0, true, 1.0],
          coordPair: [
            { x: 10.5, y: 20.5 },
            { x: 30.5, y: 40.5 },
          ],
        },
      });

      expect(result.coordPair[0]).toEqual({ x: 10.5, y: 20.5 });
      expect(result.coordPair[1]).toEqual({ x: 30.5, y: 40.5 });
    });

    test('object elements preserve structure', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 2, true],
          namedTriple: ['n', 3, false],
          quad: ['q', 0, true, 1.0],
          coordPair: [
            { x: 0.0, y: 0.0 },
            { x: 100.0, y: -50.0 },
          ],
        },
      });

      expect(result.coordPair[0]!.x).toBe(0.0);
      expect(result.coordPair[0]!.y).toBe(0.0);
      expect(result.coordPair[1]!.x).toBe(100.0);
      expect(result.coordPair[1]!.y).toBe(-50.0);
    });
  });

  describe('create with ExtBasePair', () => {
    test('creates base pair tuple', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['base', 100],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      expect(result.pair).toEqual(['base', 100]);
    });
  });

  describe('per-element update on extended tuple', () => {
    test('updates individual elements of triple using object form', async () => {
      const created = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['old', 10, false],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const updated = await client.db.ExtTupleModel.updateMany({
        where: { id: created.id },
        data: { triple: { 0: 'new', 2: true } },
      });

      expect(updated[0]!.triple[0]).toBe('new');
      expect(updated[0]!.triple[1]).toBe(10); // preserved
      expect(updated[0]!.triple[2]).toBe(true);
    });

    test('updates named tuple elements by name', async () => {
      const created = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 0, true],
          namedTriple: ['OldName', 20, true],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const updated = await client.db.ExtTupleModel.updateMany({
        where: { id: created.id },
        data: { namedTriple: { name: 'NewName', active: false } },
      });

      expect(updated[0]!.namedTriple[0]).toBe('NewName');
      expect(updated[0]!.namedTriple[1]).toBe(20); // preserved
      expect(updated[0]!.namedTriple[2]).toBe(false);
    });

    test('full replace of triple with array form', async () => {
      const created = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['old', 10, false],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const updated = await client.db.ExtTupleModel.updateMany({
        where: { id: created.id },
        data: { triple: ['replaced', 999, true] },
      });

      expect(updated[0]!.triple).toEqual(['replaced', 999, true]);
    });

    test('updates quad per-element', async () => {
      const created = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['old', 1, true, 1.0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const updated = await client.db.ExtTupleModel.updateMany({
        where: { id: created.id },
        data: { quad: { 3: 9.99 } },
      });

      expect(updated[0]!.quad[0]).toBe('old'); // preserved
      expect(updated[0]!.quad[3]).toBe(9.99);
    });
  });

  describe('where filtering on tuple elements', () => {
    test('filters by parent element (index 0)', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['target', 1],
          triple: ['target', 1, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['other', 2],
          triple: ['other', 2, false],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const results = await client.db.ExtTupleModel.findMany({
        where: { triple: { 0: 'target' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.triple[0]).toBe('target');
    });

    test('filters by child element (index 2)', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['a', 1],
          triple: ['a', 1, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['b', 2],
          triple: ['b', 2, false],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const results = await client.db.ExtTupleModel.findMany({
        where: { triple: { 2: true } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.triple[2]).toBe(true);
    });

    test('filters by named element name', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['a', 1],
          triple: ['t', 0, true],
          namedTriple: ['FindMe', 99, true],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const results = await client.db.ExtTupleModel.findMany({
        where: { namedTriple: { name: 'FindMe' } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.namedTriple[0]).toBe('FindMe');
    });

    test('filters quad by multi-level inherited element', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['a', 1],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['findQuad', 42, true, 3.14],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const results = await client.db.ExtTupleModel.findMany({
        where: { quad: { 0: 'findQuad', 1: 42 } },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.quad).toEqual(['findQuad', 42, true, 3.14]);
    });
  });

  describe('optional tuple field', () => {
    test('optionalTriple is undefined when not provided', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      expect(result.optionalTriple).toBeUndefined();
    });

    test('creates with optionalTriple provided', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          optionalTriple: ['hello', 42, true],
        },
      });

      expect(result.optionalTriple).toEqual(['hello', 42, true]);
    });

    test('optionalTriple with nullable elements', async () => {
      const result = await client.db.ExtTupleModel.create({
        data: {
          pair: ['p', 1],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
          optionalTriple: [null, null, null],
        },
      });

      expect(result.optionalTriple).toEqual([null, null, null]);
    });
  });

  describe('select on tuple fields', () => {
    test('selects only specific tuple fields', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['sel', 1],
          triple: ['sel', 2, true],
          namedTriple: ['sel', 3, false],
          quad: ['sel', 4, true, 5.0],
          coordPair: [
            { x: 1, y: 2 },
            { x: 3, y: 4 },
          ],
        },
      });

      const results = await client.db.ExtTupleModel.findMany({
        select: { triple: true, quad: true },
      });

      expect(results).toHaveLength(1);
      expect(results[0]!.triple).toEqual(['sel', 2, true]);
      expect(results[0]!.quad).toEqual(['sel', 4, true, 5.0]);
      expect('pair' in results[0]!).toBe(false);
      expect('namedTriple' in results[0]!).toBe(false);
    });
  });

  describe('count and exists', () => {
    test('count all tuple models', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['a', 1],
          triple: ['a', 1, true],
          namedTriple: ['a', 1, true],
          quad: ['a', 1, true, 1],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['b', 2],
          triple: ['b', 2, false],
          namedTriple: ['b', 2, false],
          quad: ['b', 2, false, 2],
          coordPair: [
            { x: 1, y: 1 },
            { x: 2, y: 2 },
          ],
        },
      });

      const count = await client.db.ExtTupleModel.count();

      expect(count).toBe(2);
    });

    test('exists with tuple element filter', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['exists', 999],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const exists = await client.db.ExtTupleModel.exists({ pair: { 1: 999 } });
      const notExists = await client.db.ExtTupleModel.exists({ pair: { 1: -1 } });

      expect(exists).toBe(true);
      expect(notExists).toBe(false);
    });
  });

  describe('delete with tuple filter', () => {
    test('deletes by tuple element', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['delete-me', 1],
          triple: ['t', 0, true],
          namedTriple: ['n', 0, false],
          quad: ['q', 0, true, 0],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const count = await client.db.ExtTupleModel.deleteMany({
        where: { pair: { 0: 'delete-me' } },
      });

      expect(count).toBe(1);
    });
  });

  describe('findMany with tuples (no args)', () => {
    test('returns all records with correct tuple shapes', async () => {
      await client.db.ExtTupleModel.create({
        data: {
          pair: ['x', 1],
          triple: ['x', 1, true],
          namedTriple: ['x', 1, true],
          quad: ['x', 1, true, 1],
          coordPair: [
            { x: 0, y: 0 },
            { x: 0, y: 0 },
          ],
        },
      });

      const all = await client.db.ExtTupleModel.findMany();

      expect(all).toHaveLength(1);
      const item = all[0]!;
      expect(item.id).toBeInstanceOf(CerialId);
      expect(item.pair).toHaveLength(2);
      expect(item.triple).toHaveLength(3);
      expect(item.namedTriple).toHaveLength(3);
      expect(item.quad).toHaveLength(4);
      expect(item.coordPair).toHaveLength(2);
    });
  });
});
