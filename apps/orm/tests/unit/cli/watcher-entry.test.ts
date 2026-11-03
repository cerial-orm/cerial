import { afterAll, describe, expect, it } from 'bun:test';
import { shouldTriggerRegeneration, holdsTypescriptModules, buildGenerateArgs } from '../../../src/cli/watcher';
import type { TypescriptEntryScope, WatchTarget } from '../../../src/cli/watcher';
import { removeTempProjects, tempProject } from '../../registration-project';

afterAll(removeTempProjects);

const scope: TypescriptEntryScope = { schemaPath: '/p/src', outputDir: '/p/src/client' };

describe('watching an entry module', () => {
  it('treats a target with an entry as TypeScript even when its folder holds no *.schema.ts', async () => {
    const dir = await tempProject({ 'schema.ts': 'export {};\n', 'user.ts': 'export {};\n' });

    expect(await holdsTypescriptModules({ schemaPath: dir })).toBe(false);
    expect(await holdsTypescriptModules({ schemaPath: dir, entry: `${dir}/schema.ts` })).toBe(true);
  });

  it('treats a folder mixing *.schema.ts and .cerial as TypeScript, since generation imports the modules', async () => {
    const dir = await tempProject({ 'a.cerial': 'model A {\n  id Record @id\n}\n', 'x.schema.ts': 'export {};\n' });
    const cerialOnly = await tempProject({ 'a.cerial': 'model A {\n  id Record @id\n}\n' });

    expect(await holdsTypescriptModules({ schemaPath: dir })).toBe(true);
    expect(await holdsTypescriptModules({ schemaPath: cerialOnly })).toBe(false);
  });

  it('triggers on a plainly named module the entry may import', () => {
    expect(shouldTriggerRegeneration('users/user.ts', undefined, scope)).toBe(true);
    expect(shouldTriggerRegeneration('schema.ts', undefined, scope)).toBe(true);
  });

  it('does not trigger on generated output, including cerial/handles.ts', () => {
    expect(shouldTriggerRegeneration('client/index.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('client/models/user.d.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('cerial/handles.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('users/cerial/handles.ts', undefined, scope)).toBe(false);
  });

  it('does not trigger on a dependency being installed', () => {
    expect(shouldTriggerRegeneration('node_modules/pkg/index.ts', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('packages/a/node_modules/pkg/index.ts', undefined, scope)).toBe(false);
  });

  it('does not trigger on a non-TypeScript file, a plain .ts file outside a TypeScript entry, or no name', () => {
    expect(shouldTriggerRegeneration('README.md', undefined, scope)).toBe(false);
    expect(shouldTriggerRegeneration('users/user.ts', undefined, undefined)).toBe(false);
    expect(shouldTriggerRegeneration(null, undefined, scope)).toBe(false);
  });

  it('applies the filter to a dependency', () => {
    const filter = { shouldInclude: (p: string) => !p.startsWith('skip/') };

    expect(shouldTriggerRegeneration('skip/user.ts', filter, scope)).toBe(false);
    expect(shouldTriggerRegeneration('keep/user.ts', filter, scope)).toBe(true);
  });

  it('a target with an entry regenerates through its config name, so the child resolves the entry itself', () => {
    const target: WatchTarget = {
      name: 'app',
      clientClassName: 'AppCerialClient',
      schemaPath: '/p/src',
      outputDir: '/p/src/client',
      configPath: 'cerial.config.ts',
      entry: '/p/src/schema.ts',
      entryOnly: true,
    };
    const args = buildGenerateArgs(target, { execPath: 'node', entry: 'cli.js' });

    expect(args).toContain('-n');
    expect(args).toContain('app');
    expect(args).toContain('-C');
    expect(args).not.toContain('-s');
  });
});
