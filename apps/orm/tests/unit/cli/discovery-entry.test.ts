import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { resolveConfig } from '../../../src/cli/config';
import { applyFolderOverridesAndDiscover } from '../../../src/cli/discovery';
import { removeTempProjects, tempProject } from '../../registration-project';

afterAll(removeTempProjects);

describe('applyFolderOverridesAndDiscover with an entry-only schema', () => {
  it('does not read the entry folder as a schema root, so the project config beside it is not a folder config', async () => {
    // A root-style config in the entry's folder would throw if the folder were read as a folder config
    const dir = await tempProject({
      'cerial.config.json': JSON.stringify({ schemas: { app: { entry: './schema.ts' } } }),
      'schema.ts': 'export {};\n',
    });
    const entries = resolveConfig({ schemas: { app: { entry: './schema.ts' } } }, dir);

    const merged = await applyFolderOverridesAndDiscover(entries, dir);

    expect(merged.map((e) => e.name)).toEqual(['app']);
    expect(merged[0]!.entry).toBe(join(dir, 'schema.ts'));
  });

  it('still discovers a .cerial schema root beside the entry', async () => {
    const dir = await tempProject({
      'schema.ts': 'export {};\n',
      'legacy/schema.cerial': 'model A {\n  id Record @id\n}\n',
    });
    const entries = resolveConfig({ schemas: { app: { entry: './schema.ts' } } }, dir);

    const merged = await applyFolderOverridesAndDiscover(entries, dir);

    expect(merged.map((e) => e.name).sort()).toEqual(['app', 'legacy']);
  });

  it('keeps the entry on a schema that also has a path', async () => {
    const dir = await tempProject({
      'schemas/a.cerial': 'model A {\n  id Record @id\n}\n',
      'schema.ts': 'export {};\n',
    });
    const entries = resolveConfig({ schemas: { app: { path: './schemas', entry: './schema.ts' } } }, dir);

    const merged = await applyFolderOverridesAndDiscover(entries, dir);

    expect(merged[0]!.entry).toBe(join(dir, 'schema.ts'));
    expect(merged[0]!.entryOnly).toBe(false);
  });
});
