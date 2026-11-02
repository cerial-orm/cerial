/**
 * Migration state rows against the shared instance, each case in a scratch database of its own.
 */

import { afterAll, describe, expect, spyOn, test } from 'bun:test';
import { Surreal } from 'surrealdb';
import { CerialMigrationError } from '../../src/errors';
import {
  convertLiterals,
  convertModels,
  convertObjects,
  convertTuples,
  createLiteralRegistry,
  createObjectRegistry,
  createRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../../src/generators/metadata';
import { generateModelDefineStatements } from '../../src/generators/migrations';
import {
  bootstrapStateTables,
  buildModelStateWrite,
  buildDesiredSchema,
  buildSchemaStateWrite,
  liveFingerprint,
  MIGRATIONS_TABLE,
  readLiveSchema,
  readState,
  schemaFingerprint,
  writeModelState,
  writeSchemaState,
} from '../../src/migrations';
import { resolveInheritance } from '../../src/resolver';
import type { ASTLiteral, ASTLiteralVariant } from '../../src/types';
import { loadCorpus } from '../generators/parity-corpus';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const names: string[] = [];

async function connect(database?: string): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, {
    namespace: 'main',
    ...(database ? { database } : {}),
    authentication: { username: 'root', password: 'root' },
  });
  opened.push(db);

  return db;
}

async function scratch(label: string, bootstrap = true): Promise<{ db: Surreal; name: string }> {
  const name = `st_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await connect();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  names.push(name);
  if (bootstrap) await bootstrapStateTables(db);

  return { db, name };
}

afterAll(async () => {
  const root = await connect();
  for (const name of names) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
});

const model = (schemaName: string, modelName: string, fingerprint = 'f1', status: 'pending' | 'applied' = 'applied') =>
  ({ schemaName, modelName, fingerprint, cerialVersion: '0.3.0', status }) as const;

const schemaInput = (schemaName: string, managedTables: string[], extra: Record<string, unknown> = {}) => ({
  schemaName,
  fingerprint: 'sf',
  statements: ['DEFINE TABLE t'],
  managedTables,
  ...extra,
});

describe('state survives', () => {
  test('a second connection reads what the first wrote', async () => {
    const { db, name } = await scratch('persist');
    await writeModelState(db, model('main', 'User', 'abc'));
    await writeSchemaState(db, schemaInput('main', ['user']));
    await db.close();

    const second = await connect(name);
    const state = await readState(second, 'main');
    expect(state.models.get('User')?.fingerprint).toBe('abc');
    expect(state.models.get('User')?.cerialVersion).toBe('0.3.0');
    expect(state.models.get('User')?.appliedAt).toBeDefined();
    expect(state.schema).toEqual({ fingerprint: 'sf', statements: ['DEFINE TABLE t'], managedTables: ['user'] });
  });

  test('several models written in one call each get their row', async () => {
    const { db } = await scratch('batch');
    const { query, bindings } = buildModelStateWrite([model('main', 'A', 'a'), model('main', 'B', 'b')]);
    const [response] = await db.query(`BEGIN; ${query}; COMMIT`, bindings).responses();
    expect(response?.success).toBe(true);

    const state = await readState(db, 'main');
    expect([...state.models.keys()].sort()).toEqual(['A', 'B']);
  });

  test('a rewrite replaces the row instead of adding one', async () => {
    const { db } = await scratch('rewrite');
    await writeModelState(db, model('main', 'User', 'one'));
    await writeModelState(db, model('main', 'User', 'two'));

    expect((await readState(db, 'main')).models.get('User')?.fingerprint).toBe('two');
    const [rows] = await db.query(`SELECT * FROM ${MIGRATIONS_TABLE}`).collect<[unknown[]]>();
    expect(rows).toHaveLength(1);
  });

  test('two schema names keep separate rows', async () => {
    const { db } = await scratch('twoschemas');
    await writeModelState(db, model('one', 'User', 'a'));
    await writeModelState(db, model('two', 'User', 'b'));
    await writeSchemaState(db, schemaInput('one', ['user']));
    await writeSchemaState(db, schemaInput('two', ['other']));

    const one = await readState(db, 'one');
    const two = await readState(db, 'two');
    expect(one.models.get('User')?.fingerprint).toBe('a');
    expect(two.models.get('User')?.fingerprint).toBe('b');
    expect(one.schema?.managedTables).toEqual(['user']);
    expect(two.schema?.managedTables).toEqual(['other']);
    expect((await readState(db, 'three')).models.size).toBe(0);
  });

  test('a schema row and a model row never share an id', async () => {
    const { db } = await scratch('ids');
    await writeModelState(db, model('main', 'main', 'm'));
    await writeSchemaState(db, schemaInput('main', []));

    const state = await readState(db, 'main');
    expect(state.models.get('main')?.fingerprint).toBe('m');
    expect(state.schema?.fingerprint).toBe('sf');
  });

  test('hostile names are stored and read back as themselves', async () => {
    const { db } = await scratch('hostile');
    const schema = `s"'\`; REMOVE TABLE ${MIGRATIONS_TABLE}; --\n]`;
    const modelName = `M'"\\\`$x}; DELETE ${MIGRATIONS_TABLE}`;
    await writeModelState(db, model(schema, modelName, 'h'));
    await writeSchemaState(db, schemaInput(schema, [`t"'\`x`]));

    const state = await readState(db, schema);
    expect(state.models.get(modelName)?.fingerprint).toBe('h');
    expect(state.schema?.managedTables).toEqual([`t"'\`x`]);
  });
});

describe('what reads as no state', () => {
  test('a database without the table gives empty state and creates nothing', async () => {
    const { db } = await scratch('fresh', false);
    const state = await readState(db, 'main');
    expect(state.models.size).toBe(0);
    expect(state.schema).toBeUndefined();

    const [info] = await db.query('INFO FOR DB').collect<[{ tables: Record<string, string> }]>();
    expect(Object.keys(info.tables)).toEqual([]);
  });

  test('a pending row is no state', async () => {
    const { db } = await scratch('pending');
    await writeModelState(db, model('main', 'User', 'p', 'pending'));
    await writeModelState(db, model('main', 'Post', 'q'));

    const state = await readState(db, 'main');
    expect(state.models.has('User')).toBe(false);
    expect(state.models.has('Post')).toBe(true);
  });

  test('a pending row flipped to applied reads as state', async () => {
    const { db } = await scratch('flip');
    await writeModelState(db, model('main', 'User', 'p', 'pending'));
    await writeModelState(db, model('main', 'User', 'p', 'applied'));

    expect((await readState(db, 'main')).models.get('User')?.fingerprint).toBe('p');
  });

  test('corrupt rows read as no state and are logged', async () => {
    const { db } = await scratch('corrupt');
    await db
      .query(
        `CREATE ${MIGRATIONS_TABLE}:['main', 'BadFp'] SET kind = 'model', status = 'applied', fingerprint = 5, cerialVersion = 'x';
         CREATE ${MIGRATIONS_TABLE}:['main', 'BadStatus'] SET kind = 'model', status = 'weird', fingerprint = 'f', cerialVersion = 'x';
         CREATE ${MIGRATIONS_TABLE}:['main', 'Bare'] SET fingerprint = 'f';
         CREATE ${MIGRATIONS_TABLE}:['main'] SET kind = 'schema', fingerprint = 'f', statements = 'no', managedTables = [];
         CREATE ${MIGRATIONS_TABLE}:['other', 'BadFp'] SET fingerprint = 5`,
      )
      .collect();
    await writeModelState(db, model('main', 'Good', 'g'));

    const warn = spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const state = await readState(db, 'main');
      expect([...state.models.keys()]).toEqual(['Good']);
      expect(state.schema).toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(4);
      expect(String(warn.mock.calls[0]?.[0])).toContain('malformed');
    } finally {
      warn.mockRestore();
    }
  });
});

describe('managedTables', () => {
  test('shrinking without a removed table is refused and the row is unchanged', async () => {
    const { db } = await scratch('shrink');
    await writeSchemaState(db, schemaInput('main', ['a', 'b']));

    await expect(writeSchemaState(db, schemaInput('main', ['a']))).rejects.toBeInstanceOf(CerialMigrationError);
    expect((await readState(db, 'main')).schema?.managedTables).toEqual(['a', 'b']);
  });

  test('a removed table that is not the dropped one does not excuse it', async () => {
    const { db } = await scratch('shrinkwrong');
    await writeSchemaState(db, schemaInput('main', ['a', 'b']));

    await expect(writeSchemaState(db, schemaInput('main', ['a'], { removedTables: ['c'] }))).rejects.toBeInstanceOf(
      CerialMigrationError,
    );
  });

  test('shrinking with the matching removed table is allowed', async () => {
    const { db } = await scratch('shrinkok');
    await writeSchemaState(db, schemaInput('main', ['a', 'b']));
    await writeSchemaState(db, schemaInput('main', ['a'], { removedTables: ['b'] }));

    expect((await readState(db, 'main')).schema?.managedTables).toEqual(['a']);
  });

  test('growth is allowed', async () => {
    const { db } = await scratch('grow');
    await writeSchemaState(db, schemaInput('main', ['a']));
    await writeSchemaState(db, schemaInput('main', ['a', 'b']));

    expect((await readState(db, 'main')).schema?.managedTables).toEqual(['a', 'b']);
  });

  test('the builder refuses a shrink without touching a database', () => {
    expect(() => buildSchemaStateWrite({ ...schemaInput('main', []), previousManagedTables: ['a'] })).toThrow(
      CerialMigrationError,
    );
  });
});

describe('every value is bound', () => {
  test('pieces carry names and fingerprints only as bindings', () => {
    const evil = `x'; REMOVE TABLE y; --`;
    const m = buildModelStateWrite([model(evil, evil, evil), model('b', 'c')]);
    const s = buildSchemaStateWrite({ ...schemaInput(evil, [evil]), previousManagedTables: [] });

    for (const piece of [m, s]) {
      expect(piece.query).not.toContain('REMOVE');
      expect(piece.query).not.toContain(evil);
    }
    expect(Object.keys(m.bindings)).toEqual(['modelRows']);
    expect(Object.keys(s.bindings)).toContain('schemaStateId');
  });
});

describe('live fingerprint matches the desired one', () => {
  const corpus = loadCorpus();
  const resolved = resolveInheritance(corpus.ast);
  const models = convertModels(resolved.models.filter((m) => !m.abstract));
  const objects = convertObjects(resolved.objects);
  const tuples = convertTuples(resolved.tuples);
  const enumLiterals: ASTLiteral[] = resolved.enums.map((e) => ({
    name: e.name,
    variants: e.values.map((value): ASTLiteralVariant => ({ kind: 'string', value })),
    range: e.range,
    origin: e.origin,
  }));
  const literals = convertLiterals([...resolved.literals, ...enumLiterals]);
  const objectRegistry = createObjectRegistry(objects);
  const tupleRegistry = createTupleRegistry(tuples);
  const literalRegistry = createLiteralRegistry(literals);
  resolveObjectFields(models, objects, objectRegistry, tupleRegistry, literalRegistry);
  const registry = createRegistry(models);
  inferFKTypes(models, registry);

  const picked = models.slice(0, 3);
  const subset = Object.fromEntries(picked.map((m) => [m.name, registry[m.name]!]));

  test('a schema applied to a scratch database fingerprints as desired, and a hand-added field moves it', async () => {
    expect(picked.length).toBeGreaterThan(0);
    const { db } = await scratch('live', false);
    for (const m of picked) {
      const ddl = generateModelDefineStatements(
        m,
        undefined,
        undefined,
        objectRegistry,
        tupleRegistry,
        literalRegistry,
      );
      const responses = await db.query(ddl.join(';\n')).responses();
      expect(responses.every((r) => r.success)).toBe(true);
    }

    const desired = buildDesiredSchema(subset, objectRegistry, tupleRegistry, literalRegistry);
    const live = await readLiveSchema(db);
    expect(liveFingerprint(live)).toBe(schemaFingerprint(desired));

    const table = desired.tables[0]!.name;
    await db.query(`DEFINE FIELD handAdded ON TABLE \`${table}\` TYPE string`).collect();
    expect(liveFingerprint(await readLiveSchema(db))).not.toBe(schemaFingerprint(desired));
  });
});
