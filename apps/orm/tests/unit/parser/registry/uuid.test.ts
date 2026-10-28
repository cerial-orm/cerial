import { describe, expect, test } from 'bun:test';
import { entryFor, expectSameAsDispatch } from './helpers';

describe('registry: uuid decorators', () => {
  test.each(['@uuid', '@uuid4', '@uuid7'])('%s parses like the dispatch', (name) => {
    expectSameAsDispatch(name, [name]);
  });

  test('each excludes the other two and the default and timestamp decorators', () => {
    const all = ['@uuid', '@uuid4', '@uuid7'] as const;
    for (const name of all) {
      const others = all.filter((n) => n !== name);
      expect(entryFor(name).excludes).toEqual(
        expect.arrayContaining([...others, '@default', '@defaultAlways', '@now', '@createdAt', '@updatedAt']),
      );
    }
  });

  test('none is legal on a tuple element', () => {
    for (const name of ['@uuid', '@uuid4', '@uuid7']) expect(entryFor(name).targets).not.toContain('tupleElement');
  });
});
