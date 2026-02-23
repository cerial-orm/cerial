import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { findCerialIgnoreFilesSync, loadCerialIgnoreSync } from '../../server/src/filters';

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cerial-test-'));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('loadCerialIgnoreSync', () => {
  test('returns CerialIgnoreFile when .cerialignore exists', () => {
    const dir = path.join(tmpDir, 'with-ignore');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.cerialignore'), 'draft/**\ntemp/*.cerial');

    const result = loadCerialIgnoreSync(dir);

    expect(result).not.toBeNull();
    expect(result!.dir).toBe(dir);
    expect(result!.path).toBe(path.resolve(dir, '.cerialignore'));
    expect(result!.content).toBe('draft/**\ntemp/*.cerial');
  });

  test('returns null when no .cerialignore exists', () => {
    const dir = path.join(tmpDir, 'no-ignore');
    fs.mkdirSync(dir, { recursive: true });

    const result = loadCerialIgnoreSync(dir);

    expect(result).toBeNull();
  });

  test('returns null for non-existent directory', () => {
    const result = loadCerialIgnoreSync(path.join(tmpDir, 'nonexistent'));

    expect(result).toBeNull();
  });

  test('handles empty .cerialignore file', () => {
    const dir = path.join(tmpDir, 'empty-ignore');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, '.cerialignore'), '');

    const result = loadCerialIgnoreSync(dir);

    expect(result).not.toBeNull();
    expect(result!.content).toBe('');
  });

  test('preserves multi-line content with comments', () => {
    const dir = path.join(tmpDir, 'multiline-ignore');
    fs.mkdirSync(dir, { recursive: true });
    const content = '# Comment\ndraft/**\n\n# Another comment\ntemp/**';
    fs.writeFileSync(path.join(dir, '.cerialignore'), content);

    const result = loadCerialIgnoreSync(dir);

    expect(result).not.toBeNull();
    expect(result!.content).toBe(content);
  });
});

describe('findCerialIgnoreFilesSync', () => {
  test('finds root and folder cerialignore files', () => {
    const cwd = path.join(tmpDir, 'find-both');
    const schemaDir = path.join(cwd, 'schemas', 'auth');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(path.join(cwd, '.cerialignore'), 'root-ignore/**');
    fs.writeFileSync(path.join(schemaDir, '.cerialignore'), 'folder-ignore/**');

    const result = findCerialIgnoreFilesSync(cwd, [schemaDir]);

    expect(result.root).toBeDefined();
    expect(result.root!.content).toBe('root-ignore/**');
    expect(result.folders.size).toBe(1);
    expect(result.folders.get(schemaDir)!.content).toBe('folder-ignore/**');
  });

  test('finds only root cerialignore when folders have none', () => {
    const cwd = path.join(tmpDir, 'find-root-only');
    const schemaDir = path.join(cwd, 'schemas');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(path.join(cwd, '.cerialignore'), 'excluded/**');

    const result = findCerialIgnoreFilesSync(cwd, [schemaDir]);

    expect(result.root).toBeDefined();
    expect(result.root!.content).toBe('excluded/**');
    expect(result.folders.size).toBe(0);
  });

  test('returns no root when cwd has no .cerialignore', () => {
    const cwd = path.join(tmpDir, 'find-folder-only');
    const schemaDir = path.join(cwd, 'auth');
    fs.mkdirSync(schemaDir, { recursive: true });
    fs.writeFileSync(path.join(schemaDir, '.cerialignore'), 'folder-only/**');

    const result = findCerialIgnoreFilesSync(cwd, [schemaDir]);

    expect(result.root).toBeUndefined();
    expect(result.folders.size).toBe(1);
    expect(result.folders.get(schemaDir)!.content).toBe('folder-only/**');
  });

  test('returns empty when no cerialignore files exist', () => {
    const cwd = path.join(tmpDir, 'find-none');
    const schemaDir = path.join(cwd, 'schemas');
    fs.mkdirSync(schemaDir, { recursive: true });

    const result = findCerialIgnoreFilesSync(cwd, [schemaDir]);

    expect(result.root).toBeUndefined();
    expect(result.folders.size).toBe(0);
  });

  test('works without schemaDirs argument', () => {
    const cwd = path.join(tmpDir, 'find-no-dirs');
    fs.mkdirSync(cwd, { recursive: true });
    fs.writeFileSync(path.join(cwd, '.cerialignore'), 'root-patterns/**');

    const result = findCerialIgnoreFilesSync(cwd);

    expect(result.root).toBeDefined();
    expect(result.root!.content).toBe('root-patterns/**');
    expect(result.folders.size).toBe(0);
  });

  test('finds multiple folder cerialignore files', () => {
    const cwd = path.join(tmpDir, 'find-multi-folder');
    const authDir = path.join(cwd, 'auth');
    const coreDir = path.join(cwd, 'core');
    fs.mkdirSync(authDir, { recursive: true });
    fs.mkdirSync(coreDir, { recursive: true });
    fs.writeFileSync(path.join(authDir, '.cerialignore'), 'auth-draft/**');
    fs.writeFileSync(path.join(coreDir, '.cerialignore'), 'core-draft/**');

    const result = findCerialIgnoreFilesSync(cwd, [authDir, coreDir]);

    expect(result.root).toBeUndefined();
    expect(result.folders.size).toBe(2);
    expect(result.folders.get(authDir)!.content).toBe('auth-draft/**');
    expect(result.folders.get(coreDir)!.content).toBe('core-draft/**');
  });
});
