import { describe, expect, test } from 'bun:test';
import { entryFor, parseDirectiveInModel } from './helpers';

const LINE = 5;
const rangeAt = (line: number) => ({ start: { line, column: 0, offset: 0 }, end: { line, column: 0, offset: 0 } });

describe('registry: model-level directives', () => {
  test.each([
    '@@index(nameIdx, [a, b])',
    '@@unique(nameUq, [a, b])',
    '@@index( spaced , [ a , b ] )',
    '@@index(dotted, [a.x, b.y.z])',
    '@@unique(single, [a])',
    '@@index(commented, [a, b]) # trailing comment',
  ])('%s parses like the parser', (line) => {
    const { directive, errors } = parseDirectiveInModel(line);
    expect(errors).toEqual([]);
    expect(directive).toBeDefined();
    const name = line.startsWith('@@index') ? '@@index' : '@@unique';
    expect(entryFor(name).parse(line, rangeAt(directive!.range.start.line))).toEqual(directive!);
  });

  test.each(['@@index(noFields)', '@@index(x, [])', '@@index(x, [ , ])', '@@index(x [a])', '@@unique(1x, a)'])(
    '%s is refused by the parser and throws from the entry',
    (line) => {
      const { directive, errors } = parseDirectiveInModel(line);
      expect(directive).toBeUndefined();
      expect(errors.length).toBeGreaterThan(0);
      const name = line.startsWith('@@index') ? '@@index' : '@@unique';
      expect(() => entryFor(name).parse(line, rangeAt(LINE))).toThrow();
    },
  );

  test('both are model-level only and use the nameAndFields shape', () => {
    for (const name of ['@@index', '@@unique']) {
      expect(entryFor(name).targets).toEqual(['model']);
      expect(entryFor(name).args).toMatchObject({ kind: 'nameAndFields' });
    }
    expect(entryFor('@@unique').args).toEqual({ kind: 'nameAndFields', options: ['nullsNotDistinct'] });
    expect(entryFor('@@index').args).toEqual({ kind: 'nameAndFields' });
  });

  test('@index and @@index are separate entries', () => {
    expect(entryFor('@index')).not.toBe(entryFor('@@index'));
  });
});
