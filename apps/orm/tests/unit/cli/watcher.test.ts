import { afterEach, describe, expect, it } from 'bun:test';
import {
  createDebouncer,
  type Debouncer,
  getSchemaLabel,
  isCerialFile,
  type WatchTarget,
} from '../../../src/cli/watcher';

describe('watcher', () => {
  describe('isCerialFile', () => {
    it('should return true for .cerial files', () => {
      expect(isCerialFile('schema.cerial')).toBe(true);
    });

    it('should return true for nested .cerial files', () => {
      expect(isCerialFile('models/user.cerial')).toBe(true);
    });

    it('should return false for null filename', () => {
      expect(isCerialFile(null)).toBe(false);
    });

    it('should return false for non-cerial files', () => {
      expect(isCerialFile('file.ts')).toBe(false);
      expect(isCerialFile('file.json')).toBe(false);
      expect(isCerialFile('file.cerial.bak')).toBe(false);
      expect(isCerialFile('.gitignore')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isCerialFile('')).toBe(false);
    });

    it('should return false for partial match', () => {
      expect(isCerialFile('cerial')).toBe(false);
      expect(isCerialFile('.cerial.ts')).toBe(false);
    });
  });

  describe('getSchemaLabel', () => {
    it('should return name when provided', () => {
      const target: WatchTarget = {
        name: 'auth',
        schemaPath: '/some/path',
        outputDir: '/out',
      };

      expect(getSchemaLabel(target)).toBe('auth');
    });

    it('should return schemaPath when name is undefined', () => {
      const target: WatchTarget = {
        schemaPath: '/some/path/schemas',
        outputDir: '/out',
      };

      expect(getSchemaLabel(target)).toBe('/some/path/schemas');
    });
  });

  describe('createDebouncer', () => {
    let debouncer: Debouncer;

    afterEach(() => {
      debouncer?.cancelAll();
    });

    it('should start with zero pending', () => {
      debouncer = createDebouncer(100);

      expect(debouncer.pending()).toBe(0);
    });

    it('should track pending timers after schedule', () => {
      debouncer = createDebouncer(100);
      debouncer.schedule('key1', () => {});

      expect(debouncer.pending()).toBe(1);
    });

    it('should track multiple pending timers', () => {
      debouncer = createDebouncer(100);
      debouncer.schedule('key1', () => {});
      debouncer.schedule('key2', () => {});

      expect(debouncer.pending()).toBe(2);
    });

    it('should not duplicate timers for same key', () => {
      debouncer = createDebouncer(100);
      debouncer.schedule('key1', () => {});
      debouncer.schedule('key1', () => {});

      expect(debouncer.pending()).toBe(1);
    });

    it('should execute callback after delay', async () => {
      debouncer = createDebouncer(50);
      let called = false;

      debouncer.schedule('key1', () => {
        called = true;
      });

      expect(called).toBe(false);
      await Bun.sleep(80);
      expect(called).toBe(true);
      expect(debouncer.pending()).toBe(0);
    });

    it('should debounce rapid calls with same key', async () => {
      debouncer = createDebouncer(50);
      let callCount = 0;

      debouncer.schedule('key1', () => {
        callCount = 1;
      });
      debouncer.schedule('key1', () => {
        callCount = 2;
      });
      debouncer.schedule('key1', () => {
        callCount = 3;
      });

      await Bun.sleep(80);
      expect(callCount).toBe(3);
    });

    it('should allow independent keys to fire separately', async () => {
      debouncer = createDebouncer(50);
      const results: string[] = [];

      debouncer.schedule('a', () => results.push('a'));
      debouncer.schedule('b', () => results.push('b'));

      await Bun.sleep(80);
      expect(results).toContain('a');
      expect(results).toContain('b');
      expect(results).toHaveLength(2);
    });

    it('should cancel a specific timer', async () => {
      debouncer = createDebouncer(50);
      let called = false;

      debouncer.schedule('key1', () => {
        called = true;
      });
      debouncer.cancel('key1');

      expect(debouncer.pending()).toBe(0);
      await Bun.sleep(80);
      expect(called).toBe(false);
    });

    it('should cancel all timers', async () => {
      debouncer = createDebouncer(50);
      let count = 0;

      debouncer.schedule('a', () => count++);
      debouncer.schedule('b', () => count++);
      debouncer.cancelAll();

      expect(debouncer.pending()).toBe(0);
      await Bun.sleep(80);
      expect(count).toBe(0);
    });

    it('should handle cancel on non-existent key gracefully', () => {
      debouncer = createDebouncer(50);

      expect(() => debouncer.cancel('nonexistent')).not.toThrow();
    });

    it('should reset timer on re-schedule with same key', async () => {
      debouncer = createDebouncer(60);
      let value = '';

      debouncer.schedule('key1', () => {
        value = 'first';
      });

      await Bun.sleep(40);
      expect(value).toBe('');

      debouncer.schedule('key1', () => {
        value = 'second';
      });

      await Bun.sleep(40);
      expect(value).toBe('');

      await Bun.sleep(40);
      expect(value).toBe('second');
    });
  });
});
