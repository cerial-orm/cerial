/**
 * Migration statements are written as chunk files behind one aggregator. The aggregator must be
 * indistinguishable from the single-file output, and the chunks must follow the schema's size.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSchemaMetadata } from '../../src/cli/schema-metadata';
import { generateSingleSchema } from '../../src/cli/generate';
import { generateModelMigrationMap } from '../../src/generators/migrations/define-generator';
import { writeMigrationFile } from '../../src/generators/migrations/writer';
import { resolveInheritance } from '../../src/resolver';
import type { ModelMetadata } from '../../src/types';
import { loadCorpus } from './parity-corpus';

const scratch = mkdtempSync(join(tmpdir(), 'cerial-migration-chunks-'));
let counter = 0;
const freshDir = (): string => {
  const dir = join(scratch, `d${counter++}`);
  mkdirSync(dir, { recursive: true });

  return dir;
};

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface Migrations {
  migrationsByModel: Record<string, string[]>;
  modelNames: string[];
  getModelMigrationQuery: (name: string) => string;
  getMigrationModelNames: () => string[];
}

const names = (count: number): string[] => Array.from({ length: count }, (_, i) => `M${String(i).padStart(3, '0')}`);

const models = (count: number): ModelMetadata[] =>
  names(count).map((name) => ({
    name,
    tableName: name.toLowerCase(),
    fields: [{ name: 'id', type: 'record', isId: true, isUnique: true, isRequired: false }],
  }));

const chunkFiles = (dir: string): string[] => {
  const path = join(dir, 'internal', 'migrations');

  return existsSync(path) ? readdirSync(path).sort() : [];
};

describe('migration chunks: same migrations as one file', () => {
  test('whole corpus deep-equals the unchunked map, key order and helpers included', async () => {
    const corpus = loadCorpus();
    const resolved = resolveInheritance(corpus.ast);
    const meta = buildSchemaMetadata({ ...resolved, models: resolved.models.filter((m) => !m.abstract) });

    const dir = freshDir();
    await writeMigrationFile(dir, meta.models, meta.objectRegistry, meta.tupleRegistry, meta.literalRegistry);
    const chunked = (await import(join(dir, 'internal', 'migrations.ts'))) as Migrations;
    const old = generateModelMigrationMap(
      meta.modelRegistry,
      undefined,
      undefined,
      meta.objectRegistry,
      meta.tupleRegistry,
      meta.literalRegistry,
    );

    expect(meta.models.length).toBeGreaterThan(50);
    expect(Object.keys(chunked.migrationsByModel)).toEqual(Object.keys(old));
    expect(chunked.migrationsByModel).toEqual(old);
    expect(chunked.getMigrationModelNames()).toEqual(Object.keys(old));
    for (const [name, statements] of Object.entries(old)) {
      expect(chunked.getModelMigrationQuery(name)).toBe(statements.join('\n'));
    }
  });

  test('a changed statement is detected, so the comparison can fail', async () => {
    const dir = freshDir();
    await writeMigrationFile(dir, models(2));
    const chunked = (await import(join(dir, 'internal', 'migrations.ts'))) as Migrations;
    const old = generateModelMigrationMap({ M000: models(2)[0]!, M001: { ...models(2)[1]!, tableName: 'other' } });

    expect(chunked.migrationsByModel).not.toEqual(old);
  });
});

describe('migration chunks: boundaries', () => {
  test.each([
    [1, 1],
    [50, 1],
    [51, 2],
    [100, 2],
    [101, 3],
  ])('%i models write %i chunk file(s)', async (count, files) => {
    const dir = freshDir();
    const written = await writeMigrationFile(dir, models(count));

    expect(chunkFiles(dir)).toEqual(Array.from({ length: files }, (_, i) => `chunk-${i}.ts`));
    expect(written).toHaveLength(files + 1);
  });

  test('51 models split 50 and 1 in declaration order', async () => {
    const dir = freshDir();
    await writeMigrationFile(dir, models(51));
    const first = (await import(join(dir, 'internal/migrations/chunk-0.ts'))) as { chunk: Record<string, string[]> };
    const second = (await import(join(dir, 'internal/migrations/chunk-1.ts'))) as { chunk: Record<string, string[]> };

    expect(Object.keys(first.chunk)).toEqual(names(51).slice(0, 50));
    expect(Object.keys(second.chunk)).toEqual(['M050']);
  });

  test('no models write no chunk files or directory', async () => {
    const dir = freshDir();
    const written = await writeMigrationFile(dir, []);

    expect(chunkFiles(dir)).toEqual([]);
    expect(existsSync(join(dir, 'internal', 'migrations'))).toBe(false);
    expect(written).toEqual([join(dir, 'internal', 'migrations.ts')]);
  });
});

describe('migration chunks: regeneration', () => {
  const schema = (count: number): string =>
    names(count)
      .map((n) => `model ${n} {\n  id Record @id\n}`)
      .join('\n');

  const generate = async (schemaDir: string, outputDir: string, count: number) => {
    writeFileSync(join(schemaDir, 'schema.cerial'), schema(count));

    return generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal' });
  };

  test('fewer models remove the stale chunk and leave no empty directory', async () => {
    const schemaDir = freshDir();
    const outputDir = join(freshDir(), 'out');

    expect((await generate(schemaDir, outputDir, 51)).success).toBe(true);
    expect(chunkFiles(outputDir)).toEqual(['chunk-0.ts', 'chunk-1.ts']);

    const again = await generate(schemaDir, outputDir, 50);
    expect(again.success).toBe(true);
    expect(chunkFiles(outputDir)).toEqual(['chunk-0.ts']);
    expect(again.files.filter((f) => f.includes('/internal/migrations/'))).toEqual([
      join(outputDir, 'internal/migrations/chunk-0.ts'),
    ]);
  });

  test('every chunk file is listed in the result when the schema grows', async () => {
    const schemaDir = freshDir();
    const outputDir = join(freshDir(), 'out');
    const result = await generate(schemaDir, outputDir, 51);

    expect(result.files.filter((f) => f.includes('/internal/migrations/')).sort()).toEqual([
      join(outputDir, 'internal/migrations/chunk-0.ts'),
      join(outputDir, 'internal/migrations/chunk-1.ts'),
    ]);
  });

  test('two generations are byte-identical', async () => {
    const schemaDir = freshDir();
    const a = join(freshDir(), 'out');
    const b = join(freshDir(), 'out');

    await generate(schemaDir, a, 60);
    await generate(schemaDir, b, 60);
    for (const path of ['migrations.ts', 'migrations/chunk-0.ts', 'migrations/chunk-1.ts']) {
      expect(await Bun.file(join(a, 'internal', path)).text()).toBe(await Bun.file(join(b, 'internal', path)).text());
    }
  });
});
