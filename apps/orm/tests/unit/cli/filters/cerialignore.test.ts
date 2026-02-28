import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, resolve } from 'node:path';
import { findCerialIgnoreFiles, loadCerialIgnore } from '../../../../src/cli/filters/cerialignore';

const TEST_ROOT = resolve(tmpdir(), 'cerial-cerialignore-test');

function dir(...segments: string[]): string {
  return resolve(TEST_ROOT, ...segments);
}

beforeAll(async () => {
  rmSync(TEST_ROOT, { recursive: true, force: true });

  // Directory with .cerialignore containing patterns, comments, blank lines
  mkdirSync(dir('with-ignore'), { recursive: true });
  await Bun.write(resolve(dir('with-ignore'), '.cerialignore'), '# Comment line\n\n*.draft.cerial\narchive/\n');

  // Directory without .cerialignore
  mkdirSync(dir('without-ignore'), { recursive: true });

  // Nested schema directories for findCerialIgnoreFiles
  mkdirSync(dir('project', 'schemas', 'auth'), { recursive: true });
  mkdirSync(dir('project', 'schemas', 'blog'), { recursive: true });
  mkdirSync(dir('project', 'schemas', 'empty'), { recursive: true });

  // Root .cerialignore
  await Bun.write(resolve(dir('project'), '.cerialignore'), '# Root ignore\ntemp/\n');

  // Per-folder .cerialignore in auth
  await Bun.write(resolve(dir('project', 'schemas', 'auth'), '.cerialignore'), 'internal.cerial\n');

  // Per-folder .cerialignore in blog
  await Bun.write(resolve(dir('project', 'schemas', 'blog'), '.cerialignore'), '# Blog ignores\ndraft-*.cerial\n');

  // empty dir has no .cerialignore

  // Project with no root .cerialignore
  mkdirSync(dir('no-root', 'schemas', 'api'), { recursive: true });
  await Bun.write(resolve(dir('no-root', 'schemas', 'api'), '.cerialignore'), 'generated.cerial\n');
});

afterAll(() => {
  rmSync(TEST_ROOT, { recursive: true, force: true });
});

describe('loadCerialIgnore', () => {
  it('should return CerialIgnoreFile when .cerialignore exists', async () => {
    const result = await loadCerialIgnore(dir('with-ignore'));

    expect(result).not.toBeNull();
    expect(result!.path).toBe(resolve(dir('with-ignore'), '.cerialignore'));
    expect(result!.dir).toBe(dir('with-ignore'));
    expect(result!.content).toBe('# Comment line\n\n*.draft.cerial\narchive/\n');
  });

  it('should return null when .cerialignore does not exist', async () => {
    const result = await loadCerialIgnore(dir('without-ignore'));

    expect(result).toBeNull();
  });

  it('should preserve content as-is including comments and blank lines', async () => {
    const result = await loadCerialIgnore(dir('with-ignore'));

    expect(result).not.toBeNull();
    // Comments NOT stripped
    expect(result!.content).toContain('# Comment line');
    // Blank lines NOT stripped
    expect(result!.content).toContain('\n\n');
    // Patterns preserved
    expect(result!.content).toContain('*.draft.cerial');
    expect(result!.content).toContain('archive/');
  });

  it('should return absolute path for the .cerialignore file', async () => {
    const result = await loadCerialIgnore(dir('with-ignore'));

    expect(result).not.toBeNull();
    expect(isAbsolute(result!.path)).toBe(true);
  });

  it('should set dir to the directory containing the file', async () => {
    const result = await loadCerialIgnore(dir('with-ignore'));

    expect(result).not.toBeNull();
    expect(result!.dir).toBe(dir('with-ignore'));
  });

  it('should return null for nonexistent directory', async () => {
    const result = await loadCerialIgnore(dir('does-not-exist'));

    expect(result).toBeNull();
  });
});

describe('findCerialIgnoreFiles', () => {
  it('should return root .cerialignore when present at cwd', async () => {
    const result = await findCerialIgnoreFiles(dir('project'));

    expect(result.root).toBeDefined();
    expect(result.root!.path).toBe(resolve(dir('project'), '.cerialignore'));
    expect(result.root!.content).toBe('# Root ignore\ntemp/\n');
  });

  it('should return root as undefined when no .cerialignore at cwd', async () => {
    const result = await findCerialIgnoreFiles(dir('no-root'));

    expect(result.root).toBeUndefined();
  });

  it('should return per-folder .cerialignore files in folders map', async () => {
    const schemaDirs = [dir('project', 'schemas', 'auth'), dir('project', 'schemas', 'blog')];
    const result = await findCerialIgnoreFiles(dir('project'), schemaDirs);

    expect(result.folders.size).toBe(2);
    expect(result.folders.has(dir('project', 'schemas', 'auth'))).toBe(true);
    expect(result.folders.has(dir('project', 'schemas', 'blog'))).toBe(true);

    const authFile = result.folders.get(dir('project', 'schemas', 'auth'))!;
    expect(authFile.content).toBe('internal.cerial\n');

    const blogFile = result.folders.get(dir('project', 'schemas', 'blog'))!;
    expect(blogFile.content).toBe('# Blog ignores\ndraft-*.cerial\n');
  });

  it('should return empty folders map when no schemaDirs provided', async () => {
    const result = await findCerialIgnoreFiles(dir('project'));

    expect(result.folders).toBeInstanceOf(Map);
    expect(result.folders.size).toBe(0);
  });

  it('should return both root and folder .cerialignore when both exist', async () => {
    const schemaDirs = [dir('project', 'schemas', 'auth')];
    const result = await findCerialIgnoreFiles(dir('project'), schemaDirs);

    expect(result.root).toBeDefined();
    expect(result.root!.content).toContain('temp/');
    expect(result.folders.size).toBe(1);
    expect(result.folders.get(dir('project', 'schemas', 'auth'))!.content).toBe('internal.cerial\n');
  });

  it('should exclude folders without .cerialignore from the map', async () => {
    const schemaDirs = [dir('project', 'schemas', 'auth'), dir('project', 'schemas', 'empty')];
    const result = await findCerialIgnoreFiles(dir('project'), schemaDirs);

    expect(result.folders.size).toBe(1);
    expect(result.folders.has(dir('project', 'schemas', 'auth'))).toBe(true);
    expect(result.folders.has(dir('project', 'schemas', 'empty'))).toBe(false);
  });

  it('should handle schemaDirs with no .cerialignore at cwd', async () => {
    const schemaDirs = [dir('no-root', 'schemas', 'api')];
    const result = await findCerialIgnoreFiles(dir('no-root'), schemaDirs);

    expect(result.root).toBeUndefined();
    expect(result.folders.size).toBe(1);
    expect(result.folders.get(dir('no-root', 'schemas', 'api'))!.content).toBe('generated.cerial\n');
  });

  it('should handle empty schemaDirs array', async () => {
    const result = await findCerialIgnoreFiles(dir('project'), []);

    expect(result.root).toBeDefined();
    expect(result.folders.size).toBe(0);
  });
});
