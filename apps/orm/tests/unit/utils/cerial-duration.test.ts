import { describe, expect, test } from 'bun:test';
import { Duration } from 'surrealdb';
import { CerialDuration, isCerialDuration } from '../../../src/utils/cerial-duration';

describe('CerialDuration', () => {
  describe('construction', () => {
    test('from string', () => {
      const dur = new CerialDuration('1h30m');
      expect(dur.toString()).toBe('1h30m');
    });

    test('from SDK Duration', () => {
      const native = new Duration('45m');
      const dur = new CerialDuration(native);
      expect(dur.toString()).toBe('45m');
    });

    test('from another CerialDuration', () => {
      const original = new CerialDuration('2h');
      const copy = new CerialDuration(original);
      expect(copy.toString()).toBe('2h');
    });

    test('rejects empty string', () => {
      expect(() => new CerialDuration('')).toThrow('Invalid duration string');
    });

    test('rejects invalid string', () => {
      expect(() => new CerialDuration('not-a-duration')).toThrow('Invalid duration string');
    });

    test('rejects invalid input type', () => {
      expect(() => new CerialDuration(123 as unknown as string)).toThrow('Invalid input type');
    });
  });

  describe('static constructors', () => {
    test('from() creates from string', () => {
      const dur = CerialDuration.from('10s');
      expect(dur.toString()).toBe('10s');
    });

    test('from() creates from SDK Duration', () => {
      const dur = CerialDuration.from(new Duration('5m'));
      expect(dur.toString()).toBe('5m');
    });

    test('parse() is alias for from()', () => {
      const dur = CerialDuration.parse('1h');
      expect(dur.toString()).toBe('1h');
    });
  });

  describe('accessors', () => {
    test('hours accessor', () => {
      const dur = new CerialDuration('2h');
      expect(dur.hours).toBe(2);
    });

    test('minutes accessor', () => {
      const dur = new CerialDuration('30m');
      expect(dur.minutes).toBe(30);
    });

    test('seconds accessor', () => {
      const dur = new CerialDuration('45s');
      expect(dur.seconds).toBe(45);
    });

    test('days accessor', () => {
      const dur = new CerialDuration('3d');
      expect(dur.days).toBe(3);
    });

    test('weeks accessor', () => {
      const dur = new CerialDuration('2w');
      expect(dur.weeks).toBe(2);
    });

    test('milliseconds accessor', () => {
      const dur = new CerialDuration('500ms');
      expect(dur.milliseconds).toBe(500);
    });

    test('compound duration accessors', () => {
      const dur = new CerialDuration('1h30m');
      expect(dur.hours).toBe(1);
      expect(dur.minutes).toBe(90);
    });
  });

  describe('serialization', () => {
    test('toString()', () => {
      const dur = new CerialDuration('2h30m');
      expect(dur.toString()).toBe('2h30m');
    });

    test('toJSON()', () => {
      const dur = new CerialDuration('1h');
      expect(dur.toJSON()).toBe('1h');
    });

    test('valueOf() returns milliseconds', () => {
      const dur = new CerialDuration('1s');
      expect(typeof dur.valueOf()).toBe('number');
    });
  });

  describe('comparison', () => {
    test('equals with same duration', () => {
      const a = new CerialDuration('1h');
      const b = new CerialDuration('1h');
      expect(a.equals(b)).toBe(true);
    });

    test('equals with string', () => {
      const dur = new CerialDuration('30m');
      expect(dur.equals('30m')).toBe(true);
    });

    test('equals with SDK Duration', () => {
      const dur = new CerialDuration('1h');
      expect(dur.equals(new Duration('1h'))).toBe(true);
    });

    test('not equals with different duration', () => {
      const a = new CerialDuration('1h');
      const b = new CerialDuration('2h');
      expect(a.equals(b)).toBe(false);
    });

    test('compareTo returns negative for shorter', () => {
      const a = new CerialDuration('30m');
      const b = new CerialDuration('1h');
      expect(a.compareTo(b)).toBeLessThan(0);
    });

    test('compareTo returns positive for longer', () => {
      const a = new CerialDuration('2h');
      const b = new CerialDuration('1h');
      expect(a.compareTo(b)).toBeGreaterThan(0);
    });

    test('compareTo returns zero for equal', () => {
      const a = new CerialDuration('1h');
      const b = new CerialDuration('1h');
      expect(a.compareTo(b)).toBe(0);
    });
  });

  describe('SDK interop', () => {
    test('toNative() returns SDK Duration', () => {
      const dur = new CerialDuration('1h');
      const native = dur.toNative();
      expect(native).toBeInstanceOf(Duration);
    });

    test('clone() returns new instance', () => {
      const dur = new CerialDuration('1h');
      const cloned = dur.clone();
      expect(cloned).not.toBe(dur);
      expect(cloned.equals(dur)).toBe(true);
    });
  });

  describe('type guards', () => {
    test('is() detects CerialDuration', () => {
      expect(CerialDuration.is(new CerialDuration('1h'))).toBe(true);
    });

    test('is() rejects string', () => {
      expect(CerialDuration.is('1h')).toBe(false);
    });

    test('is() rejects null', () => {
      expect(CerialDuration.is(null)).toBe(false);
    });

    test('is() rejects SDK Duration', () => {
      expect(CerialDuration.is(new Duration('1h'))).toBe(false);
    });

    test('isCerialDuration() works same as is()', () => {
      expect(isCerialDuration(new CerialDuration('1h'))).toBe(true);
      expect(isCerialDuration('1h')).toBe(false);
    });
  });

  describe('valid duration formats', () => {
    test('seconds', () => {
      expect(new CerialDuration('30s').toString()).toBe('30s');
    });

    test('minutes', () => {
      expect(new CerialDuration('15m').toString()).toBe('15m');
    });

    test('hours', () => {
      expect(new CerialDuration('2h').toString()).toBe('2h');
    });

    test('days', () => {
      expect(new CerialDuration('3d').toString()).toBe('3d');
    });

    test('weeks', () => {
      expect(new CerialDuration('1w').toString()).toBe('1w');
    });

    test('years', () => {
      expect(new CerialDuration('1y').toString()).toBe('1y');
    });

    test('compound h+m', () => {
      expect(new CerialDuration('1h30m').toString()).toBe('1h30m');
    });

    test('compound d+h+m+s', () => {
      expect(new CerialDuration('1d2h30m15s').toString()).toBe('1d2h30m15s');
    });

    test('milliseconds', () => {
      expect(new CerialDuration('500ms').toString()).toBe('500ms');
    });
  });
});
