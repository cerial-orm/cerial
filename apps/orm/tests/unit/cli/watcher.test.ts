import { afterEach, describe, expect, it } from 'bun:test';
import {
  createDebouncer,
  DEBOUNCE_MS,
  type Debouncer,
  getSchemaLabel,
  isCerialFile,
  type WatchTarget,
} from '../../../src/cli/watcher';

describe('watcher', () => {
  describe('DEBOUNCE_MS', () => {
    it('should be 300ms', () => {
      expect(DEBOUNCE_MS).toBe(300);
    });
  });

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

  describe('WatchTarget', () => {
    it('should accept minimal shape', () => {
      const target: WatchTarget = {
        schemaPath: './schemas',
        outputDir: './generated',
      };

      expect(target.schemaPath).toBe('./schemas');
      expect(target.outputDir).toBe('./generated');
      expect(target.name).toBeUndefined();
      expect(target.clientClassName).toBeUndefined();
    });

    it('should accept full shape', () => {
      const target: WatchTarget = {
        name: 'auth',
        schemaPath: './schemas/auth',
        outputDir: './generated/auth',
        clientClassName: 'AuthCerialClient',
      };

      expect(target.name).toBe('auth');
      expect(target.schemaPath).toBe('./schemas/auth');
      expect(target.outputDir).toBe('./generated/auth');
      expect(target.clientClassName).toBe('AuthCerialClient');
    });

    it('should support merged folder override output', () => {
      const target: WatchTarget = {
        name: 'auth',
        schemaPath: './schemas/auth',
        outputDir: './custom-output/auth',
        clientClassName: 'AuthCerialClient',
      };

      expect(target.outputDir).toBe('./custom-output/auth');
    });

    it('should support auto-discovered schema entry', () => {
      const target: WatchTarget = {
        name: 'discovered',
        schemaPath: './discovered-schemas',
        outputDir: './generated/discovered',
        clientClassName: 'DiscoveredCerialClient',
      };

      expect(target.name).toBe('discovered');
      expect(target.schemaPath).toBe('./discovered-schemas');
      expect(target.outputDir).toBe('./generated/discovered');
      expect(target.clientClassName).toBe('DiscoveredCerialClient');
    });

    it('should support multiple merged entries with different outputs', () => {
      const targets: WatchTarget[] = [
        {
          name: 'auth',
          schemaPath: './schemas/auth',
          outputDir: './custom-output/auth',
          clientClassName: 'AuthCerialClient',
        },
        {
          name: 'core',
          schemaPath: './schemas/core',
          outputDir: './generated/core',
          clientClassName: 'CoreCerialClient',
        },
      ];

      expect(targets).toHaveLength(2);
      const auth = targets[0];
      const core = targets[1];
      expect(auth?.outputDir).toBe('./custom-output/auth');
      expect(core?.outputDir).toBe('./generated/core');
    });

    it('should support convention marker watch target with name from basename', () => {
      const target: WatchTarget = {
        name: 'schemas',
        schemaPath: './schemas',
        outputDir: './schemas/client',
      };

      expect(target.name).toBe('schemas');
      expect(target.schemaPath).toBe('./schemas');
      expect(target.outputDir).toBe('./schemas/client');
      expect(target.clientClassName).toBeUndefined();
    });

    it('should support multiple convention marker watch targets', () => {
      const targets: WatchTarget[] = [
        {
          name: 'auth',
          schemaPath: './auth',
          outputDir: './auth/client',
        },
        {
          name: 'core',
          schemaPath: './core',
          outputDir: './core/client',
        },
      ];

      expect(targets).toHaveLength(2);
      expect(targets[0]?.name).toBe('auth');
      expect(targets[0]?.schemaPath).toBe('./auth');
      expect(targets[0]?.outputDir).toBe('./auth/client');
      expect(targets[1]?.name).toBe('core');
      expect(targets[1]?.schemaPath).toBe('./core');
      expect(targets[1]?.outputDir).toBe('./core/client');
    });

    it('should support convention marker with custom output override', () => {
      const target: WatchTarget = {
        name: 'schemas',
        schemaPath: './schemas',
        outputDir: './custom-output',
      };

      expect(target.outputDir).toBe('./custom-output');
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
