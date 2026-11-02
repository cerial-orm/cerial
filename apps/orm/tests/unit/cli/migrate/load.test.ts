import { afterAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadDesired } from '../../../../src/cli/migrate/load';
import type { LoadDesiredOptions } from '../../../../src/cli/migrate/load';
import { HANDLES_MARKER } from '../../../../src/generators/handles';
import { CerialValidationError } from '../../../../src/errors';
import { mixedProject, removeMixedProjects } from '../../../integration/mixed-merge-project';

const FIXTURES = join(import.meta.dir, '../../../fixtures');
const created: string[] = [];

afterAll(async () => {
  await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
  await removeMixedProjects();
});

const ENV = { CERIAL_DB_URL: 'http://127.0.0.1:8000', CERIAL_DB_NAMESPACE: 'ns', CERIAL_DB_DATABASE: 'db' };

function load(cwd: string, flags: LoadDesiredOptions['flags'] = {}, env: LoadDesiredOptions['env'] = ENV) {
  return loadDesired({ flags: { config: join(cwd, 'cerial.config.ts'), ...flags }, env, cwd });
}

/** A project of plain `.cerial` files and a plain-object config, so nothing imports outside the temp dir */
async function project(config: object, files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'cerial-load-'));
  created.push(dir);
  await writeFile(join(dir, 'cerial.config.ts'), `export default ${JSON.stringify(config)};\n`);
  for (const [name, text] of Object.entries(files)) {
    await mkdir(join(dir, name, '..'), { recursive: true });
    await writeFile(join(dir, name), text);
  }

  return dir;
}

const model = (name: string): string => `model ${name} {\n  id Record(int) @id\n  title String\n}\n`;
const entry = (name: string, conn?: object) => ({
  path: `./${name}`,
  output: `./out/${name}`,
  ...(conn ? { connection: conn } : {}),
});
const connection = (database: string) => ({ url: 'http://127.0.0.1:8000', namespace: 'ns', database });

/** A temp copy of a fixture: loading a mixed entry writes the handles module beside its sources */
async function copyOf(fixture: string): Promise<string> {
  const names = (await readdir(fixture, { recursive: true })).filter((name) => /\.(cerial|ts)$/.test(name));
  const files = await Promise.all(names.map(async (name) => [name, await readFile(join(fixture, name), 'utf8')]));

  return mixedProject(Object.fromEntries(files));
}

describe('the three authoring forms', () => {
  it('give the same desired model for twin schemas', async () => {
    const dsl = await load(await copyOf(join(FIXTURES, 'mixed-twins/dsl')));
    const ts = await load(await copyOf(join(FIXTURES, 'mixed-twins/ts')));
    const mixed = await load(await copyOf(join(FIXTURES, 'mixed')));

    for (const targets of [dsl, ts, mixed]) {
      expect(targets).toHaveLength(1);
      expect(targets[0]!.desired.tables.length).toBeGreaterThan(2);
    }
    expect(ts[0]!.desired).toEqual(dsl[0]!.desired);
    expect(mixed[0]!.desired).toEqual(dsl[0]!.desired);
    expect(ts[0]!.schemaFingerprint).toBe(dsl[0]!.schemaFingerprint);
    expect(mixed[0]!.schemaFingerprint).toBe(dsl[0]!.schemaFingerprint);
    expect(ts[0]!.tableFingerprints).toEqual(dsl[0]!.tableFingerprints);
  });
});

describe('grouping by connection', () => {
  it('merges two entries on one connection into one target holding both tables', async () => {
    const dir = await project(
      { schemas: { one: entry('one'), two: entry('two') } },
      { 'one/a.cerial': model('Alpha'), 'two/b.cerial': model('Beta') },
    );
    const targets = await load(dir);

    expect(targets).toHaveLength(1);
    expect(targets[0]!.entries).toEqual(['one', 'two']);
    expect(targets[0]!.desired.tables.map((t) => t.name).sort()).toEqual(['alpha', 'beta']);
    expect(Object.keys(targets[0]!.tableFingerprints).sort()).toEqual(['alpha', 'beta']);
    expect(targets[0]!.entryModels.map((e) => e.desired.tables.map((t) => t.name))).toEqual([['alpha'], ['beta']]);
  });

  it('keeps two entries on different connections as two targets', async () => {
    const dir = await project(
      {
        schemas: {
          one: entry('one', connection('db_one')),
          two: entry('two', connection('db_two')),
        },
      },
      { 'one/a.cerial': model('Alpha'), 'two/b.cerial': model('Beta') },
    );
    const targets = await load(dir, {}, {});

    expect(targets.map((t) => [t.connection.database, t.entries])).toEqual([
      ['db_one', ['one']],
      ['db_two', ['two']],
    ]);
    expect(targets[0]!.desired.tables.map((t) => t.name)).toEqual(['alpha']);
    expect(targets[1]!.desired.tables.map((t) => t.name)).toEqual(['beta']);
  });

  it('puts no password in any printable field of a target', async () => {
    const dir = await project({ schemas: { one: entry('one') } }, { 'one/a.cerial': model('Alpha') });
    const [target] = await load(dir, { username: 'root' }, { ...ENV, CERIAL_DB_PASSWORD: 'hunter2-secret' });

    expect(JSON.stringify(target)).not.toContain('hunter2-secret');
    expect(target!.connection.username).toBe('root');
    expect(target!.credentials().auth?.password).toBe('hunter2-secret');
  });
});

describe('--name', () => {
  it('limits the load to one entry', async () => {
    const dir = await project(
      {
        schemas: {
          one: entry('one', connection('db_one')),
          two: entry('two', connection('db_two')),
        },
      },
      { 'one/a.cerial': model('Alpha'), 'two/b.cerial': model('Beta') },
    );
    const targets = await load(dir, { name: 'two' }, {});

    expect(targets).toHaveLength(1);
    expect(targets[0]!.entries).toEqual(['two']);
    expect(targets[0]!.desired.tables.map((t) => t.name)).toEqual(['beta']);
  });

  it('refuses an unknown name, naming --name', async () => {
    const dir = await project({ schemas: { one: entry('one') } }, { 'one/a.cerial': model('Alpha') });
    const error = await load(dir, { name: 'nope' }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(CerialValidationError);
    expect((error as Error).message).toContain('--name nope');
    expect((error as Error).message).toContain('one');
  });
});

/** Every file under `dir` with its content, so a before and after can be compared byte for byte */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const names = (await readdir(dir, { recursive: true, withFileTypes: true }))
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
  const files = await Promise.all(names.map(async (name) => [name, await readFile(name, 'utf8')]));

  return Object.fromEntries(files.sort(([a], [b]) => String(a).localeCompare(String(b))));
}

describe('a project with no config file', () => {
  const ZERO_ENV = { ...ENV };

  it('loads a .cerial-only project through its convention marker', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': model('Alpha'), 'app/more.cerial': model('Beta') });
    const targets = await loadDesired({ flags: {}, env: ZERO_ENV, cwd: dir });

    expect(targets).toHaveLength(1);
    expect(targets[0]!.connection.database).toBe('db');
    expect(targets[0]!.desired.tables.map((t) => t.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('loads a .schema.ts-only project', async () => {
    const source = `import { f, model } from 'cerial/schema';\nexport const Gamma = model('Gamma', { id: f.record('int').id(), title: f.string() });\n`;
    const dir = await mixedProject({ 'app/gamma.schema.ts': source });
    const targets = await loadDesired({ flags: {}, env: ZERO_ENV, cwd: dir });

    expect(targets).toHaveLength(1);
    expect(targets[0]!.desired.tables.map((t) => t.name)).toEqual(['gamma']);
  });

  it('names a lone root CerialClient, the class generate writes for it, not for its folder', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': model('Alpha') });
    const targets = await loadDesired({ flags: {}, env: ZERO_ENV, cwd: dir });

    expect(targets[0]!.entryModels.map((e) => e.schemaName)).toEqual(['CerialClient']);
  });

  it('names each of several roots for its folder, as generate does', async () => {
    const dir = await mixedProject({ 'one/schema.cerial': model('Alpha'), 'two-x/schema.cerial': model('Beta') });
    const targets = await loadDesired({ flags: {}, env: ZERO_ENV, cwd: dir });

    expect(targets[0]!.entryModels.map((e) => e.schemaName).sort()).toEqual(['OneCerialClient', 'TwoXCerialClient']);
  });

  it('takes the connection from flags and env only, refusing when there is none', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': model('Alpha') });

    await expect(loadDesired({ flags: {}, env: {}, cwd: dir })).rejects.toThrow('No database url');
  });
});

describe('a read-only load', () => {
  it('leaves a mixed fixture directory byte for byte unchanged', async () => {
    const fixture = join(FIXTURES, 'mixed');
    const before = await snapshot(fixture);
    const [target] = await load(fixture);
    const after = await snapshot(fixture);

    expect(target!.desired.tables.length).toBeGreaterThan(2);
    expect(Object.keys(after).some((name) => name.endsWith('handles.ts'))).toBe(false);
    expect(after).toEqual(before);
  });

  it('puts back a handles module that was already there', async () => {
    const dir = await copyOf(join(FIXTURES, 'mixed'));
    const handles = join(dir, 'schema/cerial/handles.ts');
    await mkdir(join(dir, 'schema/cerial'), { recursive: true });
    await writeFile(handles, `${HANDLES_MARKER}\n// out of date\n`);
    const before = await snapshot(dir);

    await load(dir);

    expect(await snapshot(dir)).toEqual(before);
  });
});
