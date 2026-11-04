import { describe, expect, test } from 'bun:test';
import { CerialMigrationError } from '../../../src/errors';
import { buildMigrationPlan, diffSchema, indexDesiredStatements, type SchemaModel } from '../../../src/migrations';
import { field, index, schema, table } from './diff-helpers';

const ID = field('id', 'record<note>');

function plan(statements: string[], desired: SchemaModel, live: SchemaModel) {
  const differences = diffSchema(desired, live, { managedTables: [] });

  return buildMigrationPlan(
    differences,
    indexDesiredStatements(['DEFINE TABLE OVERWRITE note SCHEMAFULL;', ...statements]),
    live,
  );
}

const populated = (name: string, fields: ReturnType<typeof field>[], indexes: ReturnType<typeof index>[] = []) => ({
  ...table(name, fields, indexes),
  populated: true as const,
});

const ID_STATEMENT = 'DEFINE FIELD OVERWRITE id ON TABLE note TYPE record<note>;';
const MIGRATE = /^(.*) MIGRATE EXISTING ROWS AS (cerial_[0-9a-f]{12}) USING (.*);$/;

describe('a type change over stored rows', () => {
  const live = schema([populated('note', [ID, field('size', 'string')])]);
  const typeChange = (
    kind: string,
    extra = {},
    statement = `DEFINE FIELD OVERWRITE size ON TABLE note TYPE ${kind};`,
  ) => plan([ID_STATEMENT, statement], schema([table('note', [ID, field('size', kind, extra)])]), live);

  test('converts with a cast and falls back to the default, as data-loss', () => {
    const [item] = typeChange('int', { default: '0' }, 'DEFINE FIELD OVERWRITE size ON TABLE note TYPE int DEFAULT 0;');

    expect(item!.statement).toMatch(MIGRATE);
    expect(item!.statement).toContain('DEFAULT 0 MIGRATE EXISTING ROWS AS');
    expect(item!.statement).toEndWith('USING <int>$value FALLBACK 0;');
    expect(item!.class).toBe('data-loss');
    expect(item!.reason).toContain('rows whose value does not convert get 0');
  });

  test('falls back to NONE on an optional field', () => {
    const [item] = typeChange('option<int>');

    expect(item!.statement).toEndWith('USING <int | none>$value FALLBACK NONE;');
    expect(item!.class).toBe('data-loss');
  });

  test('with neither a default nor an optional type it names the field and the fix', () => {
    expect(() => typeChange('int')).toThrow(CerialMigrationError);
    expect(() => typeChange('int')).toThrow(/field `size` on table `note`.*Add a @default, make the field optional/);
  });

  test('a default computed at write time cannot be a fallback and is refused by name', () => {
    expect(() =>
      typeChange(
        'datetime',
        { default: 'time::now()' },
        'DEFINE FIELD OVERWRITE size ON TABLE note TYPE datetime DEFAULT time::now();',
      ),
    ).toThrow(/`size`.*computed at write time/);
  });

  test('a widening the server accepts bare keeps the bare definition and its class', () => {
    const [item] = typeChange('option<string>');

    expect(item!.statement).toBe('DEFINE FIELD OVERWRITE size ON TABLE note TYPE option<string>;');
    expect(item!.class).toBe('destructive');
  });

  test('a table with no rows keeps the bare definition for the same change', () => {
    const empty = schema([table('note', [ID, field('size', 'string')])]);
    const differences = diffSchema(schema([table('note', [ID, field('size', 'int')])]), empty, { managedTables: [] });
    const [item] = buildMigrationPlan(
      differences,
      indexDesiredStatements([
        'DEFINE TABLE OVERWRITE note SCHEMAFULL;',
        ID_STATEMENT,
        'DEFINE FIELD OVERWRITE size ON TABLE note TYPE int;',
      ]),
      empty,
    );

    expect(item!.statement).toBe('DEFINE FIELD OVERWRITE size ON TABLE note TYPE int;');
  });

  test('the migration name is stable for one step and differs between steps', () => {
    const name = (kind: string) =>
      MIGRATE.exec(typeChange(kind, {}, `DEFINE FIELD OVERWRITE size ON TABLE note TYPE ${kind};`)[0]!.statement!)![2];

    expect(name('option<int>')).toBe(name('option<int>'));
    expect(name('option<int>')).not.toBe(name('option<float>'));
  });
});

describe('a new required field over stored rows', () => {
  const live = schema([populated('note', [ID])]);

  test('is filled with its default', () => {
    const [item] = plan(
      [ID_STATEMENT, 'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int DEFAULT 0;'],
      schema([table('note', [ID, field('age', 'int', { default: '0' })])]),
      live,
    );

    expect(item!.statement).toMatch(MIGRATE);
    expect(item!.statement).toEndWith('USING 0;');
    expect(item!.class).toBe('additive');
  });

  test('without a default names the field and the fix', () => {
    const run = () =>
      plan(
        [ID_STATEMENT, 'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int;'],
        schema([table('note', [ID, field('age', 'int')])]),
        live,
      );

    expect(run).toThrow(CerialMigrationError);
    expect(run).toThrow(/new required field `age` on table `note`.*Add a @default, make the field optional/);
  });

  test('an optional field and a table with no rows carry no clause', () => {
    const optional = plan(
      [ID_STATEMENT, 'DEFINE FIELD OVERWRITE age ON TABLE note TYPE option<int>;'],
      schema([table('note', [ID, field('age', 'option<int>')])]),
      live,
    );
    const empty = plan(
      [ID_STATEMENT, 'DEFINE FIELD OVERWRITE age ON TABLE note TYPE int;'],
      schema([table('note', [ID, field('age', 'int')])]),
      schema([table('note', [ID])]),
    );

    expect(optional[0]!.statement).not.toContain('MIGRATE');
    expect(empty[0]!.statement).not.toContain('MIGRATE');
  });
});

describe('a field removal', () => {
  test('is the removal alone, with no UNSET step after it', () => {
    const live = schema([populated('note', [ID, field('legacy', 'string')])]);
    const items = plan([ID_STATEMENT], schema([table('note', [ID])]), live);

    expect(items.map((i) => i.statement)).toEqual(['REMOVE FIELD `legacy` ON `note`;']);
    expect(items[0]!.reason).toContain('deletes its stored values');
  });
});

describe('index order around a data step', () => {
  const live = schema([populated('note', [ID, field('size', 'string'), field('title', 'string')])]);
  const definitions = [
    ID_STATEMENT,
    'DEFINE FIELD OVERWRITE size ON TABLE note TYPE option<int>;',
    'DEFINE FIELD OVERWRITE title ON TABLE note TYPE string;',
    'DEFINE INDEX OVERWRITE note_title_index ON TABLE note COLUMNS title;',
    'DEFINE INDEX OVERWRITE note_size_index ON TABLE note COLUMNS size;',
  ];
  const desired = (indexes: ReturnType<typeof index>[]) =>
    schema([table('note', [ID, field('size', 'option<int>'), field('title', 'string')], indexes)]);

  test('an index over an untouched field is defined before the migrating step', () => {
    const items = plan(definitions.slice(0, 4), desired([index('note_title_index', 'title')]), live);
    const statements = items.map((i) => i.statement!);

    expect(statements.findIndex((s) => s.startsWith('DEFINE INDEX'))).toBeLessThan(
      statements.findIndex((s) => s.includes('MIGRATE EXISTING ROWS')),
    );
  });

  test('an index over the migrating field is refused by name, before any statement runs', () => {
    expect(() => plan(definitions, desired([index('note_size_index', 'size')]), live)).toThrow(
      /field `size` on table `note`.*index `note_size_index`.*Apply the schema twice/,
    );
  });

  test('a live index the schema keeps over the migrating field is refused too', () => {
    const kept = schema([
      populated('note', [ID, field('size', 'string'), field('title', 'string')], [index('note_size_index', 'size')]),
    ]);

    expect(() => plan(definitions, desired([index('note_size_index', 'size')]), kept)).toThrow(
      /index `note_size_index` reads it/,
    );
  });

  test('a live index the schema drops is removed before the migrating step', () => {
    const dropped = schema([
      populated('note', [ID, field('size', 'string'), field('title', 'string')], [index('old_size_index', 'size')]),
    ]);
    const statements = plan(definitions.slice(0, 3), desired([]), dropped).map((i) => i.statement!);

    expect(statements[0]).toBe('REMOVE INDEX `old_size_index` ON `note`;');
    expect(statements[1]).toContain('MIGRATE EXISTING ROWS');
  });
});
