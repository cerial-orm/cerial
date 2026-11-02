import { describe, expect, test } from 'bun:test';
import { diffSchema, findDrift } from '../../../src/migrations';
import { field, index, schema, table } from './diff-helpers';

const drift = (desired: ReturnType<typeof schema>, live: ReturnType<typeof schema>, managed: string[] = []) =>
  findDrift(diffSchema(desired, live, { managedTables: managed }));

describe('findDrift', () => {
  test('a hand-added field on a managed table is reported by table and field name', () => {
    const r = drift(
      schema([table('user', [field('name', 'string')])]),
      schema([table('user', [field('name', 'string'), field('nick', 'string')])]),
    );

    expect(r.hasDrift).toBe(true);
    expect(r.drift).toHaveLength(1);
    expect(r.drift[0]).toMatchObject({ construct: 'field', change: 'extra', table: 'user', field: ['nick'] });
    expect(r.drift[0]!.line).toBe('field `nick` on table `user` is live but not in the schema');
  });

  test('a hand-added index is reported by name', () => {
    const r = drift(
      schema([table('user', [field('name', 'string')])]),
      schema([table('user', [field('name', 'string')], [index('hand_idx', 'name')])]),
    );

    expect(r.drift.map((d) => [d.construct, d.table, d.index])).toEqual([['index', 'user', 'hand_idx']]);
  });

  test('a hand-changed type is reported by name with the attribute', () => {
    const r = drift(schema([table('user', [field('age', 'int')])]), schema([table('user', [field('age', 'string')])]));

    expect(r.hasDrift).toBe(true);
    expect(r.drift[0]).toMatchObject({ construct: 'field', change: 'changed', table: 'user', field: ['age'] });
    expect(r.drift[0]!.line).toBe('field `age` on table `user` differs from the schema (kind)');
  });

  test('an index that no longer matches is drift', () => {
    const r = drift(
      schema([table('user', [field('a', 'string')], [index('i', 'a', 'UNIQUE')])]),
      schema([table('user', [field('a', 'string')], [index('i', 'a')])]),
    );

    expect(r.drift.map((d) => d.index)).toEqual(['i']);
  });

  test('additive-only changes are pending, not drift', () => {
    const r = drift(
      schema([
        table('user', [field('name', 'string'), field('bio', 'option<string>')], [index('i', 'name')]),
        table('post', [field('t', 'string')]),
      ]),
      schema([table('user', [field('name', 'string')])]),
    );

    expect(r.hasDrift).toBe(false);
    expect(r.drift).toEqual([]);
    expect(r.pending.map((d) => d.kind).sort()).toEqual(['field-missing', 'index-missing', 'table-missing']);
  });

  test('a required field the live table lacks is pending', () => {
    const r = drift(schema([table('user', [field('name', 'string')])]), schema([table('user')]));

    expect(r.hasDrift).toBe(false);
    expect(r.pending.map((d) => d.kind)).toEqual(['field-missing-required']);
  });

  test('unmanaged constructs are not drift', () => {
    const r = drift(
      schema([table('user', [field('name', 'string')])]),
      schema(
        [table('user', [field('name', 'string')]), table('foreign')],
        [{ kind: 'events', name: 'on_user', table: 'user' }],
      ),
    );

    expect(r.hasDrift).toBe(false);
    expect(r.drift).toEqual([]);
    expect(r.pending).toEqual([]);
  });

  test('a managed live-only table is drift, an unmanaged one is not', () => {
    const desired = schema([table('user')]);
    const live = schema([table('user'), table('old_thing')]);

    const managed = drift(desired, live, ['old_thing']);
    expect(managed.hasDrift).toBe(true);
    expect(managed.drift.map((d) => [d.construct, d.table, d.line])).toEqual([
      ['table', 'old_thing', 'table `old_thing` is live but not in the schema'],
    ]);
    expect(drift(desired, live).hasDrift).toBe(false);
  });

  test('every drift item is named, one per construct', () => {
    const r = drift(
      schema([table('user', [field('a', 'string')])]),
      schema([table('user', [field('a', 'int'), field('x', 'string'), field('y', 'string')])]),
    );

    expect(r.drift.map((d) => d.field)).toEqual([['a'], ['x'], ['y']]);
  });

  test('hostile and non-ASCII names are reported as themselves on one line', () => {
    const name = 'zażółć\nDROP\u2028x';
    const r = drift(schema([table('user')]), schema([table('user', [field(name, 'string')])]));

    expect(r.drift[0]!.field).toEqual([name]);
    expect(r.drift[0]!.line).not.toMatch(/[\n\r\u2028]/);
    expect(r.drift[0]!.line).toContain('zażółć');
    expect(r.drift[0]!.line).toContain('\\n');
  });
});
