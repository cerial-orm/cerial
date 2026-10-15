import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { resolvePathFilter } from '../../../../src/cli/filters';
import type { Project } from './helpers';
import { makeProject, selectWithConfig, selectWithConventions, selectWithSchemaFlag } from './helpers';

const ALL = [
  'archive/keep.cerial',
  'archive/old.cerial',
  'draft.cerial',
  'legacy.cerial',
  'notes.cerial',
  'post.cerial',
  'secret.cerial',
  'sub/a.cerial',
  'sub/keep.cerial',
  'user.cerial',
];

let project: Project;

beforeAll(() => {
  const files: Record<string, string> = {};
  for (const f of ALL) files[`schemas/${f}`] = '';
  project = makeProject(files);
});

afterAll(() => project.cleanup());

const select = (layers: Parameters<typeof selectWithConfig>[2]) => selectWithConfig(project, 'schemas', layers);

describe('filter cascade: precedence between the layers', () => {
  it('selects everything when no layer is active', async () => {
    expect(await select({})).toEqual(ALL);
  });

  it('config ignore beats include at every level', async () => {
    const result = await select({
      root: { ignore: ['secret.cerial'], include: ['secret.cerial'] },
      schema: { include: ['secret.cerial'] },
    });

    expect(result).not.toContain('secret.cerial');
    expect(result).toHaveLength(ALL.length - 1);
  });

  it('root include overrides root .cerialignore and root exclude', async () => {
    project.writeCerialIgnore('', 'draft.cerial\nlegacy.cerial\n');
    const result = await select({
      root: { exclude: ['notes.cerial', 'legacy.cerial'], include: ['draft.cerial', 'notes.cerial'] },
    });

    expect(result).toContain('draft.cerial');
    expect(result).toContain('notes.cerial');
    expect(result).not.toContain('legacy.cerial');
    project.removeCerialIgnore('');
  });

  it('schema exclude is overridable only by schema include, not by root include', async () => {
    const rootIncludeOnly = await select({
      root: { include: ['sub/a.cerial'] },
      schema: { exclude: ['sub/**'] },
    });
    const schemaInclude = await select({
      root: { include: ['sub/a.cerial'] },
      schema: { exclude: ['sub/**'], include: ['sub/keep.cerial'] },
    });

    expect(rootIncludeOnly.filter((f) => f.startsWith('sub/'))).toEqual([]);
    expect(schemaInclude.filter((f) => f.startsWith('sub/'))).toEqual(['sub/keep.cerial']);
  });

  it('schema include does not override a root exclude', async () => {
    const result = await select({
      root: { exclude: ['notes.cerial'] },
      schema: { include: ['notes.cerial'] },
    });

    expect(result).not.toContain('notes.cerial');
  });

  it('no config include reaches the folder .cerialignore', async () => {
    project.writeCerialIgnore('schemas', 'archive/*\n');
    const result = await select({
      root: { include: ['archive/keep.cerial'] },
      schema: { include: ['archive/keep.cerial'] },
    });

    expect(result.filter((f) => f.startsWith('archive/'))).toEqual([]);
    project.removeCerialIgnore('schemas');
  });

  it('all layers active together select exactly the survivors', async () => {
    project.writeCerialIgnore('', 'draft.cerial\nlegacy.cerial\n');
    project.writeCerialIgnore('schemas', 'archive/*\nuser.cerial\n');
    const result = await select({
      root: {
        ignore: ['secret.cerial'],
        exclude: ['notes.cerial', 'legacy.cerial'],
        include: ['draft.cerial'],
      },
      schema: { exclude: ['sub/**'], include: ['sub/keep.cerial'] },
    });

    // secret: ignore. legacy: root .cerialignore + exclude, not in include. user, archive/*: folder .cerialignore.
    // notes: root exclude. sub/a: schema exclude. draft: root include rescues it. sub/keep: schema include.
    expect(result).toEqual(['draft.cerial', 'post.cerial', 'sub/keep.cerial']);
    project.removeCerialIgnore('');
    project.removeCerialIgnore('schemas');
  });
});

describe('filter cascade: the -s flag layer', () => {
  it('applies the root .cerialignore, relative to the -s directory', async () => {
    project.writeCerialIgnore('', 'draft.cerial\nsub/\n');
    const result = await selectWithSchemaFlag(project, 'schemas');

    expect(result).not.toContain('draft.cerial');
    expect(result.filter((f) => f.startsWith('sub/'))).toEqual([]);
    expect(result).toHaveLength(ALL.length - 3);
    project.removeCerialIgnore('');
  });

  it('does not read the folder .cerialignore or any config layer', async () => {
    project.writeCerialIgnore('schemas', 'user.cerial\n');
    const result = await selectWithSchemaFlag(project, 'schemas');

    expect(result).toEqual(ALL);
    project.removeCerialIgnore('schemas');
  });

  it('does not match a root pattern written relative to the project root', async () => {
    project.writeCerialIgnore('', 'schemas/draft.cerial\n');
    const result = await selectWithSchemaFlag(project, 'schemas');

    expect(result).toContain('draft.cerial');
    project.removeCerialIgnore('');
  });

  it('applies the root .cerialignore to a single file passed with -s, matched by basename', async () => {
    project.writeCerialIgnore('', 'draft.cerial\n');
    const excluded = await selectWithSchemaFlag(project, 'schemas/draft.cerial');
    const kept = await selectWithSchemaFlag(project, 'schemas/user.cerial');

    expect(excluded).toEqual([]);
    expect(kept).toEqual(['']);
    project.removeCerialIgnore('');
  });
});

describe('filter cascade: convention defaults', () => {
  let conv: Project;

  beforeAll(() => {
    conv = makeProject({
      'a/schema.cerial': '',
      'a/extra.cerial': '',
      'b/main.cerial': '',
      'c/index.cerial': '',
      'c/draft.cerial': '',
      '.cerialignore': 'b/\n',
      'c/.cerialignore': 'extra.cerial\n',
    });
  });

  afterAll(() => conv.cleanup());

  it('drops a convention root excluded by the root .cerialignore and keeps the rest', async () => {
    expect(await selectWithConventions(conv)).toEqual([
      'a/extra.cerial',
      'a/schema.cerial',
      'c/draft.cerial',
      'c/index.cerial',
    ]);
  });

  it('folder .cerialignore applies inside its own convention root only', async () => {
    conv.writeCerialIgnore('c', 'draft.cerial\n');
    const result = await selectWithConventions(conv);

    expect(result).toEqual(['a/extra.cerial', 'a/schema.cerial', 'c/index.cerial']);
    conv.writeCerialIgnore('c', 'extra.cerial\n');
  });

  it('root config ignore removes a convention root before it is read', async () => {
    const result = await selectWithConventions(conv, { ignore: ['a/'] });

    expect(result).toEqual(['c/draft.cerial', 'c/index.cerial']);
  });

  it('root include rescues a convention root the root .cerialignore excluded', async () => {
    const result = await selectWithConventions(conv, { include: ['b/'] });

    expect(result).toContain('b/main.cerial');
  });
});

describe('filter cascade: documented gotchas', () => {
  it('include without exclude, ignore or .cerialignore is a no-op, not a whitelist', async () => {
    const result = await select({ root: { include: ['user.cerial'] }, schema: { include: ['post.cerial'] } });

    expect(result).toEqual(ALL);
  });

  it('include without exclude yields NO_FILTER semantics through resolvePathFilter', () => {
    const filter = resolvePathFilter({ rootConfig: { include: ['user.cerial'] }, basePath: '/x' });

    expect(filter.shouldInclude('anything/at/all.cerial')).toBe(true);
  });

  it('include only overrides an exclusion; it does not exclude unlisted files', async () => {
    const result = await select({ root: { exclude: ['*.cerial'], include: ['user.cerial'] } });

    expect(result).toEqual(['user.cerial']);
  });

  it('a parent-directory pattern cannot be negated for one file inside it', async () => {
    project.writeCerialIgnore('schemas', 'archive/\n!archive/keep.cerial\n');
    const result = await select({});

    expect(result.filter((f) => f.startsWith('archive/'))).toEqual([]);
    project.removeCerialIgnore('schemas');
  });

  it('negation works when the pattern targets the directory contents instead', async () => {
    project.writeCerialIgnore('schemas', 'archive/*\n!archive/keep.cerial\n');
    const result = await select({});

    expect(result.filter((f) => f.startsWith('archive/'))).toEqual(['archive/keep.cerial']);
    project.removeCerialIgnore('schemas');
  });

  it('config include is the working way to re-include a file under an ignored directory', async () => {
    project.writeCerialIgnore('', 'archive/\n');
    const result = await select({ root: { include: ['archive/keep.cerial'] } });

    expect(result.filter((f) => f.startsWith('archive/'))).toEqual(['archive/keep.cerial']);
    project.removeCerialIgnore('');
  });

  it('patterns with ../ never match anything inside the scope directory', async () => {
    const result = await select({
      root: { exclude: ['../schemas/user.cerial', '../user.cerial', '../**'] },
      schema: { exclude: ['../post.cerial'] },
    });

    expect(result).toEqual(ALL);
  });

  it('a ../ pattern in .cerialignore cannot escape either', async () => {
    project.writeCerialIgnore('schemas', '../schemas/user.cerial\n../*\n');
    const result = await select({});

    expect(result).toEqual(ALL);
    project.removeCerialIgnore('schemas');
  });
});
