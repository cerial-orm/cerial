/**
 * A failed generation must leave the previous output untouched, with and without --clean.
 *
 * Needs no database; it drives generateSingleSchema against a temp schema folder and makes
 * the last generator (writeClient) throw after the earlier ones have already run.
 */

import { afterAll, afterEach, describe, expect, it, spyOn } from 'bun:test';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import * as clientWriter from '../../src/generators/client/writer';

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

const SCHEMA = 'model Host {\n  id Record @id\n  name String\n}\n';
const SCHEMA_V2 = 'model Host {\n  id Record @id\n  name String\n  age Int?\n}\n';

async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const full = join(entry.parentPath, entry.name);
    out[full.slice(dir.length)] = await readFile(full, 'utf8');
  }

  return out;
}

async function setup(): Promise<{ schemaDir: string; outputDir: string }> {
  const base = await mkdtemp(join(tmpdir(), 'cerial-atomic-output-'));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  const schemaDir = join(base, 'schemas');
  await Bun.write(join(schemaDir, 'a.cerial'), SCHEMA);

  return { schemaDir, outputDir: join(base, 'output') };
}

describe('generate output is written only after every generator returns', () => {
  afterEach(() => {
    spyOn(clientWriter, 'writeClient').mockRestore();
  });

  for (const clean of [false, true]) {
    it(`a throwing generator leaves the previous output byte-identical (clean: ${clean})`, async () => {
      const { schemaDir, outputDir } = await setup();
      const first = await generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal' });
      expect(first.success).toBe(true);
      const before = await snapshot(outputDir);
      expect(Object.keys(before).length).toBeGreaterThan(3);

      await writeFile(join(schemaDir, 'a.cerial'), SCHEMA_V2, 'utf8');
      spyOn(clientWriter, 'writeClient').mockRejectedValue(new Error('generator exploded'));
      const failed = await generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal', clean });

      expect(failed.success).toBe(false);
      expect(failed.errors.join('\n')).toContain('generator exploded');
      expect(await snapshot(outputDir)).toEqual(before);
    });

    it(`a failed first generation creates no output directory (clean: ${clean})`, async () => {
      const { schemaDir, outputDir } = await setup();
      spyOn(clientWriter, 'writeClient').mockRejectedValue(new Error('generator exploded'));
      const failed = await generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal', clean });

      expect(failed.success).toBe(false);
      expect(await Bun.file(join(outputDir, 'internal', 'model-registry.ts')).exists()).toBe(false);
    });
  }

  it('a successful regeneration still replaces the output, and --clean drops stale files', async () => {
    const { schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal' });
    await writeFile(join(outputDir, 'stale.ts'), 'export {};\n', 'utf8');
    await writeFile(join(outputDir, 'notes.txt'), 'keep me\n', 'utf8');

    const again = await generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal' });
    expect(again.success).toBe(true);
    expect(await Bun.file(join(outputDir, 'stale.ts')).exists()).toBe(false);
    expect(await Bun.file(join(outputDir, 'notes.txt')).exists()).toBe(true);
    expect(again.files.every((f) => f.startsWith(outputDir))).toBe(true);

    const cleaned = await generateSingleSchema({ schemaPath: schemaDir, outputDir, logLevel: 'minimal', clean: true });
    expect(cleaned.success).toBe(true);
    expect(await Bun.file(join(outputDir, 'notes.txt')).exists()).toBe(false);
    expect(await Bun.file(join(outputDir, 'internal', 'model-registry.ts')).exists()).toBe(true);
  });
});
