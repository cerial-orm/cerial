import { describe, expect, test } from 'bun:test';
import { entryFor, expectRefusedLikeDispatch, expectSameAsDispatch } from './helpers';

describe('registry: array decorators', () => {
  test.each(['@distinct', '@set'])('%s parses like the dispatch', (name) => {
    expectSameAsDispatch(name, [name]);
  });

  test('@sort parses like the dispatch for every accepted form', () => {
    expectSameAsDispatch('@sort', [
      '@sort',
      '@sort()',
      '@sort( )',
      '@sort(asc)',
      '@sort(desc)',
      '@sort(true)',
      '@sort(false)',
      '@sort( desc )',
    ]);
  });

  test('@sort refuses what the dispatch refuses', () => {
    expectRefusedLikeDispatch('@sort', ['@sort(bogus)', '@sort(ASC)', '@sort(1)', '@sort(asc, desc)']);
  });

  test('@sort maps its arguments to a boolean direction', () => {
    const range = { start: { line: 1, column: 0, offset: 0 }, end: { line: 1, column: 0, offset: 0 } };
    const direction = (token: string) => entryFor('@sort').parse(token, range);
    expect(direction('@sort')).toMatchObject({ value: true });
    expect(direction('@sort(asc)')).toMatchObject({ value: true });
    expect(direction('@sort(true)')).toMatchObject({ value: true });
    expect(direction('@sort(desc)')).toMatchObject({ value: false });
    expect(direction('@sort(false)')).toMatchObject({ value: false });
  });

  test('@set excludes @distinct and @sort', () => {
    expect(entryFor('@set').excludes).toEqual(['@distinct', '@sort']);
    expect(entryFor('@distinct').excludes).toEqual(['@set']);
    expect(entryFor('@sort').excludes).toEqual(['@set']);
  });
});
