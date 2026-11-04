/**
 * The registry is written as chunk files behind one aggregator. The aggregator must be
 * indistinguishable from the single-file registry, and the chunks must follow the schema's size.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSchemaMetadata } from '../../src/cli/schema-metadata';
import { generateSingleSchema } from '../../src/cli/generate';
import { generateFullRegistryCode } from '../../src/generators/metadata/registry-generator';
import { writeModelRegistry } from '../../src/generators/metadata/registry-writer';
import { resolveInheritance } from '../../src/resolver';
import type { LiteralMetadata, ModelMetadata, ObjectMetadata } from '../../src/types';
import { loadCorpus } from './parity-corpus';

const scratch = mkdtempSync(join(tmpdir(), 'cerial-registry-chunks-'));
let counter = 0;
const freshDir = (): string => {
  const dir = join(scratch, `d${counter++}`);
  mkdirSync(dir, { recursive: true });

  return dir;
};

afterAll(() => rmSync(scratch, { recursive: true, force: true }));

interface Registries {
  modelRegistry: Record<string, unknown>;
  objectRegistry?: Record<string, unknown>;
  tupleRegistry?: Record<string, unknown>;
  literalRegistry?: Record<string, unknown>;
}

const names = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, i) => `${prefix}${String(i).padStart(3, '0')}`);

const models = (count: number): ModelMetadata[] =>
  names('M', count).map((name) => ({
    name,
    tableName: name.toLowerCase(),
    fields: [{ name: 'id', type: 'record', isId: true, isUnique: true, isRequired: false }],
  }));

const objects = (count: number): ObjectMetadata[] =>
  names('O', count).map((name) => ({
    name,
    fields: [{ name: 'a', type: 'string', isId: false, isUnique: false, isRequired: true }],
  }));

const literals = (count: number): LiteralMetadata[] =>
  names('L', count).map((name) => ({ name, variants: [{ kind: 'string', value: 'a' }] }));

const chunkFiles = (dir: string, kind: string): string[] => {
  const path = join(dir, 'internal', 'registry', kind);

  return existsSync(path) ? readdirSync(path).sort() : [];
};

describe('registry chunks: same registry as one file', () => {
  test('whole corpus deep-equals the single-file registry, key order included', async () => {
    const corpus = loadCorpus();
    const resolved = resolveInheritance(corpus.ast);
    const meta = buildSchemaMetadata({ ...resolved, models: resolved.models.filter((m) => !m.abstract) });

    const dir = freshDir();
    await writeModelRegistry(dir, meta.models, meta.objects, meta.tuples, meta.literals);
    const chunked = (await import(join(dir, 'internal', 'model-registry.ts'))) as Registries;

    const oldFile = join(freshDir(), 'old.ts');
    writeFileSync(oldFile, generateFullRegistryCode(meta.models, meta.objects, meta.tuples, meta.literals));
    const old = (await import(oldFile)) as Registries;

    expect(meta.models.length).toBeGreaterThan(50);
    for (const key of ['modelRegistry', 'objectRegistry', 'tupleRegistry', 'literalRegistry'] as const) {
      expect(Object.keys(chunked[key]!)).toEqual(Object.keys(old[key]!));
      expect(chunked[key]).toEqual(old[key]);
    }
  });

  test('a registry the schema does not use is not exported', async () => {
    const dir = freshDir();
    await writeModelRegistry(dir, models(2));
    const chunked = (await import(join(dir, 'internal', 'model-registry.ts'))) as Registries;

    expect(Object.keys(chunked.modelRegistry)).toEqual(['M000', 'M001']);
    expect(chunked.objectRegistry).toBeUndefined();
    expect(chunked.tupleRegistry).toBeUndefined();
    expect(chunked.literalRegistry).toBeUndefined();
  });
});

describe('registry chunks: boundaries', () => {
  test.each([
    [1, 1],
    [50, 1],
    [51, 2],
    [100, 2],
    [101, 3],
  ])('%i models write %i chunk file(s)', async (count, files) => {
    const dir = freshDir();
    const written = await writeModelRegistry(dir, models(count));

    expect(chunkFiles(dir, 'models')).toEqual(Array.from({ length: files }, (_, i) => `chunk-${i}.ts`));
    expect(written).toHaveLength(files + 1);
  });

  test('51 models split 50 and 1 in declaration order', async () => {
    const dir = freshDir();
    await writeModelRegistry(dir, models(51));
    const { chunk: first } = (await import(join(dir, 'internal/registry/models/chunk-0.ts'))) as {
      chunk: Record<string, unknown>;
    };
    const { chunk: second } = (await import(join(dir, 'internal/registry/models/chunk-1.ts'))) as {
      chunk: Record<string, unknown>;
    };

    expect(Object.keys(first)).toEqual(names('M', 51).slice(0, 50));
    expect(Object.keys(second)).toEqual(['M050']);
  });

  test('every kind chunks on its own, and zero entries write no chunk files or directory', async () => {
    const dir = freshDir();
    await writeModelRegistry(dir, models(1), objects(51), [], literals(50));

    expect(chunkFiles(dir, 'models')).toEqual(['chunk-0.ts']);
    expect(chunkFiles(dir, 'objects')).toEqual(['chunk-0.ts', 'chunk-1.ts']);
    expect(chunkFiles(dir, 'literals')).toEqual(['chunk-0.ts']);
    expect(existsSync(join(dir, 'internal', 'registry', 'tuples'))).toBe(false);
  });

  test('a model and an object whose names match when lowercased stay separate', async () => {
    const dir = freshDir();
    const model: ModelMetadata = { name: 'UserId', tableName: 'user_id', fields: [] };
    const object: ObjectMetadata = { name: 'Userid', fields: [] };
    await writeModelRegistry(dir, [model], [object]);
    const chunked = (await import(join(dir, 'internal', 'model-registry.ts'))) as Registries;

    expect(Object.keys(chunked.modelRegistry)).toEqual(['UserId']);
    expect(Object.keys(chunked.objectRegistry!)).toEqual(['Userid']);
  });
});

describe('registry chunks: regeneration', () => {
  const schema = (modelCount: number, withObject: boolean): string =>
    [
      ...names('M', modelCount).map((n) => `model ${n} {\n  id Record @id\n}`),
      ...(withObject ? ['object Extra {\n  a String\n}'] : []),
    ].join('\n');

  const generate = async (schemaDir: string, outputDir: string, source: string) => {
    writeFileSync(join(schemaDir, 'schema.cerial'), source);

    return generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal' });
  };

  test('fewer entries remove the stale chunk files and leave no empty directory', async () => {
    const schemaDir = freshDir();
    const outputDir = join(freshDir(), 'out');

    expect((await generate(schemaDir, outputDir, schema(51, true))).success).toBe(true);
    expect(chunkFiles(outputDir, 'models')).toEqual(['chunk-0.ts', 'chunk-1.ts']);
    expect(chunkFiles(outputDir, 'objects')).toEqual(['chunk-0.ts']);

    const again = await generate(schemaDir, outputDir, schema(50, false));
    expect(again.success).toBe(true);
    expect(chunkFiles(outputDir, 'models')).toEqual(['chunk-0.ts']);
    expect(existsSync(join(outputDir, 'internal', 'registry', 'objects'))).toBe(false);
    expect(again.files.filter((f) => f.includes('/internal/registry/'))).toEqual([
      join(outputDir, 'internal/registry/models/chunk-0.ts'),
    ]);
  });

  test('unchanged chunks are kept and two generations are byte-identical', async () => {
    const schemaDir = freshDir();
    const a = join(freshDir(), 'out');
    const b = join(freshDir(), 'out');

    await generate(schemaDir, a, schema(60, true));
    await generate(schemaDir, b, schema(60, true));
    for (const file of ['models/chunk-0.ts', 'models/chunk-1.ts', 'objects/chunk-0.ts']) {
      const path = `internal/registry/${file}`;
      expect(await Bun.file(join(a, path)).text()).toBe(await Bun.file(join(b, path)).text());
    }
    expect(await Bun.file(join(a, 'internal/model-registry.ts')).text()).toBe(
      await Bun.file(join(b, 'internal/model-registry.ts')).text(),
    );
  });
});
