import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

const VALUES = [
  'true',
  'false',
  'null',
  '0',
  '42',
  '-7',
  '1.5',
  '-0.25',
  '"text"',
  "'single'",
  '1h30m',
  'bare',
  '"a b"',
  ' 3 ',
];

describe('registry: default decorators', () => {
  test('@default parses like the dispatch', () => {
    expectSameAsDispatch(
      '@default',
      VALUES.map((v) => `@default(${v})`),
    );
  });

  test('@defaultAlways parses like the dispatch', () => {
    expectSameAsDispatch(
      '@defaultAlways',
      VALUES.map((v) => `@defaultAlways(${v})`),
    );
  });

  test('@default and @defaultAlways exclude each other and the timestamp decorators', () => {
    expect(entryFor('@default').excludes).toEqual(expect.arrayContaining(['@defaultAlways', '@now', '@createdAt']));
    expect(entryFor('@defaultAlways').excludes).toEqual(expect.arrayContaining(['@default', '@now', '@readonly']));
  });

  test('both are legal on tuple elements', () => {
    expect(entryFor('@default').targets).toContain('tupleElement');
    expect(entryFor('@defaultAlways').targets).toContain('tupleElement');
  });
});
