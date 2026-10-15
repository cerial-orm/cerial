/**
 * Generate-level validation: every schema rule must be enforced by the same
 * pipeline `cerial generate` runs, not only by a validator in isolation.
 *
 * Needs no database; it drives generateSingleSchema against temp schema folders.
 */

import { afterAll, describe, expect, it } from 'bun:test';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate, generateSingleSchema } from '../../src/cli/generate';
import { getFixturePath } from '../fixtures/multi-schema/helpers';

const cleanups: Array<() => Promise<void>> = [];

afterAll(async () => {
  await Promise.all(cleanups.map((fn) => fn()));
});

async function generateFrom(files: Record<string, string>) {
  const base = await mkdtemp(join(tmpdir(), 'cerial-generate-validation-'));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  const schemaDir = join(base, 'schemas');
  await Bun.write(join(schemaDir, '.keep'), '');
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(schemaDir, name), content, 'utf8');
  }

  return generateSingleSchema({ schemaPath: schemaDir, outputDir: join(base, 'output'), logLevel: 'minimal' });
}

const HOST = `
model Host {
  id Record @id
  name String
}
`;

/** Schemas `cerial generate` must refuse, with a fragment of the message it must report */
const REFUSED: Array<{ name: string; files: Record<string, string>; message: string }> = [
  // models
  {
    name: 'two @id fields on a model',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  otherId String @id\n}' },
    message: 'Multiple @id decorators in model User',
  },
  {
    name: 'a field with both @index and @unique',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  email Email @index @unique\n}' },
    message: "Field 'email' in model User cannot have both @index and @unique",
  },
  {
    name: '@unique on a model array field',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  tags String[] @unique\n}' },
    message: "Field 'tags' in model User is an array field and cannot have @unique",
  },
  {
    name: 'a model declared in two files',
    files: { 'a.cerial': HOST, 'b.cerial': HOST },
    message: 'Duplicate model name: Host',
  },
  {
    name: 'an object declared in two files',
    files: {
      'a.cerial': `object Geo {\n  lat Float\n}\n${HOST}`,
      'b.cerial': 'object Geo {\n  lng Float\n}',
    },
    message: 'Duplicate object name: Geo',
  },
  // composite directives
  {
    name: 'a composite directive with one field',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  a String\n  b String\n  @@index(solo, [a])\n}' },
    message: 'must have at least 2 fields',
  },
  {
    name: 'a composite directive naming a missing field',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  a String\n  @@unique(gone, [a, nope])\n}' },
    message: 'Field \'nope\' in composite @@unique("gone") does not exist in model User',
  },
  {
    name: 'a composite directive name reused across models',
    files: {
      'a.cerial':
        'model One {\n  id Record @id\n  a String\n  b String\n  @@index(shared, [a, b])\n}\n' +
        'model Two {\n  id Record @id\n  a String\n  b String\n  @@index(shared, [a, b])\n}',
    },
    message: "Composite directive name 'shared' is already used in model One",
  },
  {
    name: 'a composite directive over an array field',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  a String\n  tags String[]\n  @@index(arr, [a, tags])\n}' },
    message: 'is an array field and cannot be part of a composite index',
  },
  {
    name: 'a composite directive repeating a field',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  a String\n  b String\n  @@index(rep, [a, a, b])\n}' },
    message: 'Duplicate field \'a\' in composite @@index("rep")',
  },
  // tuples
  {
    name: 'a tuple declared twice',
    files: { 'a.cerial': `tuple Pair {\n  Int,\n  Int\n}\ntuple Pair {\n  Float,\n  Float\n}\n${HOST}` },
    message: 'Duplicate tuple name: Pair',
  },
  {
    name: 'a tuple declared in two files',
    files: { 'a.cerial': `tuple Pair {\n  Int,\n  Int\n}\n${HOST}`, 'b.cerial': 'tuple Pair {\n  Float,\n  Float\n}' },
    message: 'Duplicate tuple name: Pair',
  },
  {
    name: 'a tuple named like a model',
    files: { 'a.cerial': `tuple Host {\n  Int,\n  Int\n}\n${HOST}` },
    message: "Tuple name 'Host' conflicts with model name",
  },
  {
    name: 'a tuple named like an object',
    files: { 'a.cerial': `tuple Geo {\n  Int,\n  Int\n}\nobject Geo {\n  lat Float\n}\n${HOST}` },
    message: "Tuple name 'Geo' conflicts with object name",
  },
  {
    name: 'a tuple with a duplicate element name',
    files: { 'a.cerial': `tuple Pair {\n  x Int,\n  x Int\n}\n${HOST}` },
    message: "Duplicate element name 'x' in tuple Pair",
  },
  {
    name: 'a self-referencing tuple',
    files: { 'a.cerial': `tuple Node {\n  Int,\n  Node\n}\n${HOST}` },
    message: 'Self-referencing tuple element in tuple Node',
  },
  // enums
  {
    name: 'an enum declared twice',
    files: { 'a.cerial': `enum Role { A, B }\nenum Role { C }\n${HOST}` },
    message: 'Duplicate enum name: Role',
  },
  {
    name: 'an enum with a repeated value',
    files: { 'a.cerial': `enum Role { A, B, A }\n${HOST}` },
    message: "Duplicate value 'A' in enum Role",
  },
  {
    name: 'an enum named like a model',
    files: { 'a.cerial': `enum Host { A, B }\n${HOST}` },
    message: "Enum name 'Host' conflicts with model name",
  },
  {
    name: 'an enum named like an object',
    files: { 'a.cerial': `enum Geo { A, B }\nobject Geo {\n  lat Float\n}\n${HOST}` },
    message: "Enum name 'Geo' conflicts with object name",
  },
  {
    name: 'an enum named like a tuple',
    files: { 'a.cerial': `enum Pair { A, B }\ntuple Pair {\n  Int,\n  Int\n}\n${HOST}` },
    message: "Enum name 'Pair' conflicts with tuple name",
  },
  {
    name: 'an enum named like a literal',
    files: { 'a.cerial': `enum Level { A, B }\nliteral Level { 'x', 'y' }\n${HOST}` },
    message: "Enum name 'Level' conflicts with literal name",
  },
  // literals
  {
    name: 'a literal declared twice',
    files: { 'a.cerial': `literal Level { 'a', 'b' }\nliteral Level { 'c' }\n${HOST}` },
    message: 'Duplicate literal name: Level',
  },
  {
    name: 'a literal named like a model',
    files: { 'a.cerial': `literal Host { 'a', 'b' }\n${HOST}` },
    message: "Literal name 'Host' conflicts with model name",
  },
  {
    name: 'a literal named like an object',
    files: { 'a.cerial': `literal Geo { 'a', 'b' }\nobject Geo {\n  lat Float\n}\n${HOST}` },
    message: "Literal name 'Geo' conflicts with object name",
  },
  {
    name: 'a literal named like a tuple',
    files: { 'a.cerial': `literal Pair { 'a', 'b' }\ntuple Pair {\n  Int,\n  Int\n}\n${HOST}` },
    message: "Literal name 'Pair' conflicts with tuple name",
  },
  {
    name: 'a literal with a repeated variant',
    files: { 'a.cerial': `literal Level { 'a', 'b', 'a' }\n${HOST}` },
    message: 'Duplicate variant in literal Level',
  },
  {
    name: 'a circular literal reference',
    files: { 'a.cerial': `literal A { B, 'x' }\nliteral B { A, 'y' }\n${HOST}` },
    message: 'Circular literal reference detected',
  },
  {
    name: 'a literal that references itself',
    files: { 'a.cerial': `literal A { A, 'x' }\n${HOST}` },
    message: 'Literal A cannot reference itself',
  },
  {
    name: 'a literal referencing a tuple with an object element',
    files: {
      'a.cerial': `object Geo {\n  lat Float\n}\ntuple Holder {\n  Geo,\n  Int\n}\nliteral L { Holder, 'x' }\n${HOST}`,
    },
    message: "Tuple 'Holder' referenced in literal 'L' contains object element",
  },
  {
    name: 'a literal referencing an object with a nested object field',
    files: {
      'a.cerial': `object Geo {\n  lat Float\n}\nobject Wrap {\n  geo Geo\n}\nliteral L { Wrap, 'x' }\n${HOST}`,
    },
    message: "Object 'Wrap' referenced in literal 'L' contains object field 'geo'",
  },
];

/** Schemas that sit next to each refused case and must keep generating */
const ACCEPTED: Array<{ name: string; files: Record<string, string> }> = [
  { name: 'one @id per model', files: { 'a.cerial': 'model User {\n  id Record @id\n  email Email @unique\n}' } },
  {
    name: '@index on one field and @unique on another',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  email Email @unique\n  name String @index\n}' },
  },
  {
    name: '@index on a model array field',
    files: { 'a.cerial': 'model User {\n  id Record @id\n  tags String[] @index\n}' },
  },
  {
    name: 'models with different names across files',
    files: { 'a.cerial': HOST, 'b.cerial': 'model Guest {\n  id Record @id\n  name String\n}' },
  },
  {
    name: 'composite directives with distinct names over valid fields',
    files: {
      'a.cerial':
        'model One {\n  id Record @id\n  a String\n  b String\n  @@index(oneIdx, [a, b])\n}\n' +
        'model Two {\n  id Record @id\n  a String\n  b String\n  @@unique(twoUniq, [a, b])\n}',
    },
  },
  {
    name: 'tuples, enums and literals with distinct names',
    files: {
      'a.cerial': `tuple Pair {\n  x Int,\n  y Int\n}\nenum Role { A, B }\nliteral Level { 'lo', 'hi' }\nliteral Wider { Level, 'mid' }\n${HOST}`,
    },
  },
  {
    name: 'a literal referencing a flat tuple and a flat object',
    files: {
      'a.cerial': `tuple Pair {\n  Int,\n  Int\n}\nobject Flat {\n  label String\n}\nliteral L { Pair, Flat, 'x' }\n${HOST}`,
    },
  },
  {
    name: 'a self-referencing tuple whose self element is @nullable',
    files: {
      'a.cerial': `tuple Node {\n  label String,\n  Node @nullable\n}\nmodel Tree {\n  id Record @id\n  root Node?\n}`,
    },
  },
  {
    name: 'a literal chain that is not circular',
    files: { 'a.cerial': `literal A { 'x' }\nliteral B { A, 'y' }\nliteral C { A, B }\n${HOST}` },
  },
  {
    name: 'literal and enum fields referencing declared types',
    files: {
      'a.cerial': `enum Role { A, B }\nliteral Level { 'lo', 'hi' }\nmodel Account {\n  id Record @id\n  role Role\n  level Level\n}`,
    },
  },
];

describe('cerial generate refuses invalid schemas', () => {
  for (const { name, files, message } of REFUSED) {
    it(`refuses ${name}`, async () => {
      const result = await generateFrom(files);

      expect(result.success).toBe(false);
      expect(result.errors.some((e) => e.includes(message))).toBe(true);
    });
  }
});

describe('cerial generate still accepts valid neighbours', () => {
  for (const { name, files } of ACCEPTED) {
    it(`accepts ${name}`, async () => {
      const result = await generateFrom(files);

      expect(result.errors).toEqual([]);
      expect(result.success).toBe(true);
    });
  }
});

/**
 * Run `generate` (the entry point behind `cerial generate`) on a multi-schema fixture.
 *
 * The fixture is copied into a temp directory and the process moves there for the call, because
 * the config's relative schema and output paths resolve against the working directory. Its
 * import of the package source is rewritten to an absolute path for the same reason. Nothing is
 * written inside the repo.
 */
async function generateFixture(fixture: string) {
  const base = await mkdtemp(join(tmpdir(), 'cerial-generate-entries-'));
  cleanups.push(() => rm(base, { recursive: true, force: true }));
  await cp(getFixturePath(fixture), base, { recursive: true });

  const configPath = join(base, 'cerial.config.ts');
  const source = (await readFile(configPath, 'utf8')).replace(
    /'(\.\.\/)+src\/index'/,
    `'${join(import.meta.dir, '../../src/index')}'`,
  );
  await writeFile(configPath, source, 'utf8');

  const cwd = process.cwd();
  process.chdir(base);
  try {
    const result = await generate({ config: configPath, log: 'minimal' });

    return { result, base };
  } finally {
    process.chdir(cwd);
  }
}

async function exists(path: string): Promise<boolean> {
  return stat(path).then(
    () => true,
    () => false,
  );
}

/**
 * Before the cross-entry table check existed, `generate` on `same-name` succeeded and wrote two
 * clients that read and wrote one table. It now fails with a message naming the table, the
 * entries and the models, and writes nothing.
 *
 * The same-name before-state was observed: the last test generates each entry on its own through
 * generateSingleSchema, the call the loop made before the check existed, and both succeed.
 * `converging-names` has no such observation. Its `userAccount` entry is rejected as not
 * PascalCase by the per-entry parse, so generating it without the check fails for a different
 * reason; the pre-loop check is what turns that into the table message asserted here.
 */
describe('cerial generate on a multi-schema config whose entries share a table', () => {
  it('refuses identical model names, with a non-zero outcome and the message', async () => {
    const { result, base } = await generateFixture('same-name');

    expect(result.success).toBe(false);
    const message = result.errors.join('\n');
    expect(message).toContain("table 'ms_rt_shared'");
    expect(message).toContain("model 'MsRtShared' in entry 'one'");
    expect(message).toContain("model 'MsRtShared' in entry 'two'");
    expect(await exists(join(base, 'generated'))).toBe(false);
  });

  it('refuses model names that converge on one snake_case table', async () => {
    const { result, base } = await generateFixture('converging-names');

    expect(result.success).toBe(false);
    const message = result.errors.join('\n');
    expect(message).toContain("table 'user_account'");
    expect(message).toContain("model 'UserAccount' in entry 'one'");
    expect(message).toContain("model 'userAccount' in entry 'two'");
    expect(await exists(join(base, 'generated'))).toBe(false);
  });

  it('accepts entries that share no table and writes both clients', async () => {
    const { result, base } = await generateFixture('distinct-tables');

    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
    // Separates "accepted" from "refused for another reason": both output directories hold a client.
    expect(await exists(join(base, 'generated/one/client.ts'))).toBe(true);
    expect(await exists(join(base, 'generated/two/client.ts'))).toBe(true);
  });

  it('would have generated both same-name entries without the table check', async () => {
    for (const fixture of ['same-name']) {
      const base = await mkdtemp(join(tmpdir(), 'cerial-generate-bypass-'));
      cleanups.push(() => rm(base, { recursive: true, force: true }));

      for (const entry of ['one', 'two']) {
        const result = await generateSingleSchema({
          schemaPath: join(getFixturePath(fixture), 'schemas', entry),
          outputDir: join(base, entry),
          logLevel: 'minimal',
        });

        expect(result.errors).toEqual([]);
        expect(result.success).toBe(true);
      }
    }
  });
});
