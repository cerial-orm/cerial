/**
 * `cerial generate` and `cerial/handles.ts`: written only for an entry mixing `.cerial` and TypeScript,
 * removed when it stops, and never read back as a schema. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { findSchemasInDir } from '../../src/cli/resolvers/schema-resolver';
import { HANDLES_MARKER } from '../../src/generators/handles';

const cleanups: Array<() => Promise<void>> = [];
afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

const CERIAL = 'model Host {\n  id Record(int) @id\n  name String\n}\nobject Spot {\n  a Int\n}\n';
const TS_MODULE = 'export const noop = 1;\n';

async function entry(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-handles-int-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), content);
  }

  return dir;
}

const handlesFile = (dir: string): string => join(dir, 'cerial', 'handles.ts');

describe('handles on generate', () => {
  it('writes them for an entry holding .cerial files and a TypeScript source, before anything is imported', async () => {
    const dir = await entry({ 'a.cerial': CERIAL, 'x.schema.ts': TS_MODULE });
    const built = await buildResolvedSchemaAst({ schemaPath: dir });

    expect(built.parseErrors).toEqual([]);
    const text = await readFile(handlesFile(dir), 'utf-8');
    expect(text.startsWith(HANDLES_MARKER)).toBe(true);
    expect(text).toContain("handle.model('Host', { members: ['id', 'name'], id: ['int'] })");
    expect(text).toContain("handle.object('Spot'");
  });

  it('writes nothing into a .cerial-only project, and nothing into a TypeScript-only one', async () => {
    const cerialOnly = await entry({ 'a.cerial': CERIAL });
    const tsOnly = await entry({ 'x.schema.ts': TS_MODULE });
    await buildResolvedSchemaAst({ schemaPath: cerialOnly });
    await buildResolvedSchemaAst({ schemaPath: tsOnly });

    expect(existsSync(join(cerialOnly, 'cerial'))).toBe(false);
    expect(existsSync(join(tsOnly, 'cerial'))).toBe(false);
    expect(await readdir(cerialOnly)).toEqual(['a.cerial']);
  });

  it('generates a client for a .cerial-only project exactly as before, with no handles file', async () => {
    const dir = await entry({ 'a.cerial': CERIAL });
    const result = await generateSingleSchema({ schemaPath: dir, outputDir: join(dir, 'out'), logLevel: 'minimal' });

    expect(result.errors).toEqual([]);
    expect(existsSync(handlesFile(dir))).toBe(false);
  });

  it('keeps writing the same bytes on a second run', async () => {
    const dir = await entry({ 'a.cerial': CERIAL, 'x.schema.ts': TS_MODULE });
    await buildResolvedSchemaAst({ schemaPath: dir });
    const first = await readFile(handlesFile(dir), 'utf-8');
    await buildResolvedSchemaAst({ schemaPath: dir });

    expect(await readFile(handlesFile(dir), 'utf-8')).toBe(first);
  });

  it('removes the marked file once the entry stops mixing', async () => {
    const dir = await entry({ 'a.cerial': CERIAL, 'x.schema.ts': TS_MODULE });
    await buildResolvedSchemaAst({ schemaPath: dir });
    expect(existsSync(handlesFile(dir))).toBe(true);

    await rm(join(dir, 'x.schema.ts'));
    await buildResolvedSchemaAst({ schemaPath: dir });
    expect(existsSync(handlesFile(dir))).toBe(false);
  });

  it('refuses an unmarked file at the path, naming it, and keeps it', async () => {
    const dir = await entry({
      'a.cerial': CERIAL,
      'x.schema.ts': TS_MODULE,
      'cerial/handles.ts': 'export const mine = 1;\n',
    });

    await expect(buildResolvedSchemaAst({ schemaPath: dir })).rejects.toThrow(handlesFile(dir));
    expect(await readFile(handlesFile(dir), 'utf-8')).toBe('export const mine = 1;\n');
  });

  it('leaves an unmarked file alone when the entry is not mixing', async () => {
    const dir = await entry({ 'a.cerial': CERIAL, 'cerial/handles.ts': 'export const mine = 1;\n' });
    await buildResolvedSchemaAst({ schemaPath: dir });

    expect(await readFile(handlesFile(dir), 'utf-8')).toBe('export const mine = 1;\n');
  });

  it('keeps handles for the declarations that parsed when another references a TypeScript-declared type', async () => {
    const dir = await entry({
      'a.cerial': `${CERIAL}model NeedsTs {\n  id Record @id\n  where TsAddress\n}\n`,
      'x.schema.ts': TS_MODULE,
    });
    const built = await buildResolvedSchemaAst({ schemaPath: dir });

    // Pass 1 sees only .cerial names, so the reference fails today; the merge pass resolves it
    expect(built.parseErrors.length).toBe(1);
    const text = await readFile(handlesFile(dir), 'utf-8');
    expect(text).toContain("handle.model('Host'");
    expect(text).not.toContain('NeedsTs');
  });
});

describe('handles stay out of discovery', () => {
  it('is not found by convention discovery or read as a schema source, whatever the mode', async () => {
    const dir = await entry({ 'a.cerial': CERIAL, 'x.schema.ts': TS_MODULE });
    await buildResolvedSchemaAst({ schemaPath: dir });
    expect(existsSync(handlesFile(dir))).toBe(true);

    const found = await findSchemasInDir(dir, ['**/*.cerial', '**/*.schema.ts']);
    expect(found.some((f) => f.endsWith('handles.ts'))).toBe(false);

    const byPath = await buildResolvedSchemaAst({ schemaPath: dir });
    expect([...byPath.schemaFiles, ...byPath.typescriptFiles].some((f) => f.endsWith('handles.ts'))).toBe(false);

    // Listing the generated file as a `files` entry contributes nothing
    const byFiles = await buildResolvedSchemaAst({
      files: [join(dir, 'a.cerial'), handlesFile(dir)],
      filterBase: dir,
    });
    expect([...byFiles.schemaFiles, ...byFiles.typescriptFiles].some((f) => f.endsWith('handles.ts'))).toBe(false);
  });
});
