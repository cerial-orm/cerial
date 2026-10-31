import { afterAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { entryModule, modelModule, removeTempProjects, tempProject } from '../../../registration-project';

afterAll(removeTempProjects);

const cerialModel = (name: string): string => `model ${name} {\n  id Record @id\n}\n`;

async function refusal(promise: Promise<unknown>): Promise<CerialGenerationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('buildResolvedSchemaAst did not refuse');
}

const names = (built: Awaited<ReturnType<typeof buildResolvedSchemaAst>>): string[] | undefined =>
  built.resolvedAST?.models.map((m) => m.name);

describe('buildResolvedSchemaAst with listed files', () => {
  it('imports a listed .ts module that does not carry the .schema.ts suffix, and searches nothing else', async () => {
    const dir = await tempProject({
      'models/user.ts': modelModule('User'),
      'models/other.schema.ts': modelModule('Other'),
    });

    const built = await buildResolvedSchemaAst({ files: [join(dir, 'models/user.ts')] });

    expect(names(built)).toEqual(['User']);
    expect(built.typescriptFiles).toEqual([join(dir, 'models/user.ts')]);
  });

  it('adds listed files to the *.schema.ts files of a path', async () => {
    const dir = await tempProject({ 'schemas/a.schema.ts': modelModule('A'), 'lib/b.ts': modelModule('B') });

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas'), files: [join(dir, 'lib/b.ts')] });

    // Declarations are ordered by file path, whichever mode found them
    expect(names(built)).toEqual(['B', 'A']);
  });

  it('counts a file once when the path also finds it', async () => {
    const dir = await tempProject({ 'schemas/a.schema.ts': modelModule('A') });
    const file = join(dir, 'schemas/a.schema.ts');

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas'), files: [file, file] });

    expect(built.typescriptFiles).toEqual([file]);
    expect(names(built)).toEqual(['A']);
  });

  it('parses a list of .cerial files as it would a folder of them', async () => {
    const dir = await tempProject({ 'a.cerial': cerialModel('A'), 'sub/b.cerial': cerialModel('B') });

    const built = await buildResolvedSchemaAst({ files: [join(dir, 'a.cerial'), join(dir, 'sub/b.cerial')] });

    expect(built.schemaFiles).toHaveLength(2);
    expect(names(built)).toEqual(['A', 'B']);
  });

  it('walks a listed module that exports defineSchema, and only that one', async () => {
    const dir = await tempProject({
      'entry.ts': entryModule(['User']),
      'user.ts': modelModule('User'),
      'plain.ts': modelModule('Plain', "import './helper';\n"),
      'helper.ts': modelModule('Helper'),
    });

    const registering = await buildResolvedSchemaAst({ files: [join(dir, 'entry.ts')] });
    const plain = await buildResolvedSchemaAst({ files: [join(dir, 'plain.ts')] });

    expect(names(registering)).toEqual(['User']);
    expect(names(plain)).toEqual(['Plain']);
  });

  it('drops cerial/handles.ts from the list without reading it', async () => {
    const dir = await tempProject({
      'user.ts': modelModule('User'),
      'cerial/handles.ts': "throw new Error('handles must not be imported');\n",
    });

    const built = await buildResolvedSchemaAst({ files: [join(dir, 'user.ts'), join(dir, 'cerial/handles.ts')] });

    expect(built.typescriptFiles).toEqual([join(dir, 'user.ts')]);
    expect(names(built)).toEqual(['User']);
  });

  it('does not drop a file that only ends like handles.ts', async () => {
    const dir = await tempProject({ 'my-handles.ts': modelModule('Mine') });

    expect(names(await buildResolvedSchemaAst({ files: [join(dir, 'my-handles.ts')] }))).toEqual(['Mine']);
  });
});

describe('buildResolvedSchemaAst refusing listed files', () => {
  it('refuses a listed file that does not exist, naming the field and path', async () => {
    const dir = await tempProject({ 'a.ts': modelModule('A') });
    const missing = join(dir, 'missing.ts');

    const error = await refusal(buildResolvedSchemaAst({ files: [join(dir, 'a.ts'), missing] }));

    expect(error.message).toContain(missing);
    expect(error.message).toContain("'files'");
  });

  it('refuses a file that is neither .cerial nor .ts, naming it', async () => {
    const dir = await tempProject({ 'schema.json': '{}' });

    const error = await refusal(buildResolvedSchemaAst({ files: [join(dir, 'schema.json')] }));

    expect(error.message).toContain('schema.json');
    expect(error.message).toContain("'files'");
  });

  it('merges a listed .ts module with the .cerial files of a path', async () => {
    const dir = await tempProject({ 'schemas/a.cerial': cerialModel('A'), 'lib/b.ts': modelModule('B') });
    const listed = join(dir, 'lib/b.ts');

    const built = await buildResolvedSchemaAst({ schemaPath: join(dir, 'schemas'), files: [listed] });

    expect(built.typescriptFiles).toEqual([listed]);
    expect(names(built)).toEqual(['B', 'A']);
  });

  it('merges a .ts module listed beside a listed .cerial file', async () => {
    const dir = await tempProject({ 'a.cerial': cerialModel('A'), 'b.ts': modelModule('B') });

    const built = await buildResolvedSchemaAst({ files: [join(dir, 'a.cerial'), join(dir, 'b.ts')] });

    expect(names(built)).toEqual(['A', 'B']);
  });

  it('refuses a listed .ts module that throws, naming it, when .cerial files sit beside it', async () => {
    const dir = await tempProject({ 'a.cerial': cerialModel('A'), 'b.ts': "throw new Error('boom');\n" });
    const listed = join(dir, 'b.ts');

    const error = await refusal(buildResolvedSchemaAst({ files: [join(dir, 'a.cerial'), listed] }));

    expect(error.message).toContain(listed);
    expect(error.message).toContain('boom');
  });

  it('does not refuse a list of .cerial files beside the .cerial files of a path', async () => {
    const dir = await tempProject({ 'schemas/a.cerial': cerialModel('A'), 'lib/b.cerial': cerialModel('B') });

    const built = await buildResolvedSchemaAst({
      schemaPath: join(dir, 'schemas'),
      files: [join(dir, 'lib/b.cerial')],
    });

    expect(names(built)).toEqual(['A', 'B']);
  });
});
