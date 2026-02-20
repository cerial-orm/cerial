import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { loadCerialIgnore, resolvePathFilter } from '../../../src/cli/filters';
import type { GenerateResult } from '../../../src/cli/generate';
import { generateSingleSchema } from '../../../src/cli/generate';
import { findSchemaRoots } from '../../../src/cli/resolvers';

const TMP = resolve(tmpdir(), `cerial-gen-filter-${Date.now()}`);

/** Minimal valid .cerial schema with a unique model name */
function modelSchema(name: string): string {
  return `model ${name} {\n  id Record @id\n  label String\n}\n`;
}

/** Create schema fixture directory with files */
function setupFixture(
  testId: string,
  schemaFiles: Record<string, string>,
): { base: string; schemas: string; output: string } {
  const base = resolve(TMP, testId);
  const schemas = resolve(base, 'schemas');
  const output = resolve(base, 'output');

  for (const [rel, content] of Object.entries(schemaFiles)) {
    const full = resolve(schemas, rel);
    mkdirSync(resolve(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }

  mkdirSync(output, { recursive: true });

  return { base, schemas, output };
}

/** Check if a model name appears in any generated file */
function generatedContains(result: GenerateResult, modelName: string): boolean {
  for (const file of result.files) {
    try {
      const content = readFileSync(file, 'utf-8');
      if (content.includes(modelName)) return true;
    } catch {}
  }

  return false;
}

beforeAll(() => mkdirSync(TMP, { recursive: true }));
afterAll(() => rmSync(TMP, { recursive: true, force: true }));

describe('generate pipeline filter integration', () => {
  // Scenario 1: Root .cerialignore excludes file
  it('should exclude files listed in root .cerialignore', async () => {
    const { base, schemas, output } = setupFixture('cerialignore-exclude', {
      'main.cerial': modelSchema('CiMainModel'),
      'draft.cerial': modelSchema('CiDraftModel'),
    });

    writeFileSync(resolve(base, '.cerialignore'), 'draft.cerial\n');

    const rootIgnore = await loadCerialIgnore(base);
    const filter = resolvePathFilter({
      rootCerialIgnore: rootIgnore!,
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'CiMainModel')).toBe(true);
    expect(generatedContains(result, 'CiDraftModel')).toBe(false);
  });

  // Scenario 2: Root config include overrides .cerialignore
  it('should allow root include to override .cerialignore exclusion', async () => {
    const { base, schemas, output } = setupFixture('include-override', {
      'main.cerial': modelSchema('IoMainModel'),
      'draft.cerial': modelSchema('IoDraftModel'),
    });

    writeFileSync(resolve(base, '.cerialignore'), 'draft.cerial\n');

    const rootIgnore = await loadCerialIgnore(base);
    const filter = resolvePathFilter({
      rootCerialIgnore: rootIgnore!,
      rootConfig: { include: ['draft.cerial'] },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'IoMainModel')).toBe(true);
    expect(generatedContains(result, 'IoDraftModel')).toBe(true);
  });

  // Scenario 3: Root config ignore is absolute — include cannot override
  it('should treat root ignore as absolute blacklist that include cannot override', async () => {
    const { schemas, output } = setupFixture('ignore-absolute', {
      'main.cerial': modelSchema('IaMainModel'),
      'secret.cerial': modelSchema('IaSecretModel'),
    });

    const filter = resolvePathFilter({
      rootConfig: {
        ignore: ['secret.cerial'],
        include: ['secret.cerial'],
      },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'IaMainModel')).toBe(true);
    expect(generatedContains(result, 'IaSecretModel')).toBe(false);
  });

  // Scenario 4: Root config exclude with directory pattern
  it('should exclude files matching root exclude directory pattern', async () => {
    const { schemas, output } = setupFixture('root-exclude', {
      'main.cerial': modelSchema('ReMainModel'),
      'temp/test.cerial': modelSchema('ReTempModel'),
      'temp/extra.cerial': modelSchema('ReExtraModel'),
    });

    const filter = resolvePathFilter({
      rootConfig: { exclude: ['temp/**'] },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'ReMainModel')).toBe(true);
    expect(generatedContains(result, 'ReTempModel')).toBe(false);
    expect(generatedContains(result, 'ReExtraModel')).toBe(false);
  });

  // Scenario 5: Per-schema exclude + include override
  it('should apply per-schema exclude with include override for specific file', async () => {
    const { schemas, output } = setupFixture('schema-exclude-include', {
      'main.cerial': modelSchema('SeiMainModel'),
      'generated/auto.cerial': modelSchema('SeiAutoModel'),
      'generated/keep.cerial': modelSchema('SeiKeepModel'),
    });

    const filter = resolvePathFilter({
      schemaConfig: {
        exclude: ['generated/**'],
        include: ['generated/keep.cerial'],
      },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'SeiMainModel')).toBe(true);
    expect(generatedContains(result, 'SeiAutoModel')).toBe(false);
    expect(generatedContains(result, 'SeiKeepModel')).toBe(true);
  });

  // Scenario 6: Folder .cerialignore excludes file
  it('should exclude files listed in folder .cerialignore', async () => {
    const { schemas, output } = setupFixture('folder-cerialignore', {
      'main.cerial': modelSchema('FcMainModel'),
      'internal.cerial': modelSchema('FcInternalModel'),
    });

    writeFileSync(resolve(schemas, '.cerialignore'), 'internal.cerial\n');

    const folderIgnore = await loadCerialIgnore(schemas);
    const filter = resolvePathFilter({
      folderCerialIgnore: folderIgnore!,
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'FcMainModel')).toBe(true);
    expect(generatedContains(result, 'FcInternalModel')).toBe(false);
  });

  // Scenario 7: Folder config include overrides folder .cerialignore
  it('should allow folder include to override folder .cerialignore', async () => {
    const { schemas, output } = setupFixture('folder-include-override', {
      'main.cerial': modelSchema('FioMainModel'),
      'internal.cerial': modelSchema('FioInternalModel'),
    });

    writeFileSync(resolve(schemas, '.cerialignore'), 'internal.cerial\n');

    const folderIgnore = await loadCerialIgnore(schemas);
    const filter = resolvePathFilter({
      folderCerialIgnore: folderIgnore!,
      folderConfig: { include: ['internal.cerial'] },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'FioMainModel')).toBe(true);
    expect(generatedContains(result, 'FioInternalModel')).toBe(true);
  });

  // Scenario 8: No filters → all schemas generated (backward compat)
  it('should generate all schemas when no filters are applied', async () => {
    const { schemas, output } = setupFixture('no-filters', {
      'alpha.cerial': modelSchema('NfAlphaModel'),
      'beta.cerial': modelSchema('NfBetaModel'),
      'gamma.cerial': modelSchema('NfGammaModel'),
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'NfAlphaModel')).toBe(true);
    expect(generatedContains(result, 'NfBetaModel')).toBe(true);
    expect(generatedContains(result, 'NfGammaModel')).toBe(true);
  });

  // Scenario 9: -s flag + root .cerialignore (simulated via filter from cerialignore)
  it('should apply root .cerialignore filter in -s flag path', async () => {
    const { base, schemas, output } = setupFixture('s-flag-cerialignore', {
      'alpha.cerial': modelSchema('SfAlphaModel'),
      'excluded.cerial': modelSchema('SfExcludedModel'),
    });

    // Simulate: .cerialignore at cwd (base) level — same as buildRootFilter(cwd)
    writeFileSync(resolve(base, '.cerialignore'), 'excluded.cerial\n');

    const rootIgnore = await loadCerialIgnore(base);
    const filter = resolvePathFilter({
      rootCerialIgnore: rootIgnore!,
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'SfAlphaModel')).toBe(true);
    expect(generatedContains(result, 'SfExcludedModel')).toBe(false);
  });

  // Scenario 10: Convention marker in ignored directory not discovered
  it('should not discover convention markers in excluded directories', async () => {
    const base = resolve(TMP, 'marker-ignored');
    mkdirSync(resolve(base, 'active'), { recursive: true });
    mkdirSync(resolve(base, 'ignored'), { recursive: true });

    writeFileSync(resolve(base, 'active/schema.cerial'), modelSchema('MiActiveModel'));
    writeFileSync(resolve(base, 'ignored/schema.cerial'), modelSchema('MiIgnoredModel'));

    const filter = resolvePathFilter({
      rootConfig: { exclude: ['ignored/**'] },
      basePath: base,
    });

    const roots = await findSchemaRoots(base, filter);
    const rootPaths = roots.map((r) => r.path);

    expect(rootPaths).toContain(resolve(base, 'active'));
    expect(rootPaths).not.toContain(resolve(base, 'ignored'));
  });

  // Scenario 11: All files excluded → "No schema files found"
  it('should fail with no-schema-files error when all files are excluded', async () => {
    const { schemas, output } = setupFixture('all-excluded', {
      'only.cerial': modelSchema('AeOnlyModel'),
    });

    const filter = resolvePathFilter({
      rootConfig: { exclude: ['*.cerial'] },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(false);
    expect(result.errors).toContain('No schema files found');
  });

  // Scenario 12: Cross-level — schema include cannot override root exclude
  it('should not allow schema include to rescue from root exclude', async () => {
    const { schemas, output } = setupFixture('cross-level', {
      'main.cerial': modelSchema('ClMainModel'),
      'excluded.cerial': modelSchema('ClExcludedModel'),
    });

    const filter = resolvePathFilter({
      rootConfig: { exclude: ['excluded.cerial'] },
      schemaConfig: { include: ['excluded.cerial'] },
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'ClMainModel')).toBe(true);
    expect(generatedContains(result, 'ClExcludedModel')).toBe(false);
  });

  // Scenario 13: .cerialignore with comments and blank lines
  it('should handle .cerialignore with comments and blank lines', async () => {
    const { base, schemas, output } = setupFixture('cerialignore-comments', {
      'main.cerial': modelSchema('CcMainModel'),
      'draft.cerial': modelSchema('CcDraftModel'),
      'keep.cerial': modelSchema('CcKeepModel'),
    });

    writeFileSync(resolve(base, '.cerialignore'), '# This is a comment\n\ndraft.cerial\n\n# Another comment\n');

    const rootIgnore = await loadCerialIgnore(base);
    const filter = resolvePathFilter({
      rootCerialIgnore: rootIgnore!,
      basePath: schemas,
    });

    const result = await generateSingleSchema({
      schemaPath: schemas,
      outputDir: output,
      filter,
      logLevel: 'minimal',
    });

    expect(result.success).toBe(true);
    expect(generatedContains(result, 'CcMainModel')).toBe(true);
    expect(generatedContains(result, 'CcDraftModel')).toBe(false);
    expect(generatedContains(result, 'CcKeepModel')).toBe(true);
  });
});
