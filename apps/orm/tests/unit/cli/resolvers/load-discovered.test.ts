import { describe, expect, test } from 'bun:test';
import { resolve } from 'node:path';
import { findSchemasInDir, isTypescriptSchemaFile } from '../../../../src/cli/resolvers';
import { CerialGenerationError } from '../../../../src/errors';
import { loadDeclarations } from '../../../../src/parser/builder/load';
import { materialise } from '../../../../src/parser/builder/materialise';

const FIXTURES = resolve(__dirname, '../../../fixtures/schema-discovery');
const ROOT = resolve(FIXTURES, 'builder-modules');
const BROKEN_ROOT = resolve(FIXTURES, 'builder-modules-broken');

describe('loading discovered modules', () => {
  test('imports every discovered module and never the throwing cerial/handles.ts', async () => {
    const discovered = await findSchemasInDir(ROOT, ['**/*.schema.ts']);

    expect(discovered.map((f) => f.slice(ROOT.length + 1)).sort()).toEqual([
      'schema/empty.schema.ts',
      'schema/post.schema.ts',
      'schema/user.schema.ts',
    ]);
    expect(isTypescriptSchemaFile(resolve(ROOT, 'cerial/handles.ts'))).toBe(false);

    const ast = materialise(await loadDeclarations(discovered));

    expect(ast.models.map((m) => m.name)).toEqual(['Post', 'User']);
    expect(ast.objects.map((o) => o.name)).toEqual(['Address']);
    expect(ast.enums.map((e) => e.name)).toEqual(['Status']);
  });

  test('a discovered module that throws refuses with C7000 naming it', async () => {
    const discovered = await findSchemasInDir(BROKEN_ROOT, ['**/*.schema.ts']);

    expect(discovered).toHaveLength(1);
    const error = await loadDeclarations(discovered).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialGenerationError);
    expect((error as CerialGenerationError).code).toBe('C7000');
    expect((error as CerialGenerationError).message).toContain(discovered[0]!);
  });
});
