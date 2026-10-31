import { describe, expect, it } from 'bun:test';
import { dirname, resolve } from 'node:path';
import type { CerialConfig } from '../../../../src/cli/config';
import { resolveConfig, validateConfig } from '../../../../src/cli/config';

function errorsFor(config: unknown): string[] {
  return validateConfig(config as CerialConfig).errors.map((e) => `${e.field}: ${e.message}`);
}

describe('schemas[].entry validation', () => {
  it('accepts an entry with no path', () => {
    expect(validateConfig({ schemas: { app: { entry: './src/schema.ts', output: './out' } } }).valid).toBe(true);
  });

  it('accepts a path with no entry, as before', () => {
    expect(validateConfig({ schemas: { app: { path: './schemas', output: './out' } } }).valid).toBe(true);
  });

  it('accepts both together', () => {
    expect(
      validateConfig({ schemas: { app: { path: './schemas', entry: './src/schema.ts', output: './out' } } }).valid,
    ).toBe(true);
  });

  it('refuses neither, naming the schema and both fields', () => {
    const [error] = errorsFor({ schemas: { app: { output: './out' } } });

    expect(error).toContain('schemas.app');
    expect(error).toContain("'path'");
    expect(error).toContain("'entry'");
  });

  it('refuses an empty entry, naming the field', () => {
    const errors = errorsFor({ schemas: { app: { entry: '', output: './out' } } });

    expect(errors.some((e) => e.startsWith('schemas.app.entry:') && e.includes('empty'))).toBe(true);
  });

  it('refuses an entry that is not a string, naming the field', () => {
    const errors = errorsFor({ schemas: { app: { entry: 3, path: './s', output: './out' } } });

    expect(errors.some((e) => e.startsWith('schemas.app.entry:') && e.includes('string'))).toBe(true);
  });

  it('refuses an empty path, naming the field', () => {
    const errors = errorsFor({ schemas: { app: { path: '', entry: './e.ts', output: './out' } } });

    expect(errors.some((e) => e.startsWith('schemas.app.path:'))).toBe(true);
  });

  it('does not let an entry-only schema hide a path overlap between two others', () => {
    const errors = errorsFor({
      schemas: {
        a: { path: './schemas', output: './a' },
        b: { path: './schemas/inner', output: './b' },
        c: { entry: './src/schema.ts', output: './c' },
      },
    });

    expect(errors.some((e) => e.includes('overlap'))).toBe(true);
  });
});

describe('schemas[].entry resolution', () => {
  const cwd = '/project';

  it('resolves an entry-only schema to the entry module and its folder', () => {
    const [entry] = resolveConfig({ schemas: { app: { entry: './src/schema.ts' } } }, cwd);

    expect(entry!.entry).toBe(resolve(cwd, 'src/schema.ts'));
    expect(entry!.entryOnly).toBe(true);
    expect(entry!.path).toBe(dirname(resolve(cwd, 'src/schema.ts')));
  });

  it('defaults the output beside the entry module, and honours an explicit one', () => {
    const [byDefault] = resolveConfig({ schemas: { app: { entry: './src/schema.ts' } } }, cwd);
    const [explicit] = resolveConfig({ schemas: { app: { entry: './src/schema.ts', output: './gen' } } }, cwd);
    const [fromRoot] = resolveConfig({ output: './root-out', schemas: { app: { entry: './src/schema.ts' } } }, cwd);

    expect(byDefault!.output).toBe(resolve(cwd, 'src/client'));
    expect(explicit!.output).toBe(resolve(cwd, 'gen'));
    expect(fromRoot!.output).toBe(resolve(cwd, 'root-out'));
  });

  it('names the client class from the schema name', () => {
    const [entry] = resolveConfig({ schemas: { blog: { entry: './src/schema.ts' } } }, cwd);

    expect(entry!.clientClassName).toBe('BlogCerialClient');
  });

  it('keeps the path and adds the entry when both are given', () => {
    const [entry] = resolveConfig({ schemas: { app: { path: './schemas', entry: './src/schema.ts' } } }, cwd);

    expect(entry!.path).toBe(resolve(cwd, 'schemas'));
    expect(entry!.entry).toBe(resolve(cwd, 'src/schema.ts'));
    expect(entry!.entryOnly).toBe(false);
  });

  it('keeps an absolute entry as given', () => {
    const [entry] = resolveConfig({ schemas: { app: { entry: '/abs/src/schema.ts' } } }, cwd);

    expect(entry!.entry).toBe('/abs/src/schema.ts');
  });

  it('adds no entry fields to a schema that has only a path', () => {
    const [entry] = resolveConfig({ schemas: { app: { path: './schemas' } } }, cwd);

    expect(entry).not.toHaveProperty('entry');
    expect(entry).not.toHaveProperty('entryOnly');
  });
});
