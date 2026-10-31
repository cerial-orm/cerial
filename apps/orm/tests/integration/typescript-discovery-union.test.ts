/**
 * The three TypeScript discovery modes (a `*.schema.ts` suffix, an entry module, a `schemas[].files` list)
 * unioned additively. Needs no database. Fixtures live in tests/fixtures/typescript-discovery-union.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveConfig, type SchemaEntry } from '../../src/cli/config';
import { generateMultiSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import { removeTempProjects, tempProject } from '../registration-project';

afterAll(removeTempProjects);

const FIXTURES = join(import.meta.dir, '../fixtures/typescript-discovery-union');
const BIN = resolve(import.meta.dir, '../../bin/cerial.ts');

/** Generate one schema entry rooted at `fixture`, into a new directory, and return where it went */
async function generateFrom(fixture: string, entry: SchemaEntry): Promise<string> {
  const cwd = join(FIXTURES, fixture);
  const [resolved] = resolveConfig({ schemas: { app: entry } }, cwd);
  const out = await tempProject({});
  const result = await generateMultiSchema([{ ...resolved!, output: out }], { logLevel: 'minimal' });

  expect(result.errors).toEqual([]);
  expect(result.success).toBe(true);

  return out;
}

/** Every generated file by relative path, so a difference in any one of them shows */
async function snapshot(out: string): Promise<Record<string, string>> {
  const names = (await readdir(out, { recursive: true })).sort();
  const files: Record<string, string> = {};
  for (const name of names) {
    const text = await readFile(join(out, name), 'utf8').catch(() => null);
    if (text !== null) files[name] = text;
  }

  return files;
}

async function modelNames(fixture: string, entry: SchemaEntry): Promise<string[]> {
  const [resolved] = resolveConfig({ schemas: { app: entry } }, join(FIXTURES, fixture));
  const built = await buildResolvedSchemaAst({
    schemaPath: resolved!.entryOnly ? undefined : resolved!.path,
    entry: resolved!.entry,
    files: resolved!.files,
  });

  return (built.resolvedAST?.models ?? []).map((m) => m.name).sort();
}

describe('the union of the three modes', () => {
  const all: SchemaEntry = {
    path: './schemas',
    entry: './registered/entry.ts',
    files: ['./listed/listed.ts', './schemas/shared.schema.ts'],
  };

  it('holds a declaration from every mode, and one reached by all three', async () => {
    expect(await modelNames('all-modes', all)).toEqual(['Convention', 'Listed', 'Registered', 'Shared']);
  });

  it('generates a client that contains each of them once', async () => {
    const text = Object.values(await snapshot(await generateFrom('all-modes', all))).join('\n');

    for (const name of ['Convention', 'Listed', 'Registered', 'Shared']) expect(text).toContain(name);
  });

  it('gives each mode alone only what it finds', async () => {
    expect(await modelNames('all-modes', { path: './schemas' })).toEqual(['Convention', 'Shared']);
    expect(await modelNames('all-modes', { entry: './registered/entry.ts' })).toEqual(['Registered', 'Shared']);
    expect(await modelNames('all-modes', { files: ['./listed/listed.ts'] })).toEqual(['Listed']);
  });

  it('is not an error when one file is found by the suffix, listed, and imported by the entry', async () => {
    const out = await generateFrom('all-modes', all);

    expect(Object.keys(await snapshot(out)).length).toBeGreaterThan(0);
  });

  it('does not let one mode disable another', async () => {
    // A listed file adds to the path rather than replacing it, and an empty list changes nothing
    expect(await modelNames('all-modes', { path: './schemas', files: ['./listed/listed.ts'] })).toEqual([
      'Convention',
      'Listed',
      'Shared',
    ]);
    expect(await modelNames('all-modes', { path: './schemas', files: [] })).toEqual(['Convention', 'Shared']);
  });
});

describe('two different declarations sharing a name', () => {
  const clash: SchemaEntry = { entry: './registered/entry.ts', files: ['./listed/user.ts'] };

  it('hits the duplicate-name refusal, naming both files', async () => {
    const [resolved] = resolveConfig({ schemas: { app: clash } }, join(FIXTURES, 'duplicate-names'));
    const built = await buildResolvedSchemaAst({ entry: resolved!.entry, files: resolved!.files });

    expect(built.resolvedAST).toBeNull();
    const [error] = built.extendsErrors;
    expect(error!.message).toContain('Duplicate model name: User');
    expect(error!.message).toContain(join(FIXTURES, 'duplicate-names/listed/user.ts'));
    expect(error!.message).toContain(join(FIXTURES, 'duplicate-names/registered/user.ts'));
  });

  it('writes no client', async () => {
    const [resolved] = resolveConfig({ schemas: { app: clash } }, join(FIXTURES, 'duplicate-names'));
    const out = await tempProject({});

    const result = await generateMultiSchema([{ ...resolved!, output: out }], { logLevel: 'minimal' });

    expect(result.success).toBe(false);
    expect(result.errors.join('\n')).toContain('Duplicate model name: User');
    expect(await readdir(out)).toEqual([]);
  });

  it('is fine when it is the same declaration listed and registered', async () => {
    const same: SchemaEntry = { entry: './registered/entry.ts', files: ['./registered/user.ts'] };

    expect(await modelNames('duplicate-names', same)).toEqual(['User']);
  });
});

describe('cerial/handles.ts', () => {
  it('is not read as a schema by a path', async () => {
    expect(await modelNames('handles', { path: '.' })).toEqual(['User']);
  });

  it('is not registered when an entry imports it', async () => {
    expect(await modelNames('handles', { entry: './register.ts' })).toEqual(['User']);
  });

  it('is dropped when it is listed', async () => {
    const files = ['./models/user.schema.ts', './cerial/handles.ts'];

    expect(await modelNames('handles', { files })).toEqual(['User']);
  });

  it('is dropped when it is the only file listed, leaving nothing to generate', async () => {
    const [resolved] = resolveConfig(
      { schemas: { app: { files: ['./cerial/handles.ts'] } } },
      join(FIXTURES, 'handles'),
    );

    const built = await buildResolvedSchemaAst({ files: resolved!.files });

    expect(built.resolvedAST).toBeNull();
    expect(built.typescriptFiles).toEqual([]);
  });
});

describe('the same models found four ways', () => {
  const models = ['./models/user.schema.ts', './models/post.schema.ts', './models/tag.schema.ts'];
  const modes: Array<[string, SchemaEntry]> = [
    ['suffix-only', { path: './models' }],
    ['registration-only', { entry: './register.ts' }],
    ['list-only', { files: models }],
    ['all-three', { path: './models', entry: './register.ts', files: models.slice(1) }],
  ];

  it('finds the same three models in each', async () => {
    for (const [mode, entry] of modes) {
      expect(await modelNames(`same-models/${mode}`, entry), mode).toEqual(['Post', 'Tag', 'User']);
    }
  });

  it('generates byte-identical clients, every file', async () => {
    const outputs = await Promise.all(modes.map(([mode, entry]) => generateFrom(`same-models/${mode}`, entry)));
    const [first, ...rest] = await Promise.all(outputs.map(snapshot));

    expect(Object.keys(first!).length).toBeGreaterThan(5);
    for (const [i, other] of rest.entries()) {
      expect(other, modes[i + 1]![0]).toEqual(first!);
    }
  });

  it('is not vacuous: a fixture missing a model generates a different client', async () => {
    const full = await snapshot(await generateFrom('same-models/suffix-only', { path: './models' }));
    const missing = await snapshot(
      await generateFrom('same-models/list-only', { files: models.filter((m) => !m.includes('tag')) }),
    );

    expect(missing).not.toEqual(full);
  });
});

describe('schemas[].files through the CLI', () => {
  async function cerial(cwd: string): Promise<{ code: number; output: string }> {
    const proc = Bun.spawn([process.execPath, 'run', BIN, 'generate', '-y'], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

    return { code: await proc.exited, output: stdout + stderr };
  }

  const source = (name: string): string =>
    `import { f, model } from '${resolve(import.meta.dir, '../../src/schema')}';\nexport const ${name} = model('${name}', { id: f.record().id() });\n`;

  it('generates from a config that lists plainly named files and nothing else', async () => {
    const dir = await tempProject({
      'cerial.config.ts':
        "export default { schemas: { app: { files: ['./src/a.ts', './lib/b.ts'], output: './out' } } };\n",
      'src/a.ts': source('Alpha'),
      'lib/b.ts': source('Beta'),
      'src/unlisted.ts': source('Unlisted'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = Object.values(await snapshot(join(dir, 'out'))).join('\n');
    expect(text).toContain('Alpha');
    expect(text).toContain('Beta');
    expect(text).not.toContain('Unlisted');
  }, 60_000);

  it('refuses a listed file that does not exist, naming the field and the path, and writes nothing', async () => {
    const dir = await tempProject({
      'cerial.config.ts': "export default { schemas: { app: { files: ['./src/missing.ts'], output: './out' } } };\n",
    });

    const { code, output } = await cerial(dir);

    expect(code, output).not.toBe(0);
    expect(output).toContain("'files'");
    expect(output).toContain('src/missing.ts');
    expect(await readdir(dir)).not.toContain('out');
  }, 60_000);

  it('refuses a files list holding an empty string, naming the field', async () => {
    const dir = await tempProject({
      'cerial.config.ts': "export default { schemas: { app: { files: [''], output: './out' } } };\n",
    });

    const { code, output } = await cerial(dir);

    expect(code, output).not.toBe(0);
    expect(output).toContain('files');
  }, 60_000);
});
