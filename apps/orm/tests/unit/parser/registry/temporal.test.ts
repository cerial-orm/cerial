import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

describe('registry: temporal decorators', () => {
  test.each(['@now', '@createdAt', '@updatedAt'])('%s parses like the dispatch', (name) => {
    expectSameAsDispatch(name, [name]);
  });

  test('@now is legal on model fields only; the other two also on object fields and tuple elements', () => {
    expect(entryFor('@now').targets).toEqual(['modelField']);
    expect(entryFor('@createdAt').targets).toEqual(['modelField', 'objectField', 'tupleElement']);
    expect(entryFor('@updatedAt').targets).toEqual(['modelField', 'objectField', 'tupleElement']);
  });

  test('the three timestamp decorators exclude one another', () => {
    for (const name of ['@now', '@createdAt', '@updatedAt'] as const) {
      const others = (['@now', '@createdAt', '@updatedAt'] as const).filter((n) => n !== name);
      expect(entryFor(name).excludes).toEqual(expect.arrayContaining([...others, '@default', '@defaultAlways']));
    }
  });
});
