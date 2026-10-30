import { describe, expect, test } from 'bun:test';
import { buildOptions, optionEntries } from '../../../../src/parser/builder';
import { parseCompositeDirective } from '../../../../src/parser/types/model/composite-directive-parser';
import { registryOf, SYNTHETIC_OPTIONS_ENTRY } from './helpers';

describe('builder options form', () => {
  test('a multi-part entry becomes an options key, never a chain method', () => {
    expect(optionEntries('model').map((e) => e.name)).toEqual(['@@index', '@@unique']);
    expect(optionEntries('modelField')).toEqual([]);
  });

  test('model options produce the parser node for the same directive', () => {
    const [node] = buildOptions('model', { unique: { name: 'cityZip', fields: ['location.city', 'zip'] } });
    const parsed = parseCompositeDirective('@@unique(cityZip, [location.city, zip])', 0);

    expect(node).toMatchObject({ kind: 'unique', name: 'cityZip', fields: ['location.city', 'zip'] });
    expect('directive' in parsed && node?.origin.kind).toBe('dsl');
    expect('directive' in parsed && node).toMatchObject({ kind: 'unique', name: 'cityZip' });
  });

  test('both keys at once, in the order given; an undefined key is skipped', () => {
    const nodes = buildOptions('model', { index: { name: 'a', fields: ['x'] }, unique: undefined });

    expect(nodes).toMatchObject([{ kind: 'index', name: 'a' }]);
  });

  test('a synthetic multi-part entry on a field target is reachable with no builder edit', () => {
    const registry = registryOf(SYNTHETIC_OPTIONS_ENTRY);
    const [node] = buildOptions('modelField', { unique: { name: 'pair', fields: ['a', 'b.c'] } }, { registry });

    expect(node).toMatchObject({ type: 'unique', value: '@@unique(pair, [a, b.c])' });
  });

  test('an unknown key is refused rather than ignored', () => {
    // @ts-expect-error -- 'fulltext' is not an options key
    expect(() => buildOptions('model', { fulltext: { name: 'a', fields: ['x'] } })).toThrow(
      "'fulltext' is not an options key",
    );
    // @ts-expect-error -- a model has no options key for a chain decorator
    expect(() => buildOptions('model', { id: { name: 'a', fields: ['x'] } })).toThrow('not an options key');
  });

  test('a key is refused on a target its entry does not allow', () => {
    expect(() => buildOptions('modelField', { unique: { name: 'a', fields: ['x'] } })).toThrow('not an options key');
  });

  test('bad names and field lists are refused', () => {
    expect(() => buildOptions('model', { index: { name: 'a b', fields: ['x'] } })).toThrow('plain name');
    expect(() => buildOptions('model', { index: { name: 'a', fields: [] } })).toThrow('field paths');
    expect(() => buildOptions('model', { index: { name: 'a', fields: ['x]'] } })).toThrow('field paths');
    expect(() => buildOptions('model', { index: { name: 'a', fields: ['a..b'] } })).toThrow('field paths');
  });
});
