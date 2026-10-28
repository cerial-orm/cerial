import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../../src/cli/generate';

const bases: string[] = [];

afterAll(async () => {
  await Promise.all(bases.map((b) => rm(b, { recursive: true, force: true })));
});

async function run(files: Record<string, string>): Promise<{ errors: string[]; dir: string }> {
  const base = await mkdtemp(join(tmpdir(), 'cerial-errfile-test-'));
  bases.push(base);
  const dir = join(base, 'schemas');
  await Bun.write(join(dir, '.keep'), '');
  for (const [name, content] of Object.entries(files)) await writeFile(join(dir, name), content, 'utf8');
  const result = await generateSingleSchema({ schemaPath: dir, outputDir: join(base, 'out') });

  return { errors: result.errors, dir };
}

describe('generate error file attribution', () => {
  it('blames the file that declares the model, not one whose text merely contains `model <Name>`', async () => {
    const { errors, dir } = await run({
      'a.cerial': 'model UserProfile {\n  id Record @id\n  bio String\n}\n',
      'b.cerial': 'model User {\n  id Record @id\n  otherId String @id\n}\n',
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith(`${join(dir, 'b.cerial')}: `))).toBe(true);
  });

  it('blames the child file for an error in an inherited model', async () => {
    const { errors, dir } = await run({
      'a.cerial':
        'abstract model Base {\n  id Record @id\n  otherId String @id\n}\n\nmodel UserProfile {\n  id Record @id\n}\n',
      'b.cerial': 'model User extends Base {\n  name String\n}\n',
    });

    expect(errors.length).toBeGreaterThan(0);
    expect(errors.every((e) => e.startsWith(`${join(dir, 'b.cerial')}: `))).toBe(true);
  });

  it('prints a parse error as `<path>:<line>: <message>`', async () => {
    const { errors, dir } = await run({ 'post.cerial': 'model User {\n  id Record @id\n  name Bogus\n}\n' });

    expect(errors).toEqual([
      `${join(dir, 'post.cerial')}:3: Invalid field type: Bogus. Use String, Email, Int, Date, Bool, Float, Uuid, Record, Relation, or array types (String[], Int[], Date[], Uuid[], Record[], Relation[]).`,
    ]);
  });

  it('prints a validator error as `<path>: <message>` with no line', async () => {
    const { errors, dir } = await run({
      'post.cerial':
        'model Post {\n  id Record @id\n  authorId Record\n  author Relation @field(authorId) @model(Nope)\n}\n',
    });

    expect(errors).toEqual([
      `${join(dir, 'post.cerial')}: Relation field "author" references non-existent model "Nope"`,
    ]);
  });
});
