import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { findFolderConfigs } from '../../../../src/cli/config';

const FIXTURES = resolve(__dirname, '../../../fixtures/config-discovery');
let marker: string;

beforeEach(() => {
  marker = join(tmpdir(), `cerial-discovery-marker-${process.pid}-${Date.now()}`);
  process.env.CERIAL_DISCOVERY_MARKER = marker;
});

afterEach(() => {
  delete process.env.CERIAL_DISCOVERY_MARKER;
  rmSync(marker, { force: true });
});

describe('findFolderConfigs discovery bounds', () => {
  it('does not execute a config in an unrelated subdirectory', async () => {
    const results = await findFolderConfigs(resolve(FIXTURES, 'hostile'));

    expect(existsSync(marker)).toBe(false);
    expect(results).toHaveLength(0);
  });

  it('still discovers configs under a default schema directory and in direct children', async () => {
    const results = await findFolderConfigs(resolve(FIXTURES, 'legit'));

    expect(results.map((r) => basename(r.dir)).sort()).toEqual(['auth', 'cms']);
    expect(existsSync(marker)).toBe(true);
  });

  it('surfaces an invalid folder config instead of dropping it', async () => {
    await expect(findFolderConfigs(resolve(FIXTURES, 'typo'))).rejects.toThrow(/Invalid folder config in .*cms/);
  });

  it('skips a root-style config found in a subdirectory', async () => {
    const results = await findFolderConfigs(resolve(FIXTURES, 'root-style'));

    expect(results).toHaveLength(0);
  });

  it('returns nothing for a working directory that does not exist', async () => {
    expect(await findFolderConfigs(resolve(FIXTURES, 'missing-dir'))).toEqual([]);
  });
});
