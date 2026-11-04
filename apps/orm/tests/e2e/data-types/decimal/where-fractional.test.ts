import { beforeEach, describe, expect, test } from 'bun:test';
import { CerialDecimal } from 'cerial';
import { tables } from '../../test-helper';
import { setupDataTypeTests } from '../test-factory';

// SurrealDB 4.0 compares a float parameter with a decimal as unequal, so every
// operator is exercised with fractional values given as a JS number and as a CerialDecimal.
describe('E2E Decimal: Where with fractional values', () => {
  const { getClient } = setupDataTypeTests(tables.decimal);

  const names = (rows: { name: string }[]) => rows.map((r) => r.name).sort();

  beforeEach(async () => {
    const client = getClient();
    await client.db.DecimalBasic.create({ data: { name: 'a', price: '0.1', tax: null, amounts: ['0.1', '0.2'] } });
    await client.db.DecimalBasic.create({ data: { name: 'b', price: '0.2', tax: '0.5', amounts: ['0.3'] } });
    await client.db.DecimalBasic.create({ data: { name: 'c', price: '0.3', tax: '1.5', amounts: [] } });
    await client.db.DecimalWithObject.create({ data: { name: 'o1', pricing: { amount: '0.1', fee: '0.25' } } });
    await client.db.DecimalWithObject.create({ data: { name: 'o2', pricing: { amount: '0.2' } } });
  });

  describe('scalar field', () => {
    test('eq, as a number, a CerialDecimal and a string', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { price: 0.1 } }))).toEqual(['a']);
      expect(names(await DecimalBasic.findMany({ where: { price: { eq: 0.2 } } }))).toEqual(['b']);
      expect(names(await DecimalBasic.findMany({ where: { price: CerialDecimal.from('0.3') } }))).toEqual(['c']);
      expect(names(await DecimalBasic.findMany({ where: { price: { eq: CerialDecimal.from('0.1') } } }))).toEqual([
        'a',
      ]);
    });

    test('equals a value no row holds matches nothing', async () => {
      const { DecimalBasic } = getClient().db;
      expect(await DecimalBasic.findMany({ where: { price: 0.4 } })).toHaveLength(0);
      expect(await DecimalBasic.findMany({ where: { price: CerialDecimal.from('0.15') } })).toHaveLength(0);
    });

    test('neq excludes the match and keeps the rest', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { price: { neq: 0.1 } } }))).toEqual(['b', 'c']);
      expect(names(await DecimalBasic.findMany({ where: { price: { neq: CerialDecimal.from('0.2') } } }))).toEqual([
        'a',
        'c',
      ]);
      expect(await DecimalBasic.findMany({ where: { price: { neq: 0.4 } } })).toHaveLength(3);
    });

    test('lt, lte, gt, gte', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { price: { lt: 0.2 } } }))).toEqual(['a']);
      expect(names(await DecimalBasic.findMany({ where: { price: { lte: 0.2 } } }))).toEqual(['a', 'b']);
      expect(names(await DecimalBasic.findMany({ where: { price: { gt: 0.2 } } }))).toEqual(['c']);
      expect(names(await DecimalBasic.findMany({ where: { price: { gte: 0.2 } } }))).toEqual(['b', 'c']);
      expect(names(await DecimalBasic.findMany({ where: { price: { gte: CerialDecimal.from('0.3') } } }))).toEqual([
        'c',
      ]);
    });

    test('lt, lte, gt, gte at the edges match nothing', async () => {
      const { DecimalBasic } = getClient().db;
      expect(await DecimalBasic.findMany({ where: { price: { lt: 0.1 } } })).toHaveLength(0);
      expect(await DecimalBasic.findMany({ where: { price: { lte: 0.05 } } })).toHaveLength(0);
      expect(await DecimalBasic.findMany({ where: { price: { gt: 0.3 } } })).toHaveLength(0);
      expect(await DecimalBasic.findMany({ where: { price: { gte: 0.31 } } })).toHaveLength(0);
    });

    test('in and notIn', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { price: { in: [0.1, 0.3] } } }))).toEqual(['a', 'c']);
      expect(
        names(await DecimalBasic.findMany({ where: { price: { in: [CerialDecimal.from('0.2'), 0.3] } } })),
      ).toEqual(['b', 'c']);
      expect(await DecimalBasic.findMany({ where: { price: { in: [0.4, 0.5] } } })).toHaveLength(0);
      expect(names(await DecimalBasic.findMany({ where: { price: { notIn: [0.1, 0.3] } } }))).toEqual(['b']);
      expect(await DecimalBasic.findMany({ where: { price: { notIn: [0.4] } } })).toHaveLength(3);
      expect(await DecimalBasic.findMany({ where: { price: { notIn: [0.1, 0.2, 0.3] } } })).toHaveLength(0);
    });

    test('between', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { price: { between: [0.1, 0.2] } } }))).toEqual(['a', 'b']);
      expect(await DecimalBasic.findMany({ where: { price: { between: [0.31, 0.9] } } })).toHaveLength(0);
    });

    test('nullable field compares fractional values and keeps null rows out', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { tax: 0.5 } }))).toEqual(['b']);
      expect(names(await DecimalBasic.findMany({ where: { tax: { gt: 0.5 } } }))).toEqual(['c']);
      expect(names(await DecimalBasic.findMany({ where: { tax: { in: [0.5, 1.5] } } }))).toEqual(['b', 'c']);
      expect(await DecimalBasic.findMany({ where: { tax: 0.75 } })).toHaveLength(0);
    });
  });

  describe('Decimal[] field', () => {
    test('has', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { amounts: { has: 0.1 } } }))).toEqual(['a']);
      expect(names(await DecimalBasic.findMany({ where: { amounts: { has: CerialDecimal.from('0.3') } } }))).toEqual([
        'b',
      ]);
      expect(await DecimalBasic.findMany({ where: { amounts: { has: 0.4 } } })).toHaveLength(0);
    });

    test('hasAll', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { amounts: { hasAll: [0.1, 0.2] } } }))).toEqual(['a']);
      expect(await DecimalBasic.findMany({ where: { amounts: { hasAll: [0.1, 0.3] } } })).toHaveLength(0);
    });

    test('hasAny', async () => {
      const { DecimalBasic } = getClient().db;
      expect(names(await DecimalBasic.findMany({ where: { amounts: { hasAny: [0.2, 0.3] } } }))).toEqual(['a', 'b']);
      expect(await DecimalBasic.findMany({ where: { amounts: { hasAny: [0.4, 0.5] } } })).toHaveLength(0);
    });
  });

  describe('Decimal inside an object', () => {
    test('equals, comparison, in and notIn', async () => {
      const { DecimalWithObject } = getClient().db;
      expect(names(await DecimalWithObject.findMany({ where: { pricing: { amount: 0.1 } } }))).toEqual(['o1']);
      expect(
        names(await DecimalWithObject.findMany({ where: { pricing: { amount: { eq: CerialDecimal.from('0.2') } } } })),
      ).toEqual(['o2']);
      expect(await DecimalWithObject.findMany({ where: { pricing: { amount: 0.4 } } })).toHaveLength(0);
      expect(names(await DecimalWithObject.findMany({ where: { pricing: { amount: { gt: 0.1 } } } }))).toEqual(['o2']);
      expect(names(await DecimalWithObject.findMany({ where: { pricing: { amount: { lte: 0.1 } } } }))).toEqual(['o1']);
      expect(names(await DecimalWithObject.findMany({ where: { pricing: { amount: { in: [0.2, 0.9] } } } }))).toEqual([
        'o2',
      ]);
      expect(names(await DecimalWithObject.findMany({ where: { pricing: { amount: { notIn: [0.2] } } } }))).toEqual([
        'o1',
      ]);
      expect(await DecimalWithObject.findMany({ where: { pricing: { amount: { in: [0.4] } } } })).toHaveLength(0);
    });

    test('optional sub-field', async () => {
      const { DecimalWithObject } = getClient().db;
      expect(names(await DecimalWithObject.findMany({ where: { pricing: { fee: 0.25 } } }))).toEqual(['o1']);
      expect(await DecimalWithObject.findMany({ where: { pricing: { fee: 0.3 } } })).toHaveLength(0);
    });
  });
  describe('Decimal inside a tuple', () => {
    test('element comparison with a fractional value', async () => {
      const { DecimalWithTuple } = getClient().db;
      await DecimalWithTuple.create({ data: { name: 't1', pair: [0.1, undefined] } });
      await DecimalWithTuple.create({ data: { name: 't2', pair: [0.2, undefined] } });
      expect(names(await DecimalWithTuple.findMany({ where: { pair: { 0: 0.1 } } }))).toEqual(['t1']);
      expect(names(await DecimalWithTuple.findMany({ where: { pair: { 0: { gt: 0.1 } } } }))).toEqual(['t2']);
      expect(names(await DecimalWithTuple.findMany({ where: { pair: { 0: { in: [0.2, 0.9] } } } }))).toEqual(['t2']);
      expect(await DecimalWithTuple.findMany({ where: { pair: { 0: 0.15 } } })).toHaveLength(0);
    });
  });
});
