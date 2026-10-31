import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { applyFolderOverridesAndDiscover } from '../../../../src/cli/discovery';
import { resolvePathFilter } from '../../../../src/cli/filters/path-filter';
import { formatSchema } from '../../../../src/cli/format';
import {
  buildResolvedSchemaAst,
  discoverSchemas,
  findSchemaRoots,
  findSchemasInDir,
  isSchemaFile,
  isTypescriptSchemaFile,
  resolveSinglePath,
} from '../../../../src/cli/resolvers';
import type { ResolvedSchemaEntry } from '../../../../src/cli/config';

const FIXTURE = resolve(__dirname, '../../../fixtures/schema-discovery/typescript-only');
const TMP = resolve(__dirname, '../../../.tmp-typescript-discovery');

const USER_CERIAL = 'model User {\n  id Record @id\n  name String\n}\n';
const TS_STUB = 'export const stub = 1;\n';

function put(rel: string, content = TS_STUB): string {
  const full = resolve(TMP, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);

  return full;
}

function project(name: string, files: Record<string, string>): string {
  const dir = resolve(TMP, name);
  for (const [rel, content] of Object.entries(files)) put(`${name}/${rel}`, content);

  return dir;
}

afterAll(() => rmSync(TMP, { recursive: true, force: true }));
beforeAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('isTypescriptSchemaFile / isSchemaFile', () => {
  it('accepts *.schema.ts', () => {
    expect(isTypescriptSchemaFile('user.schema.ts')).toBe(true);
    expect(isTypescriptSchemaFile('src/users/user.schema.ts')).toBe(true);
    expect(isSchemaFile('user.schema.ts')).toBe(true);
    expect(isSchemaFile('user.cerial')).toBe(true);
  });

  it('rejects helpers, tests, declarations, handles and null', () => {
    for (const name of [
      'helpers.ts',
      'x.test.ts',
      'x.schema.test.ts',
      'x.schema.d.ts',
      'cerial/handles.ts',
      'schema.js',
    ]) {
      expect(isTypescriptSchemaFile(name)).toBe(false);
      expect(isSchemaFile(name)).toBe(false);
    }
    expect(isTypescriptSchemaFile(null)).toBe(false);
    expect(isSchemaFile(null)).toBe(false);
  });
});

describe('TypeScript-only fixture project', () => {
  it('discovers *.schema.ts and nothing else', async () => {
    const files = await findSchemasInDir(FIXTURE, ['**/*.cerial', '**/*.schema.ts']);

    expect(files.map((f) => f.slice(FIXTURE.length + 1))).toEqual([
      'src/users/post.schema.ts',
      'src/users/user.schema.ts',
    ]);
  });

  it('auto-discovers one root with no config and no .cerial file', async () => {
    const roots = await findSchemaRoots(FIXTURE);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.path).toBe(resolve(FIXTURE, 'src/users'));
    expect(roots[0]!.marker).toBe('post.schema.ts');
    expect(roots[0]!.files.map((f) => basename(f))).toEqual(['post.schema.ts', 'user.schema.ts']);
  });

  it('discoverSchemas returns this mode alone', async () => {
    const schemas = await discoverSchemas(FIXTURE);

    expect(schemas).toHaveLength(1);
    expect(schemas[0]!.files.map((f) => basename(f))).toEqual(['post.schema.ts', 'user.schema.ts']);
  });

  it('buildResolvedSchemaAst imports the modules and reports an entry that exports no declaration', async () => {
    const result = await buildResolvedSchemaAst({ schemaPath: FIXTURE });

    expect(result.schemaFiles).toEqual([]);
    expect(result.typescriptFiles.map((f) => basename(f))).toEqual(['post.schema.ts', 'user.schema.ts']);
    expect(result.schemaContents).toEqual([]);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0]).toContain('none exports a model');
    expect(result.resolvedAST).toBeNull();
  });

  it('formats with zero files and no error', async () => {
    const summary = await formatSchema({ schemaPath: FIXTURE, check: true });

    expect(summary).toEqual({ total: 0, formatted: 0, unchanged: 0, errors: [] });
  });
});

describe('root detection', () => {
  it('collapses several modules in one directory into one root', async () => {
    const dir = project('one-dir', { 'a/x.schema.ts': TS_STUB, 'a/y.schema.ts': TS_STUB });
    const roots = await findSchemaRoots(dir);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.files).toHaveLength(2);
  });

  it('does not make a nested directory a separate root', async () => {
    const dir = project('nested', { 'a/x.schema.ts': TS_STUB, 'a/b/y.schema.ts': TS_STUB });
    const roots = await findSchemaRoots(dir);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.path).toBe(resolve(dir, 'a'));
    expect(roots[0]!.files.map((f) => basename(f))).toEqual(['y.schema.ts', 'x.schema.ts']);
  });

  it('keeps sibling directories as separate roots', async () => {
    const dir = project('siblings', { 'a/x.schema.ts': TS_STUB, 'b/y.schema.ts': TS_STUB });

    expect(await findSchemaRoots(dir)).toHaveLength(2);
  });

  it('ignores plain helpers, tests, declarations and handles.ts', async () => {
    const dir = project('noise', {
      'src/helpers.ts': TS_STUB,
      'src/x.test.ts': TS_STUB,
      'src/x.schema.test.ts': TS_STUB,
      'src/x.schema.d.ts': TS_STUB,
      'cerial/handles.ts': TS_STUB,
    });

    expect(await findSchemaRoots(dir)).toEqual([]);
  });

  it('ignores node_modules', async () => {
    const dir = project('deps', { 'node_modules/pkg/x.schema.ts': TS_STUB });

    expect(await findSchemaRoots(dir)).toEqual([]);
  });

  it('skips a filter-excluded .ts root', async () => {
    const dir = project('filtered', { 'keep/x.schema.ts': TS_STUB, 'skip/y.schema.ts': TS_STUB });
    const filter = resolvePathFilter({ basePath: dir, rootConfig: { exclude: ['skip/**'] } });
    const roots = await findSchemaRoots(dir, filter);

    expect(roots.map((r) => basename(r.path))).toEqual(['keep']);
  });

  it('keeps the legacy result when .cerial lives under schemas/ without a marker', async () => {
    const dir = project('legacy', { 'schemas/user.cerial': USER_CERIAL, 'src/users/user.schema.ts': TS_STUB });

    expect(await findSchemaRoots(dir)).toEqual([]);
  });

  it('keeps exactly one root when a marker exists and a module sits outside it', async () => {
    const dir = project('marker-plus-ts', { 'auth/schema.cerial': USER_CERIAL, 'src/user.schema.ts': TS_STUB });
    const roots = await findSchemaRoots(dir);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.path).toBe(resolve(dir, 'auth'));
    expect(roots[0]!.marker).toBe('schema.cerial');
  });
});

describe('resolveSinglePath', () => {
  it('accepts a direct *.schema.ts path as a file', async () => {
    const file = resolve(FIXTURE, 'src/users/user.schema.ts');

    expect(await resolveSinglePath(file)).toEqual([file]);
  });

  it('applies the filter to a direct *.schema.ts path', async () => {
    const file = resolve(FIXTURE, 'src/users/user.schema.ts');
    const filter = resolvePathFilter({ basePath: dirname(file), rootConfig: { exclude: ['user.schema.ts'] } });

    expect(await resolveSinglePath(file, process.cwd(), filter)).toEqual([]);
  });

  it('does not take a plain .ts file as a schema file', async () => {
    expect(await resolveSinglePath(resolve(FIXTURE, 'src/users/helpers.ts'))).toEqual([]);
  });
});

describe('configured projects', () => {
  it('do not auto-add a root from the .ts marker', async () => {
    const dir = project('configured', { 'src/users/user.schema.ts': TS_STUB });
    const entries: ResolvedSchemaEntry[] = [];

    expect(await applyFolderOverridesAndDiscover(entries, dir)).toEqual([]);
    expect(await findSchemaRoots(dir)).toHaveLength(1);
  });

  it('still auto-add a .cerial marker root', async () => {
    const dir = project('configured-cerial', { 'auth/schema.cerial': USER_CERIAL });
    const result = await applyFolderOverridesAndDiscover([], dir);

    expect(result.map((e) => e.name)).toEqual(['auth']);
  });
});

describe('mixed .cerial root', () => {
  it('collects the module and imports it, leaving the parser the .cerial files only', async () => {
    const dir = project('mixed', {
      'auth/schema.cerial': USER_CERIAL,
      'auth/user.schema.ts': TS_STUB,
    });
    const roots = await findSchemaRoots(dir);

    expect(roots[0]!.files.map((f) => basename(f))).toEqual(['schema.cerial', 'user.schema.ts']);

    const result = await buildResolvedSchemaAst({ schemaPath: resolve(dir, 'auth') });

    expect(result.parseErrors).toEqual([]);
    expect(result.schemaFiles.map((f) => basename(f))).toEqual(['schema.cerial']);
    expect(result.typescriptFiles.map((f) => basename(f))).toEqual(['user.schema.ts']);
    expect(result.schemaContents.map((c) => basename(c.path))).toEqual(['schema.cerial']);
    expect(result.resolvedAST?.models.map((m) => m.name)).toEqual(['User']);
  });

  it('refuses a module that does not run, naming its path', async () => {
    const dir = project('mixed-broken', {
      'auth/schema.cerial': USER_CERIAL,
      'auth/user.schema.ts': 'this is not valid {{ typescript',
    });

    await expect(buildResolvedSchemaAst({ schemaPath: resolve(dir, 'auth') })).rejects.toThrow(/user\.schema\.ts/);
  });

  it('a .cerial-only project reports no TypeScript files', async () => {
    const dir = project('cerial-only', { 'auth/schema.cerial': USER_CERIAL });
    const result = await buildResolvedSchemaAst({ schemaPath: resolve(dir, 'auth') });

    expect(result.typescriptFiles).toEqual([]);
    expect(result.schemaFiles).toHaveLength(1);
  });

  it('formats only the .cerial file and leaves the module untouched', async () => {
    const dir = project('mixed-format', { 'auth/schema.cerial': USER_CERIAL, 'auth/user.schema.ts': 'const   x=1' });
    const summary = await formatSchema({ schemaPath: resolve(dir, 'auth'), check: true });

    expect(summary.total).toBe(1);
    expect(summary.errors).toEqual([]);
  });
});
