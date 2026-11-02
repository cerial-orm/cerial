import { afterAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generateSingleSchema } from '../../../src/cli/generate';
import { generateRegistryDefineStatements } from '../../../src/generators/migrations/define-generator';
import type { LiteralRegistry, ModelRegistry, ObjectRegistry, TupleRegistry } from '../../../src/types';
import { SCHEMAS_DIR } from '../../generators/parity-corpus';
import { CerialMigrationError } from '../../../src/errors';
import {
  buildDesiredSchema,
  buildMigrationPlan,
  diffSchema,
  indexDesiredStatements,
  type SchemaDifference,
  type SchemaModel,
} from '../../../src/migrations';
import { field, index, schema, table } from './diff-helpers';

const STATEMENTS = indexDesiredStatements([
  'DEFINE TABLE OVERWRITE user SCHEMAFULL;',
  'DEFINE FIELD OVERWRITE id ON TABLE user TYPE record<user>;',
  'DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;',
  'DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;',
  'DEFINE FIELD OVERWRITE tags ON TABLE user TYPE array<string>;',
  'DEFINE INDEX OVERWRITE user_email_unique ON TABLE user COLUMNS email UNIQUE;',
  'DEFINE INDEX OVERWRITE user_name_index ON TABLE user COLUMNS name;',
  'DEFINE TABLE OVERWRITE post SCHEMAFULL;',
  'DEFINE FIELD OVERWRITE title ON TABLE post TYPE string;',
  'DEFINE INDEX OVERWRITE post_title_index ON TABLE post COLUMNS title;',
]);

const USER_FIELDS = [field('id', 'record<user>'), field('name', 'string'), field('email', 'string')];

function plan(desired: SchemaModel, live: SchemaModel, managed: string[] = []) {
  const differences = diffSchema(desired, live, { managedTables: managed });

  return buildMigrationPlan(differences, STATEMENTS, live);
}

describe('buildMigrationPlan forward statements', () => {
  test('one new field issues exactly that field statement', () => {
    const live = schema([table('user', [field('id', 'record<user>'), field('name', 'string')])]);
    const desired = schema([table('user', USER_FIELDS)]);

    expect(plan(desired, live).map((i) => i.statement)).toEqual([
      'DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;',
    ]);
  });

  test('an unchanged index and unchanged fields are never reissued', () => {
    const same = schema([table('user', USER_FIELDS, [index('user_email_unique', 'email', 'UNIQUE')])]);

    expect(plan(same, same)).toEqual([]);
  });

  test('a new table issues its table, fields, then indexes', () => {
    const desired = schema([table('post', [field('title', 'string')], [index('post_title_index', 'title')])]);

    expect(plan(desired, schema([])).map((i) => i.statement)).toEqual([
      'DEFINE TABLE OVERWRITE post SCHEMAFULL;',
      'DEFINE FIELD OVERWRITE title ON TABLE post TYPE string;',
      'DEFINE INDEX OVERWRITE post_title_index ON TABLE post COLUMNS title;',
    ]);
  });

  test('a changed index is redefined, an index absent from the changes is not', () => {
    const fields = USER_FIELDS;
    const live = schema([
      table('user', fields, [index('user_email_unique', 'email'), index('user_name_index', 'name')]),
    ]);
    const desired = schema([
      table('user', fields, [index('user_email_unique', 'email', 'UNIQUE'), index('user_name_index', 'name')]),
    ]);

    expect(plan(desired, live).map((i) => i.statement)).toEqual([
      'DEFINE INDEX OVERWRITE user_email_unique ON TABLE user COLUMNS email UNIQUE;',
    ]);
  });
});

describe('buildMigrationPlan order', () => {
  test('new tables, new fields, changed fields, indexes, then removals, then reports', () => {
    const live = schema(
      [
        table('user', [field('id', 'record<user>'), field('name', 'int'), field('old', 'string')]),
        table('gone', [field('a', 'string')]),
      ],
      [{ kind: 'events', name: 'e', table: 'user' }],
    );
    const desired = schema([
      table('user', [...USER_FIELDS], [index('user_name_index', 'name')]),
      table('post', [field('title', 'string')], [index('post_title_index', 'title')]),
    ]);

    const items = plan(desired, live, ['gone']);

    expect(items.map((i) => i.statement)).toEqual([
      'DEFINE TABLE OVERWRITE post SCHEMAFULL;',
      'DEFINE FIELD OVERWRITE title ON TABLE post TYPE string;',
      'DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;',
      'DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;',
      'DEFINE INDEX OVERWRITE user_name_index ON TABLE user COLUMNS name;',
      'DEFINE INDEX OVERWRITE post_title_index ON TABLE post COLUMNS title;',
      'REMOVE FIELD `old` ON `user`;',
      'UPDATE `user` UNSET `old`;',
      'REMOVE TABLE `gone`;',
      undefined,
    ]);
  });

  test('a rename reads as one removal and one addition', () => {
    const live = schema([
      table('user', [field('id', 'record<user>'), field('name', 'string'), field('mail', 'string')]),
    ]);
    const desired = schema([table('user', USER_FIELDS)]);

    expect(plan(desired, live).map((i) => i.statement)).toEqual([
      'DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;',
      'REMOVE FIELD `mail` ON `user`;',
      'UPDATE `user` UNSET `mail`;',
    ]);
  });
});

describe('buildMigrationPlan reasons and reports', () => {
  test('a changed type says Cerial writes no data step', () => {
    const live = schema([table('user', [field('id', 'record<user>'), field('name', 'int'), field('email', 'string')])]);
    const [item] = plan(schema([table('user', USER_FIELDS)]), live);

    expect(item!.class).toBe('destructive');
    expect(item!.reason).toContain('Cerial writes no data step');
    expect(item!.reason).toContain('rows already holding the old type refuse writes');
  });

  test('a change that is not a type change does not carry the type note', () => {
    const live = schema([
      table('user', [
        field('id', 'record<user>'),
        field('name', 'string', { readonly: true }),
        field('email', 'string'),
      ]),
    ]);
    const [item] = plan(schema([table('user', USER_FIELDS)]), live);

    expect(item!.statement).toBe('DEFINE FIELD OVERWRITE name ON TABLE user TYPE string;');
    expect(item!.reason).not.toContain('no data step');
  });

  test('an unmanaged difference is a report with no statement', () => {
    const base = table('user', USER_FIELDS);
    const items = plan(schema([base]), schema([base], [{ kind: 'functions', name: 'fn::x' }]));

    expect(items).toHaveLength(1);
    expect(items[0]!.statement).toBeUndefined();
    expect(items[0]!.class).toBe('unmanaged');
    expect(items[0]!.construct).toBe('functions');
  });

  test('every step names the raw table it acts on, removals included', () => {
    const live = schema([
      table('user', [...USER_FIELDS, field('legacy', 'string')]),
      table('gone', [field('id', 'record<gone>')]),
    ]);
    const items = plan(schema([table('user', USER_FIELDS), table('post', [field('title', 'string')])]), live, ['gone']);

    expect(items.some((i) => i.statement?.startsWith('REMOVE TABLE'))).toBe(true);
    expect(items.some((i) => i.statement?.startsWith('UPDATE'))).toBe(true);
    for (const item of items.filter((i) => i.statement !== undefined)) {
      expect(['user', 'post', 'gone']).toContain(item.table!);
    }
    expect(items.find((i) => i.statement?.startsWith('REMOVE TABLE'))!.table).toBe('gone');
  });

  test('an empty difference list gives an empty plan', () => {
    expect(buildMigrationPlan([], STATEMENTS, schema([]))).toEqual([]);
  });
});

describe('buildMigrationPlan covered differences', () => {
  test('a removed table drops its fields and indexes', () => {
    const live = schema([table('gone', [field('a', 'string'), field('b', 'string')], [index('gone_a_index', 'a')])]);
    const items = plan(schema([]), live, ['gone']);

    expect(items.map((i) => i.statement)).toEqual(['REMOVE TABLE `gone`;']);
  });

  test('a removed object field is removed once with its children, index and element', () => {
    const live = schema([
      table(
        'user',
        [
          field('id', 'record<user>'),
          field('o', 'object'),
          field('o.x', 'string'),
          field('arr', 'array<string>'),
          field('arr.*', 'string'),
        ],
        [{ name: 'user_o_x_index', columns: [['o', 'x']], index: '' }],
      ),
    ]);
    const desired = schema([table('user', [field('id', 'record<user>')])]);

    expect(plan(desired, live).map((i) => i.statement)).toEqual([
      'REMOVE INDEX `user_o_x_index` ON `user`;',
      'REMOVE FIELD `o`.`x` ON `user`;',
      'REMOVE FIELD `o` ON `user`;',
      'UPDATE `user` UNSET `o`;',
      'REMOVE FIELD `arr`.`*` ON `user`;',
      'REMOVE FIELD `arr` ON `user`;',
      'UPDATE `user` UNSET `arr`;',
    ]);
  });

  test('an index live-only on a surviving field is still removed', () => {
    const f = [field('id', 'record<user>'), field('name', 'string'), field('email', 'string')];
    const live = schema([table('user', f, [index('stray', 'name')])]);

    expect(plan(schema([table('user', f)]), live).map((i) => i.statement)).toEqual(['REMOVE INDEX `stray` ON `user`;']);
  });

  test('no statement appears twice', () => {
    const live = schema([
      table(
        'user',
        [field('id', 'record<user>'), field('o', 'object'), field('o.x', 'string')],
        [{ name: 'i', columns: [['o', 'x']], index: '' }],
      ),
    ]);
    const statements = plan(schema([table('user', [field('id', 'record<user>')])]), live).map((i) => i.statement);

    expect(new Set(statements).size).toBe(statements.length);
  });
});

describe('buildMigrationPlan failures', () => {
  test('a difference with no desired statement throws naming it', () => {
    const live = schema([table('user', [field('id', 'record<user>')])]);
    const desired = schema([table('user', [field('id', 'record<user>'), field('ghost', 'string')])]);
    const differences = diffSchema(desired, live, { managedTables: [] });

    expect(() => buildMigrationPlan(differences, STATEMENTS, live)).toThrow(CerialMigrationError);
    expect(() => buildMigrationPlan(differences, STATEMENTS, live)).toThrow(/field-missing-required `user`/);
  });

  test('a missing index statement and a missing table throw', () => {
    const live = schema([table('user', USER_FIELDS)]);
    const index_ = diffSchema(schema([table('user', USER_FIELDS, [index('nope', 'name')])]), live, {
      managedTables: [],
    });
    const tbl = diffSchema(schema([table('nowhere', [])]), schema([]), { managedTables: [] });

    expect(() => buildMigrationPlan(index_, STATEMENTS, live)).toThrow(/nope/);
    expect(() => buildMigrationPlan(tbl, STATEMENTS, schema([]))).toThrow(/nowhere/);
  });

  test('a removal the live schema cannot back throws', () => {
    const live = schema([table('x', [field('a', 'string')])]);
    const gone: SchemaDifference = diffSchema(schema([table('x', [])]), live, { managedTables: [] })[0]!;

    expect(() => buildMigrationPlan([gone], STATEMENTS, schema([]))).toThrow(CerialMigrationError);
  });

  test('indexing a duplicate or an orphan statement throws', () => {
    const t = 'DEFINE TABLE OVERWRITE a SCHEMAFULL;';

    expect(() => indexDesiredStatements([t, t])).toThrow(CerialMigrationError);
    expect(() => indexDesiredStatements(['DEFINE FIELD OVERWRITE f ON TABLE b TYPE string;'])).toThrow(
      CerialMigrationError,
    );
    expect(() => indexDesiredStatements(['REMOVE TABLE a;'])).toThrow(CerialMigrationError);
  });
});

describe('indexDesiredStatements over the e2e corpus', () => {
  const outputDir = mkdtempSync(join(tmpdir(), 'cerial-plan-'));
  afterAll(() => rmSync(outputDir, { recursive: true, force: true }));

  test('indexes every generated statement, and its keys equal buildDesiredSchema', async () => {
    const { log, info, warn, error } = console;
    console.log = console.info = console.warn = console.error = () => {};
    try {
      const result = await generateSingleSchema({ schemaPath: SCHEMAS_DIR, outputDir, logLevel: 'minimal' });
      if (!result.success) throw new Error(`corpus generation failed: ${result.errors.join('; ')}`);
    } finally {
      Object.assign(console, { log, info, warn, error });
    }
    const registries = (await import(join(outputDir, 'internal', 'model-registry.ts'))) as {
      modelRegistry: ModelRegistry;
      objectRegistry?: ObjectRegistry;
      tupleRegistry?: TupleRegistry;
      literalRegistry?: LiteralRegistry;
    };
    const objects = registries.objectRegistry ?? {};
    const tuples = registries.tupleRegistry ?? {};
    const literals = registries.literalRegistry ?? {};

    const statements = generateRegistryDefineStatements(
      registries.modelRegistry,
      undefined,
      undefined,
      objects,
      tuples,
      literals,
    );
    const indexed = indexDesiredStatements(statements);
    const built = buildDesiredSchema(registries.modelRegistry, objects, tuples, literals);

    expect([...indexed.keys()].sort()).toEqual(built.tables.map((t) => t.name).sort());
    let count = 0;
    for (const t of built.tables) {
      const found = indexed.get(t.name)!;
      expect([...found.fields.keys()].sort()).toEqual(t.fields.map((f) => JSON.stringify(f.path)).sort());
      expect([...found.indexes.keys()].sort()).toEqual(t.indexes.map((i) => i.name).sort());
      count += found.fields.size + found.indexes.size;
    }
    expect(count).toBeGreaterThan(0);
  });
});

const NO_STATE = { managedTables: [] };

describe('buildMigrationPlan: an index the schema keeps', () => {
  const desiredStatements = indexDesiredStatements([
    'DEFINE TABLE OVERWRITE user SCHEMAFULL;',
    'DEFINE FIELD OVERWRITE email ON TABLE user TYPE string;',
    'DEFINE INDEX OVERWRITE idx ON TABLE user COLUMNS email UNIQUE;',
  ]);
  const desired = schema([table('user', [field('email', 'string')], [index('idx', 'email', 'UNIQUE')])]);

  test('a field removal does not remove an index the schema redefines under the same name', () => {
    const live = schema([table('user', [field('oldEmail', 'string')], [index('idx', 'oldEmail', 'UNIQUE')])]);

    const statements = buildMigrationPlan(diffSchema(desired, live, NO_STATE), desiredStatements, live).flatMap((i) =>
      i.statement ? [i.statement] : [],
    );

    expect(statements.some((s) => s.startsWith('REMOVE INDEX'))).toBe(false);
    expect(statements.some((s) => s.startsWith('DEFINE INDEX OVERWRITE idx'))).toBe(true);
    expect(statements.some((s) => s.startsWith('REMOVE FIELD `oldEmail`'))).toBe(true);
  });

  test('near miss: an index the schema does not keep is still removed with its field', () => {
    const live = schema([
      table('user', [field('oldEmail', 'string'), field('email', 'string')], [index('gone', 'oldEmail')]),
    ]);

    const statements = buildMigrationPlan(diffSchema(desired, live, NO_STATE), desiredStatements, live).flatMap((i) =>
      i.statement ? [i.statement] : [],
    );

    expect(statements).toContain('REMOVE INDEX `gone` ON `user`;');
  });
});
