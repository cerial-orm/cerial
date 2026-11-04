import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

describe('registry: identity decorators', () => {
  test.each(['@id', '@unique', '@index'])('%s parses like the dispatch', (name) => {
    expectSameAsDispatch(name, [name]);
  });

  test('declares @index and @unique as exclusive and @id as not nullable or readonly', () => {
    expect(entryFor('@index').excludes).toEqual(['@unique']);
    expect(entryFor('@unique').excludes).toEqual(['@index']);
    expect(entryFor('@id').excludes).toEqual(['@nullable', '@readonly']);
  });

  test('@unique takes the optional nullsNotDistinct choice, like @sort takes its direction', () => {
    expect(entryFor('@unique').args).toEqual({ kind: 'choice', choices: ['nullsNotDistinct'], optional: true });
    expectSameAsDispatch('@unique', ['@unique(nullsNotDistinct)']);
  });

  test('@id is a model-field decorator only', () => {
    expect(entryFor('@id').targets).toEqual(['modelField']);
  });
});
