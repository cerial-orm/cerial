import { afterAll, describe, expect, it } from 'bun:test';
import { buildWatchTargets } from '../../../src/cli/commands/generate';
import { singleSchemaOptions } from '../../../src/cli/watcher';
import type { WatchTarget } from '../../../src/cli/watcher';
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

describe('watch targets carry typeFiles', () => {
  it('a root typeFiles reaches the target of a config entry', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({
        schemas: { app: { path: './schema', output: './client' } },
        typeFiles: 'ts',
      }),
      'schema/user.cerial': MODEL,
    });
    const targets = await inProject(dir, () => buildWatchTargets({}));

    expect(targets.map((t) => t.typeFiles)).toEqual(['ts']);
  });

  it('an entry overrides the root', async () => {
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({
        schemas: { app: { path: './schema', output: './client', typeFiles: 'ts' } },
        typeFiles: 'dts',
      }),
      'schema/user.cerial': MODEL,
    });
    const targets = await inProject(dir, () => buildWatchTargets({}));

    expect(targets.map((t) => t.typeFiles)).toEqual(['ts']);
  });
});

describe('an in-process regeneration', () => {
  const target: WatchTarget = { schemaPath: '/p/schema', outputDir: '/p/client', clientClassName: 'AppClient' };

  it('passes the target typeFiles to generateSingleSchema', () => {
    expect(singleSchemaOptions({ ...target, typeFiles: 'ts' }).typeFiles).toBe('ts');
    expect(singleSchemaOptions({ ...target, typeFiles: 'dts' }).typeFiles).toBe('dts');
  });

  it('leaves it absent when the target has none, so the default applies as in a one-shot run', () => {
    expect(singleSchemaOptions(target).typeFiles).toBeUndefined();
  });
});
