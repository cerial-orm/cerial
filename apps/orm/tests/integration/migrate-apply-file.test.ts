/**
 * `cerial migrate apply <file>` against the shared instance, each case in a scratch database of its own.
 * Plan files live in a temporary directory. Every refusal asserts the rows and the schema are as they were,
 * by count and by value.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { PassThrough, Readable } from 'node:stream';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Surreal } from 'surrealdb';
import { migrateApply } from '../../src/cli/migrate/apply';
import type { ApplyResult } from '../../src/cli/migrate/apply';
import { loadDesired } from '../../src/cli/migrate/load';
import { migratePlan, parsePlanFile, splitStatements } from '../../src/cli/migrate/plan-file';
import { liveFingerprint, quoteIdent, readLiveSchema, readState } from '../../src/migrations';
import { mixedProject, removeMixedProjects } from './mixed-merge-project';
import { BS, BT, CR, LF, LS, NEL, PS } from './surrealdb-facts/hostile-names';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];
const temps: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });
  opened.push(db);

  return db;
}

async function scratch(label: string): Promise<{ db: Surreal; name: string }> {
  const name = `applyfile_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await admin();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);

  return { db, name };
}

afterAll(async () => {
  const root = await admin();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
  for (const dir of temps) await rm(dir, { recursive: true, force: true });
  await removeMixedProjects();
});

const envFor = (database: string) => ({
  CERIAL_DB_URL: URL,
  CERIAL_DB_NAMESPACE: 'main',
  CERIAL_DB_DATABASE: database,
  CERIAL_DB_USERNAME: 'root',
  CERIAL_DB_PASSWORD: 'root',
});

const NOTE = 'model Note {\n  id Record(int) @id\n  title String @index\n  body String?\n}\n';
const NOTE_TAG_NO_BODY = 'model Note {\n  id Record(int) @id\n  title String @index\n  tag String?\n}\n';
const NOTE_BODY_INT = 'model Note {\n  id Record(int) @id\n  title String @index\n  body Int?\n}\n';
const EXTRA = 'model Extra {\n  id Record(int) @id\n  label String\n}\n';
const BOTH = ['--allow-destructive', '--allow-data-loss'];

const apply = (
  dir: string,
  database: string,
  argv: string[],
  extra: { isTTY?: boolean; input?: Readable } = {},
): Promise<ApplyResult> =>
  migrateApply({
    argv,
    env: envFor(database),
    cwd: dir,
    isTTY: extra.isTTY ?? false,
    input: extra.input,
    prompt: new PassThrough(),
  });

const rowsOf = async (db: Surreal, table: string) =>
  (await db.query(`SELECT * FROM ${table} ORDER BY id`).collect<[Array<Record<string, unknown>>]>())[0];
const infoOf = async (db: Surreal, scope: string) => (await db.query(`INFO FOR ${scope}`).collect<[unknown]>())[0];
const fieldsOf = async (db: Surreal, table: string): Promise<string[]> => {
  const [info] = await db.query(`INFO FOR TABLE ${table}`).collect<[{ fields: Record<string, string> }]>();

  return Object.keys(info.fields);
};
const tablesOf = async (db: Surreal): Promise<string[]> => {
  const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();

  return Object.keys(info.tables);
};
const schemaNameOf = async (dir: string, database: string): Promise<string> =>
  (await loadDesired({ flags: {}, env: envFor(database), cwd: dir }))[0]!.entryModels[0]!.schemaName;

const NOTE_ROWS = [
  ['first', 'keep me'],
  ['second', 'and me'],
];

async function expectNoteRowsIntact(db: Surreal): Promise<void> {
  const found = await rowsOf(db, 'note');

  expect(found).toHaveLength(2);
  expect(found.map((r) => [r.title, r.body])).toEqual(NOTE_ROWS);
}

/** Applies `from` through the command, seeds rows, writes `to` as the schema and plans it into a temporary file */
async function planned(label: string, from: Record<string, string>, to: Record<string, string>) {
  const dir = await mixedProject(from);
  const target = await scratch(label);
  const first = await apply(dir, target.name, ['--from-schema']);
  expect(first.stderr).toBe('');
  await target.db
    .query("CREATE note:1 SET title = 'first', body = 'keep me'; CREATE note:2 SET title = 'second', body = 'and me'")
    .collect();
  if (from['app/extra.cerial']) await target.db.query("CREATE extra:1 SET label = 'kept'").collect();
  for (const [path, text] of Object.entries(to)) await writeFile(join(dir, path), text);
  const out = await mkdtemp(join(tmpdir(), 'cerial-apply-file-'));
  temps.push(out);
  const result = await migratePlan({ argv: ['--out', out], env: envFor(target.name), cwd: dir });
  expect(result.exitCode).toBe(0);
  const file = result.files[0]!;

  return { dir, file, text: await readFile(file, 'utf8'), ...target };
}

/** An operator's edit: take the annotations away and uncomment every statement */
const uncomment = (text: string): string =>
  text
    .split('\n')
    .filter((l) => !l.startsWith('-- cerial:'))
    .map((l) => l.replace(/^-- (?=(DEFINE|REMOVE|UPDATE) )/, ''))
    .join('\n');

describe('the statement splitter', () => {
  const hostile: Array<[string, string]> = [
    ['LF', LF],
    ['CR', CR],
    ['NEL', NEL],
    ['LS', LS],
    ['PS', PS],
    ['backtick', BT],
    ['backslash', BS],
    ['semicolon', ';'],
    ['quote and comment marks', `'; -- ${BS}${BT}${BS}`],
    ['a closing statement', `${BT};${BS}REMOVE TABLE victim;`],
  ];

  for (const [label, name] of hostile) {
    test(`a name holding ${label} stays inside one statement and decodes to itself`, () => {
      const text = `DEFINE FIELD OVERWRITE ${quoteIdent(name)} ON TABLE ${quoteIdent(`t${name}`)} TYPE string;\nDEFINE TABLE OVERWRITE ok SCHEMAFULL;`;
      const { statements } = splitStatements(text);

      expect(statements).toHaveLength(2);
      expect(statements[1]!.text).toBe('DEFINE TABLE OVERWRITE ok SCHEMAFULL');
      const parsed = parsePlanFile(text);
      expect(parsed.refusals).toEqual([]);
      expect(parsed.statements.map((s) => s.table)).toEqual([`t${name}`, 'ok']);
      expect(parsed.statements[0]!.field).toEqual([name]);
    });
  }

  test('a ; inside a string, brackets or a comment does not split, and a comment is not sent', () => {
    const { statements } = splitStatements(
      "DEFINE FIELD a ON TABLE t TYPE string DEFAULT 'x;y' ASSERT ($value != 'a;b') -- note; REMOVE TABLE t;\n;DEFINE FIELD b ON TABLE t TYPE int VALUE { 1; 2 };",
    );

    expect(statements.map((s) => s.line)).toEqual([1, 2]);
    expect(statements[0]!.text).not.toContain('REMOVE');
    expect(statements[0]!.text).toContain("'x;y'");
    expect(statements[1]!.text).toContain('{ 1; 2 }');
  });

  test('a raw line terminator ends a comment, so the statement after it is read and refused', () => {
    for (const terminator of [LF, CR, NEL, LS, PS]) {
      const parsed = parsePlanFile(`-- harmless${terminator}REMOVE DATABASE main;`);

      expect(parsed.statements).toEqual([]);
      expect(parsed.refusals).toHaveLength(1);
      expect(parsed.refusals[0]).toContain('REMOVE DATABASE is not allowed');
    }
  });

  test('an unclosed name, string or bracket is refused by line', () => {
    expect(parsePlanFile('DEFINE TABLE ok;\nDEFINE FIELD `a ON TABLE t TYPE string;').refusals[0]).toStartWith(
      'line 2:',
    );
    expect(parsePlanFile("DEFINE FIELD a ON TABLE t TYPE string DEFAULT 'x;").refusals).toHaveLength(1);
    expect(parsePlanFile('DEFINE FIELD a ON TABLE t TYPE int VALUE { 1;').refusals).toHaveLength(1);
  });

  test('a statement on the migration state tables and an UPDATE with more than UNSET are refused', () => {
    const parsed = parsePlanFile(
      'REMOVE TABLE _cerial_migrations;\nUPDATE note UNSET body WHERE true;\nUPDATE note SET body = 1;\nUPDATE note UNSET body;',
    );

    expect(parsed.refusals.map((r) => r.slice(0, 7))).toEqual(['line 1:', 'line 2:', 'line 3:']);
    expect(parsed.statements.map((s) => s.verb)).toEqual(['UPDATE UNSET']);
  });
});

describe('the allowlist', () => {
  const disallowed: Array<[string, string, string]> = [
    ['REMOVE DATABASE', 'REMOVE DATABASE', 'REMOVE DATABASE main'],
    ['REMOVE USER', 'REMOVE USER', 'REMOVE USER root ON DATABASE'],
    ['DEFINE EVENT', 'DEFINE EVENT', 'DEFINE EVENT gone ON TABLE note WHEN true THEN { DELETE note }'],
    ['DEFINE FUNCTION', 'DEFINE FUNCTION', 'DEFINE FUNCTION fn::bad() { RETURN 1 }'],
    ['DELETE FROM', 'DELETE FROM', 'DELETE FROM note'],
  ];

  for (const [label, shown, statement] of disallowed) {
    test(`${label} is refused by line number and nothing is applied, the additive part included`, async () => {
      const fixture = await planned(
        `deny_${label.replace(/\W/g, '').toLowerCase()}`,
        { 'app/schema.cerial': NOTE },
        { 'app/schema.cerial': NOTE_TAG_NO_BODY },
      );
      const lines = fixture.text.split('\n');
      const insertAt = lines.length - 1;
      const edited = [...lines.slice(0, insertAt), `${statement};`, ''].join('\n');
      await writeFile(fixture.file, edited);
      const dbBefore = await infoOf(fixture.db, 'DB');
      const noteBefore = await infoOf(fixture.db, 'TABLE note');
      const result = await apply(fixture.dir, fixture.name, [fixture.file]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`line ${insertAt + 1}: ${shown} is not allowed`);
      expect(result.stderr).toContain(fixture.file);
      expect(result.stdout).not.toContain('Applied');
      expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
      expect(await infoOf(fixture.db, 'DB')).toEqual(dbBefore);
      expect(await infoOf(fixture.db, 'TABLE note')).toEqual(noteBefore);
      await expectNoteRowsIntact(fixture.db);
    });
  }

  test('every disallowed statement of one file is listed, each with its line', async () => {
    const fixture = await planned('denyall', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await writeFile(fixture.file, `${fixture.text}REMOVE USER root ON DATABASE;\nDELETE FROM note;\n`);
    const count = fixture.text.split('\n').length;
    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(`line ${count}: REMOVE USER`);
    expect(result.stderr).toContain(`line ${count + 1}: DELETE FROM`);
    await expectNoteRowsIntact(fixture.db);
  });

  test('a file that cannot be read exits 2 and names it', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': NOTE });
    const { name } = await scratch('missingfile');
    const result = await apply(dir, name, [join(dir, 'nope.surql')]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('nope.surql');
  });

  test('a file together with --from-schema, or neither, is refused', async () => {
    const dir = await mixedProject({ 'app/schema.cerial': NOTE });
    const { name } = await scratch('bothmodes');

    expect((await apply(dir, name, ['a.surql', '--from-schema'])).exitCode).toBe(2);
    expect((await apply(dir, name, [])).exitCode).toBe(2);
  });
});

describe('the class comes from the statement and the live schema', () => {
  test('an uncommented REMOVE TABLE with its annotation deleted still needs both flags', async () => {
    const fixture = await planned(
      'rmtable',
      { 'app/schema.cerial': NOTE, 'app/extra.cerial': EXTRA },
      { 'app/extra.cerial': '' },
    );
    expect(fixture.text).toContain('-- REMOVE TABLE `extra`');
    await writeFile(fixture.file, uncomment(fixture.text));
    expect(await readFile(fixture.file, 'utf8')).toContain('\nREMOVE TABLE `extra`');
    const dbBefore = await infoOf(fixture.db, 'DB');

    const none = await apply(fixture.dir, fixture.name, [fixture.file]);
    const destructiveOnly = await apply(fixture.dir, fixture.name, [fixture.file, '--allow-destructive']);

    for (const refused of [none, destructiveOnly]) {
      expect(refused.exitCode).toBe(1);
      expect(refused.stderr).toContain('--allow-data-loss');
      expect(refused.stdout).not.toContain('Applied');
    }
    expect(none.stderr).toContain('--allow-destructive');
    expect(await infoOf(fixture.db, 'DB')).toEqual(dbBefore);
    expect(await tablesOf(fixture.db)).toContain('extra');
    expect(await rowsOf(fixture.db, 'extra')).toEqual([expect.objectContaining({ label: 'kept' })]);
    await expectNoteRowsIntact(fixture.db);

    const both = await apply(fixture.dir, fixture.name, [fixture.file, ...BOTH]);

    expect(both.stderr).toBe('');
    expect(both.exitCode).toBe(0);
    expect(await tablesOf(fixture.db)).not.toContain('extra');
    await expectNoteRowsIntact(fixture.db);
  });

  test('an annotation edited to say additive does not change the class', async () => {
    const fixture = await planned(
      'lying',
      { 'app/schema.cerial': NOTE, 'app/extra.cerial': EXTRA },
      { 'app/extra.cerial': '' },
    );
    const edited = fixture.text.replace(/cerial:data-loss/g, 'cerial:additive').replace(/^-- (REMOVE TABLE)/m, '$1');
    await writeFile(fixture.file, edited);
    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('--allow-data-loss');
    expect(await tablesOf(fixture.db)).toContain('extra');
    expect(await rowsOf(fixture.db, 'extra')).toHaveLength(1);
  });

  test('a DEFINE FIELD OVERWRITE that changes a live type needs --allow-destructive, and --allow-data-loss is not asked for', async () => {
    const fixture = await planned('typechg', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_BODY_INT });
    expect(fixture.text).toContain('-- cerial:destructive');
    await writeFile(fixture.file, uncomment(fixture.text));
    const typeBefore = await infoOf(fixture.db, 'TABLE note');

    const refused = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('--allow-destructive');
    expect(refused.stderr).not.toContain('--allow-data-loss');
    expect(await infoOf(fixture.db, 'TABLE note')).toEqual(typeBefore);
    await expectNoteRowsIntact(fixture.db);

    const allowed = await apply(fixture.dir, fixture.name, [fixture.file, '--allow-destructive']);

    expect(allowed.stderr).toBe('');
    expect(allowed.exitCode).toBe(0);
    expect(await infoOf(fixture.db, 'TABLE note')).not.toEqual(typeBefore);
    expect(await rowsOf(fixture.db, 'note')).toHaveLength(2);
  });

  test('a hand-written redefinition of a live field is refused by line even with every flag', async () => {
    const fixture = await planned(
      'handwritten',
      { 'app/schema.cerial': NOTE },
      { 'app/schema.cerial': NOTE_TAG_NO_BODY },
    );
    const fp = /live fingerprint: (\S+)/.exec(fixture.text)?.[1];
    await writeFile(
      fixture.file,
      `-- live fingerprint: ${fp}\n-- database: main/${fixture.name}\nDEFINE FIELD OVERWRITE title ON TABLE note TYPE int;\n`,
    );
    const before = await infoOf(fixture.db, 'TABLE note');
    const result = await apply(fixture.dir, fixture.name, [fixture.file, ...BOTH]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('line 3: this definition is hand-written');
    expect(await infoOf(fixture.db, 'TABLE note')).toEqual(before);
    await expectNoteRowsIntact(fixture.db);
  });

  test('a removed field and its UNSET are destructive: refused alone, applied with the flag', async () => {
    const fixture = await planned('rmfield', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await writeFile(fixture.file, uncomment(fixture.text));

    const refused = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).not.toContain('--allow-data-loss');
    expect(await fieldsOf(fixture.db, 'note')).toContain('body');
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
    await expectNoteRowsIntact(fixture.db);

    const allowed = await apply(fixture.dir, fixture.name, [fixture.file, '--allow-destructive']);

    expect(allowed.exitCode).toBe(0);
    expect(await fieldsOf(fixture.db, 'note')).toEqual(expect.arrayContaining(['tag']));
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('body');
    expect((await rowsOf(fixture.db, 'note')).map((r) => r.title)).toEqual(['first', 'second']);
  });
});

describe('a stale file', () => {
  test('a live schema that moved since the plan refuses, names the file and applies nothing', async () => {
    const fixture = await planned('stale', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await fixture.db.query('DEFINE FIELD OVERWRITE moved ON TABLE note TYPE option<string>').collect();
    const dbBefore = await infoOf(fixture.db, 'DB');
    const noteBefore = await infoOf(fixture.db, 'TABLE note');
    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(fixture.file);
    expect(result.stderr).toContain('stale');
    expect(result.stdout).not.toContain('Applied');
    expect(await infoOf(fixture.db, 'DB')).toEqual(dbBefore);
    expect(await infoOf(fixture.db, 'TABLE note')).toEqual(noteBefore);
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
    await expectNoteRowsIntact(fixture.db);
  });

  test('a file with no live fingerprint cannot be checked and is refused', async () => {
    const fixture = await planned('nofp', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await writeFile(fixture.file, fixture.text.replace(/^-- live fingerprint:.*\n/m, ''));
    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('no live fingerprint');
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
  });

  test('a file planned against another database is refused', async () => {
    const fixture = await planned('otherdb', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    const other = await scratch('otherdbtarget');
    const result = await apply(fixture.dir, other.name, [fixture.file]);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain(fixture.name);
    expect(await tablesOf(other.db)).toEqual([]);
  });
});

describe('an unedited file', () => {
  test('applies its additive half; a commented destructive line stays unapplied, reported, and its model unmatched', async () => {
    const fixture = await planned('half', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    const schema = await schemaNameOf(fixture.dir, fixture.name);
    expect((await readState(fixture.db, schema)).models.get('Note')?.fingerprint).toBeTruthy();

    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Applied 1 statement(s)');
    expect(result.stdout).toContain('commented-out statement(s) unapplied');
    expect(result.stdout).toContain('`note`');
    expect(await fieldsOf(fixture.db, 'note')).toEqual(expect.arrayContaining(['tag', 'body']));
    await expectNoteRowsIntact(fixture.db);
    // Not recorded as matched, so a lazy 'auto' run does not skip the model that still has a pending removal
    expect((await readState(fixture.db, schema)).models.get('Note')).toBeUndefined();
  });

  test('a model with nothing commented out is recorded as matched, and a new table with its rows untouched', async () => {
    const fixture = await planned(
      'whole',
      { 'app/schema.cerial': NOTE },
      { 'app/schema.cerial': NOTE, 'app/extra.cerial': EXTRA },
    );
    const schema = await schemaNameOf(fixture.dir, fixture.name);
    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('commented-out');
    expect(await tablesOf(fixture.db)).toContain('extra');
    const state = await readState(fixture.db, schema);
    expect(state.models.get('Extra')?.fingerprint).toBeTruthy();
    expect(state.schema?.managedTables).toEqual(expect.arrayContaining(['note', 'extra']));
    await expectNoteRowsIntact(fixture.db);

    const again = await apply(fixture.dir, fixture.name, [fixture.file]);
    expect(again.exitCode).toBe(1);
    expect(again.stderr).toContain('stale');
  });

  test('a file whose every statement is commented out applies nothing and says so', async () => {
    const fixture = await planned(
      'allcommented',
      { 'app/schema.cerial': NOTE },
      { 'app/schema.cerial': 'model Note {\n  id Record(int) @id\n  title String @index\n}\n' },
    );
    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('every statement in the file is commented out');
    expect(await fieldsOf(fixture.db, 'note')).toContain('body');
    await expectNoteRowsIntact(fixture.db);
  });
});

describe('the same confirmation as --from-schema', () => {
  test('on a terminal a destructive file is confirmed: no applies nothing, yes applies', async () => {
    const fixture = await planned('tty', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await writeFile(fixture.file, uncomment(fixture.text));

    const no = await apply(fixture.dir, fixture.name, [fixture.file, '--allow-destructive'], {
      isTTY: true,
      input: Readable.from(['n\n']),
    });

    expect(no.exitCode).toBe(1);
    expect(no.stderr).toContain('not confirmed');
    expect(await fieldsOf(fixture.db, 'note')).toContain('body');
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
    await expectNoteRowsIntact(fixture.db);

    const yes = await apply(fixture.dir, fixture.name, [fixture.file, '--allow-destructive'], {
      isTTY: true,
      input: Readable.from(['y\n']),
    });

    expect(yes.exitCode).toBe(0);
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('body');
  });
});

describe('a definition that carries a statement of its own', () => {
  // Each of these was measured to run its DELETE when a row of the field's table was written
  const carriers: Array<[string, string]> = [
    ['VALUE block', 'DEFINE FIELD OVERWRITE zap ON TABLE note TYPE int VALUE { DELETE victim; RETURN 1 }'],
    ['VALUE subquery', 'DEFINE FIELD OVERWRITE zap ON TABLE note TYPE int VALUE (DELETE victim RETURN BEFORE).len()'],
    ['DEFAULT block', 'DEFINE FIELD OVERWRITE zap ON TABLE note TYPE option<int> DEFAULT { DELETE victim; RETURN 1 }'],
    ['ASSERT block', 'DEFINE FIELD OVERWRITE zap ON TABLE note TYPE option<int> ASSERT { DELETE victim; RETURN true }'],
    ['view table', 'DEFINE TABLE OVERWRITE zapview AS SELECT * FROM victim'],
  ];

  for (const [label, statement] of carriers) {
    test(`${label} is refused by line with every flag, and victim keeps its rows`, async () => {
      const fixture = await planned(
        `carry${label.replace(/\W/g, '').toLowerCase()}`,
        { 'app/schema.cerial': NOTE },
        { 'app/schema.cerial': NOTE_TAG_NO_BODY },
      );
      await fixture.db.query('CREATE victim:1 SET v = 1; CREATE victim:2 SET v = 2').collect();
      const fp = liveFingerprint(await readLiveSchema(fixture.db));
      await writeFile(fixture.file, `-- live fingerprint: ${fp}\n-- database: main/${fixture.name}\n${statement};\n`);
      const before = await infoOf(fixture.db, 'DB');
      const result = await apply(fixture.dir, fixture.name, [fixture.file, ...BOTH]);
      await fixture.db.query("CREATE note:9 SET title = 'x'").collect();

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('line 3: this definition is hand-written');
      expect(await infoOf(fixture.db, 'DB')).toEqual(before);
      expect((await rowsOf(fixture.db, 'victim')).map((r) => r.v)).toEqual([1, 2]);
      expect(await fieldsOf(fixture.db, 'note')).not.toContain('zap');
    });
  }
});

describe('a removal in the file must be one the fresh plan makes', () => {
  /** A planned file for a schema change, with a table the schema does not declare added to the database afterwards */
  async function withVictim(label: string) {
    const fixture = await planned(label, { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await fixture.db
      .query(
        "DEFINE TABLE victim SCHEMAFULL; DEFINE FIELD ssn ON victim TYPE string; DEFINE INDEX ssn_idx ON victim FIELDS ssn; CREATE victim:1 SET ssn = '123-45-6789'; CREATE victim:2 SET ssn = '987-65-4321'",
      )
      .collect();
    const out = await mkdtemp(join(tmpdir(), 'cerial-apply-file-'));
    temps.push(out);
    const replanned = await migratePlan({ argv: ['--out', out], env: envFor(fixture.name), cwd: fixture.dir });
    const file = replanned.files[0]!;

    return { ...fixture, file, text: await readFile(file, 'utf8') };
  }

  const victimIntact = async (db: Surreal): Promise<void> => {
    expect((await rowsOf(db, 'victim')).map((r) => r.ssn)).toEqual(['123-45-6789', '987-65-4321']);
    expect(await fieldsOf(db, 'victim')).toEqual(['ssn']);
  };

  const tampered: Array<[string, string]> = [
    ['REMOVE TABLE', 'REMOVE TABLE victim'],
    ['UPDATE UNSET', 'UPDATE victim UNSET ssn'],
    ['REMOVE FIELD', 'REMOVE FIELD ssn ON TABLE victim'],
    ['REMOVE INDEX', 'REMOVE INDEX ssn_idx ON TABLE victim'],
  ];

  for (const [label, statement] of tampered) {
    test(`${label} on a table the schema never managed is refused by line, with every flag, and applies nothing`, async () => {
      const fixture = await withVictim(`tamper_${label.replace(/\W/g, '').toLowerCase()}`);
      const count = fixture.text.split('\n').length;
      await writeFile(fixture.file, `${fixture.text}${statement};\n`);

      const result = await apply(fixture.dir, fixture.name, [fixture.file, ...BOTH]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(`line ${count}: this ${label} is not a step the schema needs`);
      expect(result.stdout).not.toContain('Applied');
      expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
      await victimIntact(fixture.db);
      await expectNoteRowsIntact(fixture.db);
    });
  }

  test('the same file without the extra lines applies, so the refusal is the extra lines and nothing else', async () => {
    const fixture = await withVictim('tamperok');
    await writeFile(fixture.file, uncomment(fixture.text));

    const result = await apply(fixture.dir, fixture.name, [fixture.file, '--allow-destructive']);

    expect(result.exitCode).toBe(0);
    expect(await fieldsOf(fixture.db, 'note')).toEqual(expect.arrayContaining(['tag']));
    await victimIntact(fixture.db);
  });

  test('an UNSET is destructive, not data loss: it needs --allow-destructive alone', async () => {
    const fixture = await planned(
      'unsetclass',
      { 'app/schema.cerial': NOTE },
      { 'app/schema.cerial': NOTE_TAG_NO_BODY },
    );
    await writeFile(fixture.file, uncomment(fixture.text));

    const refused = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(refused.exitCode).toBe(1);
    expect(refused.stderr).toContain('--allow-destructive needed for field on table `note`');
    expect(refused.stderr).not.toContain('--allow-data-loss');
  });
});

describe('a prose comment that starts like a statement', () => {
  test('is ignored: the file applies and the prose is not reported as a skipped statement', async () => {
    const fixture = await planned('prose', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });
    await writeFile(
      fixture.file,
      `${fixture.text}-- DEFINE FIELD foo ON bar later, once the team agrees\n-- REMOVE TABLE legacy when we are done\n-- UPDATE the changelog\n`,
    );

    const result = await apply(fixture.dir, fixture.name, [fixture.file]);

    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('bar');
    expect(await fieldsOf(fixture.db, 'note')).toEqual(expect.arrayContaining(['tag']));
    expect(parsePlanFile(`${fixture.text}-- DEFINE FIELD foo ON bar later\n`).refusals).toEqual([]);
  });
});

describe('a file whose database moves between the check and the lease', () => {
  test('is refused naming the change, and nothing is applied', async () => {
    const fixture = await planned('lease', { 'app/schema.cerial': NOTE }, { 'app/schema.cerial': NOTE_TAG_NO_BODY });

    const result = await migrateApply({
      argv: [fixture.file],
      env: envFor(fixture.name),
      cwd: fixture.dir,
      isTTY: false,
      beforeApply: async () => {
        await fixture.db.query('DEFINE TABLE sneaky SCHEMAFULL').collect();
      },
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('changed after it was planned');
    expect(result.stderr).toContain('table `sneaky` appeared');
    expect(result.stdout).toBe('');
    expect(await fieldsOf(fixture.db, 'note')).not.toContain('tag');
    await expectNoteRowsIntact(fixture.db);
  });
});
