import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildWatchTargets } from '../../../src/cli/commands/generate';
import { generate, generateSingleSchema } from '../../../src/cli/generate';
import { singleSchemaOptions } from '../../../src/cli/watcher';
import { removeTempProjects, tempProject } from '../../registration-project';

afterAll(removeTempProjects);

const model = (name: string): string => `model ${name} {\n  id Record @id\n  label String\n}\n`;

async function inProject<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

/** Every generated file under `dir`, keyed by relative path */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  for (const name of await readdir(dir, { recursive: true })) {
    if (/\.(ts|json)$/.test(name)) files[name] = await readFile(join(dir, name), 'utf8');
  }

  return files;
}

/** What watch mode does on a change: build the targets, then regenerate each in process */
async function watchRegenerate(dir: string): Promise<void> {
  const targets = await inProject(dir, () => buildWatchTargets({}, { pins: true }));
  for (const target of targets) {
    const result = await inProject(dir, () => generateSingleSchema(singleSchemaOptions(target)));
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  }
}

async function oneShot(dir: string): Promise<void> {
  const result = await inProject(dir, () => generate({}));
  expect(result.errors).toEqual([]);
}

describe('a watch regeneration equals a one-shot generate', () => {
  it('leaves out a .cerialignore d file and a config-excluded file', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({
        schemas: { app: { path: './schema', output: './client', exclude: ['**/skipped.cerial'] } },
      }),
      'schema/.cerialignore': 'ignored.cerial\n',
      'schema/keep.cerial': model('Keep'),
      'schema/ignored.cerial': model('Ignored'),
      'schema/skipped.cerial': model('Skipped'),
    });

    await watchRegenerate(dir);
    const watched = await snapshot(join(dir, 'client'));
    const joined = Object.values(watched).join('\n');

    expect(joined).toContain('Keep');
    expect(joined).not.toContain('Ignored');
    expect(joined).not.toContain('Skipped');

    await oneShot(dir);
    expect(watched).toEqual(await snapshot(join(dir, 'client')));
  });

  it('honours the root exclude of a folder-discovered schema the same way', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({ schemas: { app: { path: './schema', output: './client' } } }),
      '.cerialignore': 'ignored.cerial\n',
      'schema/keep.cerial': model('Keep'),
      'schema/ignored.cerial': model('Ignored'),
    });

    await watchRegenerate(dir);
    const watched = await snapshot(join(dir, 'client'));
    const joined = Object.values(watched).join('\n');

    expect(joined).toContain('Keep');
    expect(joined).not.toContain('Ignored');

    await oneShot(dir);
    expect(await snapshot(join(dir, 'client'))).toEqual(watched);
  });

  it('generates listed files and no folder search for an entry with no path', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({
        schemas: { app: { files: ['./one.cerial'], output: './client' } },
      }),
      'one.cerial': model('One'),
      'two.cerial': model('Two'),
    });

    await watchRegenerate(dir);
    const watched = await snapshot(join(dir, 'client'));
    const joined = Object.values(watched).join('\n');

    expect(joined).toContain('One');
    expect(joined).not.toContain('Two');

    await oneShot(dir);
    expect(watched).toEqual(await snapshot(join(dir, 'client')));
  });

  it('negative: with no filter every schema file is generated', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({ schemas: { app: { path: './schema', output: './client' } } }),
      'schema/a.cerial': model('Alpha'),
      'schema/b.cerial': model('Beta'),
    });

    await watchRegenerate(dir);
    const joined = Object.values(await snapshot(join(dir, 'client'))).join('\n');

    expect(joined).toContain('Alpha');
    expect(joined).toContain('Beta');
  });
});

describe('the options a watch target regenerates with', () => {
  it('carry the connection and the database pins of the entry', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({
        schemas: {
          a: { path: './a', output: './client-a', connection: { url: 'http://127.0.0.1:8000', database: 'one' } },
          b: { path: './b', output: './client-b', connection: { url: 'http://127.0.0.1:8000', database: 'two' } },
        },
      }),
      'a/user.cerial': model('Shared'),
      'b/user.cerial': model('Shared'),
    });
    const targets = await inProject(dir, () => buildWatchTargets({}, { pins: true }));
    const [a, b] = targets.map(singleSchemaOptions);

    expect(a!.connection).toMatchObject({ database: 'one' });
    expect(a!.databasePins?.length).toBeGreaterThan(0);
    expect(b!.databasePins?.length).toBeGreaterThan(0);
    expect(a!.filter).toBeDefined();
    expect(a!.filterRoot).toBe(dir);
    expect(a!.filterBase).toBe(join(dir, 'a'));
  });
});
