import { afterAll, describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { CerialGenerationError } from '../../../../src/errors';
import { e, enum as enumeration, f, literal, model, object, tuple, variant } from '../../../../src/parser/builder';
import { loadDeclarations } from '../../../../src/parser/builder/load';
import { materialise } from '../../../../src/parser/builder/materialise';
import type { ExportedDeclaration } from '../../../../src/parser/builder/materialise';
import type { Origin, SchemaAST } from '../../../../src/types';
import { removeTempProjects, SCHEMA_SRC, tempProject } from '../../../registration-project';

afterAll(removeTempProjects);

const tsOrigin = (file: string, exportName: string): Origin => ({ kind: 'ts', file, export: exportName });

describe('the ts origin on materialised nodes', () => {
  const FILE = '/app/schema/shapes.schema.ts';
  const Author = model('Author', { id: f.record().id() });
  const declarations: ExportedDeclaration[] = [
    // Exported names differ from the declared names on purpose
    {
      handle: model('User', { id: f.record().id(), author: f.relation(() => Author) }),
      module: FILE,
      exportName: 'UserModel',
    },
    { handle: Author, module: FILE, exportName: 'AuthorModel' },
    { handle: object('Address', { street: f.string() }), module: FILE, exportName: 'AddressObject' },
    { handle: tuple('Coord', { x: e.float(), y: e.float() }), module: FILE, exportName: 'CoordTuple' },
    { handle: literal('Level', [variant.int(1), variant.string('high')]), module: FILE, exportName: 'LevelLiteral' },
    { handle: enumeration('Role', ['Admin', 'Guest']), module: FILE, exportName: 'RoleEnum' },
  ];
  const ast: SchemaAST = materialise(declarations);

  test.each([
    ['model', () => ast.models.find((m) => m.name === 'User')!, 'UserModel'],
    ['object', () => ast.objects[0]!, 'AddressObject'],
    ['tuple', () => ast.tuples[0]!, 'CoordTuple'],
    ['literal', () => ast.literals[0]!, 'LevelLiteral'],
    ['enum', () => ast.enums[0]!, 'RoleEnum'],
  ] as const)(
    'a %s carries the discovered file and its export name, not its declared name',
    (_kind, node, exportName) => {
      expect(node().origin).toEqual(tsOrigin(FILE, exportName));
    },
  );

  test('model fields, object fields and tuple elements inherit the declaration origin', () => {
    expect(ast.models.find((m) => m.name === 'User')!.fields.map((x) => x.origin)).toEqual(
      Array(3).fill(tsOrigin(FILE, 'UserModel')),
    );
    expect(ast.objects[0]!.fields.map((x) => x.origin)).toEqual([tsOrigin(FILE, 'AddressObject')]);
    expect(ast.tuples[0]!.elements.map((x) => x.origin)).toEqual(Array(2).fill(tsOrigin(FILE, 'CoordTuple')));
  });

  test('a foreign key derived from a relation takes the origin of the model that wrote the relation', () => {
    const user = ast.models.find((m) => m.name === 'User')!;

    expect(user.fields.map((x) => x.name)).toEqual(['id', 'authorId', 'author']);
    expect(user.fields[1]!.origin).toEqual(tsOrigin(FILE, 'UserModel'));
  });

  test('literal variants and enum values have no origin of their own, so an error names the declaration', () => {
    const level = ast.literals[0]!;

    expect(level.variants.some((item) => 'origin' in item)).toBe(false);
    expect(ast.enums[0]!.values).toEqual(['Admin', 'Guest']);
  });
});

describe('the ts origin through discovery', () => {
  test('a declaration re-exported through a barrel takes the smallest module and export', async () => {
    const dir = await tempProject({
      'schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { Account } from './barrel';\n\nexport default defineSchema({ models: [Account] });\nexport * from './barrel';\n`,
      'barrel.ts': "export * from './account';\n",
      'account.ts': `import { f, model } from '${SCHEMA_SRC}';\nexport const Account = model('Account', { id: f.record().id() });\n`,
    });

    const ast = materialise(await loadDeclarations([join(dir, 'schema.ts')]));

    expect(ast.models).toHaveLength(1);
    expect(ast.models[0]!.origin).toEqual(tsOrigin(join(dir, 'account.ts'), 'Account'));
  });

  test('the discovered path and export name land on the node, not the declared name', async () => {
    const dir = await tempProject({
      'user.schema.ts': `import { f, model } from '${SCHEMA_SRC}';\nexport const UserModel = model('User', { id: f.record().id() });\n`,
    });

    const ast = materialise(await loadDeclarations([join(dir, 'user.schema.ts')]));

    expect(ast.models[0]!.name).toBe('User');
    expect(ast.models[0]!.origin).toEqual(tsOrigin(join(dir, 'user.schema.ts'), 'UserModel'));
  });

  test('a model with no export binding is refused where defineSchema lists it, so no origin lacks an export', async () => {
    const dir = await tempProject({
      'entry.ts': `import { defineSchema, f, model } from '${SCHEMA_SRC}';\n\nexport default defineSchema({ models: [model('Inline', { id: f.record().id() })] });\n`,
    });

    const error = await loadDeclarations([join(dir, 'entry.ts')]).then(
      () => undefined,
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect((error as CerialGenerationError).message).toContain('a model written inline in the list cannot be traced');
  });
});
