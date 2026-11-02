import { describe, expect, test } from 'bun:test';
import { diffSchema } from '../../../src/migrations';
import { field, index, schema, table } from './diff-helpers';

const NONE = { managedTables: [] };

function one(desired: ReturnType<typeof schema>, live: ReturnType<typeof schema>, managedTables: string[] = []) {
  const found = diffSchema(desired, live, { managedTables });
  expect(found).toHaveLength(1);

  return found[0]!;
}

describe('data-loss and destructive classes', () => {
  test('a live table absent from the schema and managed is data-loss', () => {
    const found = one(schema([]), schema([table('old', [field('a', 'string')])]), ['old']);

    expect(found).toMatchObject({ kind: 'table-extra-managed', class: 'data-loss', construct: 'table', table: 'old' });
    expect(found.reason).toBeTruthy();
  });

  test('near miss: the same table when state does not list it is unmanaged, not data-loss', () => {
    expect(one(schema([]), schema([table('old')]), ['other'])).toMatchObject({
      kind: 'table-extra-unmanaged',
      class: 'unmanaged',
    });
  });

  test('a managed table removes as one difference, not one per field', () => {
    const live = schema([table('old', [field('a', 'string'), field('b', 'int')], [index('ia', 'a')])]);

    expect(diffSchema(schema([]), live, { managedTables: ['old'] })).toHaveLength(1);
  });

  test('a live-only field on a table in desired is destructive', () => {
    const found = one(
      schema([table('t', [field('a', 'string')])]),
      schema([table('t', [field('a', 'string'), field('b', 'int')])]),
    );

    expect(found).toMatchObject({ kind: 'field-extra', class: 'destructive', table: 't', field: ['b'] });
    expect(found.reason).toBeTruthy();
  });

  test('no state at all: a live-only field and a live-only index on a desired table are classified, not thrown', () => {
    const desired = schema([table('t', [field('a', 'string')])]);
    const live = schema([table('t', [field('a', 'string'), field('x', 'int')], [index('ix', 'x')])]);
    const found = diffSchema(desired, live, NONE);

    expect(found.map((d) => [d.kind, d.class])).toEqual([
      ['field-extra', 'destructive'],
      ['index-extra', 'destructive'],
    ]);
    expect(found.every((d) => d.reason)).toBe(true);
  });

  test('near miss: the same live-only field on a live-only unmanaged table is not reported on its own', () => {
    const found = one(schema([]), schema([table('foreign', [field('x', 'int')], [index('ix', 'x')])]));

    expect(found.kind).toBe('table-extra-unmanaged');
  });

  test('a changed type is destructive', () => {
    const found = one(schema([table('t', [field('a', 'int')])]), schema([table('t', [field('a', 'string')])]));

    expect(found).toMatchObject({ kind: 'field-changed', class: 'destructive', changes: ['kind'] });
  });

  test.each([
    ['default', { default: "'x'" }, {}],
    ['default', { default: "'x'" }, { default: "'y'" }],
    ['defaultAlways', { default: "'x'", defaultAlways: true }, { default: "'x'" }],
    ['value', { value: '$value' }, {}],
    ['assert', {}, { assert: '$value > 0' }],
    ['readonly', { readonly: true }, {}],
    ['flexible', { flexible: true }, {}],
    ['computed', { computed: 'time::now()' }, {}],
    ['computed', { computed: 'time::now()' }, { computed: 'time::now() + 1d' }],
  ])('a changed %s option is destructive', (attribute, desired, live) => {
    const found = one(
      schema([table('t', [field('a', 'string', desired)])]),
      schema([table('t', [field('a', 'string', live)])]),
    );

    expect(found.class).toBe('destructive');
    expect(found.changes).toContain(attribute);
  });

  test('several changed attributes are one difference listing each', () => {
    const found = one(
      schema([table('t', [field('a', 'int', { readonly: true })])]),
      schema([table('t', [field('a', 'string')])]),
    );

    expect(found.changes).toEqual(['kind', 'readonly']);
  });

  test('a required field missing live with no default is destructive', () => {
    const found = one(schema([table('t', [field('a', 'string')])]), schema([table('t')]));

    expect(found).toMatchObject({ kind: 'field-missing-required', class: 'destructive', field: ['a'] });
  });

  test('near miss: an optional, defaulted, valued or nullable-only field missing live differs in class', () => {
    const live = schema([table('t')]);
    const classOf = (f: ReturnType<typeof field>) => one(schema([table('t', [f])]), live).class;

    expect(classOf(field('a', 'option<string>'))).toBe('additive');
    expect(classOf(field('a', 'string', { default: "'x'" }))).toBe('additive');
    expect(classOf(field('a', 'datetime', { value: 'time::now()' }))).toBe('additive');
    expect(classOf(field('a', 'any'))).toBe('additive');
    // null is a value, not an absent one: `string | null` is still required
    expect(classOf(field('a', 'string | null'))).toBe('destructive');
  });

  test('a required sub-field is destructive and an array element definition is not', () => {
    const live = schema([table('t', [field('o', 'object')])]);

    expect(one(schema([table('t', [field('o', 'object'), field('o.x', 'int')])]), live).class).toBe('destructive');

    const element = { path: ['arr', { element: true as const }], kind: 'string' };
    const found = one(
      schema([table('t', [field('arr', 'array<string>'), element])]),
      schema([table('t', [field('arr', 'array<string>')])]),
    );
    expect(found).toMatchObject({ kind: 'field-missing', class: 'additive' });
  });
});

describe('additive classes', () => {
  test('a table missing live is additive, and its fields add no differences of their own', () => {
    const desired = schema([table('t', [field('a', 'string')], [index('ia', 'a', 'UNIQUE')])]);
    const found = one(desired, schema([]));

    expect(found).toMatchObject({ kind: 'table-missing', class: 'additive', table: 't' });
  });

  test('an index missing live is additive', () => {
    const found = one(schema([table('t', [], [index('ia', 'a')])]), schema([table('t')]));

    expect(found).toMatchObject({ kind: 'index-missing', class: 'additive', index: 'ia' });
  });

  test('UNIQUE added is additive and may fail at apply', () => {
    const found = one(
      schema([table('t', [], [index('ia', 'a', 'UNIQUE')])]),
      schema([table('t', [], [index('ia', 'a')])]),
    );

    expect(found).toMatchObject({ kind: 'index-unique-added', class: 'additive', mayFailAtApply: true });
  });

  test('near miss: UNIQUE dropped is additive without the may-fail flag, and a column change likewise', () => {
    const dropped = one(
      schema([table('t', [], [index('ia', 'a')])]),
      schema([table('t', [], [index('ia', 'a', 'UNIQUE')])]),
    );
    expect(dropped).toMatchObject({ kind: 'index-changed', class: 'additive' });
    expect('mayFailAtApply' in dropped).toBe(false);

    const moved = one(schema([table('t', [], [index('ia', 'b')])]), schema([table('t', [], [index('ia', 'a')])]));
    expect(moved.kind).toBe('index-changed');
  });

  test('a plain missing field is additive', () => {
    expect(one(schema([table('t', [field('a', 'option<string>')])]), schema([table('t')])).class).toBe('additive');
  });
});

describe('unmanaged class', () => {
  test('events and functions are reported as unmanaged and keep their table', () => {
    const live = schema(
      [table('t')],
      [
        { kind: 'events', name: 'on_change', table: 't' },
        { kind: 'functions', name: 'fn::x' },
      ],
    );
    const found = diffSchema(schema([table('t')]), live, NONE);

    expect(found).toEqual([
      expect.objectContaining({
        kind: 'unmanaged-item',
        class: 'unmanaged',
        construct: 'events',
        name: 'on_change',
        table: 't',
      }),
      expect.objectContaining({ kind: 'unmanaged-item', class: 'unmanaged', construct: 'functions', name: 'fn::x' }),
    ]);
    expect('table' in found[1]!).toBe(false);
  });

  test('near miss: an identical schema with no unmanaged items yields nothing', () => {
    const same = schema([table('t', [field('a', 'option<string>')], [index('ia', 'a')])]);

    expect(diffSchema(same, same, NONE)).toEqual([]);
  });
});

describe('equality across the two sides', () => {
  test('an optional tuple element is no drift', () => {
    const desired = schema([table('t', [field('p', '[float, option<float>]')])]);
    const live = schema([table('t', [field('p', '[float, none | float]')])]);

    expect(diffSchema(desired, live, NONE)).toEqual([]);
  });

  test('near miss: a required tuple element against an optional one is a changed type', () => {
    const found = one(
      schema([table('t', [field('p', '[float, float]')])]),
      schema([table('t', [field('p', '[float, none | float]')])]),
    );

    expect(found.kind).toBe('field-changed');
  });

  test('a non-ASCII and a dotted name compare by path', () => {
    const f = [field('é', 'string'), { path: ['a.b'], kind: 'string' }];
    const same = schema([table('t', f)]);

    expect(diffSchema(same, same, NONE)).toEqual([]);
  });
});
