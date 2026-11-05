import { afterAll, describe, expect, it } from 'bun:test';
import { removeTempProjects } from '../../../registration-project';
import { cascade, cascadeProject, MODES, modelsFor } from './cascade-helpers';

afterAll(removeTempProjects);

// The cascade is one filter; each mode reaches a module a different way, and none may treat it differently
describe.each(MODES)('the filter cascade in %s mode', (mode) => {
  it('keeps every module when no pattern matches', async () => {
    const dir = await cascadeProject();

    expect(await modelsFor(mode, dir, undefined)).toEqual(['Alpha', 'B']);
    expect(await modelsFor(mode, dir, cascade(dir, { exclude: ['nothing/**'] }))).toEqual(['Alpha', 'B']);
  });

  it('drops a module matched by exclude', async () => {
    const dir = await cascadeProject();

    expect(await modelsFor(mode, dir, cascade(dir, { exclude: ['drafts/**'] }))).toEqual(['Alpha']);
  });

  it('drops a module matched by ignore', async () => {
    const dir = await cascadeProject();

    expect(await modelsFor(mode, dir, cascade(dir, { ignore: ['drafts/**'] }))).toEqual(['Alpha']);
  });

  it('lets include override exclude', async () => {
    const dir = await cascadeProject();
    const layers = { exclude: ['drafts/**'], include: ['drafts/b.schema.ts'] };

    expect(await modelsFor(mode, dir, cascade(dir, layers))).toEqual(['Alpha', 'B']);
  });

  it('does not let include override ignore', async () => {
    const dir = await cascadeProject();
    const layers = { ignore: ['drafts/**'], include: ['drafts/b.schema.ts'] };

    expect(await modelsFor(mode, dir, cascade(dir, layers))).toEqual(['Alpha']);
  });

  it('drops a module matched by .cerialignore', async () => {
    const dir = await cascadeProject();

    expect(await modelsFor(mode, dir, cascade(dir, { cerialignore: 'drafts/\n' }))).toEqual(['Alpha']);
  });

  it('lets include override .cerialignore', async () => {
    const dir = await cascadeProject();
    const layers = { cerialignore: 'drafts/\n', include: ['drafts/**'] };

    expect(await modelsFor(mode, dir, cascade(dir, layers))).toEqual(['Alpha', 'B']);
  });
});
