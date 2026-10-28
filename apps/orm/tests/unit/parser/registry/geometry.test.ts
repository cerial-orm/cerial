import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

const GEOMETRY = ['@point', '@line', '@polygon', '@multipoint', '@multiline', '@multipolygon', '@geoCollection'];

describe('registry: geometry decorators', () => {
  test.each(GEOMETRY)('%s parses like the dispatch', (name) => {
    expectSameAsDispatch(name, [name]);
  });

  test('all seven share one handler and none excludes another', () => {
    const handlers = new Set(GEOMETRY.map((name) => entryFor(name).parse));
    expect(handlers.size).toBe(1);
    for (const name of GEOMETRY) expect(entryFor(name).excludes).toEqual([]);
  });

  test('the collection decorator is @geoCollection, not @collection', () => {
    expect(() => entryFor('@collection')).toThrow();
  });
});
