import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { entryModule, modelModule, removeTempProjects, SCHEMA_SRC, tempProject } from '../../../registration-project';
import { cascade, cascadeProject, MODES, modelsFor } from './cascade-helpers';

afterAll(removeTempProjects);

describe.each(MODES)('documented cascade behaviours in %s mode', (mode) => {
  it('does not re-include a file under an excluded directory by negating it (matching git)', async () => {
    const dir = await cascadeProject({ 'schemas/drafts/keep.schema.ts': modelModule('Keep') });
    // `drafts/` excludes the directory itself, and git never looks inside an excluded directory
    const filter = cascade(dir, { cerialignore: 'drafts/\n!drafts/keep.schema.ts\n' });

    expect(await modelsFor(mode, dir, filter)).toEqual(['Alpha']);
  });

  it('re-includes it through include, the documented way round', async () => {
    const dir = await cascadeProject({ 'schemas/drafts/keep.schema.ts': modelModule('Keep') });
    const filter = cascade(dir, { cerialignore: 'drafts/\n', include: ['drafts/b.schema.ts'] });

    expect(await modelsFor(mode, dir, filter)).toEqual(['Alpha', 'B']);
  });

  it('cannot reach out of its scope with ../', async () => {
    const dir = await cascadeProject();

    expect(await modelsFor(mode, dir, cascade(dir, { exclude: ['../schemas/drafts/**'] }))).toEqual(['Alpha', 'B']);
    expect(await modelsFor(mode, dir, cascade(dir, { exclude: ['../**'] }))).toEqual(['Alpha', 'B']);
  });
});

// An imported module can sit outside the schema path. `../`-prefixed paths never match a pattern, so such a
// file is matched from the root (the config's directory) by the pattern a user would write for it.
describe('a module outside the schema scope', () => {
  const layout = (): Promise<string> =>
    tempProject({
      'app/schemas/entry.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { Shared } from '../../shared/shared';\n\nexport default defineSchema({ models: [Shared] });\n`,
      'shared/shared.ts': modelModule('Shared'),
    });

  const build = async (dir: string, exclude: string[], filterRoot = dir): Promise<string[] | undefined> => {
    const built = await buildResolvedSchemaAst({
      entry: join(dir, 'app/schemas/entry.ts'),
      filterBase: join(dir, 'app/schemas'),
      filterRoot,
      filter: cascade(dir, { exclude }),
    });

    return built.resolvedAST?.models.map((m) => m.name);
  };

  it('is excluded by the pattern written from the root', async () => {
    const dir = await layout();

    expect(await build(dir, ['shared/**'])).toBeUndefined();
  });

  it('is kept by a ../ pattern written from the scope', async () => {
    const dir = await layout();

    expect(await build(dir, ['../../shared/**'])).toEqual(['Shared']);
  });

  it('is matched from the config directory, not the cwd, when they differ', async () => {
    const dir = await layout();

    // The cwd of this process is nowhere near the project, so a cwd-relative match would miss `shared/**`
    expect(process.cwd().startsWith(dir)).toBe(false);
    expect(await build(dir, ['shared/**'], join(dir, 'app'))).toEqual(['Shared']);
    expect(await build(dir, ['shared/**'], dir)).toBeUndefined();
  });

  it('is kept when it is outside both the scope and the root', async () => {
    const dir = await layout();

    expect(await build(dir, ['**/shared.ts'], join(dir, 'app'))).toEqual(['Shared']);
  });
});

describe('a path-less entry', () => {
  it('matches its imports from the folder holding it', async () => {
    const dir = await tempProject({ 'src/schema.ts': entryModule(['User']), 'src/user.ts': modelModule('User') });
    const filter = cascade(dir, { exclude: ['user.ts'] });

    const built = await buildResolvedSchemaAst({
      entry: join(dir, 'src/schema.ts'),
      filterBase: join(dir, 'src'),
      filter,
    });

    expect(built.resolvedAST?.models).toBeUndefined();
  });
});
