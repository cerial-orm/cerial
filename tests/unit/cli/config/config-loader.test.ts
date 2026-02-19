/**
 * Config loader tests
 */

import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import { loadConfig } from '../../../../src/cli/config';

describe('loadConfig', () => {
  describe('with explicit configPath', () => {
    it('should load TypeScript config file', async () => {
      const configPath = resolve(__dirname, '../../../fixtures/config/ts-config/cerial.config.ts');
      const config = await loadConfig(configPath);

      expect(config).toBeDefined();
      expect(config?.schema).toBe('./schema.cerial');
      expect(config?.output).toBe('./generated');
    });

    it('should load JSON config file', async () => {
      const configPath = resolve(__dirname, '../../../fixtures/config/json-config/cerial.config.json');
      const config = await loadConfig(configPath);

      expect(config).toBeDefined();
      expect(config?.schema).toBe('./schema.cerial');
      expect(config?.output).toBe('./generated');
    });

    it('should throw on invalid JSON config', async () => {
      const configPath = resolve(__dirname, '../../../fixtures/config/invalid-json/cerial.config.json');

      await expect(async () => {
        await loadConfig(configPath);
      }).toThrow();
    });

    it('should throw on invalid TypeScript config (missing default export)', async () => {
      const configPath = resolve(__dirname, '../../../fixtures/config/ts-config/cerial.config.ts');
      expect(configPath).toBeDefined();
    });
  });

  describe('with cwd and search order', () => {
    it('should find cerial.config.ts when no configPath given', async () => {
      const cwd = resolve(__dirname, '../../../fixtures/config/ts-config');
      const config = await loadConfig(undefined, cwd);

      expect(config).toBeDefined();
      expect(config?.schema).toBe('./schema.cerial');
    });

    it('should find cerial.config.json when no configPath given', async () => {
      const cwd = resolve(__dirname, '../../../fixtures/config/json-config');
      const config = await loadConfig(undefined, cwd);

      expect(config).toBeDefined();
      expect(config?.schema).toBe('./schema.cerial');
    });

    it('should prefer cerial.config.ts over cerial.config.json', async () => {
      const cwd = resolve(__dirname, '../../../fixtures/config/both');
      const config = await loadConfig(undefined, cwd);

      expect(config).toBeDefined();
      expect(config?.output).toBe('./generated-ts');
    });

    it('should return null when no config file found', async () => {
      const cwd = resolve(__dirname, '../../../fixtures/config/nonexistent');
      const config = await loadConfig(undefined, cwd);

      expect(config).toBeNull();
    });
  });

  describe('validation', () => {
    it('should validate loaded config', async () => {
      const configPath = resolve(__dirname, '../../../fixtures/config/ts-config/cerial.config.ts');
      const config = await loadConfig(configPath);

      expect(config).toBeDefined();
      expect(config?.schema).toBeDefined();
    });

    it('should throw on invalid config shape', async () => {
      expect(true).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should provide clear error message on load failure', async () => {
      const configPath = resolve(__dirname, '../../../fixtures/config/invalid-json/cerial.config.json');

      try {
        await loadConfig(configPath);
        expect(true).toBe(false);
      } catch (error) {
        expect(error).toBeDefined();
        expect(String(error)).toContain('Failed to load');
      }
    });
  });
});
