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
  it('blames the file and line of the field that declares the error', async () => {
    const { errors, dir } = await run({
      'a.cerial': 'model UserProfile {\n  id Record @id\n  bio String\n}\n',
      'b.cerial': 'model User {\n  id Record @id\n  otherId String @id\n}\n',
    });

    expect(errors).toEqual([
      `${join(dir, 'b.cerial')}:3: Multiple @id decorators in model User. Only one @id field is allowed per model.`,
    ]);
  });

  it('blames the parent that declares an inherited field, not the child', async () => {
    const { errors, dir } = await run({
      'a.cerial':
        'abstract model Base {\n  id Record @id\n  otherId String @id\n}\n\nmodel UserProfile {\n  id Record @id\n}\n',
      'b.cerial': 'model User extends Base {\n  name String\n}\n',
    });

    expect(errors).toEqual([
      `${join(dir, 'a.cerial')}:3: Multiple @id decorators in model User. Only one @id field is allowed per model.`,
    ]);
  });

  it('prints a parse error as `<path>:<line>: <message>`', async () => {
    const { errors, dir } = await run({ 'post.cerial': 'model User {\n  id Record @id\n  name Bogus\n}\n' });

    expect(errors).toEqual([
      `${join(dir, 'post.cerial')}:3: Invalid field type: Bogus. Use String, Email, Int, Date, Bool, Float, Uuid, Record, Relation, or array types (String[], Int[], Date[], Uuid[], Record[], Relation[]).`,
    ]);
  });

  it('prints a validator error as `<path>:<line>: <message>`', async () => {
    const { errors, dir } = await run({
      'post.cerial':
        'model Post {\n  id Record @id\n  authorId Record\n  author Relation @field(authorId) @model(Nope)\n}\n',
    });

    expect(errors).toEqual([
      `${join(dir, 'post.cerial')}:4: Relation field "author" references non-existent model "Nope"`,
    ]);
  });

  it('names the file for an error on an object, a tuple and an enum', async () => {
    const { errors, dir } = await run({
      'types.cerial': 'object Group {\n  label String\n}\n\ntuple Table {\n  Int,\n  Int\n}\n\nenum Value { A }\n',
      'user.cerial': 'model User {\n  id Record @id\n}\n',
    });
    const file = join(dir, 'types.cerial');

    expect(errors).toEqual([
      `${file}:1: Reserved keyword: object name 'Group' is a SurrealDB reserved word and cannot be used. Rename it.`,
      `${file}:5: Reserved keyword: tuple name 'Table' is a SurrealDB reserved word and cannot be used. Rename it.`,
      `${file}:10: Reserved keyword: enum name 'Value' is a SurrealDB reserved word and cannot be used. Rename it.`,
    ]);
  });

  it('names the file and line of a duplicate enum value', async () => {
    const { errors, dir } = await run({
      'role.cerial': 'enum Role { A, B, A }\n',
      'user.cerial': 'model User {\n  id Record @id\n}\n',
    });

    expect(errors).toEqual([`${join(dir, 'role.cerial')}:1: Duplicate value 'A' in enum Role`]);
  });

  it('does not repeat the location on a name collision that already names both origins', async () => {
    const { errors, dir } = await run({
      'a.cerial': 'model User {\n  id Record @id\n}\n',
      'b.cerial': 'model User {\n  id Record @id\n}\n',
    });
    const [a, b] = [join(dir, 'a.cerial'), join(dir, 'b.cerial')];

    expect(errors).toEqual([`Duplicate model name: User (declared in ${a}:1 and in ${b}:1)`]);
  });

  it('prefixes an extends error with the file and line of the extending declaration', async () => {
    const { errors, dir } = await run({
      'a.cerial': 'model A extends Nope {\n  id Record @id\n}\n',
    });

    expect(errors.length).toBe(1);
    expect(errors[0]).toStartWith(`${join(dir, 'a.cerial')}:1: `);
  });
});
