import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { f, model } from '../../../../src/parser/builder';
import { importSchemaModule, loadDeclarations } from '../../../../src/parser/builder/load';
import type { ModuleImporter } from '../../../../src/parser/builder/load';
import { materialise } from '../../../../src/parser/builder/materialise';

const ROOT = resolve(__dirname, '../../../fixtures/schema-discovery/builder-modules');
const USER = resolve(ROOT, 'schema/user.schema.ts');
const POST = resolve(ROOT, 'schema/post.schema.ts');
const EMPTY = resolve(ROOT, 'schema/empty.schema.ts');
const BROKEN = resolve(ROOT, '../builder-modules-broken/broken.schema.ts');
const HANDLES = resolve(ROOT, 'cerial/handles.ts');

async function refusal(promise: Promise<unknown>): Promise<CerialGenerationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('loadDeclarations did not refuse');
}

describe('loadDeclarations', () => {
  test('collects every exported declaration with its module and export name', async () => {
    const found = await loadDeclarations([USER]);

    expect(found.map((d) => [d.exportName, d.module]).sort()).toEqual([
      ['Address', USER],
      ['User', USER],
    ]);
  });

  test('a default export counts the same as a named one', async () => {
    const found = await loadDeclarations([POST]);

    expect(found.map((d) => d.exportName).sort()).toEqual(['Status', 'default']);
    expect(materialise(found).models.map((m) => m.name)).toEqual(['Post']);
  });

  test('exports that are not declarations are skipped', async () => {
    const found = await loadDeclarations([USER]);

    expect(found.map((d) => d.exportName)).not.toContain('notADeclaration');
    expect(found.map((d) => d.exportName)).not.toContain('count');
  });

  test('a module that exports no declaration is empty, not an error', async () => {
    expect(await loadDeclarations([EMPTY])).toEqual([]);
  });

  test('no modules gives no declarations', async () => {
    expect(await loadDeclarations([])).toEqual([]);
  });

  test('the same handle exported twice stays collected under both names', async () => {
    const Shared = model('Shared', { id: f.record().id() });
    const importModule: ModuleImporter = async () => ({ Shared, default: Shared });

    const found = await loadDeclarations(['/virtual/a.schema.ts'], { importModule });

    expect(found.map((d) => d.exportName).sort()).toEqual(['Shared', 'default']);
    expect(materialise(found).models).toHaveLength(1);
  });

  test('import order does not change the materialised AST', async () => {
    const forward = materialise(await loadDeclarations([USER, POST]));
    const backward = materialise(await loadDeclarations([POST, USER]));

    expect(backward).toEqual(forward);
    expect(forward.models.map((m) => m.name)).toEqual(['Post', 'User']);
  });

  test('a module that throws refuses with C7000, its path and the thrown error as cause', async () => {
    const error = await refusal(loadDeclarations([USER, BROKEN]));

    expect(error.code).toBe('C7000');
    expect(error.message).toContain(BROKEN);
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe('boom from the module');
  });

  test('a rejection that is not an Error still refuses and is kept as cause', async () => {
    const importModule: ModuleImporter = () => Promise.reject('plain string');

    const error = await refusal(loadDeclarations(['/virtual/a.schema.ts'], { importModule }));

    expect(error.message).toContain('/virtual/a.schema.ts');
    expect(error.cause).toBe('plain string');
  });

  test('handles.ts is never imported when only schema modules are given', async () => {
    // Importing it throws, so a clean load proves it was not touched.
    await expect(loadDeclarations([USER, POST])).resolves.toHaveLength(4);
    await expect(importSchemaModule(HANDLES)).rejects.toThrow();
  });
});
