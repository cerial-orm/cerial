/**
 * typeFiles config tests
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { CerialConfig } from '../../../../src/cli/config';
import {
  defineConfig,
  loadConfig,
  resolveConfig,
  validateConfig,
  validateFolderConfig,
} from '../../../../src/cli/config';
import { applyFolderOverridesAndDiscover } from '../../../../src/cli/discovery';

const PROJECT_TMP = resolve(__dirname, '../../../../tmp-schema-generates');
let TMP_ROOT: string;

beforeAll(async () => {
  TMP_ROOT = join(PROJECT_TMP, `cerial-type-files-${Date.now()}`);
  await mkdir(TMP_ROOT, { recursive: true });
});

afterAll(async () => {
  await rm(TMP_ROOT, { recursive: true, force: true });
});

const MESSAGE = "typeFiles must be 'dts' or 'ts'";

describe('typeFiles validation', () => {
  it('accepts both values at the root', () => {
    for (const typeFiles of ['dts', 'ts'] as const) {
      const result = validateConfig({ schema: './schemas', output: './client', typeFiles });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('refuses a bad value at the root, naming the field', () => {
    const result = validateConfig({ schema: './schemas', output: './client', typeFiles: 'js' } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ field: 'typeFiles', message: MESSAGE }]);
  });

  it('accepts both values in a schema entry', () => {
    for (const typeFiles of ['dts', 'ts'] as const) {
      const result = validateConfig({ schemas: { auth: { path: './a.cerial', output: './out', typeFiles } } });

      expect(result.valid).toBe(true);
    }
  });

  it('refuses a bad value in a schema entry, naming the entry', () => {
    const result = validateConfig({
      schemas: { auth: { path: './a.cerial', output: './out', typeFiles: 'DTS' } },
    } as never);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ field: 'schemas.auth.typeFiles', message: MESSAGE }]);
  });

  it('accepts both values in a folder config', () => {
    for (const typeFiles of ['dts', 'ts']) {
      expect(validateFolderConfig({ typeFiles }).valid).toBe(true);
    }
  });

  it('refuses a bad value in a folder config', () => {
    const result = validateFolderConfig({ typeFiles: true });

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual([{ field: 'typeFiles', message: MESSAGE }]);
  });
});

describe('typeFiles resolution', () => {
  it('resolves to the default when absent', () => {
    expect(resolveConfig({ schema: './s', output: './o' })[0]!.typeFiles).toBe('ts');
    expect(resolveConfig({ schemas: { a: { path: './a', output: './o' } } })[0]!.typeFiles).toBe('ts');
  });

  it('carries the root value into the single-schema shorthand', () => {
    expect(resolveConfig({ schema: './s', typeFiles: 'dts' })[0]!.typeFiles).toBe('dts');
  });

  it('inherits the root value in a schema entry', () => {
    const [entry] = resolveConfig({ typeFiles: 'dts', schemas: { a: { path: './a', output: './o' } } });

    expect(entry!.typeFiles).toBe('dts');
  });

  it('lets an entry override the root in both directions', () => {
    const toTs = resolveConfig({ typeFiles: 'dts', schemas: { a: { path: './a', typeFiles: 'ts' } } });
    const toDts = resolveConfig({ typeFiles: 'ts', schemas: { a: { path: './a', typeFiles: 'dts' } } });

    expect(toTs[0]!.typeFiles).toBe('ts');
    expect(toDts[0]!.typeFiles).toBe('dts');
  });

  it('lets a folder config set its own, over the entry', async () => {
    const dir = join(TMP_ROOT, 'folder-set');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'cerial.config.json'), JSON.stringify({ typeFiles: 'dts' }));

    const entries = resolveConfig({ schemas: { a: { path: dir, output: './o', typeFiles: 'ts' } } }, TMP_ROOT);
    const merged = await applyFolderOverridesAndDiscover(entries, TMP_ROOT);

    expect(merged.find((e) => e.name === 'a')!.typeFiles).toBe('dts');
  });

  it('keeps the entry value when the folder config says nothing', async () => {
    const dir = join(TMP_ROOT, 'folder-silent');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'cerial.config.json'), JSON.stringify({}));

    const entries = resolveConfig({ schemas: { a: { path: dir, output: './o', typeFiles: 'dts' } } }, TMP_ROOT);
    const merged = await applyFolderOverridesAndDiscover(entries, TMP_ROOT);

    expect(merged.find((e) => e.name === 'a')!.typeFiles).toBe('dts');
  });

  it('sets a folder-config-only schema from its folder config, else the default', async () => {
    const root = join(TMP_ROOT, 'discovered-root');
    const dir = join(root, 'discovered');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'cerial.config.json'), JSON.stringify({ typeFiles: 'dts' }));
    expect((await applyFolderOverridesAndDiscover([], root)).find((e) => e.name === 'discovered')!.typeFiles).toBe(
      'dts',
    );

    const bareRoot = join(TMP_ROOT, 'discovered-bare-root');
    const bare = join(bareRoot, 'discovered-bare');
    await mkdir(bare, { recursive: true });
    await writeFile(join(bare, 'cerial.config.json'), JSON.stringify({}));
    const found = await applyFolderOverridesAndDiscover([], bareRoot);

    expect(found.find((e) => e.name === 'discovered-bare')!.typeFiles).toBe('ts');
  });
});

describe('typeFiles in both config formats', () => {
  it('loads and resolves a .json config', async () => {
    const dir = join(TMP_ROOT, 'json');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'cerial.config.json');
    await writeFile(path, JSON.stringify({ schema: './s', output: './o', typeFiles: 'dts' }));

    const config = await loadConfig(path);

    expect(resolveConfig(config!, dir)[0]!.typeFiles).toBe('dts');
  });

  it('refuses a bad value in a .json config', async () => {
    const dir = join(TMP_ROOT, 'json-bad');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'cerial.config.json');
    await writeFile(path, JSON.stringify({ schema: './s', output: './o', typeFiles: 'js' }));

    await expect(loadConfig(path)).rejects.toThrow(MESSAGE);
  });

  it('loads and resolves a .ts config, absent key giving the default', async () => {
    const dir = join(TMP_ROOT, 'ts');
    await mkdir(dir, { recursive: true });
    const withKey = join(dir, 'with.config.ts');
    await writeFile(withKey, "export default { schema: './s', output: './o', typeFiles: 'dts' };\n");
    const without = join(dir, 'cerial.config.ts');
    await writeFile(without, "export default { schema: './s', output: './o' };\n");

    expect(resolveConfig((await loadConfig(withKey))!, dir)[0]!.typeFiles).toBe('dts');
    expect(resolveConfig((await loadConfig(without))!, dir)[0]!.typeFiles).toBe('ts');
  });

  it('refuses a bad value in a .ts config', async () => {
    const dir = join(TMP_ROOT, 'ts-bad');
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'cerial.config.ts');
    await writeFile(path, "export default { schema: './s', output: './o', typeFiles: 'js' };\n");

    await expect(loadConfig(path)).rejects.toThrow(MESSAGE);
  });
});

describe('typeFiles through defineConfig', () => {
  it('accepts both values and rejects a third', () => {
    const configs: CerialConfig[] = [
      defineConfig({ schema: './s', typeFiles: 'dts' }),
      defineConfig({ schema: './s', typeFiles: 'ts' }),
      defineConfig({ schemas: { a: { path: './a', typeFiles: 'dts' } } }),
    ];
    // @ts-expect-error -- 'js' is outside the 'dts' | 'ts' union; the validator refuses it at runtime too
    const bad: CerialConfig = defineConfig({ schema: './s', typeFiles: 'js' });

    expect(configs).toHaveLength(3);
    expect(bad.schema).toBe('./s');
  });
});
