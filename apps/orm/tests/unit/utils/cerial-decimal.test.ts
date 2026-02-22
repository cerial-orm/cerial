import { describe, expect, test } from 'bun:test';
import { Decimal } from 'surrealdb';
import { CerialDecimal, isCerialDecimal } from '../../../src/utils/cerial-decimal';

describe('CerialDecimal', () => {
  describe('constructor', () => {
    test('from string', () => {
      const d = new CerialDecimal('123.45');
      expect(d.toString()).toBe('123.45');
    });

    test('from number', () => {
      const d = new CerialDecimal(42.5);
      expect(d.toNumber()).toBe(42.5);
    });

    test('from SDK Decimal', () => {
      const native = new Decimal('99.99');
      const d = new CerialDecimal(native);
      expect(d.toString()).toBe('99.99');
    });

    test('from CerialDecimal (copy)', () => {
      const original = new CerialDecimal('10.5');
      const copy = new CerialDecimal(original);
      expect(copy.toString()).toBe('10.5');
      expect(copy.equals(original)).toBe(true);
    });

    test('throws on empty string', () => {
      expect(() => new CerialDecimal('')).toThrow('Invalid decimal string: empty string');
    });

    test('throws on invalid type', () => {
      expect(() => new CerialDecimal(true as any)).toThrow('Invalid input type for CerialDecimal');
    });

    test('from zero', () => {
      const d = new CerialDecimal(0);
      expect(d.isZero()).toBe(true);
    });

    test('from negative number', () => {
      const d = new CerialDecimal(-5.5);
      expect(d.isNegative()).toBe(true);
    });

    test('from integer', () => {
      const d = new CerialDecimal(100);
      expect(d.toNumber()).toBe(100);
    });
  });

  describe('static methods', () => {
    test('is() returns true for CerialDecimal', () => {
      expect(CerialDecimal.is(new CerialDecimal('1'))).toBe(true);
    });

    test('is() returns false for non-CerialDecimal', () => {
      expect(CerialDecimal.is('1')).toBe(false);
      expect(CerialDecimal.is(1)).toBe(false);
      expect(CerialDecimal.is(null)).toBe(false);
      expect(CerialDecimal.is(new Decimal('1'))).toBe(false);
    });

    test('from() creates instance', () => {
      const d = CerialDecimal.from('3.14');
      expect(d.toString()).toBe('3.14');
    });

    test('parse() creates instance', () => {
      const d = CerialDecimal.parse(42);
      expect(d.toNumber()).toBe(42);
    });
  });

  describe('arithmetic', () => {
    test('add', () => {
      const a = new CerialDecimal('10.5');
      const b = new CerialDecimal('3.2');
      const result = a.add(b);
      expect(result.toString()).toBe('13.7');
      expect(a.toString()).toBe('10.5');
    });

    test('add with string', () => {
      const result = new CerialDecimal('10').add('5');
      expect(result.toString()).toBe('15');
    });

    test('add with number', () => {
      const result = new CerialDecimal('10').add(5);
      expect(result.toString()).toBe('15');
    });

    test('sub', () => {
      const result = new CerialDecimal('10.5').sub('3.2');
      expect(result.toString()).toBe('7.3');
    });

    test('mul', () => {
      const result = new CerialDecimal('3').mul('4');
      expect(result.toString()).toBe('12');
    });

    test('div', () => {
      const result = new CerialDecimal('10').div('4');
      expect(result.toString()).toBe('2.5');
    });
  });

  describe('comparison', () => {
    test('equals - same value', () => {
      expect(new CerialDecimal('5').equals('5')).toBe(true);
    });

    test('equals - different values', () => {
      expect(new CerialDecimal('5').equals('6')).toBe(false);
    });

    test('equals - CerialDecimal input', () => {
      const a = new CerialDecimal('5');
      const b = new CerialDecimal('5');
      expect(a.equals(b)).toBe(true);
    });

    test('compareTo - less than', () => {
      expect(new CerialDecimal('3').compareTo('5')).toBeLessThan(0);
    });

    test('compareTo - greater than', () => {
      expect(new CerialDecimal('5').compareTo('3')).toBeGreaterThan(0);
    });

    test('compareTo - equal', () => {
      expect(new CerialDecimal('5').compareTo('5')).toBe(0);
    });

    test('isZero - zero', () => {
      expect(new CerialDecimal(0).isZero()).toBe(true);
    });

    test('isZero - non-zero', () => {
      expect(new CerialDecimal(1).isZero()).toBe(false);
    });

    test('isNegative - negative', () => {
      expect(new CerialDecimal('-5').isNegative()).toBe(true);
    });

    test('isNegative - positive', () => {
      expect(new CerialDecimal('5').isNegative()).toBe(false);
    });

    test('isNegative - zero', () => {
      expect(new CerialDecimal(0).isNegative()).toBe(false);
    });
  });

  describe('serialization', () => {
    test('toString', () => {
      expect(new CerialDecimal('123.456').toString()).toBe('123.456');
    });

    test('toJSON', () => {
      expect(new CerialDecimal('99.99').toJSON()).toBe('99.99');
    });

    test('toNumber (LOSSY)', () => {
      expect(new CerialDecimal('42.5').toNumber()).toBe(42.5);
    });

    test('valueOf', () => {
      expect(new CerialDecimal('42.5').valueOf()).toBe(42.5);
    });
  });

  describe('SDK interop', () => {
    test('toNative returns Decimal', () => {
      const d = new CerialDecimal('5.5');
      const native = d.toNative();
      expect(native instanceof Decimal).toBe(true);
      expect(native.toString()).toBe('5.5');
    });

    test('clone returns new instance', () => {
      const original = new CerialDecimal('5.5');
      const cloned = original.clone();
      expect(cloned.equals(original)).toBe(true);
      expect(cloned).not.toBe(original);
    });
  });

  describe('isCerialDecimal', () => {
    test('returns true for CerialDecimal', () => {
      expect(isCerialDecimal(new CerialDecimal('1'))).toBe(true);
    });

    test('returns false for non-CerialDecimal', () => {
      expect(isCerialDecimal('1')).toBe(false);
      expect(isCerialDecimal(1)).toBe(false);
      expect(isCerialDecimal(null)).toBe(false);
    });
  });
});
