import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

describe('registry: modifier decorators', () => {
  test.each(['@nullable', '@readonly', '@flexible'])('%s parses like the dispatch', (name) => {
    expectSameAsDispatch(name, [name]);
  });

  test('@nullable is the one modifier legal on a tuple element', () => {
    expect(entryFor('@nullable').targets).toContain('tupleElement');
    expect(entryFor('@readonly').targets).not.toContain('tupleElement');
    expect(entryFor('@flexible').targets).not.toContain('tupleElement');
  });

  test('@nullable and @readonly exclude the decorators the validators refuse them with', () => {
    expect(entryFor('@nullable').excludes).toEqual(['@id', '@now']);
    expect(entryFor('@readonly').excludes).toEqual(['@id', '@now', '@defaultAlways']);
    expect(entryFor('@flexible').excludes).toEqual([]);
  });
});
