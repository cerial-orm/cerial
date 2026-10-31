/**
 * `cerial generate` through an entry module (`defineSchema`). Needs no database.
 *
 * The CLI runs as a child process in a throwaway project, so config resolution, discovery and the entry
 * all go through the real command. Modules import the authoring surface by absolute path to source.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { generateMultiSchema } from '../../src/cli/generate';
import { resolveConfig, toClientClassName } from '../../src/cli/config';
import { findSchemaRoots } from '../../src/cli/resolvers';
import { runGenerateChild, type CliInvocation } from '../../src/cli/watcher';
import { entryModule, modelModule, removeTempProjects, SCHEMA_SRC, tempProject } from '../registration-project';

afterAll(removeTempProjects);

const FIXTURES = join(import.meta.dir, '../fixtures/typescript-registration');
const BIN = resolve(import.meta.dir, '../../bin/cerial.ts');
const CLI: CliInvocation = { execPath: process.execPath, args: ['run'], entry: BIN };

async function generated(out: string): Promise<string> {
  const files = await readdir(out, { recursive: true });
  const texts = await Promise.all(files.filter((f) => f.endsWith('.ts')).map((f) => readFile(join(out, f), 'utf8')));

  return texts.join('\n');
}

async function cerial(cwd: string, ...args: string[]): Promise<{ code: number; output: string }> {
  const proc = Bun.spawn([process.execPath, 'run', BIN, 'generate', '-y', ...args], {
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { code: await proc.exited, output: stdout + stderr };
}

const config = (entry: string, extra = ''): string =>
  `export default { schemas: { app: { entry: '${entry}', output: './out'${extra} } } };\n`;

describe('a feature-folder project', () => {
  it('generates from schemas[].entry with no schema root, registering a plainly named module', async () => {
    const entries = resolveConfig(
      { schemas: { app: { entry: join(FIXTURES, 'feature-folder/src/schema.ts'), output: './out' } } },
      FIXTURES,
    );
    const out = await tempProject({});
    const result = await generateMultiSchema([{ ...entries[0]!, output: out }], { logLevel: 'minimal' });

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    const text = await generated(out);
    for (const name of ['User', 'Post']) expect(text).toContain(name);
    // A relation across two plainly named modules resolved, and a module nothing imports stayed out
    expect(text).toContain('author');
    expect(text).not.toContain('Ghost');
  });

  it('merges an entry set beside .cerial files', async () => {
    const dir = await tempProject({
      'cerial.config.ts':
        "export default { schemas: { app: { path: './schemas', entry: './src/schema.ts', output: './out' } } };\n",
      'schemas/a.cerial': 'model A {\n  id Record @id\n}\n',
      'src/schema.ts': entryModule(['User']),
      'src/user.ts': modelModule('User'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('User');
    expect(text).toContain('A');
  }, 60_000);

  it('generates through the CLI from a cerial.config.ts naming the entry', async () => {
    const dir = await tempProject({
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': entryModule(['User', 'Post']),
      'src/user.ts': modelModule('User'),
      'src/post.ts': modelModule('Post'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('User');
    expect(text).toContain('Post');
  }, 60_000);

  it('registers modules reached through a re-export barrel and a tsconfig paths alias', async () => {
    const dir = await tempProject({
      'tsconfig.json': JSON.stringify({ compilerOptions: { baseUrl: '.', paths: { '@app/*': ['src/*'] } } }),
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\nimport { User } from '@app/users';\n\nexport default defineSchema({ models: [User] });\n`,
      'src/users/index.ts': "export * from './user';\n",
      'src/users/user.ts': modelModule('User'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    expect(await generated(join(dir, 'out'))).toContain('User');
  }, 60_000);

  it('adds the entry to a path of *.schema.ts files rather than replacing it', async () => {
    const dir = await tempProject({
      'cerial.config.ts':
        "export default { schemas: { app: { path: './schemas', entry: './src/schema.ts', output: './out' } } };\n",
      'schemas/audit.schema.ts': modelModule('Audit'),
      'src/schema.ts': entryModule(['User']),
      'src/user.ts': modelModule('User'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'out'));
    expect(text).toContain('Audit');
    expect(text).toContain('User');
  }, 60_000);
});

describe('a project with no config', () => {
  const files = {
    'cerial.schema.ts': entryModule(['User']).replace("'./user'", "'./src/users/user'"),
    'src/users/user.ts': modelModule('User'),
    'src/users/ghost.ts': modelModule('Ghost'),
  };

  it('finds cerial.schema.ts at the root as the only schema root', async () => {
    const dir = await tempProject(files);

    expect((await findSchemaRoots(dir)).map((r) => r.path)).toEqual([dir]);
  });

  it('generates from it, registering a plainly named module, into <root>/client', async () => {
    const dir = await tempProject(files);

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'client'));
    expect(text).toContain('User');
    expect(text).not.toContain('Ghost');
  }, 60_000);

  it('does not register what a plain *.schema.ts imports', async () => {
    const dir = await tempProject({
      'user.schema.ts': modelModule('User', "import './helper';\n"),
      'helper.ts': modelModule('Helper'),
    });

    const { code, output } = await cerial(dir);

    expect(code, output).toBe(0);
    const text = await generated(join(dir, 'client'));
    expect(text).toContain('User');
    expect(text).not.toContain('Helper');
  }, 60_000);
});

describe('refusals through the CLI', () => {
  async function refused(files: Record<string, string>): Promise<string> {
    const dir = await tempProject(files);
    const { code, output } = await cerial(dir);

    expect(code, output).not.toBe(0);
    expect(await readdir(dir)).not.toContain('out');

    return output;
  }

  it('an entry module that is missing, naming the file', async () => {
    expect(await refused({ 'cerial.config.ts': config('./src/missing.ts') })).toContain('missing.ts');
  }, 60_000);

  it('an entry that exports no defineSchema, naming the file', async () => {
    const output = await refused({
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': modelModule('User'),
    });

    expect(output).toContain('src/schema.ts');
    expect(output).toContain('defineSchema');
  }, 60_000);

  it('neither path nor entry, naming the schema and fields', async () => {
    const output = await refused({ 'cerial.config.ts': "export default { schemas: { app: { output: './out' } } };\n" });

    expect(output).toContain('schemas.app');
    expect(output).toContain("'entry'");
  }, 60_000);

  it('a listed model that is not an exported binding, naming it', async () => {
    const output = await refused({
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': `import { defineSchema, f, model } from '${SCHEMA_SRC}';\n\nexport default defineSchema({ models: [model('Inline', { id: f.record().id() })] });\n`,
    });

    expect(output).toContain('Inline');
  }, 60_000);

  it('a list item that is not a model, naming the position', async () => {
    const output = await refused({
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': `import { defineSchema } from '${SCHEMA_SRC}';\n\nexport default defineSchema({ models: ['User'] as never });\n`,
    });

    expect(output).toContain('models[0]');
  }, 60_000);
});

describe('regenerating an entry in a child process, as the watcher does', () => {
  it('builds the client from the config entry by name', async () => {
    const dir = await tempProject({
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': entryModule(['User']),
      'src/user.ts': modelModule('User'),
    });
    const configPath = join(dir, 'cerial.config.ts');
    const out = join(dir, 'out');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const failure = await runGenerateChild(
        {
          name: 'app',
          schemaPath: join(dir, 'src'),
          outputDir: out,
          clientClassName: toClientClassName('app'),
          configPath,
          entry: join(dir, 'src/schema.ts'),
          entryOnly: true,
        },
        CLI,
      );

      expect(failure).toBeNull();
    } finally {
      process.chdir(cwd);
    }
    expect(await generated(out)).toContain(toClientClassName('app'));
  }, 60_000);

  it('reports the child failing on a bad entry instead of throwing', async () => {
    const dir = await tempProject({
      'cerial.config.ts': config('./src/schema.ts'),
      'src/schema.ts': modelModule('User'),
    });
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const failure = await runGenerateChild(
        {
          name: 'app',
          schemaPath: join(dir, 'src'),
          outputDir: join(dir, 'out'),
          clientClassName: toClientClassName('app'),
          configPath: join(dir, 'cerial.config.ts'),
          entry: join(dir, 'src/schema.ts'),
          entryOnly: true,
        },
        CLI,
      );

      expect(failure).toMatch(/exited with code [1-9]/);
    } finally {
      process.chdir(cwd);
    }
  }, 60_000);
});
