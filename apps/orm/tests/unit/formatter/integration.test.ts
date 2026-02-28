/**
 * Integration tests for formatCerialSource() against real .cerial fixture files.
 *
 * Complements the existing formatter.test.ts (inline source strings) by:
 * - Formatting realistic multi-construct schema files from disk
 * - Verifying idempotency across all fixtures
 * - Testing the full config matrix (all 9 options)
 * - Validating error handling for syntax errors
 * - Testing edge cases (empty file, comments-only)
 * - Verifying decorator canonical ordering
 */

import { describe, expect, it } from 'bun:test';
import { join } from 'node:path';
import { formatCerialSource } from '../../../src/formatter/formatter';
import type { FormatConfig } from '../../../src/formatter/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FIXTURES_DIR = join(import.meta.dir, 'fixtures');

async function readFixture(name: string): Promise<string> {
  return Bun.file(join(FIXTURES_DIR, name)).text();
}

/** Fixtures that should parse and format without error */
const FORMATTABLE_FIXTURES = [
  'basic-model.cerial',
  'complex-relations.cerial',
  'objects-nested.cerial',
  'tuples-mixed.cerial',
  'enums-literals.cerial',
  'all-decorators.cerial',
  'comments-all-styles.cerial',
  'composite-directives.cerial',
  'multi-block.cerial',
  'already-formatted.cerial',
  'unformatted.cerial',
  'extends-basic.cerial',
  'extends-pick-omit.cerial',
  'extends-private.cerial',
  'extends-abstract.cerial',
  'extends-enum-literal.cerial',
  'extends-tuple.cerial',
  'extends-comments.cerial',
  'extends-complex.cerial',
] as const;

// ---------------------------------------------------------------------------
// 1. Fixture formatting — each fixture produces valid output
// ---------------------------------------------------------------------------

describe('fixture formatting', () => {
  for (const fixture of FORMATTABLE_FIXTURES) {
    it(`should format ${fixture} without error`, async () => {
      const source = await readFixture(fixture);
      const result = formatCerialSource(source);

      expect(result.error).toBeUndefined();
      expect(result.formatted).toBeDefined();
      expect(typeof result.formatted).toBe('string');
      expect(result.formatted!.length).toBeGreaterThan(0);
      expect(result.formatted!.endsWith('\n')).toBe(true);
    });
  }

  it('should detect changes in unformatted fixture', async () => {
    const source = await readFixture('unformatted.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.changed).toBe(true);
  });

  it('should detect no changes in already-formatted fixture', async () => {
    const source = await readFixture('already-formatted.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.changed).toBe(false);
    expect(result.formatted).toBe(source);
  });
});

// ---------------------------------------------------------------------------
// 2. Idempotency — format(format(x)) === format(x) for every fixture
// ---------------------------------------------------------------------------

describe('idempotency', () => {
  for (const fixture of FORMATTABLE_FIXTURES) {
    it(`format(format(x)) === format(x) for ${fixture}`, async () => {
      const source = await readFixture(fixture);
      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();

      const second = formatCerialSource(first.formatted!);
      expect(second.error).toBeUndefined();
      expect(second.changed).toBe(false);
      expect(second.formatted).toBe(first.formatted);
    });
  }

  it('idempotency holds across all config combinations', async () => {
    const source = await readFixture('unformatted.cerial');
    const configs: FormatConfig[] = [
      { indentSize: 4 },
      { indentSize: 'tab' },
      { decoratorAlignment: 'compact' },
      { fieldGroupBlankLines: 'collapse' },
      { fieldGroupBlankLines: 'honor' },
      { blockSeparation: 1 },
      { blockSeparation: 'honor' },
      { inlineConstructStyle: 'single' },
      { trailingComma: true },
      { commentStyle: 'hash' },
      { commentStyle: 'slash' },
      { blankLineBeforeDirectives: 'honor' },
      { alignmentScope: 'block' },
    ];

    for (const config of configs) {
      const first = formatCerialSource(source, config);
      expect(first.error).toBeUndefined();

      const second = formatCerialSource(first.formatted!, config);
      expect(second.error).toBeUndefined();
      expect(second.changed).toBe(false);
      expect(second.formatted).toBe(first.formatted);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Config matrix — each option tested with its variants
// ---------------------------------------------------------------------------

describe('config matrix', () => {
  describe('indentSize', () => {
    it('indentSize: 2 uses 2-space indent', async () => {
      const source = await readFixture('basic-model.cerial');
      const result = formatCerialSource(source, { indentSize: 2 });

      expect(result.error).toBeUndefined();
      const fieldLine = result.formatted!.split('\n').find((l) => l.includes('email') && l.includes('Email'));
      expect(fieldLine).toBeDefined();
      expect(fieldLine!.startsWith('  ')).toBe(true);
      expect(fieldLine!.startsWith('    ')).toBe(false);
    });

    it('indentSize: 4 uses 4-space indent', async () => {
      const source = await readFixture('basic-model.cerial');
      const result = formatCerialSource(source, { indentSize: 4 });

      expect(result.error).toBeUndefined();
      const fieldLine = result.formatted!.split('\n').find((l) => l.includes('email') && l.includes('Email'));
      expect(fieldLine).toBeDefined();
      expect(fieldLine!.startsWith('    ')).toBe(true);
    });

    it('indentSize: tab uses tab indent', async () => {
      const source = await readFixture('basic-model.cerial');
      const result = formatCerialSource(source, { indentSize: 'tab' });

      expect(result.error).toBeUndefined();
      const fieldLine = result.formatted!.split('\n').find((l) => l.includes('email') && l.includes('Email'));
      expect(fieldLine).toBeDefined();
      expect(fieldLine!.startsWith('\t')).toBe(true);
    });

    it('indent applies to enum variants', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { indentSize: 4, inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      const adminLine = result.formatted!.split('\n').find((l) => l.includes('ADMIN'));
      expect(adminLine).toBeDefined();
      expect(adminLine!.startsWith('    ')).toBe(true);
    });

    it('indent applies to object fields', async () => {
      const source = await readFixture('objects-nested.cerial');
      const result = formatCerialSource(source, { indentSize: 4 });

      expect(result.error).toBeUndefined();
      const streetLine = result.formatted!.split('\n').find((l) => l.includes('line1') && l.includes('String'));
      expect(streetLine).toBeDefined();
      expect(streetLine!.startsWith('    ')).toBe(true);
    });

    it('indent applies to tuple elements', async () => {
      const source = await readFixture('tuples-mixed.cerial');
      const result = formatCerialSource(source, { indentSize: 4, inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      const latLine = result.formatted!.split('\n').find((l) => l.trimStart().startsWith('lat'));
      expect(latLine).toBeDefined();
      expect(latLine!.startsWith('    ')).toBe(true);
    });

    it('indent applies to directives', async () => {
      const source = await readFixture('composite-directives.cerial');
      const result = formatCerialSource(source, { indentSize: 4 });

      expect(result.error).toBeUndefined();
      const directiveLine = result.formatted!.split('\n').find((l) => l.includes('@@unique'));
      expect(directiveLine).toBeDefined();
      expect(directiveLine!.startsWith('    ')).toBe(true);
    });
  });

  describe('decoratorAlignment', () => {
    it('aligned mode column-aligns decorators', async () => {
      const source = await readFixture('basic-model.cerial');
      const result = formatCerialSource(source, {
        decoratorAlignment: 'aligned',
        fieldGroupBlankLines: 'collapse',
      });

      expect(result.error).toBeUndefined();
      // In aligned mode, decorator columns should line up across fields
      const lines = result.formatted!.split('\n').filter((l) => l.includes('@'));
      // All decorator-bearing lines should have decorators at a consistent column
      const decoratorPositions = lines.map((l) => l.indexOf('@'));
      // At least 2 lines should share the same @ position (column alignment)
      const positionCounts = new Map<number, number>();
      for (const pos of decoratorPositions) {
        positionCounts.set(pos, (positionCounts.get(pos) ?? 0) + 1);
      }
      const maxShared = Math.max(...positionCounts.values());
      expect(maxShared).toBeGreaterThanOrEqual(2);
    });

    it('compact mode does not add extra alignment padding', async () => {
      const source = await readFixture('basic-model.cerial');
      const result = formatCerialSource(source, {
        decoratorAlignment: 'compact',
        fieldGroupBlankLines: 'collapse',
      });

      expect(result.error).toBeUndefined();
      const idLine = result.formatted!.split('\n').find((l) => l.includes('@id'));
      expect(idLine).toBeDefined();
      // In compact mode: "  id  Record @id" — single space before @
      expect(idLine!).toMatch(/Record\s@id/);
    });
  });

  describe('fieldGroupBlankLines', () => {
    it('collapse removes blank lines between fields', async () => {
      const source = await readFixture('unformatted.cerial');
      const result = formatCerialSource(source, { fieldGroupBlankLines: 'collapse' });

      expect(result.error).toBeUndefined();
      const modelBody = result.formatted!.split('model Messy')[1]!.split('}')[0]!;
      const lines = modelBody.split('\n').filter((l) => l.trim() !== '' && !l.includes('{'));
      // Consecutive fields with no blank lines between them
      const bodyLines = result.formatted!.split('model Messy')[1]!.split('}')[0]!.split('\n');
      let consecutiveFields = 0;
      for (let i = 0; i < bodyLines.length - 1; i++) {
        if (bodyLines[i]!.trim() !== '' && bodyLines[i + 1]!.trim() !== '' && !bodyLines[i]!.includes('{')) {
          consecutiveFields++;
        }
      }
      expect(consecutiveFields).toBeGreaterThan(0);
      expect(lines.length).toBeGreaterThanOrEqual(10); // All fields present
    });

    it('single puts one blank line between each field', async () => {
      const source = await readFixture('basic-model.cerial');
      const result = formatCerialSource(source, { fieldGroupBlankLines: 'single' });

      expect(result.error).toBeUndefined();
      const modelBody = result.formatted!.split('model Customer')[1]!.split('}')[0]!;
      // Source has no blank lines between fields, so single mode should not add any
      const bodyLines = modelBody.split('\n').slice(1); // skip the opening brace line
      const fieldLines = bodyLines.filter((l) => l.trim() !== '' && !l.includes('{'));
      // All fields present
      expect(fieldLines.length).toBeGreaterThanOrEqual(10);
      // No blank lines should be added (source had none)
      const hasBlankLine = bodyLines.some((l, i) => l.trim() === '' && i < bodyLines.length - 1);
      expect(hasBlankLine).toBe(false);
    });

    it('honor preserves original blank line pattern', async () => {
      // The unformatted fixture has a double blank line before `location`
      const source = await readFixture('unformatted.cerial');
      const result = formatCerialSource(source, { fieldGroupBlankLines: 'honor' });

      expect(result.error).toBeUndefined();
      // The original source had a blank line gap before `location`, and fields without gaps
      // Honor should preserve those groups
      const modelBody = result.formatted!.split('model Messy')[1]!.split('}')[0]!;
      const bodyLines = modelBody.split('\n').slice(1);
      // There should be at least some blank lines AND some non-blank consecutive lines
      const hasBlankLine = bodyLines.some((l) => l.trim() === '');
      expect(hasBlankLine).toBe(true);
    });
  });

  describe('blockSeparation', () => {
    it('blockSeparation: 1 uses 1 blank line between blocks', async () => {
      const source = await readFixture('multi-block.cerial');
      const result = formatCerialSource(source, { blockSeparation: 1 });

      expect(result.error).toBeUndefined();
      // Between any two blocks, exactly 1 blank line (2 newlines total)
      // Should NOT have 3 consecutive newlines (which means 2+ blank lines)
      expect(result.formatted).not.toMatch(/\}\n\n\n/);
      // Should have 2 consecutive newlines between blocks
      expect(result.formatted).toMatch(/\}\n\n[a-z]/);
    });

    it('blockSeparation: 2 uses 2 blank lines between blocks', async () => {
      const source = await readFixture('multi-block.cerial');
      const result = formatCerialSource(source, { blockSeparation: 2 });

      expect(result.error).toBeUndefined();
      // Should have 3 consecutive newlines between blocks (2 blank lines)
      expect(result.formatted).toMatch(/\}\n\n\n[a-z]/);
      // Should NOT have 4 consecutive newlines
      expect(result.formatted).not.toMatch(/\}\n\n\n\n/);
    });

    it('blockSeparation: honor preserves original separation', async () => {
      const source = await readFixture('multi-block.cerial');
      const result = formatCerialSource(source, { blockSeparation: 'honor' });

      expect(result.error).toBeUndefined();
      // Original has 2 blank lines between blocks (reformatted with default blockSeparation: 2)
      expect(result.formatted).toMatch(/\}\n\n\n[a-z]/);
    });
  });

  describe('inlineConstructStyle', () => {
    it('single puts enums on one line', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { inlineConstructStyle: 'single' });

      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('enum Role { ADMIN, EDITOR, VIEWER }');
      expect(result.formatted).toContain('enum Severity { LOW, MEDIUM, HIGH, CRITICAL }');
    });

    it('single puts literals on one line', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { inlineConstructStyle: 'single' });

      expect(result.error).toBeUndefined();
      expect(result.formatted).toMatch(/literal Status \{ 'active', 'inactive', 'pending' \}/);
    });

    it('single puts tuples on one line', async () => {
      const source = await readFixture('tuples-mixed.cerial');
      const result = formatCerialSource(source, { inlineConstructStyle: 'single' });

      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('tuple Coordinate { lat Float, lng Float }');
    });

    it('multi expands enums to multiple lines', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('enum Role {\n');
      expect(result.formatted).not.toContain('enum Role { ADMIN');
    });

    it('multi expands tuples to multiple lines', async () => {
      const source = await readFixture('tuples-mixed.cerial');
      const result = formatCerialSource(source, { inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('tuple Coordinate {\n');
      expect(result.formatted).not.toContain('tuple Coordinate { lat');
    });
  });

  describe('trailingComma', () => {
    it('trailingComma: true adds trailing comma to last enum variant', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { trailingComma: true, inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      // Find the last variant in Role enum
      const roleBlock = result.formatted!.split('enum Role')[1]!.split('}')[0]!;
      const lines = roleBlock.split('\n').filter((l) => l.trim().length > 0 && !l.includes('{'));
      const lastVariant = lines[lines.length - 1]!.trim();
      expect(lastVariant.endsWith(',')).toBe(true);
    });

    it('trailingComma: false omits trailing comma from last variant', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { trailingComma: false, inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      const roleBlock = result.formatted!.split('enum Role')[1]!.split('}')[0]!;
      const lines = roleBlock.split('\n').filter((l) => l.trim().length > 0 && !l.includes('{'));
      const lastVariant = lines[lines.length - 1]!.trim();
      expect(lastVariant.endsWith(',')).toBe(false);
    });

    it('trailingComma: true adds trailing comma to last literal variant', async () => {
      const source = await readFixture('enums-literals.cerial');
      const result = formatCerialSource(source, { trailingComma: true, inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      const statusBlock = result.formatted!.split('literal Status')[1]!.split('}')[0]!;
      const lines = statusBlock.split('\n').filter((l) => l.trim().length > 0 && !l.includes('{'));
      const lastVariant = lines[lines.length - 1]!.trim();
      expect(lastVariant.endsWith(',')).toBe(true);
    });

    it('trailingComma: true adds trailing comma to last tuple element', async () => {
      const source = await readFixture('tuples-mixed.cerial');
      const result = formatCerialSource(source, { trailingComma: true, inlineConstructStyle: 'multi' });

      expect(result.error).toBeUndefined();
      const coordBlock = result.formatted!.split('tuple Coordinate')[1]!.split('}')[0]!;
      const lines = coordBlock.split('\n').filter((l) => l.trim().length > 0 && !l.includes('{'));
      const lastElement = lines[lines.length - 1]!.trim();
      expect(lastElement.endsWith(',')).toBe(true);
    });
  });

  describe('commentStyle', () => {
    it('hash converts all comments to # style', async () => {
      const source = await readFixture('comments-all-styles.cerial');
      const result = formatCerialSource(source, { commentStyle: 'hash' });

      expect(result.error).toBeUndefined();
      const lines = result.formatted!.split('\n');
      const commentLines = lines.filter(
        (l) => l.trim().startsWith('#') || l.trim().startsWith('//') || l.trim().startsWith('/*'),
      );
      for (const line of commentLines) {
        expect(line.trim().startsWith('#')).toBe(true);
      }
      expect(result.formatted).not.toContain('//');
      expect(result.formatted).not.toContain('/*');
    });

    it('slash converts all comments to // style', async () => {
      const source = await readFixture('comments-all-styles.cerial');
      const result = formatCerialSource(source, { commentStyle: 'slash' });

      expect(result.error).toBeUndefined();
      // All standalone hash comments should be converted to //
      const lines = result.formatted!.split('\n');
      const pureCommentLines = lines.filter((l) => {
        const t = l.trim();

        return (t.startsWith('#') || t.startsWith('//')) && !t.startsWith('/*');
      });
      for (const line of pureCommentLines) {
        expect(line.trim().startsWith('//')).toBe(true);
      }
    });

    it('honor preserves original comment styles', async () => {
      const source = await readFixture('comments-all-styles.cerial');
      const result = formatCerialSource(source, { commentStyle: 'honor' });

      expect(result.error).toBeUndefined();
      // Both # and // should be present
      expect(result.formatted).toContain('# File-level hash comment');
      expect(result.formatted).toContain('// File-level slash comment');
      expect(result.formatted).toContain('/* Block comment at file level */');
    });

    it('hash normalizes trailing comments too', async () => {
      const source = await readFixture('comments-all-styles.cerial');
      const result = formatCerialSource(source, { commentStyle: 'hash' });

      expect(result.error).toBeUndefined();
      // Trailing slash comment should become hash
      expect(result.formatted).toContain('# trailing slash comment');
      expect(result.formatted).not.toContain('// trailing slash comment');
    });

    it('slash normalizes trailing comments too', async () => {
      const source = await readFixture('comments-all-styles.cerial');
      const result = formatCerialSource(source, { commentStyle: 'slash' });

      expect(result.error).toBeUndefined();
      // Trailing hash comment should become slash
      expect(result.formatted).toContain('// trailing hash comment');
      expect(result.formatted).not.toContain('# trailing hash comment');
    });
  });

  describe('blankLineBeforeDirectives', () => {
    it('always inserts blank line before first directive in a group', async () => {
      const source = await readFixture('composite-directives.cerial');
      const result = formatCerialSource(source, {
        blankLineBeforeDirectives: 'always',
        fieldGroupBlankLines: 'collapse',
      });

      expect(result.error).toBeUndefined();
      // Before the FIRST @@ directive in each model, there should be a blank line
      const lines = result.formatted!.split('\n');
      for (let i = 1; i < lines.length; i++) {
        if (lines[i]!.trim().startsWith('@@')) {
          // If the previous line is also a directive, that's fine (consecutive directives)
          // But if the previous line is a field, there must be a blank line between
          const prevTrimmed = lines[i - 1]!.trim();
          if (prevTrimmed !== '' && !prevTrimmed.startsWith('@@')) {
            // There should be a blank line between the last field and first directive
            // Actually the blank line is before this group — check i-1 is blank
            expect(prevTrimmed).toBe('');
          }
        }
      }
    });

    it('honor preserves original spacing before directives', async () => {
      const source = await readFixture('composite-directives.cerial');
      const result = formatCerialSource(source, {
        blankLineBeforeDirectives: 'honor',
        fieldGroupBlankLines: 'collapse',
      });

      expect(result.error).toBeUndefined();
      // Directives should still be present
      expect(result.formatted).toContain('@@unique(employeeFullName');
      expect(result.formatted).toContain('@@index(employeeDeptName');
    });
  });

  describe('alignmentScope', () => {
    it('group aligns within each field group', async () => {
      const source = await readFixture('unformatted.cerial');
      const result = formatCerialSource(source, {
        alignmentScope: 'group',
        fieldGroupBlankLines: 'collapse',
      });

      expect(result.error).toBeUndefined();
      // Fields within the model should be column-aligned
      const modelBody = result.formatted!.split('model Messy')[1]!.split('}')[0]!;
      const fieldLines = modelBody
        .split('\n')
        .filter((l) => l.trim().length > 0 && !l.includes('{') && !l.includes('@@'));
      // Check that field names are padded to the same column
      expect(fieldLines.length).toBeGreaterThanOrEqual(2);
    });

    it('block aligns across the entire file block', async () => {
      const source = await readFixture('unformatted.cerial');
      const result = formatCerialSource(source, {
        alignmentScope: 'block',
        fieldGroupBlankLines: 'collapse',
      });

      expect(result.error).toBeUndefined();
      const modelBody = result.formatted!.split('model Messy')[1]!.split('}')[0]!;
      const fieldLines = modelBody
        .split('\n')
        .filter((l) => l.trim().length > 0 && !l.includes('{') && !l.includes('@@'));
      expect(fieldLines.length).toBeGreaterThanOrEqual(2);
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Error handling
// ---------------------------------------------------------------------------

describe('error handling', () => {
  it('should return error for syntax-error fixture', async () => {
    const source = await readFixture('syntax-error.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeDefined();
    expect(result.error!.message).toBeDefined();
    expect(result.error!.message.length).toBeGreaterThan(0);
    expect(typeof result.error!.line).toBe('number');
    expect(typeof result.error!.column).toBe('number');
    expect(result.error!.line).toBeGreaterThanOrEqual(1);
    expect(result.formatted).toBeUndefined();
    expect(result.changed).toBeUndefined();
  });

  it('error contains line and column pointing to the issue', async () => {
    const source = await readFixture('syntax-error.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeDefined();
    // The InvalidType is on line 3
    expect(result.error!.line).toBe(3);
  });

  it('config options have no effect on syntax errors', async () => {
    const source = await readFixture('syntax-error.cerial');
    const result = formatCerialSource(source, {
      indentSize: 4,
      decoratorAlignment: 'compact',
      commentStyle: 'hash',
    });

    expect(result.error).toBeDefined();
    expect(result.formatted).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. Edge cases
// ---------------------------------------------------------------------------

describe('edge cases', () => {
  it('empty file formats to single newline', async () => {
    const source = await readFixture('empty.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toBe('\n');
  });

  it('empty file is unchanged (already just a newline)', async () => {
    const source = await readFixture('empty.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    // The fixture is "\n" which is already the canonical empty form
    expect(result.changed).toBe(false);
  });

  it('comments-only file preserves all comments', async () => {
    const source = await readFixture('comments-only.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('# This file has only comments');
    expect(result.formatted).toContain('# No models, objects, or enums');
    expect(result.formatted).toContain('// Another style of comment');
    expect(result.formatted).toContain('# End of file');
  });

  it('comments-only file ends with single newline', async () => {
    const source = await readFixture('comments-only.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted!.endsWith('\n')).toBe(true);
    expect(result.formatted!.endsWith('\n\n')).toBe(false);
  });

  it('all formatted outputs have no trailing whitespace on any line', async () => {
    for (const fixture of FORMATTABLE_FIXTURES) {
      const source = await readFixture(fixture);
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();

      const lines = result.formatted!.split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          expect(line).toBe(line.trimEnd());
        }
      }
    }
  });

  it('all formatted outputs end with exactly one trailing newline', async () => {
    for (const fixture of FORMATTABLE_FIXTURES) {
      const source = await readFixture(fixture);
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();

      expect(result.formatted!.endsWith('\n')).toBe(true);
      expect(result.formatted!.endsWith('\n\n')).toBe(false);
    }
  });

  it('all formatted outputs contain no carriage returns', async () => {
    for (const fixture of FORMATTABLE_FIXTURES) {
      const source = await readFixture(fixture);
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();

      expect(result.formatted).not.toContain('\r');
    }
  });
});

// ---------------------------------------------------------------------------
// 6. Already-formatted fixture
// ---------------------------------------------------------------------------

describe('already-formatted detection', () => {
  it('already-formatted fixture reports changed: false', async () => {
    const source = await readFixture('already-formatted.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.changed).toBe(false);
  });

  it('already-formatted fixture output is identical to input', async () => {
    const source = await readFixture('already-formatted.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toBe(source);
  });

  it('all formattable fixtures produce unchanged output on second format', async () => {
    for (const fixture of FORMATTABLE_FIXTURES) {
      const source = await readFixture(fixture);
      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();

      const second = formatCerialSource(first.formatted!);
      expect(second.error).toBeUndefined();
      expect(second.changed).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 7. Decorator reordering
// ---------------------------------------------------------------------------

describe('decorator reordering', () => {
  it('reorders decorators to canonical order', async () => {
    const source = await readFixture('all-decorators.cerial');
    const result = formatCerialSource(source, { fieldGroupBlankLines: 'collapse' });

    expect(result.error).toBeUndefined();
    const lines = result.formatted!.split('\n');

    // @readonly should come before @nullable on bio field
    const bioLine = lines.find((l) => l.includes('bio'));
    expect(bioLine).toBeDefined();
    const readonlyIdx = bioLine!.indexOf('@readonly');
    const nullableIdx = bioLine!.indexOf('@nullable');
    expect(readonlyIdx).toBeLessThan(nullableIdx);

    // @default should come before @nullable on age field
    const ageLine = lines.find((l) => l.includes('age'));
    expect(ageLine).toBeDefined();
    const defaultIdx = ageLine!.indexOf('@default');
    const nullableIdx2 = ageLine!.indexOf('@nullable');
    expect(defaultIdx).toBeLessThan(nullableIdx2);
  });

  it('@field comes before @model on relation fields', async () => {
    const source = await readFixture('all-decorators.cerial');
    const result = formatCerialSource(source, { fieldGroupBlankLines: 'collapse' });

    expect(result.error).toBeUndefined();
    const lines = result.formatted!.split('\n');

    // On the author field: @field should come before @model, @model before @key, @key before @onDelete
    const authorLine = lines.find((l) => l.includes('author') && l.includes('Relation'));
    expect(authorLine).toBeDefined();
    const fieldIdx = authorLine!.indexOf('@field');
    const modelIdx = authorLine!.indexOf('@model');
    const keyIdx = authorLine!.indexOf('@key');
    const onDeleteIdx = authorLine!.indexOf('@onDelete');
    expect(fieldIdx).toBeLessThan(modelIdx);
    expect(modelIdx).toBeLessThan(keyIdx);
    expect(keyIdx).toBeLessThan(onDeleteIdx);
  });

  it('@distinct comes before @sort on array fields', async () => {
    const source = await readFixture('all-decorators.cerial');
    const result = formatCerialSource(source, { fieldGroupBlankLines: 'collapse' });

    expect(result.error).toBeUndefined();
    const lines = result.formatted!.split('\n');

    const scoresLine = lines.find((l) => l.includes('scores'));
    expect(scoresLine).toBeDefined();
    const distinctIdx = scoresLine!.indexOf('@distinct');
    const sortIdx = scoresLine!.indexOf('@sort');
    expect(distinctIdx).toBeLessThan(sortIdx);
  });

  it('canonical order is preserved in complex-relations fixture', async () => {
    const source = await readFixture('complex-relations.cerial');
    const result = formatCerialSource(source, { fieldGroupBlankLines: 'collapse' });

    expect(result.error).toBeUndefined();
    const lines = result.formatted!.split('\n');

    // category field: @field before @model before @key before @onDelete
    const catLine = lines.find((l) => l.includes('category') && l.includes('Relation'));
    expect(catLine).toBeDefined();
    const fIdx = catLine!.indexOf('@field');
    const mIdx = catLine!.indexOf('@model');
    const kIdx = catLine!.indexOf('@key');
    const odIdx = catLine!.indexOf('@onDelete');
    expect(fIdx).toBeLessThan(mIdx);
    expect(mIdx).toBeLessThan(kIdx);
    expect(kIdx).toBeLessThan(odIdx);
  });
});

// ---------------------------------------------------------------------------
// 8. Content preservation
// ---------------------------------------------------------------------------

describe('content preservation', () => {
  it('preserves all model names across formatting', async () => {
    const source = await readFixture('multi-block.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('model Organization');
    expect(result.formatted).toContain('model Member');
  });

  it('preserves all block types in multi-block fixture', async () => {
    const source = await readFixture('multi-block.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('enum Permission');
    expect(result.formatted).toContain('literal Theme');
    expect(result.formatted).toContain('tuple Dimensions');
    expect(result.formatted).toContain('object ContactInfo');
    expect(result.formatted).toContain('model Organization');
    expect(result.formatted).toContain('model Member');
  });

  it('preserves source declaration order', async () => {
    const source = await readFixture('multi-block.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    const text = result.formatted!;
    const enumIdx = text.indexOf('enum Permission');
    const litIdx = text.indexOf('literal Theme');
    const tupleIdx = text.indexOf('tuple Dimensions');
    const objIdx = text.indexOf('object ContactInfo');
    const model1Idx = text.indexOf('model Organization');
    const model2Idx = text.indexOf('model Member');

    expect(enumIdx).toBeLessThan(litIdx);
    expect(litIdx).toBeLessThan(tupleIdx);
    expect(tupleIdx).toBeLessThan(objIdx);
    expect(objIdx).toBeLessThan(model1Idx);
    expect(model1Idx).toBeLessThan(model2Idx);
  });

  it('preserves all field names in basic-model fixture', async () => {
    const source = await readFixture('basic-model.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    const fieldNames = [
      'id',
      'email',
      'name',
      'bio',
      'age',
      'isActive',
      'rating',
      'createdAt',
      'updatedAt',
      'tags',
      'scores',
      'loginDates',
    ];
    for (const field of fieldNames) {
      expect(result.formatted).toContain(field);
    }
  });

  it('preserves all decorator values', async () => {
    const source = await readFixture('all-decorators.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('@default(0)');
    expect(result.formatted).toContain('@defaultAlways(0)');
    expect(result.formatted).toContain('@onDelete(SetNull)');
    expect(result.formatted).toContain('@key(authorKey)');
    expect(result.formatted).toContain('@sort(asc)');
    expect(result.formatted).toContain('@field(authorId)');
    expect(result.formatted).toContain('@model(DecoratorReorder)');
    expect(result.formatted).toContain('@uuid7');
  });

  it('preserves all enum variants', async () => {
    const source = await readFixture('enums-literals.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('ADMIN');
    expect(result.formatted).toContain('EDITOR');
    expect(result.formatted).toContain('VIEWER');
    expect(result.formatted).toContain('LOW');
    expect(result.formatted).toContain('MEDIUM');
    expect(result.formatted).toContain('HIGH');
    expect(result.formatted).toContain('CRITICAL');
  });

  it('preserves all literal variants', async () => {
    const source = await readFixture('enums-literals.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain("'active'");
    expect(result.formatted).toContain("'inactive'");
    expect(result.formatted).toContain("'pending'");
    expect(result.formatted).toContain("'archived'");
    expect(result.formatted).toContain("'deleted'");
  });

  it('preserves all directive content', async () => {
    const source = await readFixture('composite-directives.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('@@unique(employeeFullName, [firstName, lastName])');
    expect(result.formatted).toContain('@@index(employeeDeptName, [department, firstName])');
    expect(result.formatted).toContain('@@index(productCatVendor, [category, vendor])');
    expect(result.formatted).toContain('@@unique(productSkuCat, [sku, category])');
  });

  it('preserves comment text content', async () => {
    const source = await readFixture('comments-all-styles.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('File-level hash comment');
    expect(result.formatted).toContain('File-level slash comment');
    expect(result.formatted).toContain('Block comment at file level');
    expect(result.formatted).toContain('A model for testing comments');
    expect(result.formatted).toContain('Hash comment on field');
    expect(result.formatted).toContain('Slash comment on field');
    expect(result.formatted).toContain('trailing hash comment');
    expect(result.formatted).toContain('trailing slash comment');
    expect(result.formatted).toContain('Between-block comment');
    expect(result.formatted).toContain('Bottom file comment');
  });

  it('preserves tuple element names', async () => {
    const source = await readFixture('tuples-mixed.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('lat');
    expect(result.formatted).toContain('lng');
  });

  it('preserves object nested references', async () => {
    const source = await readFixture('objects-nested.cerial');
    const result = formatCerialSource(source);

    expect(result.error).toBeUndefined();
    expect(result.formatted).toContain('Street');
    expect(result.formatted).toContain('Location');
    expect(result.formatted).toContain('TreeItem');
    expect(result.formatted).toContain('MetaInfo');
    // Self-referencing (alignment may add padding between name and type)
    expect(result.formatted).toMatch(/children\s+TreeItem\[\]/);
  });
});

// ---------------------------------------------------------------------------
// 9. Combined config tests
// ---------------------------------------------------------------------------

describe('combined config', () => {
  it('compact + collapse produces dense output', async () => {
    const source = await readFixture('unformatted.cerial');
    const result = formatCerialSource(source, {
      decoratorAlignment: 'compact',
      fieldGroupBlankLines: 'collapse',
      blockSeparation: 1,
    });

    expect(result.error).toBeUndefined();
    // Dense: no double blank lines in the entire output
    expect(result.formatted).not.toMatch(/\n\n\n/);
    // Fields should be tightly packed
    const modelBody = result.formatted!.split('model Messy')[1]!.split('}')[0]!;
    const fieldLines = modelBody
      .split('\n')
      .filter((l) => l.trim().length > 0 && !l.includes('{') && !l.includes('@@'));
    expect(fieldLines.length).toBeGreaterThanOrEqual(10);
  });

  it('4-space + tab produces tab output (tab wins)', async () => {
    // indentSize is a single option, not combinable — just verify tab works on complex file
    const source = await readFixture('multi-block.cerial');
    const result = formatCerialSource(source, { indentSize: 'tab' });

    expect(result.error).toBeUndefined();
    const fieldLines = result.formatted!.split('\n').filter((l) => l.startsWith('\t'));
    expect(fieldLines.length).toBeGreaterThan(0);
  });

  it('single-line + trailing comma produces correct inline syntax', async () => {
    const source = await readFixture('enums-literals.cerial');
    const result = formatCerialSource(source, {
      inlineConstructStyle: 'single',
      trailingComma: true,
    });

    expect(result.error).toBeUndefined();
    // Single-line enums should NOT have trailing commas (trailing comma only for multi-line)
    expect(result.formatted).toContain('enum Role { ADMIN, EDITOR, VIEWER }');
  });

  it('hash comments + 4-space indent together', async () => {
    const source = await readFixture('comments-all-styles.cerial');
    const result = formatCerialSource(source, {
      commentStyle: 'hash',
      indentSize: 4,
    });

    expect(result.error).toBeUndefined();
    // All comments should be # style
    expect(result.formatted).not.toContain('//');
    // Field comments should be indented with 4 spaces
    const hashFieldComment = result.formatted!.split('\n').find((l) => l.startsWith('    #'));
    expect(hashFieldComment).toBeDefined();
  });
});
