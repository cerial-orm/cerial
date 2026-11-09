import { describe, expect, test } from 'bun:test';
import { readdirSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';
import { lossyCase } from '../../../../src/cli/convert/lossy-cases';
import { scanModules } from '../../../../src/cli/convert/scan-module';
import type { ScanHit } from '../../../../src/cli/convert/scan-module';

const FIXTURES = join(import.meta.dir, '..', '..', '..', 'fixtures', 'convert', 'scan');
const TWINS = join(import.meta.dir, '..', '..', '..', 'e2e', 'schemas-ts');
const at = (...parts: string[]): string => join(FIXTURES, ...parts);
const summary = (hits: readonly ScanHit[]): Array<[string, string | null, string | null, string]> =>
  hits.map((hit) => [hit.id, hit.declaration, hit.field, basename(hit.file)]);

function twinFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);

    return statSync(path).isDirectory() ? twinFiles(path) : path.endsWith('.schema.ts') ? [path] : [];
  });
}

describe('scanModules: shapes the AST cannot show', () => {
  test('a declaration bound to a helper in another file', async () => {
    const hits = await scanModules([at('helper', 'entry.ts')]);

    expect(summary(hits)).toEqual([['helper-built-declaration', 'User', null, 'entry.ts']]);
    expect(lossyCase(hits[0]!.id).action).toBe('expand');
  });

  test('a computed value in a helper body in another file is attributed by file and position', async () => {
    const hits = await scanModules([at('helper', 'stamped-entry.ts')]);

    expect(summary(hits)).toEqual([
      ['helper-built-declaration', 'Stamped', null, 'stamped-entry.ts'],
      ['computed-value', null, null, 'stamped.ts'],
    ]);
    const computed = hits.find((hit) => hit.id === 'computed-value')!;
    expect(computed.line).toBe(4);
    expect(computed.column).toBeGreaterThan(1);
  });

  test('a shared field in a field map', async () => {
    expect(summary(await scanModules([at('shared-field.ts')]))).toEqual([
      ['shared-field-set', 'Shared', 'name', 'shared-field.ts'],
    ]);
  });

  test('a partial chain over a held builder', async () => {
    expect(summary(await scanModules([at('partial-chain.ts')]))).toEqual([
      ['shared-field-set', 'Partial', 'name', 'partial-chain.ts'],
    ]);
  });

  test('a spread in a field map', async () => {
    expect(summary(await scanModules([at('spread.ts')]))).toEqual([['shared-field-set', 'Spread', null, 'spread.ts']]);
  });

  test('a ternary choosing between declarations refuses', async () => {
    const hits = await scanModules([at('conditional.ts')]);

    expect(summary(hits)).toEqual([['conditional-structure', 'Choice', null, 'conditional.ts']]);
    expect(lossyCase(hits[0]!.id).action).toBe('refuse');
  });

  test('a conditional field value', async () => {
    expect(summary(await scanModules([at('conditional-field.ts')]))).toEqual([
      ['conditional-structure', 'Maybe', 'extra', 'conditional-field.ts'],
    ]);
  });

  test('.default(CONFIG.x)', async () => {
    const hits = await scanModules([at('default-config.ts')]);

    expect(summary(hits)).toEqual([['computed-value', 'Configured', 'name', 'default-config.ts']]);
    expect(lossyCase(hits[0]!.id).action).toBe('refuse');
  });

  test('.default(compute())', async () => {
    expect(summary(await scanModules([at('default-compute.ts')]))).toEqual([
      ['computed-value', 'Computed', 'name', 'default-compute.ts'],
    ]);
  });

  test('a template string with a substitution', async () => {
    expect(summary(await scanModules([at('template-substitution.ts')]))).toEqual([
      ['computed-value', 'Templated', 'name', 'template-substitution.ts'],
    ]);
  });

  test('a declaration from a loop bound to exports', async () => {
    const hits = await scanModules([at('loop.ts')]);

    expect(summary(hits)).toEqual([['loop-built-model', 'Alpha, Beta', null, 'loop.ts']]);
    expect(lossyCase(hits[0]!.id).action).toBe('expand');
  });

  test('a field set imported from a package refuses', async () => {
    const hits = await scanModules([at('npm-fields.ts')]);

    expect(summary(hits)).toEqual([['npm-field-set', 'Packaged', null, 'npm-fields.ts']]);
    expect(lossyCase(hits[0]!.id).action).toBe('refuse');
  });

  test('an export assigned after its declaration', async () => {
    expect(summary(await scanModules([at('reassigned.ts')])).map((row) => row[0])).toContain('reassigned-export');
  });

  test('a tagged template is still a hit', async () => {
    expect(summary(await scanModules([at('tagged-template.ts')]))).toEqual([
      ['computed-value', 'Tagged', 'name', 'tagged-template.ts'],
    ]);
  });

  test('new X() is still a hit', async () => {
    expect(summary(await scanModules([at('new-expression.ts')]))).toEqual([
      ['computed-value', 'Seeded', 'name', 'new-expression.ts'],
    ]);
  });

  test('every hit id is a LOSSY_CASES row with a position', async () => {
    const hits = await scanModules([at('shared-field.ts'), at('default-config.ts'), at('loop.ts')]);

    expect(hits.length).toBe(3);
    for (const hit of hits) {
      expect(() => lossyCase(hit.id)).not.toThrow();
      expect(hit.line).toBeGreaterThan(0);
      expect(hit.column).toBeGreaterThan(0);
      expect(hit.message).toContain(hit.declaration!.split(',')[0]!);
    }
  });
});

describe('scanModules: entry mode', () => {
  test('a hit in a module only the entry imports is found', async () => {
    const hits = await scanModules([at('entry', 'schema.ts')]);

    expect(summary(hits)).toEqual([['computed-value', 'Inner', 'name', 'inner.ts']]);
  });
});

describe('scanModules: no false positives', () => {
  test('literals, constants of literals, handle references and thunks yield nothing', async () => {
    expect(await scanModules([at('literals.ts')])).toEqual([]);
  });

  test('aliases, namespace imports and project re-exports of the builder yield nothing', async () => {
    expect(await scanModules([at('alias.ts')])).toEqual([]);
  });

  test('a project module that only looks like the builder is not trusted', async () => {
    const hits = await scanModules([at('lookalike', 'user.ts')]);

    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((hit) => hit.declaration === 'User' || hit.file.endsWith('src/schema/index.ts'))).toBe(true);
  });

  test('every e2e TypeScript twin yields nothing', async () => {
    const files = twinFiles(TWINS);
    expect(files.length).toBeGreaterThan(0);

    const hits = await scanModules(files, {
      isBuilderSpecifier: (specifier) => specifier.endsWith('/src/schema'),
    });

    expect(summary(hits)).toEqual([]);
  });
});
