import { describe, expect, it } from 'bun:test';
import { resolve } from 'node:path';
import type { CerialConfig } from '../../../../src/cli/config';
import { resolveConfig, validateConfig } from '../../../../src/cli/config';

function errorsFor(config: unknown): string[] {
  return validateConfig(config as CerialConfig).errors.map((e) => `${e.field}: ${e.message}`);
}

describe('schemas[].files validation', () => {
  it('accepts files with no path or entry', () => {
    expect(validateConfig({ schemas: { app: { files: ['./a.ts', './b.cerial'], output: './out' } } }).valid).toBe(true);
  });

  it('accepts files beside a path and an entry', () => {
    const app = { path: './schemas', entry: './src/schema.ts', files: ['./x.ts'], output: './out' };

    expect(validateConfig({ schemas: { app } }).valid).toBe(true);
  });

  it('refuses a schema with none of path, entry and files, naming all three', () => {
    const [error] = errorsFor({ schemas: { app: { output: './out' } } });

    expect(error).toContain('schemas.app');
    for (const field of ["'path'", "'entry'", "'files'"]) expect(error).toContain(field);
  });

  it('does not count an empty list as a source', () => {
    expect(errorsFor({ schemas: { app: { files: [], output: './out' } } })[0]).toContain("'files'");
  });

  it('refuses a list holding an empty string, naming the field', () => {
    const errors = errorsFor({ schemas: { app: { files: ['./a.ts', ''], output: './out' } } });

    expect(errors.some((e) => e.includes('files') && e.includes('empty'))).toBe(true);
  });

  it('refuses an entry that is not a string, naming the field', () => {
    const errors = errorsFor({ schemas: { app: { files: ['./a.ts', 3], output: './out' } } });

    expect(errors.some((e) => e.includes('files') && e.includes('string'))).toBe(true);
  });

  it('refuses a files value that is not an array, naming the field', () => {
    const errors = errorsFor({ schemas: { app: { files: './a.ts', output: './out' } } });

    expect(errors.some((e) => e.includes('files') && e.includes('array'))).toBe(true);
  });
});

describe('schemas[].files resolution', () => {
  const cwd = '/project';

  it('resolves the list to absolute paths and drops the schema root', () => {
    const [entry] = resolveConfig({ schemas: { app: { files: ['./src/a.ts', 'src/b.cerial', '/abs/c.ts'] } } }, cwd);

    expect(entry!.files).toEqual([resolve(cwd, 'src/a.ts'), resolve(cwd, 'src/b.cerial'), '/abs/c.ts']);
    expect(entry!.entryOnly).toBe(true);
    expect(entry).not.toHaveProperty('entry');
  });

  it('scopes a files-only schema to the folder its files share, and defaults the output there', () => {
    const [entry] = resolveConfig({ schemas: { app: { files: ['./src/users/a.ts', './src/posts/b.ts'] } } }, cwd);

    expect(entry!.path).toBe(resolve(cwd, 'src'));
    expect(entry!.output).toBe(resolve(cwd, 'src/client'));
  });

  it('does not take a shared name prefix for a shared folder', () => {
    const [entry] = resolveConfig({ schemas: { app: { files: ['./src/user/a.ts', './src/users/b.ts'] } } }, cwd);

    expect(entry!.path).toBe(resolve(cwd, 'src'));
  });

  it('includes the entry module in the shared folder', () => {
    const [entry] = resolveConfig({ schemas: { app: { entry: './app/schema.ts', files: ['./lib/a.ts'] } } }, cwd);

    expect(entry!.path).toBe(cwd);
    expect(entry!.entry).toBe(resolve(cwd, 'app/schema.ts'));
  });

  it('keeps the path, and is not entry-only, when files come with a path', () => {
    const [entry] = resolveConfig({ schemas: { app: { path: './schemas', files: ['./x.ts'] } } }, cwd);

    expect(entry!.path).toBe(resolve(cwd, 'schemas'));
    expect(entry!.files).toEqual([resolve(cwd, 'x.ts')]);
    expect(entry!.entryOnly).toBe(false);
  });

  it('adds no files field to a schema without a list', () => {
    const [entry] = resolveConfig({ schemas: { app: { path: './schemas' } } }, cwd);

    expect(entry).not.toHaveProperty('files');
  });
});
