import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { f, model } from '../../../../src/parser/builder';
import { defineSchema } from '../../../../src/parser/builder/define-schema';
import { loadDeclarations } from '../../../../src/parser/builder/load';
import type { ImportReader, ModuleImporter } from '../../../../src/parser/builder/load';
import { materialise } from '../../../../src/parser/builder/materialise';
import { entryModule, modelModule, removeTempProjects, SCHEMA_SRC, tempProject } from '../../../registration-project';

afterAll(removeTempProjects);

async function refusal(promise: Promise<unknown>): Promise<CerialGenerationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('loadDeclarations did not refuse');
}

async function modelNames(files: readonly string[], entries: readonly string[] = []): Promise<string[]> {
  return materialise(await loadDeclarations(files, { entries })).models.map((m) => m.name);
}

describe('an entry module registers its transitive imports', () => {
  test('a plainly named module the entry imports counts, without the .schema.ts suffix', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User', 'Post']),
      'user.ts': modelModule('User'),
      'post.ts': modelModule('Post'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['Post', 'User']);
  });

  test('imports of imports count, down any depth', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User']),
      'user.ts': modelModule('User', "import './deeper';\n"),
      'deeper.ts': "import './deepest';\n",
      'deepest.ts': modelModule('Deepest'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['Deepest', 'User']);
  });

  test('a declaration the entry does not list is still registered by being imported', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User'], []),
      'user.ts': modelModule('User'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['User']);
  });

  test('a module nothing imports is not registered', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User']),
      'user.ts': modelModule('User'),
      'ghost.ts': modelModule('Ghost'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['User']);
  });

  test('a type-only import is not followed, a commented one neither', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User']),
      'user.ts': modelModule('User', "import type { Ghost } from './ghost';\n// import './other';\n"),
      'ghost.ts': modelModule('Ghost'),
      'other.ts': modelModule('Other'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['User']);
  });

  test('a dynamic import is not followed', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User']),
      'user.ts': modelModule('User', "export const later = () => import('./ghost');\n"),
      'ghost.ts': modelModule('Ghost'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['User']);
  });

  test('export * from registers the re-exported module, once', async () => {
    const dir = await tempProject({
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { User } from './barrel';\n\nexport default defineSchema({ models: [User] });\nexport * from './barrel';\n`,
      'barrel.ts': "export * from './user';\n",
      'user.ts': modelModule('User'),
    });

    const found = await loadDeclarations([join(dir, 'schema.ts')]);

    expect(found.filter((d) => d.exportName === 'User').length).toBeGreaterThan(1);
    expect(materialise(found).models.map((m) => m.name)).toEqual(['User']);
  });

  test('an import cycle ends, and each module is imported once', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User']),
      'user.ts': modelModule('User', "import './post';\n"),
      'post.ts': modelModule('Post', "import './user';\n"),
    });
    const imported: string[] = [];
    const importModule: ModuleImporter = (path) => {
      imported.push(path);

      return import(path);
    };

    const found = await loadDeclarations([join(dir, 'schema.ts')], { importModule });

    expect(materialise(found).models.map((m) => m.name)).toEqual(['Post', 'User']);
    expect(imported.length).toBe(new Set(imported).size);
  });

  test('a module imported by two entries, or listed and imported, is harvested once', async () => {
    const dir = await tempProject({
      'one.ts': entryModule(['User']),
      'two.ts': entryModule(['User']),
      'user.ts': modelModule('User'),
    });
    const user = join(dir, 'user.ts');
    const imported: string[] = [];
    const importModule: ModuleImporter = (path) => {
      imported.push(path);

      return import(path);
    };

    const found = await loadDeclarations([join(dir, 'one.ts'), join(dir, 'two.ts'), user], { importModule });

    expect(imported.filter((p) => p === user)).toHaveLength(1);
    expect(found.filter((d) => d.module === user)).toHaveLength(1);
  });

  test('a plain schema module reached by an entry has its own imports followed', async () => {
    const dir = await tempProject({
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { Post } from './post.schema';\n\nexport default defineSchema({ models: [Post] });\n`,
      'post.schema.ts': modelModule('Post', "import './helper';\n"),
      'helper.ts': modelModule('Helper'),
    });
    // Listed first as a convention file, then reached through the entry: the walk must still follow it
    const files = [join(dir, 'post.schema.ts'), join(dir, 'schema.ts')];

    expect(await modelNames(files)).toEqual(['Helper', 'Post']);
  });
});

describe('only an entry is walked', () => {
  test('a *.schema.ts without defineSchema keeps its imports unregistered', async () => {
    const dir = await tempProject({
      'user.schema.ts': modelModule('User', "import './helper';\n"),
      'helper.ts': modelModule('Helper'),
    });
    let reads = 0;
    const readImports: ImportReader = async () => {
      reads++;

      return [];
    };

    const found = await loadDeclarations([join(dir, 'user.schema.ts')], { readImports });

    expect(materialise(found).models.map((m) => m.name)).toEqual(['User']);
    expect(reads).toBe(0);
  });

  test('a registration under any export name makes the module an entry', async () => {
    const dir = await tempProject({
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { User } from './user';\n\nexport const registration = defineSchema({ models: [User] });\n`,
      'user.ts': modelModule('User', "import './helper';\n"),
      'helper.ts': modelModule('Helper'),
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['Helper', 'User']);
  });

  test('the reader is injectable, so a graph can be supplied', async () => {
    const User = model('User', { id: f.record().id() });
    const Edge = model('Edge', { id: f.record().id() });
    const modules: Record<string, Record<string, unknown>> = {
      '/v/entry.ts': { default: defineSchema({ models: [User] }) },
      '/v/user.ts': { User },
      '/v/edge.ts': { Edge },
    };
    const importModule: ModuleImporter = async (path) => modules[path]!;
    const readImports: ImportReader = async (file) => (file === '/v/entry.ts' ? ['/v/user.ts'] : []);

    const found = await loadDeclarations(['/v/entry.ts'], { importModule, readImports });

    expect(found.map((d) => d.exportName)).toEqual(['User']);
  });
});

describe('refuses', () => {
  test('a listed model no imported module exports, naming the model and the entry', async () => {
    const dir = await tempProject({
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { f, model } from '${SCHEMA_SRC}';\n\nconst Local = model('Local', { id: f.record().id() });\nexport default defineSchema({ models: [Local] });\n`,
    });
    const entry = join(dir, 'schema.ts');

    const error = await refusal(loadDeclarations([entry]));

    expect(error.message).toContain(entry);
    expect(error.message).toContain('Local');
    expect(error.message).toContain('exported binding');
  });

  test('an inline model(...) in the list', async () => {
    const dir = await tempProject({
      'schema.ts': `import { defineSchema, f, model } from '${SCHEMA_SRC}';\n\nexport default defineSchema({ models: [model('Inline', { id: f.record().id() })] });\n`,
    });

    const error = await refusal(loadDeclarations([join(dir, 'schema.ts')]));

    expect(error.message).toContain('Inline');
    expect(error.message).toContain('inline');
  });

  test('a listed model that a non-relative module declares, when the entry does not export it', async () => {
    const dir = await tempProject({
      'node_modules/shared/package.json': JSON.stringify({ name: 'shared', main: 'index.ts' }),
      'node_modules/shared/index.ts': modelModule('Shared'),
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { Shared } from 'shared';\n\nexport default defineSchema({ models: [Shared] });\n`,
    });

    const error = await refusal(loadDeclarations([join(dir, 'schema.ts')]));

    expect(error.message).toContain('Shared');
  });

  test('...and accepts it once the entry re-exports it', async () => {
    const dir = await tempProject({
      'node_modules/shared/package.json': JSON.stringify({ name: 'shared', main: 'index.ts' }),
      'node_modules/shared/index.ts': modelModule('Shared'),
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { Shared } from 'shared';\n\nexport { Shared };\nexport default defineSchema({ models: [Shared] });\n`,
    });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['Shared']);
  });

  test('a module required to be an entry that exports no registration', async () => {
    const dir = await tempProject({ 'schema.ts': modelModule('User') });
    const entry = join(dir, 'schema.ts');

    const error = await refusal(loadDeclarations([entry], { entries: [entry] }));

    expect(error.message).toContain(entry);
    expect(error.message).toContain('defineSchema');
  });

  test('the same module is fine when it is not required to be an entry', async () => {
    const dir = await tempProject({ 'schema.ts': modelModule('User') });

    expect(await modelNames([join(dir, 'schema.ts')])).toEqual(['User']);
  });

  test('an imported module that throws, naming the entry that reached it and the cause', async () => {
    const dir = await tempProject({
      'schema.ts': entryModule(['User']),
      'user.ts': `${modelModule('User')}throw new Error('boom from user');\n`,
    });

    const error = await refusal(loadDeclarations([join(dir, 'schema.ts')]));

    // The entry's own import evaluates user.ts first, so the entry is the module the failure is reported on
    expect(error.message).toContain(join(dir, 'schema.ts'));
    expect(error.message).toContain('boom from user');
  });
});
