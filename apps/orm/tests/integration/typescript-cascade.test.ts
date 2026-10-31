/**
 * The filter cascade through the real `cerial generate`, for TypeScript schemas. Needs no database.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { modelModule, removeTempProjects, SCHEMA_SRC, tempProject } from '../registration-project';

afterAll(removeTempProjects);

const BIN = resolve(import.meta.dir, '../../bin/cerial.ts');

async function cerial(cwd: string, ...args: string[]): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([process.execPath, 'run', BIN, 'generate', '-y', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { code: await proc.exited, output: stdout + stderr };
}

async function generated(out: string): Promise<string> {
  const files = await readdir(out, { recursive: true });
  const texts = await Promise.all(files.filter((f) => f.endsWith('.ts')).map((f) => readFile(join(out, f), 'utf8')));

  return texts.join('\n');
}

const ENTRY = `import { defineSchema } from '${SCHEMA_SRC}';
import { Audit } from './audit';
import { Draft } from './drafts/draft';

export default defineSchema({ models: [Audit, Draft] });
`;

const project = (config: string): Promise<string> =>
  tempProject({
    'cerial.config.ts': config,
    'src/schema.ts': ENTRY,
    'src/audit.ts': modelModule('Audit'),
    'src/drafts/draft.ts': modelModule('Draft'),
  });

describe('cerial generate with a TypeScript schema and the filter cascade', () => {
  it('registers an imported module when nothing excludes it', async () => {
    const dir = await project("export default { schemas: { app: { entry: './src/schema.ts', output: './out' } } };\n");

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('Audit');
    expect(text).toContain('Draft');
  }, 60_000);

  it('leaves out an imported module its config excludes, though the entry lists it', async () => {
    const dir = await project(
      "export default { schemas: { app: { entry: './src/schema.ts', exclude: ['drafts/**'], output: './out' } } };\n",
    );

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('Audit');
    expect(text).not.toContain('Draft');
  }, 60_000);

  it('leaves it out for a root .cerialignore too', async () => {
    const dir = await tempProject({
      'cerial.config.ts': "export default { schemas: { app: { entry: './src/schema.ts', output: './out' } } };\n",
      '.cerialignore': 'drafts/\n',
      'src/schema.ts': ENTRY,
      'src/audit.ts': modelModule('Audit'),
      'src/drafts/draft.ts': modelModule('Draft'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    expect(await generated(join(dir, 'out'))).not.toContain('Draft');
  }, 60_000);

  it('applies .cerialignore under -s', async () => {
    const dir = await tempProject({
      '.cerialignore': 'drafts/\n',
      'schemas/audit.schema.ts': modelModule('Audit'),
      'schemas/drafts/draft.schema.ts': modelModule('Draft'),
    });

    const { code, output } = await cerial(dir, '-s', './schemas', '-o', './out');

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('Audit');
    expect(text).not.toContain('Draft');
  }, 60_000);

  it('names the entry when the config excludes it', async () => {
    const dir = await project(
      "export default { schemas: { app: { entry: './src/schema.ts', exclude: ['schema.ts'], output: './out' } } };\n",
    );

    const { code, output } = await cerial(dir);

    expect(code).not.toBe(0);
    expect(output).toContain('src/schema.ts');
    expect(output).toContain('excluded');
  }, 60_000);

  it('matches a module outside the entry folder by the pattern written from the config directory', async () => {
    const dir = await tempProject({
      'cerial.config.ts':
        "export default { schemas: { app: { entry: './app/schema.ts', exclude: ['shared/**'], output: './out' } } };\n",
      'app/schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { Audit } from './audit';\nimport { Shared } from '../shared/shared';\n\nexport default defineSchema({ models: [Audit, Shared] });\n`,
      'app/audit.ts': modelModule('Audit'),
      'shared/shared.ts': modelModule('Shared'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('Audit');
    expect(text).not.toContain('Shared');
  }, 60_000);
});
