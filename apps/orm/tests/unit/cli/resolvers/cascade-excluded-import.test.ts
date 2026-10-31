import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { buildResolvedSchemaAst } from '../../../../src/cli/resolvers';
import { modelModule, removeTempProjects, SCHEMA_SRC, tempProject } from '../../../registration-project';
import { cascade, cascadeProject, ENTRY_SOURCE } from './cascade-helpers';

afterAll(removeTempProjects);

async function refusal(promise: Promise<unknown>): Promise<CerialGenerationError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('buildResolvedSchemaAst did not refuse');
}

describe('a module the cascade excludes but an entry imports', () => {
  // Elsewhere an explicit registration beats convention. Exclusion is the deliberate exception:
  // listing a model in defineSchema never brings a file back that the cascade keeps out.
  it('stays excluded: exclusion beats registration, the one exception to explicit-beats-convention', async () => {
    const dir = await cascadeProject();
    const entry = join(dir, 'schemas/entry.ts');
    const schemas = join(dir, 'schemas');

    const registered = await buildResolvedSchemaAst({ entry, filterBase: schemas });
    const excluded = await buildResolvedSchemaAst({
      entry,
      filterBase: schemas,
      filter: cascade(dir, { exclude: ['drafts/**'] }),
    });

    expect(registered.resolvedAST?.models.map((m) => m.name).sort()).toEqual(['A', 'B']);
    expect(excluded.resolvedAST?.models.map((m) => m.name)).toEqual(['A']);
  });

  it('still runs, because its importer imports it', async () => {
    const dir = await cascadeProject({
      'schemas/drafts/b.schema.ts': `${modelModule('B')}import { writeFileSync } from 'node:fs';\nwriteFileSync(new URL('./ran', import.meta.url), 'yes');\n`,
    });

    await buildResolvedSchemaAst({
      entry: join(dir, 'schemas/entry.ts'),
      filterBase: join(dir, 'schemas'),
      filter: cascade(dir, { exclude: ['drafts/**'] }),
    });

    expect(existsSync(join(dir, 'schemas/drafts/ran'))).toBe(true);
  });

  it('is not followed: what only it imports is not harvested', async () => {
    const dir = await cascadeProject({
      'schemas/drafts/b.schema.ts': modelModule('B', "import './deep';\n"),
      'schemas/drafts/deep.ts': modelModule('Deep'),
    });
    const schemas = join(dir, 'schemas');
    // An entry that registers only A, so Deep can appear only through the walk
    const entry = ENTRY_SOURCE.replace('[A, B]', '[A]');
    await Bun.write(join(schemas, 'entry.ts'), entry);

    const walked = await buildResolvedSchemaAst({ entry: join(schemas, 'entry.ts'), filterBase: schemas });
    const stopped = await buildResolvedSchemaAst({
      entry: join(schemas, 'entry.ts'),
      filterBase: schemas,
      filter: cascade(dir, { exclude: ['drafts/**'] }),
    });

    expect(walked.resolvedAST?.models.map((m) => m.name).sort()).toEqual(['A', 'B', 'Deep']);
    expect(stopped.resolvedAST?.models.map((m) => m.name)).toEqual(['A']);
  });

  it('does not refuse a listed handle as unbound, but a reference to a declaration of it still fails', async () => {
    const listed = await cascadeProject();
    const schemas = join(listed, 'schemas');
    const filter = cascade(listed, { exclude: ['drafts/**'] });

    // B is listed in defineSchema and excluded: exclusion is the reason it is missing, so no refusal
    const built = await buildResolvedSchemaAst({ entry: join(schemas, 'entry.ts'), filterBase: schemas, filter });
    expect(built.resolvedAST?.models.map((m) => m.name)).toEqual(['A']);

    const dir = await tempProject({
      'schemas/a.ts': `import { f, model } from '${SCHEMA_SRC}';\nimport { Address } from './address';\n\nexport const A = model('A', { id: f.record().id(), home: f.object(Address) });\n`,
      'schemas/address.ts': `import { f, object } from '${SCHEMA_SRC}';\n\nexport const Address = object('Address', { city: f.string() });\n`,
      'schemas/entry.ts': ENTRY_SOURCE.replace("import { B } from './drafts/b.schema';\n", '')
        .replace('./a.schema', './a')
        .replace('[A, B]', '[A]'),
    });

    // The ordinary missing-declaration refusal for a reference, not the unbound-handle one
    const error = await refusal(
      buildResolvedSchemaAst({
        entry: join(dir, 'schemas/entry.ts'),
        filterBase: join(dir, 'schemas'),
        filter: cascade(dir, { exclude: ['address.ts'] }),
      }),
    );
    expect(error.message).toContain("refers to 'Address'");
    expect(error.message).not.toContain('no module the entry imports');
  });

  it('is refused as unbound when nothing excludes it and it is not exported', async () => {
    const dir = await tempProject({
      'schemas/entry.ts': `import { defineSchema, f, model } from '${SCHEMA_SRC}';\n\nexport default defineSchema({ models: [model('Inline', { id: f.record().id() })] });\n`,
    });

    const error = await refusal(buildResolvedSchemaAst({ entry: join(dir, 'schemas/entry.ts') }));

    expect(error.message).toContain('no module the entry imports exports it');
  });
});

describe('an excluded source', () => {
  it('names an excluded entry rather than saying no schema files exist', async () => {
    const dir = await cascadeProject();
    const entry = join(dir, 'schemas/entry.ts');

    const error = await refusal(
      buildResolvedSchemaAst({
        entry,
        filterBase: join(dir, 'schemas'),
        filter: cascade(dir, { exclude: ['entry.ts'] }),
      }),
    );

    expect(error.message).toContain(entry);
    expect(error.message).toContain('excluded');
    expect(error.message).not.toContain('No schema files found');
  });

  it('names every listed file when all are excluded', async () => {
    const dir = await cascadeProject();
    const schemas = join(dir, 'schemas');
    const files = [join(schemas, 'a.schema.ts'), join(schemas, 'drafts/b.schema.ts')];

    const error = await refusal(
      buildResolvedSchemaAst({ files, filterBase: schemas, filter: cascade(dir, { exclude: ['**/*.schema.ts'] }) }),
    );

    for (const file of files) expect(error.message).toContain(file);
  });

  it('is skipped quietly when another source remains', async () => {
    const dir = await cascadeProject();
    const schemas = join(dir, 'schemas');

    const built = await buildResolvedSchemaAst({
      files: [join(schemas, 'a.schema.ts'), join(schemas, 'drafts/b.schema.ts')],
      filterBase: schemas,
      filter: cascade(dir, { exclude: ['drafts/**'] }),
    });

    expect(built.typescriptFiles).toEqual([join(schemas, 'a.schema.ts')]);
  });

  it('applies to listed .cerial files as well', async () => {
    const dir = await tempProject({
      'a.cerial': 'model A {\n  id Record @id\n}\n',
      'drafts/b.cerial': 'model B {\n  id Record @id\n}\n',
    });

    const built = await buildResolvedSchemaAst({
      files: [join(dir, 'a.cerial'), join(dir, 'drafts/b.cerial')],
      filterBase: dir,
      filter: cascade(dir, { exclude: ['drafts/**'] }),
    });

    expect(built.schemaFiles).toEqual([join(dir, 'a.cerial')]);
  });
});
