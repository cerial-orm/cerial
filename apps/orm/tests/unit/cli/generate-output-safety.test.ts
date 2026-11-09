/**
 * generate deletes only what its own previous run wrote, and refuses an output directory that is
 * outside the project or holds schema sources. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ResolvedSchemaEntry } from '../../../src/cli/config';
import { entrySources, generate, generateMultiSchema, generateSingleSchema } from '../../../src/cli/generate';
import { buildWatchTargets } from '../../../src/cli/commands/generate';
import { singleSchemaOptions } from '../../../src/cli/watcher';
import { entryModule, modelModule, removeTempProjects, tempProject } from '../../registration-project';
import { ALLOW_UNSAFE_OUTPUT_FLAG, OUTPUT_MANIFEST_NAME } from '../../../src/cli/output-guard';

const bases: string[] = [];

afterAll(async () => {
  await removeTempProjects();
  await Promise.all(bases.map((b) => rm(b, { recursive: true, force: true })));
});

const SCHEMA = 'model Host {\n  id Record @id\n  name String\n}\n';

/** Adds entries to the manifest of the last run, which stays otherwise as it was */
async function addToManifest(outputDir: string, extra: string[]): Promise<void> {
  const path = join(outputDir, OUTPUT_MANIFEST_NAME);
  const manifest = JSON.parse(await readFile(path, 'utf8')) as { files: string[] };
  await writeFile(path, JSON.stringify({ files: [...manifest.files, ...extra] }));
}

async function setup(): Promise<{ base: string; schemaDir: string; outputDir: string }> {
  const base = await realpath(await mkdtemp(join(tmpdir(), 'cerial-output-safety-')));
  bases.push(base);
  const schemaDir = join(base, 'schemas');
  await mkdir(schemaDir, { recursive: true });
  await writeFile(join(schemaDir, 'a.cerial'), SCHEMA);

  return { base, schemaDir, outputDir: join(base, 'out') };
}

describe('generate deletes only files its manifest lists', () => {
  for (const clean of [false, true]) {
    it(`a user .ts file in the output survives (clean: ${clean})`, async () => {
      const { schemaDir, outputDir } = await setup();
      const first = await generateSingleSchema({ schemaPath: schemaDir, outputDir });
      expect(first.success).toBe(true);
      await mkdir(join(outputDir, 'mine'), { recursive: true });
      await writeFile(join(outputDir, 'mine', 'user.ts'), 'export const keep = 1;\n');
      await writeFile(join(outputDir, 'top.ts'), 'export const top = 1;\n');

      const second = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean });
      expect(second.success).toBe(true);
      expect(await readFile(join(outputDir, 'mine', 'user.ts'), 'utf8')).toBe('export const keep = 1;\n');
      expect(existsSync(join(outputDir, 'top.ts'))).toBe(true);
    });
  }

  it('a file written by the previous run and not by this one is removed, with its emptied directory', async () => {
    const { schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    const manifestPath = join(outputDir, OUTPUT_MANIFEST_NAME);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as { files: string[] };
    await mkdir(join(outputDir, 'old'), { recursive: true });
    await writeFile(join(outputDir, 'old', 'gone.ts'), 'export {};\n');
    await writeFile(manifestPath, JSON.stringify({ files: [...manifest.files, 'old/gone.ts'] }));

    const second = await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    expect(second.success).toBe(true);
    expect(existsSync(join(outputDir, 'old'))).toBe(false);
  });

  it('--clean removes listed files and keeps unlisted ones', async () => {
    const { schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    const manifest = JSON.parse(await readFile(join(outputDir, OUTPUT_MANIFEST_NAME), 'utf8')) as { files: string[] };
    await writeFile(join(outputDir, manifest.files[0]!), 'stale content');
    await writeFile(join(outputDir, 'user.ts'), 'export {};\n');

    const second = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean: true });
    expect(second.success).toBe(true);
    expect(await readFile(join(outputDir, manifest.files[0]!), 'utf8')).not.toBe('stale content');
    expect(existsSync(join(outputDir, 'user.ts'))).toBe(true);
  });

  it('no manifest deletes nothing', async () => {
    for (const clean of [false, true]) {
      const { schemaDir, outputDir } = await setup();
      await mkdir(outputDir, { recursive: true });
      await writeFile(join(outputDir, 'older.ts'), 'export {};\n');

      const result = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean });
      expect(result.success).toBe(true);
      expect(existsSync(join(outputDir, 'older.ts'))).toBe(true);
    }
  });

  it('no manifest and an existing file a run would write: refused, naming it, and kept', async () => {
    const { schemaDir, outputDir } = await setup();
    await mkdir(outputDir, { recursive: true });
    await writeFile(join(outputDir, 'client.ts'), '// mine\n');

    for (const clean of [false, true]) {
      const refused = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean });
      expect(refused.success).toBe(false);
      expect(refused.errors[0]).toContain(join(outputDir, 'client.ts'));
      expect(refused.errors[0]).toContain(ALLOW_UNSAFE_OUTPUT_FLAG);
      expect(refused.errors[0]).toContain(`has no ${OUTPUT_MANIFEST_NAME}`);
      expect(refused.errors[0]).toContain(`Delete '${outputDir}' and run generate again`);
      expect(refused.errors[0]).toContain('can shadow the new types');
      expect(await readFile(join(outputDir, 'client.ts'), 'utf8')).toBe('// mine\n');
      expect(existsSync(join(outputDir, OUTPUT_MANIFEST_NAME))).toBe(false);
    }

    const allowed = await generateSingleSchema({ schemaPath: schemaDir, outputDir, allowUnsafeOutput: true });
    expect(allowed.success).toBe(true);
    expect(await readFile(join(outputDir, 'client.ts'), 'utf8')).not.toBe('// mine\n');
  });

  it('a first run into an empty existing folder works', async () => {
    const { schemaDir, outputDir } = await setup();
    await mkdir(outputDir, { recursive: true });

    expect((await generateSingleSchema({ schemaPath: schemaDir, outputDir })).success).toBe(true);
  });

  it('a user file that only a later run would write is refused, not overwritten', async () => {
    const { schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    await writeFile(join(schemaDir, 'b.cerial'), 'model Extra {\n  id Record @id\n}\n');
    await mkdir(join(outputDir, 'models'), { recursive: true });
    await writeFile(join(outputDir, 'models', 'extra.d.ts'), '// mine\n');

    const result = await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    expect(result.success).toBe(false);
    expect(await readFile(join(outputDir, 'models', 'extra.d.ts'), 'utf8')).toBe('// mine\n');
    expect(result.errors[0]).toContain('that a previous generate did not write');
    expect(result.errors[0]).toContain(`Pass ${ALLOW_UNSAFE_OUTPUT_FLAG} to overwrite them`);
    expect(result.errors[0]).not.toContain('has no ');
    expect(result.errors[0]).not.toContain('Delete ');
  });

  it('a copy that fails under --clean deletes nothing', async () => {
    const { schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    await mkdir(join(outputDir, 'old'), { recursive: true });
    await writeFile(join(outputDir, 'old', 'gone.ts'), 'export {};\n');
    await addToManifest(outputDir, ['old/gone.ts']);
    // A file where the run needs a folder makes the copy fail after the generators have run
    await rm(join(outputDir, 'internal'), { recursive: true });
    await writeFile(join(outputDir, 'internal'), 'in the way');

    const result = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean: true });

    expect(result.success).toBe(false);
    expect(existsSync(join(outputDir, 'old', 'gone.ts'))).toBe(true);
    expect(existsSync(join(outputDir, 'client.ts'))).toBe(true);
  });

  it('a manifest entry that escapes the output directory is not deleted', async () => {
    const { base, schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    await writeFile(join(base, 'outside.ts'), 'export {};\n');
    await addToManifest(outputDir, ['../outside.ts']);

    const result = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean: true });
    expect(result.errors).toEqual([]);
    expect(existsSync(join(base, 'outside.ts'))).toBe(true);
  });
});

describe('a manifest entry that resolves outside the output is never deleted', () => {
  it('a symlinked folder inside the output', async () => {
    const { base, schemaDir, outputDir } = await setup();
    await generateSingleSchema({ schemaPath: schemaDir, outputDir });
    const outside = join(base, 'outside');
    await mkdir(outside, { recursive: true });
    await writeFile(join(outside, 'victim.ts'), 'export {};\n');
    await symlink(outside, join(outputDir, 'link'));
    await addToManifest(outputDir, ['link/victim.ts']);

    for (const clean of [false, true]) {
      const r = await generateSingleSchema({ schemaPath: schemaDir, outputDir, clean });
      expect(r.errors).toEqual([]);
      expect(existsSync(join(outside, 'victim.ts'))).toBe(true);
      await addToManifest(outputDir, ['link/victim.ts']);
    }
  });
});

describe('generate refuses an unsafe output directory', () => {
  it('refuses -o outside the project root and allows it with the flag', async () => {
    const { base, schemaDir } = await setup();
    const project = join(base, 'project');
    await mkdir(project, { recursive: true });
    const outputDir = join(base, 'elsewhere');

    const refused = await generateSingleSchema({ schemaPath: schemaDir, outputDir, projectRoot: project });
    expect(refused.success).toBe(false);
    expect(refused.errors[0]).toContain(outputDir);
    expect(refused.errors[0]).toContain(ALLOW_UNSAFE_OUTPUT_FLAG);
    expect(existsSync(outputDir)).toBe(false);

    const allowed = await generateSingleSchema({
      schemaPath: schemaDir,
      outputDir,
      projectRoot: project,
      allowUnsafeOutput: true,
    });
    expect(allowed.success).toBe(true);
  });

  it('allows an output inside the project root', async () => {
    const { base, schemaDir } = await setup();
    const result = await generateSingleSchema({
      schemaPath: schemaDir,
      outputDir: join(base, 'out'),
      projectRoot: base,
    });
    expect(result.success).toBe(true);
  });

  it('refuses an output containing a .cerial source and leaves it intact', async () => {
    const { schemaDir } = await setup();
    const result = await generateSingleSchema({ schemaPath: schemaDir, outputDir: schemaDir });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('a.cerial');
    expect(result.errors[0]).toContain(ALLOW_UNSAFE_OUTPUT_FLAG);
    expect(await readFile(join(schemaDir, 'a.cerial'), 'utf8')).toBe(SCHEMA);
  });

  it('refuses an output that is a parent of the schema folder', async () => {
    const { base, schemaDir } = await setup();
    const result = await generateSingleSchema({ schemaPath: schemaDir, outputDir: base });
    expect(result.success).toBe(false);
    expect(existsSync(join(schemaDir, 'a.cerial'))).toBe(true);
  });

  it('refuses a symlinked output that points outside the project', async () => {
    const { base, schemaDir } = await setup();
    const project = join(base, 'project');
    const outside = join(base, 'outside');
    await mkdir(project, { recursive: true });
    await mkdir(outside, { recursive: true });
    await symlink(outside, join(project, 'link'));

    const result = await generateSingleSchema({
      schemaPath: schemaDir,
      outputDir: join(project, 'link'),
      projectRoot: project,
    });
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain(outside);
    expect(existsSync(join(outside, 'index.ts'))).toBe(false);
  });
});

describe('the output must not hold what a schema entry loads', () => {
  it('refuses an output holding a module the TypeScript entry imports', async () => {
    const dir = await tempProject({
      'src/user.ts': modelModule('User'),
      'src/db/index.ts': 'export const marker = 1;\n',
      'src/schema.ts': entryModule(['User']).replace('import { User }', "import './db/index';\nimport { User }"),
    });

    const result = await generateSingleSchema({
      entry: join(dir, 'src', 'schema.ts'),
      outputDir: join(dir, 'src', 'db'),
      projectRoot: dir,
    });

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('schema source');
    expect(result.errors[0]).toContain(join(dir, 'src', 'db', 'index.ts'));
    expect(await readFile(join(dir, 'src', 'db', 'index.ts'), 'utf8')).toBe('export const marker = 1;\n');
  });

  it("refuses an output that is another entry's folder", async () => {
    const { base } = await setup();
    const a = join(base, 'schemas', 'a');
    const b = join(base, 'schemas', 'b');
    await mkdir(a, { recursive: true });
    await mkdir(b, { recursive: true });
    await writeFile(join(a, 'a.cerial'), 'model A {\n  id Record @id\n}\n');
    await writeFile(join(b, 'b.cerial'), 'model B {\n  id Record @id\n}\n');
    const entry = (name: string, path: string, output: string): ResolvedSchemaEntry => ({
      name,
      path,
      output,
      clientClassName: `${name}Client`,
    });
    const entries = [entry('a', a, join(a, 'client')), entry('b', b, a)];

    const result = await generateMultiSchema(entries, { projectRoot: base });

    expect(result.success).toBe(false);
    expect(result.results.b!.errors[0]).toContain(ALLOW_UNSAFE_OUTPUT_FLAG);
    expect(await readFile(join(a, 'a.cerial'), 'utf8')).toBe('model A {\n  id Record @id\n}\n');
    expect(entrySources(entries)).toContain(a);
  });
});

const MODEL = 'model Host {\n  id Record @id\n  name String\n}\n';

async function inProject<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

/** A directory beside the project, so it lies outside the project root */
async function outsideOf(dir: string): Promise<string> {
  const outside = `${dir}-outside`;
  bases.push(outside);

  return outside;
}

describe('generate() applies the project root from every source of the output', () => {
  const sources: Array<{
    name: string;
    files: (outside: string) => Record<string, string>;
    options: (outside: string) => { schema?: string; output?: string };
  }> = [
    {
      name: '-o',
      files: () => ({ 'schemas/a.cerial': MODEL }),
      options: (outside) => ({ schema: 'schemas', output: outside }),
    },
    {
      name: 'the root config',
      files: (outside) => ({
        'cerial.config.json': JSON.stringify({ schema: './schemas', output: outside }),
        'schemas/a.cerial': MODEL,
      }),
      options: () => ({}),
    },
    {
      name: 'a folder config',
      files: (outside) => ({
        'schemas/cerial.config.json': JSON.stringify({ output: outside }),
        'schemas/a.cerial': MODEL,
      }),
      options: () => ({}),
    },
  ];

  for (const source of sources) {
    it(`refuses an output outside the project from ${source.name}, and allows it with the flag`, async () => {
      // The output path is made absolute only once the project directory is known
      const dir = await tempProject({ placeholder: '' });
      const outside = await outsideOf(dir);
      for (const [name, text] of Object.entries(source.files(outside))) {
        await mkdir(join(dir, name, '..'), { recursive: true });
        await writeFile(join(dir, name), text);
      }

      const refused = await inProject(dir, () => generate(source.options(outside)));
      expect(refused.success).toBe(false);
      expect(refused.errors.join('\n')).toContain(ALLOW_UNSAFE_OUTPUT_FLAG);
      expect(existsSync(outside)).toBe(false);

      const allowed = await inProject(dir, () => generate({ ...source.options(outside), allowUnsafeOutput: true }));
      expect(allowed.errors).toEqual([]);
      expect(existsSync(join(outside, 'client.ts'))).toBe(true);
    });
  }

  it('watch mode regenerates in process with the same root, so the refusal holds there too', async () => {
    const dir = await tempProject({ 'schemas/a.cerial': MODEL });
    const outside = await outsideOf(dir);
    await writeFile(join(dir, 'schemas', 'cerial.config.json'), JSON.stringify({ output: outside }));

    const [target] = await inProject(dir, () => buildWatchTargets({}));
    expect(target!.projectRoot).toBe(await realpath(dir));
    const result = await generateSingleSchema(singleSchemaOptions(target!));

    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain(ALLOW_UNSAFE_OUTPUT_FLAG);
  });
});
