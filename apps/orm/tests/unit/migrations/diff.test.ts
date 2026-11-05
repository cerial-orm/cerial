import { describe, expect, spyOn, test } from 'bun:test';
import { CerialMigrationError } from '../../../src/errors';
import { classifyDifference, diffSchema } from '../../../src/migrations';
import { deepFreeze, field, index, schema, table } from './diff-helpers';

describe('diffSchema contract', () => {
  test('each difference names construct, table, field or index, class and reason', () => {
    const desired = schema([table('t', [field('a', 'string')], [index('ia', 'a')]), table('n')]);
    const live = schema([table('t', [field('b', 'int')])]);
    const found = diffSchema(desired, live, { managedTables: [] });

    expect(found.map((d) => [d.kind, d.construct, d.table, d.class])).toEqual([
      ['field-missing-required', 'field', 't', 'destructive'],
      ['field-extra', 'field', 't', 'destructive'],
      ['index-missing', 'index', 't', 'additive'],
      ['table-missing', 'table', 'n', 'additive'],
    ]);
    expect(found[0]!.field).toEqual(['a']);
    expect(found[2]!.index).toBe('ia');
    for (const difference of found) {
      expect(difference.reason).toBeTruthy();
    }
  });

  test('managedTables accepts a set and a list alike', () => {
    const live = schema([table('old')]);

    expect(diffSchema(schema([]), live, { managedTables: new Set(['old']) })[0]!.class).toBe('data-loss');
    expect(diffSchema(schema([]), live, { managedTables: ['old'] })[0]!.class).toBe('data-loss');
  });

  test('a table in desired is managed for its own fields whatever managedTables says', () => {
    const desired = schema([table('t')]);
    const live = schema([table('t', [field('x', 'int')])]);

    expect(diffSchema(desired, live, { managedTables: [] })[0]!.class).toBe('destructive');
    expect(diffSchema(desired, live, { managedTables: ['elsewhere'] })[0]!.class).toBe('destructive');
  });

  test('the order is stable: desired tables in order, then live-only tables sorted, then unmanaged items', () => {
    const live = schema([table('z'), table('a'), table('m')], [{ kind: 'params', name: 'p' }]);
    const found = diffSchema(schema([table('m')]), live, { managedTables: [] });

    expect(found.map((d) => d.table ?? d.name)).toEqual(['a', 'z', 'p']);
  });
});

describe('refusing what it cannot classify', () => {
  test('an unknown kind throws CerialMigrationError naming it, and never defaults to additive', () => {
    expect(() => classifyDifference('column-reordered')).toThrow(CerialMigrationError);
    expect(() => classifyDifference('column-reordered')).toThrow("'column-reordered'");
    expect(() => classifyDifference('toString')).toThrow(CerialMigrationError);
  });

  test('every kind the differ emits is known to the classifier', () => {
    for (const kind of ['table-missing', 'field-extra', 'index-changed', 'unmanaged-item']) {
      expect(classifyDifference(kind).class).toBeTruthy();
    }
  });

  test('an index change to a clause Cerial does not define throws', () => {
    const live = schema([table('t', [], [index('ix', 'a', 'SEARCH ANALYZER x')])]);
    const desired = schema([table('t', [], [index('ix', 'a', 'UNIQUE')])]);

    expect(() => diffSchema(desired, live, { managedTables: [] })).toThrow(CerialMigrationError);
    expect(() => diffSchema(desired, live, { managedTables: [] })).toThrow("index 'ix'");
  });

  describe('UNIQUE NULLS NOT DISTINCT', () => {
    const NND = 'UNIQUE NULLS NOT DISTINCT';
    const run = (desired: string, live: string) =>
      diffSchema(
        schema([table('t', [], [index('ix', 'a', desired)])]),
        schema([table('t', [], [index('ix', 'a', live)])]),
        { managedTables: [] },
      );

    test('adding the option to a UNIQUE index is index-unique-added and may fail at apply', () => {
      const [found, ...rest] = run(NND, 'UNIQUE');

      expect(rest).toEqual([]);
      expect(found!.kind).toBe('index-unique-added');
      expect(found!.mayFailAtApply).toBe(true);
    });

    test('adding the option to a non-unique index is index-unique-added', () => {
      expect(run(NND, '').map((d) => d.kind)).toEqual(['index-unique-added']);
    });

    test('dropping the option is index-changed and cannot fail at apply', () => {
      const [found, ...rest] = run('UNIQUE', NND);

      expect(rest).toEqual([]);
      expect(found!.kind).toBe('index-changed');
      expect(found!.mayFailAtApply).toBeUndefined();
    });

    test('dropping UNIQUE altogether from an option index is index-changed', () => {
      expect(run('', NND).map((d) => d.kind)).toEqual(['index-changed']);
    });

    test('near miss: the same clause on both sides is no difference', () => {
      expect(run(NND, NND)).toEqual([]);
      expect(run('UNIQUE', 'UNIQUE')).toEqual([]);
    });
  });

  test('near miss: an unknown clause that is identical on both sides is not a difference', () => {
    const same = schema([table('t', [], [index('ix', 'a', 'SEARCH ANALYZER x')])]);

    expect(diffSchema(same, same, { managedTables: [] })).toEqual([]);
  });

  test('a live-only index with an unknown clause is still classified as removable', () => {
    const live = schema([table('t', [], [index('ix', 'a', 'HNSW DIMENSION 3')])]);

    expect(diffSchema(schema([table('t')]), live, { managedTables: [] })[0]!.kind).toBe('index-extra');
  });

  test('a table, field or index defined twice in one model is refused', () => {
    const twice = (t: ReturnType<typeof table>) => () => diffSchema(schema([t]), schema([t]), { managedTables: [] });

    expect(twice(table('t', [field('a', 'string'), field('a', 'int')]))).toThrow(CerialMigrationError);
    expect(twice(table('t', [], [index('i', 'a'), index('i', 'b')]))).toThrow(CerialMigrationError);
    expect(() => diffSchema(schema([table('t'), table('t')]), schema([]), { managedTables: [] })).toThrow(
      CerialMigrationError,
    );
  });
});

describe('purity', () => {
  test('frozen inputs are accepted, unchanged and not aliased by the result', () => {
    const desired = deepFreeze(schema([table('t', [field('a', 'string')])]));
    const live = deepFreeze(
      schema([table('t', [field('b', 'int')]), table('gone')], [{ kind: 'functions', name: 'f' }]),
    );
    const options = deepFreeze({ managedTables: ['gone'] });
    const before = JSON.stringify([desired, live, options]);
    const found = diffSchema(desired, live, options);

    expect(found.length).toBeGreaterThan(0);
    expect(JSON.stringify([desired, live, options])).toBe(before);
    expect(diffSchema(desired, live, options)).toEqual(found);
  });

  test('no clock, randomness or socket is touched', () => {
    const now = spyOn(Date, 'now');
    const random = spyOn(Math, 'random');
    const socket = { query: () => ({ responses: async () => [] }) };
    const query = spyOn(socket, 'query');

    diffSchema(schema([table('t', [field('a', 'string')])]), schema([table('t')]), { managedTables: [] });

    expect(now).not.toHaveBeenCalled();
    expect(random).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    now.mockRestore();
    random.mockRestore();
  });
});
