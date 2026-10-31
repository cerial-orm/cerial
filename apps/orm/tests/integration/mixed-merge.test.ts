/**
 * An entry holding `.cerial` files and TypeScript modules generates one schema: each form refers to the other's
 * declarations, the merged AST is deterministic, and a stale handle is named. Needs no database.
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { generateSingleSchema } from '../../src/cli/generate';
import { buildResolvedSchemaAst } from '../../src/cli/resolvers';
import type { SchemaAstResult } from '../../src/cli/resolvers/schema-ast';
import { CerialGenerationError } from '../../src/errors';
import { mixedProject, NOTES_MODULE, ORDERS_MODULE, removeMixedProjects, SHOP_CERIAL } from './mixed-merge-project';

afterAll(removeMixedProjects);

let built: SchemaAstResult;
const field = (model: string, name: string) =>
  built.resolvedAST?.models.find((m) => m.name === model)?.fields.find((f) => f.name === name);

beforeAll(async () => {
  const dir = await mixedProject({
    'shop.cerial': SHOP_CERIAL,
    'orders.schema.ts': ORDERS_MODULE,
    'notes.schema.ts': NOTES_MODULE,
  });
  built = await buildResolvedSchemaAst({ schemaPath: dir });
});

describe('a .cerial field typed by a TypeScript declaration', () => {
  it('generates with no parse error', () => {
    expect(built.parseErrors).toEqual([]);
    expect(built.extendsErrors).toEqual([]);
    expect(built.resolvedAST).not.toBeNull();
  });

  it('resolves an object', () => {
    expect(field('Shop', 'address')).toMatchObject({ type: 'object', objectName: 'Address' });
  });

  it('resolves a tuple', () => {
    expect(field('Shop', 'spot')).toMatchObject({ type: 'tuple', tupleName: 'Point' });
  });

  it('resolves a literal', () => {
    expect(field('Customer', 'tier')).toMatchObject({ type: 'literal', literalName: 'Level' });
  });

  it('resolves an enum', () => {
    expect(field('Shop', 'role')).toMatchObject({ type: 'literal', literalName: 'Role' });
  });

  it('resolves a .cerial literal variant naming a TypeScript object', () => {
    const badge = built.resolvedAST?.literals.find((l) => l.name === 'Badge');

    expect(badge?.variants).toContainEqual({ kind: 'objectRef', objectName: 'Address' });
  });

  it('still refuses a type nobody declares, with the parser message', async () => {
    const dir = await mixedProject({
      'a.cerial': 'model A {\n  id Record(int) @id\n  total Moneyy\n}\n',
      'x.schema.ts': NOTES_MODULE,
    });

    const result = await buildResolvedSchemaAst({ schemaPath: dir });

    expect(result.parseErrors.join('\n')).toContain('Invalid field type: Moneyy');
  });
});

describe('a TypeScript declaration referring to a .cerial one', () => {
  it('relates to a .cerial model whose own field is typed by TypeScript, on a clean checkout', () => {
    expect(built.resolvedAST?.models.map((m) => m.name)).toContain('Purchase');
    expect(field('Purchase', 'customer')?.type).toBe('relation');
    expect(field('Purchase', 'customer')?.decorators).toContainEqual(
      expect.objectContaining({ type: 'model', value: 'Customer' }),
    );
  });

  it('resolves f.object over the handle of a .cerial object', () => {
    expect(field('Purchase', 'plain')).toMatchObject({ type: 'object', objectName: 'Plain' });
  });
});

describe('the merged declarations', () => {
  it('hold both forms, ordered by file path', () => {
    const files = built.combinedAST.models.map((m) => m.origin.file.split('/').pop());

    expect(files).toEqual(['orders.schema.ts', 'shop.cerial', 'shop.cerial']);
    expect(built.combinedAST.models.map((m) => m.name)).toEqual(['Purchase', 'Customer', 'Shop']);
    expect(built.combinedAST.source).toBe('');
  });

  it('contribute nothing from a module with no declaration', () => {
    const origins = [built.combinedAST.models, built.combinedAST.objects].flat().map((d) => d.origin.file);

    expect(origins.some((file) => file.endsWith('notes.schema.ts'))).toBe(false);
  });

  it('pass a duplicate name to the existing validator unchanged', async () => {
    const dir = await mixedProject({
      'a.cerial': 'object Address {\n  city String\n}\n',
      'x.schema.ts':
        "import { f, object } from 'cerial/schema';\nexport const Address = object('Address', { street: f.string() });\n",
    });

    const result = await buildResolvedSchemaAst({ schemaPath: dir });

    expect(result.combinedAST.objects.map((o) => o.name)).toEqual(['Address', 'Address']);
    expect(result.extendsErrors.map((e) => e.message).join('\n')).toContain('Address');
    expect(result.resolvedAST).toBeNull();
  });
});

// Each case starts from the edited .cerial file on a clean checkout: a second run in one process would reuse the
// module cache, which the watcher avoids by regenerating in a child process
describe('a stale handle through generate', () => {
  const outputDir = (dir: string): string => join(dir, 'out');

  async function failure(run: Promise<{ errors: string[] }>): Promise<string> {
    return run.then(
      (r) => r.errors.join('\n'),
      (e: unknown) => (e instanceof CerialGenerationError ? e.message : String(e)),
    );
  }

  it('names a renamed model as renamed or removed', async () => {
    const dir = await mixedProject({
      'shop.cerial': SHOP_CERIAL.replaceAll('Customer', 'Client'),
      'orders.schema.ts': ORDERS_MODULE,
    });

    const message = await failure(
      generateSingleSchema({ schemaPath: dir, outputDir: outputDir(dir), logLevel: 'minimal' }),
    );

    expect(message).toContain("'Customer'");
    expect(message).toContain('renamed or removed');
  });

  it('names a removed field as a missing member', async () => {
    const dir = await mixedProject({
      'shop.cerial': SHOP_CERIAL.replace('  m Int\n', ''),
      'orders.schema.ts': `${ORDERS_MODULE}export const Slim = object('Slim', { label: f.string() }, { extends: Plain.pick('m') });\n`,
    });

    const message = await failure(
      generateSingleSchema({ schemaPath: dir, outputDir: outputDir(dir), logLevel: 'minimal' }),
    );

    expect(message).toContain("has no member 'm'");
    expect(message).not.toContain('renamed or removed');
  });
});
