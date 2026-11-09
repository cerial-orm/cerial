/**
 * The built CLI generating in a project that has TypeScript 7 installed, whose JS entry has no compiler API.
 * Needs no database, but needs `bun run build`: it runs the copy of `dist/bin/cerial.mjs` in the project.
 */

import { afterAll, expect, it } from 'bun:test';
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { typescript7Project } from './typescript-7-project';

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function generate(dir: string): Promise<{ code: number; output: string }> {
  const cli = join(dir, 'node_modules/cerial/dist/bin/cerial.mjs');
  const proc = Bun.spawn(['node', cli, 'generate', '-y'], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()]);

  return { code: await proc.exited, output: stdout + stderr };
}

async function generatedText(out: string): Promise<string> {
  const files = await readdir(out, { recursive: true });
  const texts = await Promise.all(files.filter((f) => f.endsWith('.ts')).map((f) => readFile(join(out, f), 'utf8')));

  return texts.join('\n');
}

it('built the CLI before running', () => {
  expect(existsSync(join(import.meta.dir, '../../dist/bin/cerial.mjs')), 'run `bun run build` first').toBe(true);
});

it('generates from schema modules beside a .cerial file with TypeScript 7 installed', async () => {
  const dir = await typescript7Project(
    {
      'schemas/user.schema.ts': `import { f, model } from 'cerial/schema';
export const User = model('User', { id: f.record().id(), name: f.string() });
`,
      'schemas/post.schema.ts': `import { f, model } from 'cerial/schema';
import { User } from './user.schema';
export const Post = model('Post', { id: f.record().id(), title: f.string(), author: f.relation(() => User).optional() });
`,
      'schemas/tag.cerial': `model Tag {
  id Record @id
  label String
}
`,
    },
    cleanups,
  );
  const { code, output } = await generate(dir);

  expect(code, output).toBe(0);
  const text = await generatedText(join(dir, 'out'));
  expect(text).toContain('Post');
  expect(text).toContain('author');
  expect(text).toContain('Tag');
});

it('parses a module written with syntax TypeScript 7 accepts', async () => {
  const dir = await typescript7Project(
    {
      'schemas/user.schema.ts': `import { f, model } from 'cerial/schema';
import type { Foo } from './types';
const identity = <const T,>(value: T): T => value;
const shape = identity({ id: f.record().id(), name: f.string() }) satisfies Record<string, unknown>;
export const User = model('User', shape);
export type { Foo };
`,
      'schemas/types.ts': 'export type Foo = { readonly a: 1 };\n',
    },
    cleanups,
  );
  const { code, output } = await generate(dir);

  expect(code, output).toBe(0);
  expect(await generatedText(join(dir, 'out'))).toContain('User');
});
