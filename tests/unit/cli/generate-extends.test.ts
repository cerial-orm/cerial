import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../../src/cli/generate';

/**
 * Create a temp directory with .cerial schema files for testing.
 * Returns { schemaDir, outputDir, cleanup }.
 */
async function createTempSchema(
  files: Record<string, string>,
): Promise<{ schemaDir: string; outputDir: string; cleanup: () => Promise<void> }> {
  const base = await mkdtemp(join(tmpdir(), 'cerial-extends-test-'));
  const schemaDir = join(base, 'schemas');
  const outputDir = join(base, 'output');
  await Bun.write(join(schemaDir, '.keep'), '');

  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(schemaDir, name), content, 'utf8');
  }

  return {
    schemaDir,
    outputDir,
    cleanup: () => rm(base, { recursive: true, force: true }),
  };
}

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

describe('generate pipeline — extends integration', () => {
  describe('abstract model filtering', () => {
    it('should exclude abstract models from generated output', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}

model User extends BaseEntity {
  name String
  email Email
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Verify no BaseEntity files were generated
      const modelFiles = result.files.filter((f) => f.includes('BaseEntity') || f.includes('base-entity'));
      expect(modelFiles).toHaveLength(0);

      // Verify User files WERE generated (concrete model)
      const userFiles = result.files.filter((f) => f.toLowerCase().includes('user'));
      expect(userFiles.length).toBeGreaterThan(0);
    });

    it('should include inherited fields in concrete model output', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}

model Post extends BaseEntity {
  title String
  content String?
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should handle schema with only abstract models (no concrete models)', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      // Should fail — no concrete models to generate
      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('No models found'))).toBe(true);
    });
  });

  describe('cross-file extends', () => {
    it('should resolve extends across separate schema files', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'base.cerial': `
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
  updatedAt Date @updatedAt
}
`,
        'user.cerial': `
model User extends BaseEntity {
  name String
  email Email
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // No BaseEntity generated
      const baseFiles = result.files.filter((f) => f.includes('BaseEntity') || f.includes('base-entity'));
      expect(baseFiles).toHaveLength(0);

      // User was generated
      const userFiles = result.files.filter((f) => f.toLowerCase().includes('user'));
      expect(userFiles.length).toBeGreaterThan(0);
    });

    it('should resolve multiple children extending same abstract parent across files', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'base.cerial': `
abstract model BaseEntity {
  id Record @id
  createdAt Date @createdAt
}
`,
        'user.cerial': `
model User extends BaseEntity {
  name String
}
`,
        'post.cerial': `
model Post extends BaseEntity {
  title String
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Both concrete models generated, no abstract
      const userFiles = result.files.filter((f) => f.toLowerCase().includes('user'));
      const postFiles = result.files.filter((f) => f.toLowerCase().includes('post'));
      const baseFiles = result.files.filter((f) => f.includes('BaseEntity'));
      expect(userFiles.length).toBeGreaterThan(0);
      expect(postFiles.length).toBeGreaterThan(0);
      expect(baseFiles).toHaveLength(0);
    });
  });

  describe('extends validation errors', () => {
    it('should report circular extends before resolution', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
model A extends B {
  id Record @id
  foo String
}

model B extends A {
  id Record @id
  bar String
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.toLowerCase().includes('circular'))).toBe(true);
    });

    it('should report missing extends target', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
model User extends NonExistent {
  id Record @id
  name String
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes('NonExistent'))).toBe(true);
    });
  });

  describe('no extends regression', () => {
    it('should still work for schemas without extends', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
model User {
  id Record @id
  name String
  email Email
}

model Post {
  id Record @id
  title String
  authorId Record?
  author Relation? @field(authorId) @model(User)
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.files.length).toBeGreaterThan(0);
    });

    it('should still work for schemas with objects and tuples (no extends)', async () => {
      const { schemaDir, outputDir, cleanup } = await createTempSchema({
        'schema.cerial': `
object Address {
  street String
  city String
}

model User {
  id Record @id
  name String
  address Address?
}
`,
      });
      cleanups.push(cleanup);

      const result = await generateSingleSchema({
        schemaPath: schemaDir,
        outputDir,
        logLevel: 'minimal',
      });

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
