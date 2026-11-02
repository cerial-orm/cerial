import { describe, expect, test } from 'bun:test';
import { CerialMigrationError } from '../../src/errors';
import { diffSchema, emitRemove, type SchemaDifference } from '../../src/migrations';
import { field, index, schema, table } from '../unit/migrations/diff-helpers';

const EMPTY = schema([]);

function only(
  desired: ReturnType<typeof schema>,
  live: ReturnType<typeof schema>,
  kind: string,
  managed: string[] = [],
) {
  const found = diffSchema(desired, live, { managedTables: managed }).filter((d) => d.kind === kind);
  expect(found).toHaveLength(1);

  return found[0]!;
}

describe('emitRemove', () => {
  test('a live-only field is removed and its values unset', () => {
    const live = schema([table('t', [field('a', 'string'), field('b', 'string')])]);
    const d = only(schema([table('t', [field('a', 'string')])]), live, 'field-extra');

    expect(emitRemove(d, live)).toEqual(['REMOVE FIELD `b` ON `t`;', 'UPDATE `t` UNSET `b`;']);
  });

  test('a live-only index is removed', () => {
    const live = schema([table('t', [field('a', 'string')], [index('ia', 'a')])]);
    const d = only(schema([table('t', [field('a', 'string')])]), live, 'index-extra');

    expect(emitRemove(d, live)).toEqual(['REMOVE INDEX `ia` ON `t`;']);
  });

  test('a managed table is removed, and only when managed', () => {
    const live = schema([table('old', [field('a', 'string')])]);
    const d = only(EMPTY, live, 'table-extra-managed', ['old']);

    expect(emitRemove(d, live)).toEqual(['REMOVE TABLE `old`;']);
    expect(() => emitRemove(only(EMPTY, live, 'table-extra-unmanaged'), live)).toThrow(CerialMigrationError);
  });

  test('indexes over the field go first, then children deepest first, then the field, then the unset', () => {
    const live = schema([
      table(
        't',
        [
          field('a', 'string'),
          field('o', 'object'),
          field('o.x', 'object'),
          field('o.x.y', 'string'),
          field('o.z', 'string'),
        ],
        [{ name: 'io', columns: [['o', 'z']], index: '' }, index('ia', 'a')],
      ),
    ]);
    // the differ reports every live-only path; the parent is the shortest one
    const parent = diffSchema(schema([table('t', [field('a', 'string')], [index('ia', 'a')])]), live, {
      managedTables: [],
    }).find((x) => x.kind === 'field-extra' && x.field!.length === 1);

    expect(emitRemove(parent!, live)).toEqual([
      'REMOVE INDEX `io` ON `t`;',
      'REMOVE FIELD `o`.`x`.`y` ON `t`;',
      'REMOVE FIELD `o`.`x` ON `t`;',
      'REMOVE FIELD `o`.`z` ON `t`;',
      'REMOVE FIELD `o` ON `t`;',
      'UPDATE `t` UNSET `o`;',
    ]);
  });

  test('removing only a child unsets that path, not its parent', () => {
    const live = schema([table('t', [field('p', 'object'), field('p.x', 'string')])]);
    const d = diffSchema(schema([table('t', [field('p', 'object')])]), live, { managedTables: [] })[0]!;

    expect(emitRemove(d, live)).toEqual(['REMOVE FIELD `p`.`x` ON `t`;', 'UPDATE `t` UNSET `p`.`x`;']);
  });

  test('an array element is not removed on its own, and goes with its parent', () => {
    const live = schema([
      table('t', [field('arr', 'array<string>'), { ...field('arr', 'string'), path: ['arr', { element: true }] }]),
    ]);
    const found = diffSchema(schema([table('t')]), live, { managedTables: [] });
    const element = found.find((d) => d.field!.length === 2)!;
    const parent = found.find((d) => d.field!.length === 1)!;

    expect(emitRemove(element, live)).toEqual([]);
    expect(emitRemove(parent, live)).toEqual([
      'REMOVE FIELD `arr`.* ON `t`;',
      'REMOVE FIELD `arr` ON `t`;',
      'UPDATE `t` UNSET `arr`;',
    ]);
  });

  test('a difference that adds, redefines or is unmanaged throws and yields no statement', () => {
    const live = schema([table('t', [field('a', 'string')])]);
    const desired = schema([table('t', [field('a', 'int'), field('n', 'string')]), table('fresh')]);
    const found = diffSchema(desired, live, { managedTables: [] });
    const unmanaged = diffSchema(EMPTY, schema([table('u')], [{ kind: 'functions', name: 'f' }]), {
      managedTables: [],
    });
    const kinds = new Set<string>();

    for (const d of [...found, ...unmanaged]) {
      kinds.add(d.kind);
      expect(() => emitRemove(d, live)).toThrow(CerialMigrationError);
    }
    // field-changed is destructive but redefines in place; it is never a removal
    expect(kinds).toContain('field-changed');
    expect(kinds).toContain('field-missing-required');
    expect(kinds).toContain('table-missing');
    expect(kinds).toContain('table-extra-unmanaged');
    expect(kinds).toContain('unmanaged-item');
  });

  test('a state table is never touched', () => {
    const live = schema([table('_cerial_migrations', [field('a', 'string')], [index('ia', 'a')])]);

    for (const kind of ['table-extra-managed', 'field-extra', 'index-extra'] as const) {
      const d: SchemaDifference = {
        kind,
        construct: 'x',
        class: 'destructive',
        table: '_cerial_migrations',
        field: ['a'],
        index: 'ia',
        reason: '',
      };

      expect(() => emitRemove(d, live)).toThrow(CerialMigrationError);
    }
  });

  test('a hostile name is quoted and nothing but REMOVE and UPDATE statements are produced', () => {
    const hostile = 'x`; REMOVE DATABASE main; --\\\n\r\u0085\u2028\u2029';
    const live = schema([
      table(hostile, [field('a', 'string'), { ...field('a', 'string'), path: [hostile] }], [index(hostile, hostile)]),
    ]);
    const found = diffSchema(schema([table(hostile)]), live, { managedTables: [] });
    const statements = [
      ...found.flatMap((d) => emitRemove(d, live)),
      ...emitRemove(only(EMPTY, live, 'table-extra-managed', [hostile]), live),
    ];

    expect(statements.length).toBeGreaterThan(3);
    for (const statement of statements) {
      expect(statement).toMatch(/^(REMOVE (FIELD|INDEX|TABLE)|UPDATE) `/);
      expect(statement).not.toMatch(/[\p{Cc}\p{Zl}\p{Zp}]/u);
      expect(statement).toContain('x\\`; REMOVE DATABASE main; --\\\\\\n\\r\\u{85}\\u{2028}\\u{2029}');
    }
  });
});
