import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { loadConfig, resolveConfig } from '../../../src/cli/config';
import { generateMultiSchema } from '../../../src/cli/generate';
import { cleanupTempDir, createTempOutputDir, getFixturePath } from '../../fixtures/multi-schema/helpers';

/** Generate a fixture's entries into a temp directory and return the refusal message. */
async function refusalOf(fixture: string): Promise<string> {
  const tempDir = await createTempOutputDir();
  try {
    const fixtureDir = getFixturePath(fixture);
    const config = await loadConfig(join(fixtureDir, 'cerial.config.ts'));
    const entries = resolveConfig(config!, fixtureDir).map((entry) => ({
      ...entry,
      output: join(tempDir, entry.name),
    }));

    try {
      await generateMultiSchema(entries, { logLevel: 'minimal' });
    } catch (error) {
      return (error as Error).message;
    }
    throw new Error(`Expected '${fixture}' to be refused, but it generated`);
  } finally {
    await cleanupTempDir(tempDir);
  }
}

describe('two schema entries declaring the same model name', () => {
  // Two clients sharing one table, and every runtime case that depended on it, is unreachable by construction.
  it('refuses, naming the model, both entries and the table', async () => {
    const message = await refusalOf('same-name');

    expect(message).toContain("table 'ms_rt_shared'");
    expect(message).toContain("model 'MsRtShared' in entry 'one'");
    expect(message).toContain("model 'MsRtShared' in entry 'two'");
  });
});

describe('two schema entries whose model names converge on one table', () => {
  it('refuses on the resolved table name, naming each differing model name', async () => {
    const message = await refusalOf('converging-names');

    expect(message).toContain("table 'user_account'");
    expect(message).toContain("model 'UserAccount' in entry 'one'");
    expect(message).toContain("model 'userAccount' in entry 'two'");
  });
});

describe('overlapping schema paths in one config', () => {
  it('refuses the config and names both paths', async () => {
    const dir = getFixturePath('overlapping');

    await expect(loadConfig(`${dir}/cerial.config.ts`)).rejects.toThrow(
      /Schema paths overlap: "\.\/schemas\/auth" and "\.\/schemas"/,
    );
  });
});
