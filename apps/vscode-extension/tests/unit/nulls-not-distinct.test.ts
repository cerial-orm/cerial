import { describe, expect, test } from 'bun:test';
import { DECORATOR_DOCS, OPTION_DOCS } from '../../server/src/data/hover-docs';
import { getDecoratorOptionCompletions } from '../../server/src/providers/completion';
import { buildOptionHover } from '../../server/src/providers/hover';

const labels = (line: string): string[] | undefined =>
  getDecoratorOptionCompletions(line, line.length)?.map((item) => item.label);

describe('nullsNotDistinct hover', () => {
  test('@unique documents the option, the nullable requirement and an example', () => {
    const doc = DECORATOR_DOCS.unique!;

    expect(doc.signature).toBe('@unique | @unique(nullsNotDistinct)');
    expect(doc.constraints).toMatch(/at most one record with null/);
    expect(doc.constraints).toMatch(/optional or @nullable/);
    expect(doc.example).toContain('@unique(nullsNotDistinct)');
  });

  test('@@unique documents the option and says it needs a nullable column', () => {
    const doc = DECORATOR_DOCS['@unique']!;

    expect(doc.signature).toContain('@@unique(name, [field1, field2], nullsNotDistinct)');
    expect(doc.constraints).toMatch(/at least one nullable column/);
    expect(doc.example).toContain('nullsNotDistinct');
  });

  test('@@index signature carries no option', () => {
    expect(DECORATOR_DOCS['@index']!.signature).not.toContain('nullsNotDistinct');
  });

  test('the option word has hover text on @unique and @@unique', () => {
    expect(buildOptionHover('nullsNotDistinct', '  email Email? @unique(nullsNotDistinct)')).toBe(
      OPTION_DOCS.nullsNotDistinct!.text,
    );
    expect(buildOptionHover('nullsNotDistinct', '  @@unique(slot, [a, b], nullsNotDistinct)')).toContain(
      'at least one nullable column',
    );
  });

  test('the option word has no hover on @@index or an unrelated line', () => {
    expect(buildOptionHover('nullsNotDistinct', '  @@index(slot, [a, b], nullsNotDistinct)')).toBeNull();
    expect(buildOptionHover('nullsNotDistinct', '  nullsNotDistinct String')).toBeNull();
    expect(buildOptionHover('other', '  email Email? @unique(other)')).toBeNull();
  });
});

describe('nullsNotDistinct completion', () => {
  test('offered inside @unique(', () => {
    expect(labels('  email Email? @unique(')).toEqual(['nullsNotDistinct']);
  });

  test('offered after the field list of @@unique', () => {
    expect(labels('  @@unique(slot, [a, b], ')).toEqual(['nullsNotDistinct']);
    expect(labels('  @@unique(slot, [a, b],nulls')).toEqual(['nullsNotDistinct']);
  });

  test('not offered while typing the name or the field list of @@unique', () => {
    expect(labels('  @@unique(')).toBeUndefined();
    expect(labels('  @@unique(slot, ')).toBeUndefined();
    expect(labels('  @@unique(slot, [a, ')).toBeUndefined();
  });

  test('not offered in @@index(, even after the field list', () => {
    expect(labels('  @@index(slot, [a, b], ')).toBeUndefined();
    expect(labels('  @@index(')).toBeUndefined();
  });

  test('not offered once the parentheses are closed', () => {
    expect(labels('  email Email? @unique(nullsNotDistinct) ')).toBeUndefined();
  });
});
