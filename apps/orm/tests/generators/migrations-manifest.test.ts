import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { generateManifestCode } from '../../src/generators/migrations';
import * as writer from '../../src/generators/migrations/writer';
import { buildDesiredSchema, fingerprint } from '../../src/migrations';
import type { LiteralRegistry, ModelMetadata, ModelRegistry, ObjectRegistry, TupleRegistry } from '../../src/types';
import { loadCorpus, SCHEMAS_DIR } from './parity-corpus';

type Args = [string, ModelMetadata[], ObjectRegistry?, TupleRegistry?, LiteralRegistry?];

const cleanup: string[] = [];
afterAll(() => cleanup.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), 'cerial-manifest-'));
  cleanup.push(dir);

  return dir;
}

function silently<T>(run: () => Promise<T>): Promise<T> {
  const { log, info, warn, error } = console;
  console.log = console.info = console.warn = console.error = () => {};

  return run().finally(() => Object.assign(console, { log, info, warn, error }));
}

/** Frozen at this node and every node below it. */
function frozenEverywhere(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;

  return Object.isFrozen(value) && Object.values(value).every(frozenEverywhere);
}

const registryOf = (models: ModelMetadata[]): ModelRegistry =>
  Object.fromEntries(models.map((model) => [model.name, model]));

/** Writes the generated source into a module of its own and imports it back. */
async function evaluate(source: string): Promise<{ manifest: unknown }> {
  const file = join(scratch(), 'manifest.ts');
  writeFileSync(file, source);

  return (await import(file)) as { manifest: unknown };
}

describe('internal/manifest.ts', () => {
  test('the corpus manifest equals the desired schema, matches modelFingerprints and is frozen at every depth', async () => {
    expect(loadCorpus().errors).toEqual([]);
    const original = writer.writeManifestFile;
    let args: Args | undefined;
    const spy = spyOn(writer, 'writeManifestFile').mockImplementation(async (...received: Args) => {
      args = received;

      return original(...received);
    });
    const outputDir = scratch();
    try {
      const result = await silently(() =>
        generateSingleSchema({ schemaPath: SCHEMAS_DIR, outputDir, logLevel: 'minimal' }),
      );
      expect(result.success).toBe(true);
    } finally {
      spy.mockRestore();
    }
    const [, models, objects, tuples, literals] = args!;
    const desired = buildDesiredSchema(registryOf(models), objects, tuples, literals);

    const { manifest } = (await import(join(outputDir, 'internal', 'manifest.ts'))) as {
      manifest: typeof desired;
    };
    const { modelFingerprints } = (await import(join(outputDir, 'internal', 'migrations.ts'))) as {
      modelFingerprints: Record<string, string>;
    };

    expect(desired.tables.length).toBeGreaterThan(50);
    expect(manifest).toEqual(desired);
    expect(manifest.unmanaged).toEqual([]);
    expect(Object.keys(modelFingerprints)).toEqual(models.map((model) => model.name));
    manifest.tables.forEach((table, index) => {
      expect(fingerprint(table)).toBe(modelFingerprints[models[index]!.name]!);
    });
    expect(frozenEverywhere(manifest)).toBe(true);
    expect(() => {
      (manifest.tables as unknown as unknown[]).push({});
    }).toThrow();
  });

  test('the manifest adds nothing to the public barrel', () => {
    const barrel = readFileSync(join(import.meta.dir, '..', '..', 'src', 'index.ts'), 'utf8');
    expect(barrel).not.toContain('manifest');
  });

  test('a hostile name and default serialise as inert text and round-trip', async () => {
    const hostile = `x'; process.exit(1); //\\ \`\${1}\` */ \n\r\u2028\u2029 "q"`;
    const models = [
      {
        name: 'Hostile',
        tableName: 'hostile',
        fields: [
          { name: 'id', type: 'record', isId: true, isRequired: true },
          { name: 'note', type: 'string', isRequired: true, defaultValue: hostile },
        ],
      },
    ] as unknown as ModelMetadata[];
    const desired = buildDesiredSchema(registryOf(models), {}, {}, {});
    const source = generateManifestCode(models, {}, {}, {});
    const { manifest } = await evaluate(source);

    expect(JSON.stringify(desired)).toContain('process.exit');
    expect(manifest).toEqual(desired);
    expect(frozenEverywhere(manifest)).toBe(true);
    // The hostile text only ever appears inside quoted strings: no raw line terminator survives in the source.
    expect(source).not.toMatch(/[\r\u2028\u2029]/);
  });

  test('a hostile model name cannot break out of an object key', async () => {
    const name = `A'}; throw new Error('pwned'); const b = {'`;
    const models = [
      { name, tableName: name, fields: [{ name: 'id', type: 'record', isId: true, isRequired: true }] },
    ] as unknown as ModelMetadata[];
    const { manifest } = await evaluate(generateManifestCode(models, {}, {}, {}));

    expect(manifest).toEqual(buildDesiredSchema(registryOf(models), {}, {}, {}));
  });
});
