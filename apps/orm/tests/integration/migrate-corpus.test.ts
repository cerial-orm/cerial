/**
 * Every corpus schema, applied to a scratch database in the shared instance, reads back with no difference
 * from what the registries describe; and a changed live schema is reported difference by difference.
 */

import { afterAll, describe, expect, test } from 'bun:test';
import { Surreal } from 'surrealdb';
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
  buildDesiredSchema,
  diffSchema,
  quoteFieldPath,
  quoteIdent,
  readLiveSchema,
  type SchemaDifference,
  type SchemaModel,
} from '../../src/migrations';
import { resolveInheritance } from '../../src/resolver';
import type {
  ASTLiteral,
  ASTLiteralVariant,
  LiteralRegistry,
  ModelRegistry,
  ObjectRegistry,
  SchemaAST,
  TupleRegistry,
} from '../../src/types';
import { loadCorpus } from '../generators/parity-corpus';

const URL = 'http://127.0.0.1:8000';
const opened: Surreal[] = [];
const databases: string[] = [];

async function admin(): Promise<Surreal> {
  const db = new Surreal();
  await db.connect(URL, { namespace: 'main', authentication: { username: 'root', password: 'root' } });

  return db;
}

async function scratch(label: string): Promise<Surreal> {
  const name = `corpus_${label}_${process.pid}_${Date.now().toString(36)}`;
  const db = await admin();
  await db.query(`DEFINE DATABASE ${name}`).collect();
  await db.use({ namespace: 'main', database: name });
  databases.push(name);
  opened.push(db);

  return db;
}

async function exec(db: Surreal, statements: readonly string[]): Promise<void> {
  const responses = await db.query(statements.join(';\n')).responses();
  const failed = responses.findIndex((response) => !response.success);
  if (failed >= 0) {
    const response = responses[failed]!;
    throw new Error(`statement failed: ${response.success ? '' : response.error.message}\n${statements[failed]}`);
  }
}

afterAll(async () => {
  const root = await admin();
  for (const name of databases) await root.query(`REMOVE DATABASE IF EXISTS ${name}`).collect();
  await root.close();
  for (const db of opened) await db.close().catch(() => {});
});

/** One line per difference; a changed field also shows both sides of each changed attribute. */
function describeDifference(d: SchemaDifference, desired?: SchemaModel, live?: SchemaModel): string {
  const where = [d.table, d.field && JSON.stringify(d.field), d.index, d.name].filter(Boolean).join(' ');
  const find = (schema: SchemaModel | undefined) =>
    schema?.tables
      .find((t) => t.name === d.table)
      ?.fields.find((f) => JSON.stringify(f.path) === JSON.stringify(d.field));
  const want = find(desired) as Record<string, unknown> | undefined;
  const have = find(live) as Record<string, unknown> | undefined;
  const detail = (d.changes ?? [])
    .map((key) => `\n    ${key}: desired ${JSON.stringify(want?.[key])} live ${JSON.stringify(have?.[key])}`)
    .join('');

  return `${d.kind} [${d.class}] ${where}${detail}`;
}

interface Generated {
  readonly ddl: Record<string, string[]>;
  readonly models: ModelRegistry;
  readonly objects: ObjectRegistry;
  readonly tuples: TupleRegistry;
  readonly literals: LiteralRegistry;
}

/**
 * The generator's own metadata, built the way `cli/generate.ts` builds it. The serialised runtime registry drops
 * `uuidDecorator` and `geometrySubtypes`, which the DDL needs, so desired is built from the full metadata here.
 */
function generate(resolved: SchemaAST): Generated {
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
  const modelRegistry = createRegistry(models);
  inferFKTypes(models, modelRegistry);

  return {
    ddl: Object.fromEntries(
      models.map((m) => [
        m.name,
        generateModelDefineStatements(m, undefined, undefined, objectRegistry, tupleRegistry, literalRegistry),
      ]),
    ),
    models: modelRegistry,
    objects: objectRegistry,
    tuples: tupleRegistry,
    literals: literalRegistry,
  };
}

const corpus = loadCorpus();
const resolved = resolveInheritance(corpus.ast);
const abstractModels = new Set(resolved.models.filter((m) => m.abstract).map((m) => m.name));
const generated = generate(resolved);

describe('corpus schemas apply and read back with no difference', () => {
  test('the corpus is not empty', () => {
    expect(corpus.errors).toEqual([]);
    expect(corpus.files.length).toBeGreaterThan(0);
  });

  corpus.files.forEach((file, i) => {
    test(file, async () => {
      const names = corpus.parsed[i]!.models.map((m) => m.name).filter((n) => !abstractModels.has(n));
      if (!names.length) return;

      const db = await scratch('apply');
      for (const name of names) await exec(db, generated.ddl[name]!);

      const models = Object.fromEntries(names.map((name) => [name, generated.models[name]!]));
      const desired = buildDesiredSchema(models, generated.objects, generated.tuples, generated.literals);
      expect(desired.tables.length).toBeGreaterThan(0);

      const live = await readLiveSchema(db);
      const differences = diffSchema(desired, live, { managedTables: [] });

      expect(differences.map((d) => describeDifference(d, desired, live))).toEqual([]);
    });
  });
});

describe('a changed live schema is reported', () => {
  const NON_ASCII = 'naïve_日本';
  const desiredOf = (extra: SchemaModel['tables'][number]['fields'] = []): SchemaModel => ({
    tables: [
      {
        name: 'probe',
        fields: [
          { path: ['kept'], kind: 'string' },
          { path: ['dropped'], kind: 'string' },
          { path: ['retyped'], kind: 'int' },
          ...extra,
        ],
        indexes: [],
      },
    ],
    unmanaged: [],
  });
  const original = [
    'DEFINE TABLE probe SCHEMAFULL',
    'DEFINE FIELD kept ON probe TYPE string',
    'DEFINE FIELD dropped ON probe TYPE string',
    'DEFINE FIELD retyped ON probe TYPE int',
  ];

  test('five edits give exactly five differences, and the non-ASCII one is removable through its own path', async () => {
    const db = await scratch('negative');
    await exec(db, [
      'DEFINE TABLE probe SCHEMAFULL',
      'DEFINE FIELD kept ON probe TYPE string',
      'DEFINE FIELD retyped ON probe TYPE string',
      'DEFINE FIELD added ON probe TYPE string',
      `DEFINE FIELD ${quoteIdent(NON_ASCII)} ON probe TYPE string`,
      'DEFINE EVENT audit ON probe WHEN true THEN (true)',
    ]);
    const desired = desiredOf();

    const differences = diffSchema(desired, await readLiveSchema(db), { managedTables: [] });

    expect(differences.map((d) => `${d.kind}:${d.class}`).sort()).toEqual([
      'field-changed:destructive',
      'field-extra:destructive',
      'field-extra:destructive',
      'field-missing-required:destructive',
      'unmanaged-item:unmanaged',
    ]);

    const byField = (name: string) => differences.find((d) => d.field?.[0] === name);
    expect(byField('dropped')?.kind).toBe('field-missing-required');
    expect(byField('added')?.kind).toBe('field-extra');
    expect(byField('retyped')).toMatchObject({ kind: 'field-changed', changes: ['kind'] });
    expect(differences.find((d) => d.kind === 'unmanaged-item')).toMatchObject({ name: 'audit' });

    const extra = byField(NON_ASCII)!;
    expect(extra.kind).toBe('field-extra');
    expect(extra.field).toEqual([NON_ASCII]);

    // The statement a migration plan builds from the reported difference.
    await exec(db, [`REMOVE FIELD ${quoteFieldPath(extra.field!)} ON ${quoteIdent(extra.table!)}`]);
    const after = diffSchema(desired, await readLiveSchema(db), { managedTables: [] });

    expect(after).toHaveLength(4);
    expect(after.some((d) => d.field?.[0] === NON_ASCII)).toBe(false);
  });

  test('a schema with a non-ASCII field reports no false drift', async () => {
    const db = await scratch('non_ascii');
    await exec(db, [...original, `DEFINE FIELD ${quoteIdent(NON_ASCII)} ON probe TYPE string`]);

    const differences = diffSchema(desiredOf([{ path: [NON_ASCII], kind: 'string' }]), await readLiveSchema(db), {
      managedTables: [],
    });

    expect(differences.map((d) => describeDifference(d))).toEqual([]);
  });
});
