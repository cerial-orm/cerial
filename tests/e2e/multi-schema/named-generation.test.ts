import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { generate, generateMultiSchema } from '../../../src/cli/generate';
import { cleanupTempDir, createTempOutputDir, getFixturePath } from '../../fixtures/multi-schema/helpers';

describe('-n flag (named generation)', () => {
  describe('filtering by name', () => {
    let tempDir: string;
    let authOutput: string;

    beforeAll(async () => {
      tempDir = await createTempOutputDir();
      authOutput = join(tempDir, 'auth-only');
    });

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    it('should generate only the named schema when -n is provided', async () => {
      const configPath = getFixturePath('with-config/cerial.config.ts');
      const fixtureDir = getFixturePath('with-config');
      const config = await loadConfig(configPath);
      const allEntries = resolveConfig(config!, fixtureDir);

      const filtered = allEntries.filter((e) => e.name === 'auth');
      expect(filtered).toHaveLength(1);

      const entries = filtered.map((e) => ({ ...e, output: authOutput }));
      const result = await generateMultiSchema(entries, { logLevel: 'minimal' });

      expect(result.success).toBe(true);
      expect(Object.keys(result.results)).toHaveLength(1);
      expect(result.results).toHaveProperty('auth');
      expect(result.results.auth!.success).toBe(true);
    });

    it('should generate auth client with correct class name', async () => {
      const clientContent = await Bun.file(join(authOutput, 'client.ts')).text();
      expect(clientContent).toContain('class AuthCerialClient');
    });

    it('should not generate cms output when only auth is targeted', async () => {
      const cmsOutput = join(tempDir, 'cms');
      const cmsExists = await Bun.file(join(cmsOutput, 'client.ts')).exists();
      expect(cmsExists).toBe(false);
    });
  });

  describe('targeting cms schema', () => {
    let tempDir: string;
    let cmsOutput: string;

    beforeAll(async () => {
      tempDir = await createTempOutputDir();
      cmsOutput = join(tempDir, 'cms-only');

      const configPath = getFixturePath('with-config/cerial.config.ts');
      const fixtureDir = getFixturePath('with-config');
      const config = await loadConfig(configPath);
      const allEntries = resolveConfig(config!, fixtureDir);

      const filtered = allEntries.filter((e) => e.name === 'cms');
      const entries = filtered.map((e) => ({ ...e, output: cmsOutput }));
      const result = await generateMultiSchema(entries, { logLevel: 'minimal' });
      expect(result.success).toBe(true);
    });

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    it('should generate cms client with correct class name', async () => {
      const clientContent = await Bun.file(join(cmsOutput, 'client.ts')).text();
      expect(clientContent).toContain('class CmsCerialClient');
    });

    it('should include only cms models', async () => {
      const migration = await Bun.file(join(cmsOutput, 'internal', 'migrations.ts')).text();
      expect(migration).toContain('MsCmsPage');
      expect(migration).toContain('MsCmsBlock');
      expect(migration).not.toContain('MsAuthUser');
    });
  });

  describe('nonexistent schema name via generate()', () => {
    it('should return error with available schema names', async () => {
      const configPath = getFixturePath('with-config/cerial.config.ts');

      const result = await generate({
        config: configPath,
        name: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Schema 'nonexistent' not found");
      expect(result.errors[0]).toContain('Available schemas:');
    });

    it('should include all available schema names in error message', async () => {
      const configPath = getFixturePath('with-config/cerial.config.ts');

      const result = await generate({
        config: configPath,
        name: 'does_not_exist',
      });

      expect(result.errors[0]).toContain('auth');
      expect(result.errors[0]).toContain('cms');
    });
  });

  describe('edge cases', () => {
    it('should handle case-sensitive name matching', async () => {
      const configPath = getFixturePath('with-config/cerial.config.ts');

      const result = await generate({
        config: configPath,
        name: 'Auth',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("Schema 'Auth' not found");
    });

    it('should filter from JSON config as well', async () => {
      const configPath = getFixturePath('json-config/cerial.config.json');

      const result = await generate({
        config: configPath,
        name: 'nonexistent',
      });

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain("Schema 'nonexistent' not found");
    });

    it('should generate named schema with output override', async () => {
      const tempDir = await createTempOutputDir();

      try {
        const configPath = getFixturePath('with-config/cerial.config.ts');
        const fixtureDir = getFixturePath('with-config');
        const config = await loadConfig(configPath);
        const allEntries = resolveConfig(config!, fixtureDir);

        const filtered = allEntries.filter((e) => e.name === 'auth');
        const overrideOutput = join(tempDir, 'override');
        const entries = filtered.map((e) => ({ ...e, output: overrideOutput }));

        const result = await generateMultiSchema(entries, { logLevel: 'minimal' });

        expect(result.success).toBe(true);
        const clientContent = await Bun.file(join(overrideOutput, 'client.ts')).text();
        expect(clientContent).toContain('class AuthCerialClient');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });
});
