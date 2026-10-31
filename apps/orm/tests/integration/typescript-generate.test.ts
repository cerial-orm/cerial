/**
 * `cerial generate` against TypeScript-only schema entries. Needs no database.
 *
 * Fixture modules import the authoring surface by relative path, as the other builder fixtures do.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { cp, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import type { GenerateResult } from '../../src/cli/generate';

const FIXTURES = new URL('../fixtures/typescript-generate/', import.meta.url).pathname;
const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function outputDir(base = tmpdir()): Promise<string> {
  const dir = await mkdtemp(join(base, 'cerial-ts-generate-'));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));

  return dir;
}

// A mixed entry gets `cerial/handles.ts` beside its sources, so it is generated from a copy, never in the repo
async function copyOf(fixture: string): Promise<string> {
  const copy = await outputDir();
  await cp(join(FIXTURES, fixture), copy, { recursive: true });

  return copy;
}

async function generateFrom(fixture: string, base?: string): Promise<{ result: GenerateResult; dir: string }> {
  const dir = await outputDir(base);
  const result = await generateSingleSchema({
    schemaPath: fixture === 'mixed' ? await copyOf(fixture) : join(FIXTURES, fixture),
    outputDir: dir,
    logLevel: 'minimal',
  });

  return { result, dir };
}

// The client imports `cerial`, which only resolves once built; the output sits inside the package and a path maps it to source
describe('TypeScript-only entry', () => {
  it('generates a client whose output files exist and compile', async () => {
    const { result, dir } = await generateFrom('valid', join(import.meta.dir, '..'));

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    const files = await readdir(dir, { recursive: true });
    expect(files).toContain('index.ts');

    const text = (
      await Promise.all(files.filter((f) => f.endsWith('.ts')).map((f) => readFile(join(dir, f), 'utf8')))
    ).join('\n');
    for (const name of ['User', 'Post', 'Address', 'Role', 'Profile']) expect(text).toContain(name);

    await writeFile(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        extends: join(import.meta.dir, '../../../../tsconfig.json'),
        compilerOptions: { baseUrl: dir, paths: { cerial: [join(import.meta.dir, '../../src/index.ts')] } },
        include: ['**/*.ts'],
      }),
    );
    const tsc = Bun.spawn(['bunx', 'tsc', '--noEmit', '-p', dir], { stdout: 'pipe', stderr: 'pipe' });
    const out = await new Response(tsc.stdout).text();
    expect(await tsc.exited, out).toBe(0);
  }, 120_000);

  it('reports an entry whose modules export no declaration instead of generating an empty client', async () => {
    const { result, dir } = await generateFrom('empty');

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('none exports a model, object, tuple, literal or enum');
    expect(await readdir(dir)).toEqual([]);
  });

  it('names the module when a validation rule fails, with the message the .cerial twin gets', async () => {
    const { result } = await generateFrom('invalid');
    expect(result.success).toBe(false);
    const [error] = result.errors;
    expect(error).toContain(join(FIXTURES, 'invalid', 'bad.schema.ts'));

    const twin = await outputDir();
    await writeFile(
      join(twin, 'orphan.cerial'),
      'model Orphan {\n  id Record @id\n  ownerId Record\n  owner Relation @field(ownerId) @model(Nobody)\n}\n',
    );
    const expected = await generateSingleSchema({
      schemaPath: twin,
      outputDir: join(twin, 'out'),
      logLevel: 'minimal',
    });
    expect(expected.success).toBe(false);
    const strip = (message: string | undefined): string => (message ?? '').replace(/^[^:]*\.(cerial|schema\.ts): /, '');
    expect(strip(error)).toBe(strip(expected.errors[0]));
  });

  it('names the module when it throws on import', async () => {
    const dir = await outputDir();
    await writeFile(join(dir, 'boom.schema.ts'), "throw new Error('boom');\n");
    const result = await generateSingleSchema({ schemaPath: dir, outputDir: join(dir, 'out'), logLevel: 'minimal' });

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('boom.schema.ts');
  });
});

describe('entry holding both forms', () => {
  it('parses the .cerial files and imports the TypeScript modules, which declare nothing', async () => {
    const built = await buildResolvedSchemaAst({ schemaPath: await copyOf('mixed') });

    expect(built.schemaFiles).toHaveLength(1);
    expect(built.typescriptFiles).toHaveLength(1);
    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['Host']);

    const { result } = await generateFrom('mixed');
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });
});

describe('a second copy of the builder', () => {
  it('still recognises handles the first copy declared', async () => {
    const first = await import('../../src/parser/builder/model');
    // A query string makes the runtime evaluate the module again, as a second bundle would
    const copyPath: string = '../../src/parser/builder/model.ts?second-copy';
    const second = (await import(copyPath)) as typeof first;
    const { f } = await import('../../src/parser/builder/field');

    expect(second.model).not.toBe(first.model);
    const handle = first.model('Shared', { id: f.record().id() });
    expect(second.isModelHandle(handle)).toBe(true);
  });
});
