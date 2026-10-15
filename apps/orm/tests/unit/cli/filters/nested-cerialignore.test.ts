import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { findCerialIgnoreFiles, loadCerialIgnore, resolvePathFilter } from '../../../../src/cli/filters';
import type { Project } from './helpers';
import { makeProject, selectWithConfig, selectWithSchemaFlag } from './helpers';

const FILES = ['draft.cerial', 'keep.cerial', 'post.cerial', 'user.cerial', 'sub/deep.cerial', 'sub/keep.cerial'];

let project: Project;

beforeAll(() => {
  const files: Record<string, string> = {};
  for (const f of FILES) files[`apps/web/schemas/${f}`] = '';
  project = makeProject(files);
});

afterAll(() => project.cleanup());

const SCHEMAS = 'apps/web/schemas';
const select = () => selectWithConfig(project, SCHEMAS, {});

describe('nested .cerialignore: root plus schema-directory file', () => {
  it('applies the union of both files', async () => {
    project.writeCerialIgnore('', 'draft.cerial\n');
    project.writeCerialIgnore(SCHEMAS, 'user.cerial\n');

    expect(await select()).toEqual(['keep.cerial', 'post.cerial', 'sub/deep.cerial', 'sub/keep.cerial']);
  });

  it('a child negation does not re-include what the parent file excluded', async () => {
    project.writeCerialIgnore('', 'draft.cerial\n');
    project.writeCerialIgnore(SCHEMAS, '!draft.cerial\n');

    expect(await select()).not.toContain('draft.cerial');
  });

  it('a child negation still works against the child own earlier patterns', async () => {
    project.writeCerialIgnore('', '');
    project.writeCerialIgnore(SCHEMAS, '*.cerial\n!keep.cerial\n');

    // unanchored `!keep.cerial` matches at any depth
    expect(await select()).toEqual(['keep.cerial', 'sub/keep.cerial']);
  });

  it('a parent negation works within the parent file, and a child file cannot widen it', async () => {
    project.writeCerialIgnore('', '*.cerial\n!post.cerial\n');
    project.writeCerialIgnore(SCHEMAS, 'user.cerial\n');

    expect(await select()).toEqual(['post.cerial']);
  });

  it('a child file that excludes less than the parent never widens the selection', async () => {
    project.writeCerialIgnore('', 'draft.cerial\nuser.cerial\n');
    project.writeCerialIgnore(SCHEMAS, 'post.cerial\n');

    expect(await select()).toEqual(['keep.cerial', 'sub/deep.cerial', 'sub/keep.cerial']);
  });

  it('a parent-directory exclusion in the parent file is not undone by a child negation of a file inside it', async () => {
    project.writeCerialIgnore('', 'sub/\n');
    project.writeCerialIgnore(SCHEMAS, '!sub/keep.cerial\n');

    expect((await select()).filter((f) => f.startsWith('sub/'))).toEqual([]);
  });

  it('a parent-directory exclusion in the child file cannot be negated for one file in the same file', async () => {
    project.writeCerialIgnore('', '');
    project.writeCerialIgnore(SCHEMAS, 'sub/\n!sub/keep.cerial\n');

    expect((await select()).filter((f) => f.startsWith('sub/'))).toEqual([]);
  });

  it('a child file can exclude a directory the parent file does not mention', async () => {
    project.writeCerialIgnore('', 'draft.cerial\n');
    project.writeCerialIgnore(SCHEMAS, 'sub/\n');

    expect(await select()).toEqual(['keep.cerial', 'post.cerial', 'user.cerial']);
  });

  it('an anchored pattern in the parent file is anchored to the schema directory, not the project root', async () => {
    project.writeCerialIgnore('', '/user.cerial\n/apps/\n');
    project.removeCerialIgnore(SCHEMAS);

    expect(await select()).toEqual([
      'draft.cerial',
      'keep.cerial',
      'post.cerial',
      'sub/deep.cerial',
      'sub/keep.cerial',
    ]);
  });

  it('only the schema-directory file counts: files in intermediate or deeper directories are never read', async () => {
    project.removeCerialIgnore('');
    project.removeCerialIgnore(SCHEMAS);
    project.writeCerialIgnore('apps', 'user.cerial\n');
    project.writeCerialIgnore('apps/web', 'post.cerial\n');
    project.writeCerialIgnore(`${SCHEMAS}/sub`, 'deep.cerial\n');

    expect(await select()).toEqual(FILES.slice().sort());
    expect(await selectWithSchemaFlag(project, SCHEMAS)).toEqual(FILES.slice().sort());

    project.removeCerialIgnore('apps');
    project.removeCerialIgnore('apps/web');
    project.removeCerialIgnore(`${SCHEMAS}/sub`);
  });
});

describe('nested .cerialignore: folder include through resolvePathFilter', () => {
  const root = { path: '/r/.cerialignore', dir: '/r', content: 'draft.cerial\nsub/\n' };
  const folder = { path: '/r/s/.cerialignore', dir: '/r/s', content: 'user.cerial\nsub/\n' };

  it('folder include re-includes a folder .cerialignore match', () => {
    const filter = resolvePathFilter({
      rootCerialIgnore: root,
      folderCerialIgnore: folder,
      folderConfig: { include: ['user.cerial'] },
      basePath: '/r',
    });

    expect(filter.shouldInclude('user.cerial')).toBe(true);
  });

  it('folder include cannot re-include a root .cerialignore match', () => {
    const filter = resolvePathFilter({
      rootCerialIgnore: root,
      folderCerialIgnore: folder,
      folderConfig: { include: ['draft.cerial', 'sub/**'] },
      basePath: '/r',
    });

    expect(filter.shouldInclude('draft.cerial')).toBe(false);
    expect(filter.shouldInclude('sub/x.cerial')).toBe(false);
  });

  it('root include re-includes a root .cerialignore match but not a folder one', () => {
    const filter = resolvePathFilter({
      rootCerialIgnore: root,
      folderCerialIgnore: folder,
      rootConfig: { include: ['draft.cerial', 'user.cerial'] },
      basePath: '/r',
    });

    expect(filter.shouldInclude('draft.cerial')).toBe(true);
    expect(filter.shouldInclude('user.cerial')).toBe(false);
  });
});

describe('findCerialIgnoreFiles: discovery of nested files', () => {
  it('loads only the root and the listed schema directories', async () => {
    project.writeCerialIgnore('', 'a\n');
    project.writeCerialIgnore(SCHEMAS, 'b\n');
    project.writeCerialIgnore('apps/web', 'c\n');

    const found = await findCerialIgnoreFiles(project.cwd, [project.path(SCHEMAS)]);

    expect(found.root?.content).toBe('a\n');
    expect([...found.folders.keys()]).toEqual([project.path(SCHEMAS)]);
    expect(await loadCerialIgnore(project.path('apps', 'web'))).not.toBeNull();
    project.removeCerialIgnore('');
    project.removeCerialIgnore(SCHEMAS);
    project.removeCerialIgnore('apps/web');
  });
});
