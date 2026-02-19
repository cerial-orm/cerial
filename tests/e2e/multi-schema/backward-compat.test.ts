import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { generateSingleSchema } from '../../../src/cli/generate';
import { cleanupTempDir, createTempOutputDir, getFixturePath } from '../../fixtures/multi-schema/helpers';

describe('backward compatibility', () => {
  describe('single schema without config', () => {
    let tempDir: string;
    let outputDir: string;

    beforeAll(async () => {
      tempDir = await createTempOutputDir();
      outputDir = join(tempDir, 'single-output');

      const result = await generateSingleSchema({
        schemaPath: getFixturePath('single-schema/schemas'),
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
    });

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    it('should generate successfully with schema path and output dir', async () => {
      const files = await readdir(outputDir, { recursive: true });
      const tsFiles = files.filter((f) => f.endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThan(0);
    });

    it('should use default CerialClient class name', async () => {
      const clientContent = await Bun.file(join(outputDir, 'client.ts')).text();
      expect(clientContent).toContain('class CerialClient');
      expect(clientContent).not.toContain('class AuthCerialClient');
      expect(clientContent).not.toContain('class CmsCerialClient');
    });

    it('should export CerialClient and CerialClientConnectConfig', async () => {
      const indexContent = await Bun.file(join(outputDir, 'index.ts')).text();
      expect(indexContent).toContain('CerialClient');
      expect(indexContent).toContain('CerialClientConnectConfig');
    });

    it('should include the model from the single schema', async () => {
      const migration = await Bun.file(join(outputDir, 'internal', 'migrations.ts')).text();
      expect(migration).toContain('MsSingleUser');
    });

    it('should generate client.ts, index.ts, and internal directory', async () => {
      const rootFiles = await readdir(outputDir);

      expect(rootFiles).toContain('client.ts');
      expect(rootFiles).toContain('index.ts');
      expect(rootFiles).toContain('internal');
      expect(rootFiles).toContain('models');
    });

    it('should generate internal files (migrations, model-registry)', async () => {
      const internalFiles = await readdir(join(outputDir, 'internal'));
      expect(internalFiles).toContain('migrations.ts');
      expect(internalFiles).toContain('model-registry.ts');
      expect(internalFiles).toContain('index.ts');
    });

    it('should generate models directory with model file', async () => {
      const modelFiles = await readdir(join(outputDir, 'models'));
      expect(modelFiles).toContain('index.ts');
      expect(modelFiles.some((f) => f.includes('mssingleuser'))).toBe(true);
    });
  });

  describe('explicit -s flag schema path', () => {
    let tempDir: string;
    let outputDir: string;

    beforeAll(async () => {
      tempDir = await createTempOutputDir();
      outputDir = join(tempDir, 'explicit-schema');

      const result = await generateSingleSchema({
        schemaPath: getFixturePath('with-config/schemas/auth'),
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
    });

    afterAll(async () => {
      await cleanupTempDir(tempDir);
    });

    it('should generate from subdirectory schema path', async () => {
      const clientContent = await Bun.file(join(outputDir, 'client.ts')).text();
      expect(clientContent).toContain('class CerialClient');
    });

    it('should include only models from the specified path', async () => {
      const migration = await Bun.file(join(outputDir, 'internal', 'migrations.ts')).text();
      expect(migration).toContain('MsAuthUser');
      expect(migration).toContain('MsAuthSession');
      expect(migration).not.toContain('MsCmsPage');
    });
  });

  describe('no config file needed', () => {
    it('should not require a config to generate', async () => {
      const tempDir = await createTempOutputDir();

      try {
        const result = await generateSingleSchema({
          schemaPath: getFixturePath('single-schema/schemas'),
          outputDir: join(tempDir, 'no-config'),
          logLevel: 'minimal',
        });

        expect(result.success).toBe(true);
        expect(result.files.length).toBeGreaterThan(0);
        expect(result.errors).toHaveLength(0);
      } finally {
        await cleanupTempDir(tempDir);
      }
    });
  });

  describe('error cases', () => {
    it('should fail gracefully when schema path has no .cerial files', async () => {
      const tempDir = await createTempOutputDir();

      try {
        const result = await generateSingleSchema({
          schemaPath: tempDir,
          outputDir: join(tempDir, 'out'),
          logLevel: 'minimal',
        });

        expect(result.success).toBe(false);
        expect(result.errors).toContain('No schema files found');
      } finally {
        await cleanupTempDir(tempDir);
      }
    });

    it('should fail gracefully when schema path does not exist', async () => {
      const result = await generateSingleSchema({
        schemaPath: '/nonexistent/path/to/schemas',
        outputDir: '/tmp/cerial-test-should-not-create',
        logLevel: 'minimal',
      });

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});
