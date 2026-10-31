import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { entryModule, modelModule, removeTempProjects, tempProject } from '../../../registration-project';

afterAll(removeTempProjects);

const FIXTURES = join(import.meta.dir, '../../../fixtures/typescript-registration');

async function refusal(promise: Promise<unknown>): Promise<CerialGenerationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('buildResolvedSchemaAst did not refuse');
}

describe('buildResolvedSchemaAst with an entry', () => {
  it('builds the feature-folder fixture from its entry alone, with a plainly named module registered', async () => {
    const entry = join(FIXTURES, 'feature-folder/src/schema.ts');

    const built = await buildResolvedSchemaAst({ entry });

    expect(built.parseErrors).toEqual([]);
    expect(built.typescriptFiles).toEqual([entry]);
    expect(built.schemaFiles).toEqual([]);
    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['Post', 'User']);
  });

  it('does not search for schemas when the entry is the only source', async () => {
    // A legacy `schemas/` folder in the working directory would be found if the entry fell back to it
    const dir = await tempProject({ 'src/schema.ts': entryModule(['User']), 'src/user.ts': modelModule('User') });

    const built = await buildResolvedSchemaAst({ entry: join(dir, 'src/schema.ts') });

    expect(built.typescriptFiles).toEqual([join(dir, 'src/schema.ts')]);
  });

  it('adds the entry to the *.schema.ts files of a path, additively', async () => {
    const dir = await tempProject({
      'schemas/audit.schema.ts': modelModule('Audit'),
      'src/schema.ts': entryModule(['User']),
      'src/user.ts': modelModule('User'),
    });

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas'), entry: join(dir, 'src/schema.ts') });

    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['Audit', 'User']);
  });

  it('counts an entry that the path also finds once', async () => {
    const dir = await tempProject({
      'cerial.schema.ts': entryModule(['User']),
      'user.ts': modelModule('User'),
    });
    const entry = join(dir, 'cerial.schema.ts');

    const built = await buildResolvedSchemaAst({ schemaPath: dir, entry });

    expect(built.typescriptFiles).toEqual([entry]);
    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['User']);
  });

  it('refuses an entry file that does not exist, naming it', async () => {
    const dir = await tempProject({});
    const entry = join(dir, 'missing.ts');

    const error = await refusal(buildResolvedSchemaAst({ entry }));

    expect(error.message).toContain(entry);
  });

  it('refuses an entry that exports no defineSchema, naming the file', async () => {
    const dir = await tempProject({ 'schema.ts': modelModule('User') });
    const entry = join(dir, 'schema.ts');

    const error = await refusal(buildResolvedSchemaAst({ entry }));

    expect(error.message).toContain(entry);
    expect(error.message).toContain('defineSchema');
  });

  it('merges an entry set beside .cerial files', async () => {
    const dir = await tempProject({
      'schemas/a.cerial': 'model A {\n  id Record @id\n}\n',
      'src/schema.ts': entryModule(['User']),
      'src/user.ts': modelModule('User'),
    });
    const entry = join(dir, 'src/schema.ts');

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas'), entry });

    expect(built.parseErrors).toEqual([]);
    expect(built.typescriptFiles).toEqual([entry]);
    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['A', 'User']);
  });

  it('imports a convention *.schema.ts beside .cerial files, and follows it when it is an entry', async () => {
    const dir = await tempProject({
      'schemas/a.cerial': 'model A {\n  id Record @id\n}\n',
      'schemas/cerial.schema.ts': entryModule(['User']),
      'schemas/user.ts': modelModule('User'),
    });

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas') });

    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['A', 'User']);
  });

  it('lets a convention module with no declaration sit beside .cerial files', async () => {
    const dir = await tempProject({
      'schemas/a.cerial': 'model A {\n  id Record @id\n}\n',
      'schemas/validation.schema.ts': "export const rule = 'not a schema';\n",
    });

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas') });

    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['A']);
  });

  it('refuses a listed model that is not an exported binding', async () => {
    const dir = await tempProject({
      'schema.ts': `${entryModule([], []).replace('models: []', "models: [model('Inline', { id: f.record().id() })]").replace('{ defineSchema }', '{ defineSchema, f, model }')}`,
    });

    const error = await refusal(buildResolvedSchemaAst({ entry: join(dir, 'schema.ts') }));

    expect(error.message).toContain('Inline');
  });

  it('an entry that registers no declaration reports it instead of generating an empty client', async () => {
    const dir = await tempProject({ 'schema.ts': entryModule([]) });

    const built = await buildResolvedSchemaAst({ entry: join(dir, 'schema.ts') });

    expect(built.parseErrors.join('\n')).toContain('none exports a model');
    expect(built.resolvedAST).toBeNull();
  });
});

describe('a plain *.schema.ts', () => {
  it('does not register its imports', async () => {
    const dir = await tempProject({
      'user.schema.ts': modelModule('User', "import './helper';\n"),
      'helper.ts': modelModule('Helper'),
    });

    const built = await buildResolvedSchemaAst({ schemaPath: dir });

    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['User']);
  });
});
