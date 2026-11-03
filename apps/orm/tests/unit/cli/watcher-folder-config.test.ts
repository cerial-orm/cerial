import { afterAll, describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { buildWatchTargets } from '../../../src/cli/commands/generate';
import { discoverSchemaRoots } from '../../../src/cli/discover-roots';
import { generateSingleSchema } from '../../../src/cli/generate';
import { singleSchemaOptions } from '../../../src/cli/watcher';
import { removeTempProjects, tempProject } from '../../registration-project';

afterAll(removeTempProjects);

const MODEL = 'model User {\n  id Record @id\n  name String\n}\n';

async function inProject<T>(dir: string, run: () => Promise<T>): Promise<T> {
  const previous = process.cwd();
  process.chdir(dir);
  try {
    return await run();
  } finally {
    process.chdir(previous);
  }
}

describe('watch targets with no root config', () => {
  it('a folder config sets output and typeFiles, matching what one-shot discovery resolves', async () => {
    const dir = await tempProject({
      'app/cerial.config.json': JSON.stringify({ output: './gen', typeFiles: 'ts' }),
      'app/user.cerial': MODEL,
    });
    const targets = await inProject(dir, () => buildWatchTargets({}));
    const found = await inProject(dir, () => discoverSchemaRoots(process.cwd()));
    const root = found!.roots[0]!;

    expect(found!.source).toBe('folder-config');
    expect(targets).toHaveLength(1);
    expect(targets[0]!.schemaPath).toBe(root.dir);
    expect(targets[0]!.outputDir).toBe(resolve(root.dir, 'gen'));
    expect(targets[0]!.typeFiles).toBe('ts');
    expect(targets[0]!.name).toBe(root.name);
  });

  it('-o overrides the folder config output', async () => {
    const dir = await tempProject({
      'app/cerial.config.json': JSON.stringify({ output: './gen' }),
      'app/user.cerial': MODEL,
    });
    const targets = await inProject(dir, () => buildWatchTargets({ output: join(dir, 'elsewhere') }));

    expect(targets[0]!.outputDir).toBe(join(dir, 'elsewhere'));
  });

  it('a folder config without output or typeFiles gets the defaults', async () => {
    const dir = await tempProject({ 'app/cerial.config.json': '{}', 'app/user.cerial': MODEL });
    const targets = await inProject(dir, () => buildWatchTargets({}));

    expect(targets[0]!.outputDir).toBe(resolve(dir, 'app', 'client'));
    expect(targets[0]!.typeFiles).toBeUndefined();
  });

  it('several folder configs each keep their own settings', async () => {
    const dir = await tempProject({
      'a/cerial.config.json': JSON.stringify({ output: './outA', typeFiles: 'ts' }),
      'a/user.cerial': MODEL,
      'b/cerial.config.json': JSON.stringify({ output: './outB' }),
      'b/user.cerial': MODEL,
    });
    const targets = await inProject(dir, () => buildWatchTargets({}));
    const byName = Object.fromEntries(targets.map((t) => [t.name, t]));

    expect(byName.a!.outputDir).toBe(resolve(dir, 'a', 'outA'));
    expect(byName.a!.typeFiles).toBe('ts');
    expect(byName.b!.outputDir).toBe(resolve(dir, 'b', 'outB'));
    expect(byName.b!.typeFiles).toBeUndefined();
  });

  it('a convention marker folder without a config gets the defaults', async () => {
    const dir = await tempProject({ 'app/main.cerial': MODEL });
    const targets = await inProject(dir, () => buildWatchTargets({}));

    expect(targets.map((t) => t.schemaPath)).toEqual([resolve(dir, 'app')]);
    expect(targets[0]!.outputDir).toBe(resolve(dir, 'app', 'client'));
    expect(targets[0]!.typeFiles).toBeUndefined();
  });

  it('a root config still wins, with its own typeFiles', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({
        schemas: { app: { path: './schema', output: './client' } },
        typeFiles: 'dts',
      }),
      'schema/user.cerial': MODEL,
    });
    const targets = await inProject(dir, () => buildWatchTargets({}));

    expect(targets.map((t) => [t.name, t.typeFiles])).toEqual([['app', 'dts']]);
  });
});

describe('a regeneration through the watcher', () => {
  it('writes the folder config layout', async () => {
    const dir = await tempProject({
      'app/cerial.config.json': JSON.stringify({ output: './gen', typeFiles: 'ts' }),
      'app/user.cerial': MODEL,
    });
    const [target] = await inProject(dir, () => buildWatchTargets({}));
    const result = await generateSingleSchema(singleSchemaOptions(target!));
    const files = await readdir(target!.outputDir, { recursive: true });

    expect(result.success).toBe(true);
    expect(target!.outputDir).toBe(resolve(dir, 'app', 'gen'));
    expect(files.some((f) => f.endsWith('.d.ts'))).toBe(false);
    expect(files.some((f) => f.endsWith('.ts'))).toBe(true);
  });
});
