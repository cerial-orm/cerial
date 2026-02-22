import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ResolvedSchemaEntry } from '../../../src/cli/config';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { generateMultiSchema } from '../../../src/cli/generate';
import { cleanupTempDir, createTempOutputDir, getFixturePath } from '../../fixtures/multi-schema/helpers';

describe('config-based multi-schema generation', () => {
  let tempDir: string;
  let authOutput: string;
  let cmsOutput: string;

  beforeAll(async () => {
    tempDir = await createTempOutputDir();
    authOutput = join(tempDir, 'auth');
    cmsOutput = join(tempDir, 'cms');
  });

  afterAll(async () => {
    await cleanupTempDir(tempDir);
  });

  describe('TypeScript config generation', () => {
    let entries: ResolvedSchemaEntry[];

    beforeAll(async () => {
      const configPath = getFixturePath('with-config/cerial.config.ts');
      const fixtureDir = getFixturePath('with-config');
      const config = await loadConfig(configPath);
      expect(config).not.toBeNull();

      entries = resolveConfig(config!, fixtureDir);
      entries = entries.map((e) => ({
        ...e,
        output: e.name === 'auth' ? authOutput : cmsOutput,
      }));
    });

    it('should resolve two schema entries from config', () => {
      expect(entries).toHaveLength(2);
      expect(entries.map((e) => e.name).sort()).toEqual(['auth', 'cms']);
    });

    it('should generate independent clients for each schema', async () => {
      const result = await generateMultiSchema(entries, { logLevel: 'minimal' });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.results).toHaveProperty('auth');
      expect(result.results).toHaveProperty('cms');
      expect(result.results.auth!.success).toBe(true);
      expect(result.results.cms!.success).toBe(true);
    });

    it('should generate files in auth output directory', async () => {
      const authFiles = await readdir(authOutput, { recursive: true });
      const tsFiles = authFiles.filter((f) => f.endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThan(0);
      expect(tsFiles.some((f) => f === 'client.ts' || f.endsWith('/client.ts'))).toBe(true);
    });

    it('should generate files in cms output directory', async () => {
      const cmsFiles = await readdir(cmsOutput, { recursive: true });
      const tsFiles = cmsFiles.filter((f) => f.endsWith('.ts'));
      expect(tsFiles.length).toBeGreaterThan(0);
      expect(tsFiles.some((f) => f === 'client.ts' || f.endsWith('/client.ts'))).toBe(true);
    });

    it('should use AuthCerialClient class name for auth schema', async () => {
      const clientContent = await Bun.file(join(authOutput, 'client.ts')).text();
      expect(clientContent).toContain('class AuthCerialClient');
      expect(clientContent).not.toContain('class CerialClient ');
    });

    it('should use CmsCerialClient class name for cms schema', async () => {
      const clientContent = await Bun.file(join(cmsOutput, 'client.ts')).text();
      expect(clientContent).toContain('class CmsCerialClient');
      expect(clientContent).not.toContain('class CerialClient ');
    });

    it('should export parameterized connect config type for auth', async () => {
      const indexContent = await Bun.file(join(authOutput, 'index.ts')).text();
      expect(indexContent).toContain('AuthCerialClient');
      expect(indexContent).toContain('AuthCerialClientConnectConfig');
    });

    it('should export parameterized connect config type for cms', async () => {
      const indexContent = await Bun.file(join(cmsOutput, 'index.ts')).text();
      expect(indexContent).toContain('CmsCerialClient');
      expect(indexContent).toContain('CmsCerialClientConnectConfig');
    });

    it('should include auth models only in auth output', async () => {
      const authFiles = await readdir(join(authOutput, 'models'), { recursive: true });
      const modelFiles = authFiles.filter((f) => f.endsWith('.ts') && f !== 'index.ts');
      const modelNames = modelFiles.map((f) => f.replace('.ts', ''));

      expect(modelNames).toContain('msauthuser');
      expect(modelNames).toContain('msauthsession');
      expect(modelNames.every((n) => !n.includes('cms'))).toBe(true);
    });

    it('should include cms models only in cms output', async () => {
      const cmsFiles = await readdir(join(cmsOutput, 'models'), { recursive: true });
      const modelFiles = cmsFiles.filter((f) => f.endsWith('.ts') && f !== 'index.ts');
      const modelNames = modelFiles.map((f) => f.replace('.ts', ''));

      expect(modelNames).toContain('mscmspage');
      expect(modelNames).toContain('mscmsblock');
      expect(modelNames.every((n) => !n.includes('auth'))).toBe(true);
    });

    it('should generate migrations with correct models per schema', async () => {
      const authMigration = await Bun.file(join(authOutput, 'internal', 'migrations.ts')).text();
      expect(authMigration).toContain('MsAuthUser');
      expect(authMigration).toContain('MsAuthSession');
      expect(authMigration).not.toContain('MsCmsPage');

      const cmsMigration = await Bun.file(join(cmsOutput, 'internal', 'migrations.ts')).text();
      expect(cmsMigration).toContain('MsCmsPage');
      expect(cmsMigration).toContain('MsCmsBlock');
      expect(cmsMigration).not.toContain('MsAuthUser');
    });

    it('should generate model-registry for each schema', async () => {
      const authRegistry = await Bun.file(join(authOutput, 'internal', 'model-registry.ts')).text();
      expect(authRegistry).toContain('MsAuthUser');

      const cmsRegistry = await Bun.file(join(cmsOutput, 'internal', 'model-registry.ts')).text();
      expect(cmsRegistry).toContain('MsCmsPage');
    });
  });

  describe('JSON config generation', () => {
    let jsonTempDir: string;
    let jsonAuthOutput: string;
    let jsonCmsOutput: string;

    beforeAll(async () => {
      jsonTempDir = await createTempOutputDir();
      jsonAuthOutput = join(jsonTempDir, 'auth');
      jsonCmsOutput = join(jsonTempDir, 'cms');

      const configPath = getFixturePath('json-config/cerial.config.json');
      const fixtureDir = getFixturePath('json-config');
      const config = await loadConfig(configPath);
      expect(config).not.toBeNull();

      let entries = resolveConfig(config!, fixtureDir);
      entries = entries.map((e) => ({
        ...e,
        output: e.name === 'auth' ? jsonAuthOutput : jsonCmsOutput,
      }));

      const result = await generateMultiSchema(entries, { logLevel: 'minimal' });
      expect(result.success).toBe(true);
    });

    afterAll(async () => {
      await cleanupTempDir(jsonTempDir);
    });

    it('should generate auth client from JSON config', async () => {
      const clientContent = await Bun.file(join(jsonAuthOutput, 'client.ts')).text();
      expect(clientContent).toContain('class AuthCerialClient');
    });

    it('should generate cms client from JSON config', async () => {
      const clientContent = await Bun.file(join(jsonCmsOutput, 'client.ts')).text();
      expect(clientContent).toContain('class CmsCerialClient');
    });

    it('should include correct models in JSON config auth output', async () => {
      const authMigration = await Bun.file(join(jsonAuthOutput, 'internal', 'migrations.ts')).text();
      expect(authMigration).toContain('MsJsonAuthUser');
      expect(authMigration).not.toContain('MsJsonCmsPage');
    });

    it('should include correct models in JSON config cms output', async () => {
      const cmsMigration = await Bun.file(join(jsonCmsOutput, 'internal', 'migrations.ts')).text();
      expect(cmsMigration).toContain('MsJsonCmsPage');
      expect(cmsMigration).not.toContain('MsJsonAuthUser');
    });
  });

  describe('output isolation', () => {
    let isoTempDir: string;
    let isoAuthOutput: string;
    let isoCmsOutput: string;

    beforeAll(async () => {
      isoTempDir = await createTempOutputDir();
      isoAuthOutput = join(isoTempDir, 'auth-client');
      isoCmsOutput = join(isoTempDir, 'cms-client');

      const configPath = getFixturePath('with-config/cerial.config.ts');
      const fixtureDir = getFixturePath('with-config');
      const config = await loadConfig(configPath);

      let entries = resolveConfig(config!, fixtureDir);
      entries = entries.map((e) => ({
        ...e,
        output: e.name === 'auth' ? isoAuthOutput : isoCmsOutput,
      }));

      await generateMultiSchema(entries, { logLevel: 'minimal' });
    });

    afterAll(async () => {
      await cleanupTempDir(isoTempDir);
    });

    it('should create separate output directories', async () => {
      const authExists = await Bun.file(join(isoAuthOutput, 'client.ts')).exists();
      const cmsExists = await Bun.file(join(isoCmsOutput, 'client.ts')).exists();
      expect(authExists).toBe(true);
      expect(cmsExists).toBe(true);
    });

    it('should not share any model files between outputs', async () => {
      const authModels = await readdir(join(isoAuthOutput, 'models'));
      const cmsModels = await readdir(join(isoCmsOutput, 'models'));
      const authSet = new Set(authModels);
      const cmsSet = new Set(cmsModels);

      for (const f of authSet) {
        if (f !== 'index.ts') {
          expect(cmsSet.has(f)).toBe(false);
        }
      }
    });

    it('should generate independent index.ts files', async () => {
      const authIndex = await Bun.file(join(isoAuthOutput, 'index.ts')).text();
      const cmsIndex = await Bun.file(join(isoCmsOutput, 'index.ts')).text();

      expect(authIndex).toContain('AuthCerialClient');
      expect(authIndex).not.toContain('CmsCerialClient');
      expect(cmsIndex).toContain('CmsCerialClient');
      expect(cmsIndex).not.toContain('AuthCerialClient');
    });
  });

  describe('single entry in config', () => {
    let singleTempDir: string;
    let singleOutput: string;

    beforeAll(async () => {
      singleTempDir = await createTempOutputDir();
      singleOutput = join(singleTempDir, 'auth-only');
    });

    afterAll(async () => {
      await cleanupTempDir(singleTempDir);
    });

    it('should generate single schema from multi-schema config with one entry', async () => {
      const entries: ResolvedSchemaEntry[] = [
        {
          name: 'auth',
          path: getFixturePath('with-config/schemas/auth'),
          output: singleOutput,
          clientClassName: 'AuthCerialClient',
        },
      ];

      const result = await generateMultiSchema(entries, { logLevel: 'minimal' });

      expect(result.success).toBe(true);
      expect(Object.keys(result.results)).toHaveLength(1);
      expect(result.results.auth!.success).toBe(true);
      expect(result.results.auth!.files.length).toBeGreaterThan(0);
    });

    it('should use the specified client class name', async () => {
      const clientContent = await Bun.file(join(singleOutput, 'client.ts')).text();
      expect(clientContent).toContain('class AuthCerialClient');
    });
  });

  describe('clean flag', () => {
    let cleanTempDir: string;
    let cleanOutput: string;

    beforeAll(async () => {
      cleanTempDir = await createTempOutputDir();
      cleanOutput = join(cleanTempDir, 'clean-test');
    });

    afterAll(async () => {
      await cleanupTempDir(cleanTempDir);
    });

    it('should clean output directory before generation when clean=true', async () => {
      const entries: ResolvedSchemaEntry[] = [
        {
          name: 'auth',
          path: getFixturePath('with-config/schemas/auth'),
          output: cleanOutput,
          clientClassName: 'AuthCerialClient',
        },
      ];

      await generateMultiSchema(entries, { logLevel: 'minimal' });
      const firstFiles = await readdir(cleanOutput, { recursive: true });

      await generateMultiSchema(entries, { logLevel: 'minimal', clean: true });
      const secondFiles = await readdir(cleanOutput, { recursive: true });

      expect(secondFiles.length).toBe(firstFiles.length);
    });
  });
});
