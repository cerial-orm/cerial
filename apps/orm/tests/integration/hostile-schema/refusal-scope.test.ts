/**
 * What a refusal covers: abstract models, which generate never emits but the editor validates, literal
 * string values, and the generated handles module a mixed entry writes before it can know the schema is bad.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { mixedProject, removeMixedProjects } from '../mixed-merge-project';
import { cleanupFixtures, generateFixture } from './helpers';

afterAll(async () => {
  await cleanupFixtures();
  await removeMixedProjects();
});

const BIN = resolve(import.meta.dir, '../../../bin/cerial.ts');
const HOST = 'model Host {\n  id Record @id\n  name String\n}\n';

describe('abstract models', () => {
  it('refuses a digit-led abstract model name', async () => {
    const result = await generateFixture({ 'a.cerial': `${HOST}\nabstract model 1Base {\n  id Record @id\n}\n` });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('"1Base"');
    expect(result.output.filter((f) => f !== '.cerial-output.json')).toEqual([]);
  });

  it('refuses a prototype abstract model name and field', async () => {
    const source = `${HOST}\nabstract model constructor {\n  __proto__ String\n}\n`;
    const result = await generateFixture({ 'a.cerial': source });

    expect(result.exitCode).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('"constructor"');
    expect(result.stdout + result.stderr).toContain('"__proto__"');
  });

  it('still generates an abstract model with plain names', async () => {
    const result = await generateFixture({ 'a.cerial': `${HOST}\nabstract model Base {\n  note String?\n}\n` });

    expect(result.exitCode).toBe(0);
  });
});

describe('literal values', () => {
  it.each(['__proto__', 'constructor', 'prototype', 'toString', 'valueOf'])(
    'refuses the literal value %s',
    async (value) => {
      const result = await generateFixture({ 'a.cerial': `${HOST}\nliteral L { '${value}', 'a' }\n` });

      expect(result.exitCode).not.toBe(0);
      expect(result.stdout + result.stderr).toContain(`"${value}"`);
    },
  );

  it('accepts a literal value that only resembles a prototype member', async () => {
    const result = await generateFixture({ 'a.cerial': `${HOST}\nliteral L { 'toStringx', 'a' }\n` });

    expect(result.exitCode).toBe(0);
  });
});

describe('handles module of a mixed entry', () => {
  const MODULE = `import { f, model } from 'cerial/schema';
import { Pt } from './cerial/handles';

export const Other = model('Other', { id: f.record('int').id(), at: f.object(Pt) });
`;

  async function generateMixed(cerial: string): Promise<{ dir: string; code: number; output: string }> {
    const dir = await mixedProject({
      'cerial.config.ts': "export default { schema: './schema', output: './client' };\n",
      'schema/account.cerial': cerial,
      'schema/other.schema.ts': MODULE,
    });
    const proc = Bun.spawn([process.execPath, 'run', BIN, 'generate', '-y'], {
      cwd: dir,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

    return { dir, code: await proc.exited, output: stdout + stderr };
  }

  it('leaves no handles.ts behind when the schema is refused', async () => {
    const run = await generateMixed('object Pt {\n  n Int\n}\nenum Role { ADMIN, __proto__ }\n');

    expect(run.code).not.toBe(0);
    expect(run.output).toContain('__proto__');
    expect(existsSync(join(run.dir, 'schema/cerial/handles.ts'))).toBe(false);
  });

  it('leaves no handles.ts behind when only a literal value is refused', async () => {
    const run = await generateMixed("object Pt {\n  n Int\n}\nliteral L {\n  '__proto__',\n  'a'\n}\n");

    expect(run.code).not.toBe(0);
    expect(run.output).toContain('Invalid literal value');
    expect(existsSync(join(run.dir, 'schema/cerial/handles.ts'))).toBe(false);
  });

  it('keeps the handles module when the schema is accepted', async () => {
    const run = await generateMixed('object Pt {\n  n Int\n}\n');

    expect(run.code, run.output).toBe(0);
    expect(existsSync(join(run.dir, 'schema/cerial/handles.ts'))).toBe(true);
  });
});
