/**
 * Every formatter fixture through every config variant: format(format(x)) === format(x).
 * Fixtures are read from disk and variants are derived from FormatConfig, so a new fixture or a
 * new option value is covered without editing this file's cases.
 */

import { describe, expect, it } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatCerialSource } from '../../../src/formatter/formatter';
import type { FormatConfig } from '../../../src/formatter/types';

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

// syntax-error.cerial is rejected by design; malformed-input.test.ts pins that
const NON_FORMATTABLE = new Set(['syntax-error.cerial']);

const FIXTURES = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.cerial') && !NON_FORMATTABLE.has(f))
  .sort();

// One entry per value of each option, so every option is varied against the defaults
const OPTION_VALUES: { [K in keyof FormatConfig]-?: readonly FormatConfig[K][] } = {
  alignmentScope: ['group', 'block'],
  fieldGroupBlankLines: ['single', 'honor', 'collapse'],
  blockSeparation: [1, 2, 'honor'],
  indentSize: [2, 4, 'tab'],
  inlineConstructStyle: ['single', 'multi', 'honor'],
  decoratorAlignment: ['aligned', 'compact'],
  trailingComma: [false, true],
  commentStyle: ['honor', 'hash', 'slash'],
  blankLineBeforeDirectives: ['always', 'honor'],
};

interface Variant {
  label: string;
  config: FormatConfig;
}

const VARIANTS: Variant[] = [{ label: 'defaults', config: {} }];
for (const [option, values] of Object.entries(OPTION_VALUES)) {
  for (const value of values) {
    VARIANTS.push({ label: `${option}=${String(value)}`, config: { [option]: value } });
  }
}
// Options interact (alignment with indent, comma with inline style), so cover two opposing corners
VARIANTS.push(
  {
    label: 'corner: dense',
    config: {
      alignmentScope: 'block',
      fieldGroupBlankLines: 'collapse',
      blockSeparation: 1,
      indentSize: 'tab',
      inlineConstructStyle: 'single',
      decoratorAlignment: 'compact',
      trailingComma: true,
      commentStyle: 'hash',
      blankLineBeforeDirectives: 'honor',
    },
  },
  {
    label: 'corner: spacious',
    config: {
      alignmentScope: 'group',
      fieldGroupBlankLines: 'honor',
      blockSeparation: 'honor',
      indentSize: 4,
      inlineConstructStyle: 'multi',
      decoratorAlignment: 'aligned',
      trailingComma: false,
      commentStyle: 'slash',
      blankLineBeforeDirectives: 'always',
    },
  },
);

function formatOnce(source: string, config: FormatConfig): string {
  const result = formatCerialSource(source, config);
  if (result.error) throw new Error(result.error.message);

  return result.formatted;
}

describe('idempotency: fixtures x config variants', () => {
  it('should enumerate fixtures and variants', () => {
    expect(FIXTURES.length).toBeGreaterThan(15);
    expect(VARIANTS.length).toBe(1 + 2 + 3 + 3 + 3 + 3 + 2 + 2 + 3 + 2 + 2);
  });

  for (const fixture of FIXTURES) {
    describe(fixture, () => {
      for (const { label, config } of VARIANTS) {
        it(`format(format(x)) === format(x) with ${label}`, async () => {
          const source = await Bun.file(join(FIXTURES_DIR, fixture)).text();
          const first = formatOnce(source, config);

          expect(formatOnce(first, config)).toBe(first);
        });
      }
    });
  }
});
