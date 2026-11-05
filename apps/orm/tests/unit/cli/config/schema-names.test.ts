import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { schemaNameProblem, toClientClassName, validateConfig } from '../../../../src/cli/config';
import type { ResolvedSchemaEntry } from '../../../../src/cli/config';
import { validateCombinedEntries } from '../../../../src/cli/config';
import { discoverSchemaRoots } from '../../../../src/cli/discover-roots';
import { generate, generateSingleSchema } from '../../../../src/cli/generate';
import { generateClientClass } from '../../../../src/generators/client/template';

const SCHEMA = 'model User {\n  id Record @id\n  name String\n}\n';
const PAYLOADS = ['x{}console.log("PWNED");class b', "x'y{z}(1)", 'a b', '$x', '1db'];

let cwd: string;
let marker: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'cerial-schema-names-'));
  marker = join(cwd, 'PWNED');
});

afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function folders(...names: string[]): void {
  for (const name of names) {
    mkdirSync(join(cwd, name), { recursive: true });
    writeFileSync(join(cwd, name, 'schema.cerial'), SCHEMA);
  }
}

describe('folder-derived schema names', () => {
  for (const payload of PAYLOADS) {
    it(`refuses the folder ${JSON.stringify(payload)} and writes nothing`, async () => {
      folders(payload, 'auth');

      await expect(discoverSchemaRoots(cwd)).rejects.toThrow(/Set `name`/);

      const previous = process.cwd();
      process.chdir(cwd);
      const result = await generate({}).finally(() => process.chdir(previous));
      expect(result.success).toBe(false);
      expect(result.errors.join('\n')).toContain('Set `name`');
      expect(existsSync(join(cwd, 'auth', 'client'))).toBe(false);
      expect(existsSync(marker)).toBe(false);
      expect(readdirSync(cwd).sort()).toEqual([payload, 'auth'].sort());
    });
  }

  it('names the folder in the refusal', async () => {
    folders('a b', 'auth');

    await expect(discoverSchemaRoots(cwd)).rejects.toThrow(/a b/);
  });

  it('keeps valid folder names as before, hyphenated ones included', async () => {
    folders('auth', 'user_db', 'user-db');

    const found = await discoverSchemaRoots(cwd);

    expect(found?.roots.map((r) => r.name).sort()).toEqual(['auth', 'user-db', 'user_db']);
  });

  it('derives MyAuthCerialClient from my-auth', () => {
    expect(toClientClassName('my-auth')).toBe('MyAuthCerialClient');
    expect(schemaNameProblem('my-auth')).toBeUndefined();
  });
});

describe('schemaNameProblem', () => {
  it('accepts identifiers', () => {
    for (const name of ['auth', 'user_db', 'user-db', 'my-auth', 'Auth2'])
      expect(schemaNameProblem(name)).toBeUndefined();
  });

  it('refuses non-identifiers, reserved names and fixed client exports', () => {
    for (const name of ['a b', 'default', 'index', '$x', '1db', 'a--b', 'a-', '']) {
      expect(schemaNameProblem(name)).toBeDefined();
    }
  });
});

describe('config schema names', () => {
  it('refuses a $ in a schema name', () => {
    const result = validateConfig({ schemas: { a$b: { path: './a' } } });

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.field === 'schemas.a$b')).toBe(true);
  });

  it('accepts a hyphenated schema name', () => {
    expect(validateConfig({ schemas: { 'my-api': { path: './a', output: './o' } } }).valid).toBe(true);
  });
});

describe('migrationContext.schemaName', () => {
  it('is written as a JSON string literal', () => {
    const source = generateClientClass([], "x'y\\");

    expect(source).toContain(`schemaName: ${JSON.stringify("x'y\\")},`);
  });
});

describe('folder config name', () => {
  it('honours `name` for a folder that is not a valid name itself', async () => {
    folders('a b', 'auth');
    writeFileSync(join(cwd, 'a b', 'cerial.config.json'), JSON.stringify({ name: 'good' }));
    writeFileSync(join(cwd, 'auth', 'cerial.config.json'), '{}');

    const found = await discoverSchemaRoots(cwd);

    expect(found?.roots.map((r) => r.name).sort()).toEqual(['auth', 'good']);
  });

  it('refuses an invalid `name` in the folder config', async () => {
    folders('auth', 'cms');
    writeFileSync(join(cwd, 'auth', 'cerial.config.json'), JSON.stringify({ name: 'a b' }));
    writeFileSync(join(cwd, 'cms', 'cerial.config.json'), '{}');

    await expect(discoverSchemaRoots(cwd)).rejects.toThrow(/Invalid folder config.*name/s);
  });
});

describe('schema names deriving one client class', () => {
  for (const [a, b] of [
    ['my-auth', 'my_auth'],
    ['Auth', 'auth'],
    ['myAuth', 'myauth'],
  ] as const) {
    it(`refuses ${a} and ${b} in a config, naming both`, () => {
      const entry = { path: './a', output: './o' };
      const result = validateConfig({ schemas: { [a]: entry, [b]: { path: './b', output: './p' } } });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes(`"${a}"`) && e.message.includes(`"${b}"`))).toBe(true);
    });

    it(`refuses ${a} and ${b} across root and discovered entries`, () => {
      const entry = (name: string): ResolvedSchemaEntry =>
        ({ name, path: `/p/${name}`, output: `/o/${name}/client`, clientClassName: toClientClassName(name) }) as never;

      expect(() => validateCombinedEntries([entry(a)], [entry(b)])).toThrow(new RegExp(`${a}.*${b}`));
    });
  }

  it('accepts schema names that derive different classes', () => {
    const result = validateConfig({
      schemas: { auth: { path: './a', output: './o' }, cms: { path: './b', output: './p' } },
    });

    expect(result.valid).toBe(true);
  });
});

describe('generateSingleSchema with a client class name', () => {
  it('refuses a bad class name before writing anything', async () => {
    const out = join(cwd, 'out');
    folders('auth');

    await expect(
      generateSingleSchema({ schemaPath: join(cwd, 'auth'), outputDir: out, clientClassName: 'X{}; evil' }),
    ).rejects.toThrow(/Client class name/);
    expect(existsSync(out)).toBe(false);
  });

  it('refuses a class that collides with a fixed client export', async () => {
    folders('auth');

    await expect(
      generateSingleSchema({
        schemaPath: join(cwd, 'auth'),
        outputDir: join(cwd, 'out'),
        clientClassName: 'ClientOptions',
      }),
    ).rejects.toThrow(/collides/);
  });

  it('refuses a model named like its own schema client class, and only for that schema', async () => {
    mkdirSync(join(cwd, 'auth'), { recursive: true });
    writeFileSync(join(cwd, 'auth', 'schema.cerial'), 'model AuthCerialClient {\n  id Record @id\n}\n');
    const out = join(cwd, 'out');

    const refused = await generateSingleSchema({
      schemaPath: join(cwd, 'auth'),
      outputDir: out,
      clientClassName: 'AuthCerialClient',
    });
    expect(refused.success).toBe(false);
    expect(refused.errors.join('\n')).toMatch(/Name collision/);

    const other = await generateSingleSchema({
      schemaPath: join(cwd, 'auth'),
      outputDir: join(cwd, 'out2'),
      clientClassName: 'CmsCerialClient',
    });
    expect(other.errors.join('\n')).not.toMatch(/Name collision/);
  });
});
