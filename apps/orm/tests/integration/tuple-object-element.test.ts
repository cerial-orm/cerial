/**
 * Object elements of a tuple, applied to a scratch database in the shared instance.
 *
 * SurrealDB 4.0 refuses `DEFINE FIELD t[N]` under a tuple literal, so an object element is an
 * inline literal type: the database enforces its full shape, a `@flexible` or self-referencing
 * object inside it is a bare `object` under a `FLEXIBLE` field, and the ORM fills the sub-field
 * defaults the database cannot.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal, Uuid } from 'surrealdb';
import {
  convertModels,
  convertObjects,
  convertTuples,
  createObjectRegistry,
  createRegistry,
  createTupleRegistry,
  inferFKTypes,
  resolveObjectFields,
} from '../../src/generators/metadata';
import { generateModelDefineStatements } from '../../src/generators/migrations';
import { buildDesiredSchema, diffSchema, readLiveSchema } from '../../src/migrations';
import { parse } from '../../src/parser/parser';
import { buildCreateQuery } from '../../src/query/builders/insert-builder';
import { transformData } from '../../src/query/transformers/data-transformer';
import { resolveInheritance } from '../../src/resolver';
import type { ModelMetadata } from '../../src/types';

const SCHEMA = `
object Meta {
  n Int @default(3)
  at Date @createdAt
  seen Date @updatedAt
  tag String @defaultAlways('t')
  v7 Uuid @uuid7
  note String?
}

object Open {
  k String
}

object Wrap {
  meta Meta
  extra Open @flexible
}

object Node {
  label String
  next Node?
}

tuple Pair {
  String,
  Wrap
}

tuple Strict {
  String,
  Meta
}

tuple NodeBox {
  String,
  Node
}

model Holder {
  id Record @id
  pair Pair
  maybe Pair?
  many Pair[]
}

model StrictHolder {
  id Record @id
  strict Strict
}

model NodeHolder {
  id Record @id
  box NodeBox
}
`;

const parsed = parse(SCHEMA);
if (parsed.errors.length) throw new Error(parsed.errors.map((e) => e.message).join(', '));
const resolved = resolveInheritance(parsed.ast);
const models = convertModels(resolved.models);
const objects = convertObjects(resolved.objects);
const tuples = convertTuples(resolved.tuples);
const objectRegistry = createObjectRegistry(objects);
const tupleRegistry = createTupleRegistry(tuples);
resolveObjectFields(models, objects, objectRegistry, tupleRegistry, {});
const registry = createRegistry(models);
inferFKTypes(models, registry);
const model = (name: string): ModelMetadata => registry[name]!;

const opened: Surreal[] = [];
const databases: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect('http://127.0.0.1:8000', {
    namespace: 'main',
    authentication: { username: 'root', password: 'root' },
  });
  opened.push(db);

  return db;
}

async function scratch(): Promise<Surreal> {
  const name = `tupobj_${process.pid}_${Date.now().toString(36)}`;
  const db = await admin();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  databases.push(name);
  for (const m of models) {
    const statements = generateModelDefineStatements(m, undefined, undefined, objectRegistry, tupleRegistry);
    await db.query(statements.join(';\n')).collect();
  }

  return db;
}

afterAll(async () => {
  const root = await admin();
  for (const name of databases) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  for (const db of opened) await db.close().catch(() => {});
});

async function create(db: Surreal, name: string, data: Record<string, unknown>): Promise<Record<string, any>> {
  const query = buildCreateQuery(model(name), transformData(data, model(name)));
  const [row] = await db.query<[Record<string, any>]>(query.text, query.vars).collect();

  return row!;
}

describe('DDL shape', () => {
  test('the object elements are inline literals and only the flexible field is FLEXIBLE', () => {
    const ddl = (name: string): string[] =>
      generateModelDefineStatements(model(name), undefined, undefined, objectRegistry, tupleRegistry);

    expect(ddl('Holder')).toEqual([
      'DEFINE TABLE OVERWRITE holder SCHEMAFULL;',
      'DEFINE FIELD OVERWRITE pair ON TABLE holder TYPE [string, { meta: { n: int, at: option<datetime>, seen: option<datetime>, tag: option<string>, v7: option<uuid>, note: option<string> }, extra: object }] FLEXIBLE;',
      'DEFINE FIELD OVERWRITE maybe ON TABLE holder TYPE option<[string, { meta: { n: int, at: option<datetime>, seen: option<datetime>, tag: option<string>, v7: option<uuid>, note: option<string> }, extra: object }]> FLEXIBLE;',
      'DEFINE FIELD OVERWRITE many ON TABLE holder TYPE array<[string, { meta: { n: int, at: option<datetime>, seen: option<datetime>, tag: option<string>, v7: option<uuid>, note: option<string> }, extra: object }]> FLEXIBLE;',
    ]);
    expect(ddl('StrictHolder')).toEqual([
      'DEFINE TABLE OVERWRITE strict_holder SCHEMAFULL;',
      'DEFINE FIELD OVERWRITE strict ON TABLE strict_holder TYPE [string, { n: int, at: option<datetime>, seen: option<datetime>, tag: option<string>, v7: option<uuid>, note: option<string> }];',
    ]);
    expect(ddl('NodeHolder')).toEqual([
      'DEFINE TABLE OVERWRITE node_holder SCHEMAFULL;',
      'DEFINE FIELD OVERWRITE box ON TABLE node_holder TYPE [string, { label: string, next: option<object> }] FLEXIBLE;',
    ]);
  });
});

describe('applied to the database', () => {
  test('every statement is accepted and the live schema reads back with no difference', async () => {
    const db = await scratch();
    const desired = buildDesiredSchema(registry, objectRegistry, tupleRegistry);
    const differences = diffSchema(desired, await readLiveSchema(db), { managedTables: [] });

    expect(differences).toEqual([]);
  });

  test('omitted sub-field defaults are filled by the ORM and stored', async () => {
    const db = await scratch();
    const row = await create(db, 'StrictHolder', { strict: ['a', { note: 'n' }] });
    const meta = row.strict[1];

    expect(meta.n).toBe(3);
    expect(meta.tag).toBe('t');
    // The stamp comes from the database clock
    expect(Math.abs(new Date(String(meta.at)).getTime() - Date.now())).toBeLessThan(60_000);
    expect(Math.abs(new Date(String(meta.seen)).getTime() - Date.now())).toBeLessThan(60_000);
    expect(meta.v7).toBeInstanceOf(Uuid);
    expect(String(meta.v7)[14]).toBe('7');
    expect(meta.note).toBe('n');
  });

  test('an explicit value wins over every default', async () => {
    const db = await scratch();
    const when = new Date('2020-01-01T00:00:00.000Z');
    const id = new Uuid('11111111-1111-7111-8111-111111111111');
    const row = await create(db, 'StrictHolder', {
      strict: ['a', { n: 0, at: when, seen: when, tag: 'mine', v7: id }],
    });
    const meta = row.strict[1];

    expect(meta.n).toBe(0);
    expect(meta.tag).toBe('mine');
    expect(meta.at.toISOString()).toBe(when.toISOString());
    expect(meta.seen.toISOString()).toBe(when.toISOString());
    expect(String(meta.v7)).toBe(String(id));
  });

  test('the database refuses an undeclared key in a strict object element', async () => {
    const db = await scratch();

    await expect(create(db, 'StrictHolder', { strict: ['a', { stray: 1 }] })).rejects.toThrow();
  });

  test('the database refuses a wrongly typed key in a strict object element', async () => {
    const db = await scratch();

    await expect(create(db, 'StrictHolder', { strict: ['a', { n: 'x' }] })).rejects.toThrow();
  });

  test('a flexible object inside an element keeps undeclared keys, its siblings stay filled', async () => {
    const db = await scratch();
    const row = await create(db, 'Holder', {
      pair: ['a', { meta: {}, extra: { k: 'x', anything: { deep: [1] } } }],
      many: [['b', { meta: { n: 1 }, extra: { k: 'y', more: true } }]],
    });

    expect(row.pair[1].extra).toEqual({ k: 'x', anything: { deep: [1] } });
    expect(row.pair[1].meta.n).toBe(3);
    expect(row.many[0][1].extra).toEqual({ k: 'y', more: true });
    expect(row.many[0][1].meta.n).toBe(1);
    expect(row.maybe).toBeUndefined();
  });

  test('a self-referencing object inside an element stores any depth', async () => {
    const db = await scratch();
    const box = ['b', { label: 'a', next: { label: 'b', next: { label: 'c', next: { label: 'd' } } } }];
    const row = await create(db, 'NodeHolder', { box });

    expect(row.box).toEqual(box);
  });
});
