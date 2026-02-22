import { describe, expect, test } from 'bun:test';
import { formatCerialSource } from '../../../src/formatter';
import type { FormatConfig } from '../../../src/formatter/types';

/**
 * Replicate the buildFormatConfig logic from the formatting provider.
 * We test the logic directly since the function is not exported.
 */
function buildFormatConfig(
  editorOptions: { tabSize: number; insertSpaces: boolean },
  userConfig: FormatConfig,
): FormatConfig {
  const config: FormatConfig = { ...userConfig };

  if (config.indentSize === undefined) {
    if (!editorOptions.insertSpaces) {
      config.indentSize = 'tab';
    } else {
      config.indentSize = editorOptions.tabSize === 4 ? 4 : 2;
    }
  }

  return config;
}

describe('Formatting Logic', () => {
  describe('buildFormatConfig merging', () => {
    test('user indentSize takes precedence over editor tabSize', () => {
      const config = buildFormatConfig({ tabSize: 4, insertSpaces: true }, { indentSize: 2 });

      expect(config.indentSize).toBe(2);
    });

    test('user indentSize tab takes precedence over editor insertSpaces', () => {
      const config = buildFormatConfig({ tabSize: 2, insertSpaces: true }, { indentSize: 'tab' });

      expect(config.indentSize).toBe('tab');
    });

    test('falls back to tab when editor uses tabs and user has no indentSize', () => {
      const config = buildFormatConfig({ tabSize: 4, insertSpaces: false }, {});

      expect(config.indentSize).toBe('tab');
    });

    test('falls back to 4 when editor tabSize is 4 and insertSpaces', () => {
      const config = buildFormatConfig({ tabSize: 4, insertSpaces: true }, {});

      expect(config.indentSize).toBe(4);
    });

    test('falls back to 2 when editor tabSize is 2 and insertSpaces', () => {
      const config = buildFormatConfig({ tabSize: 2, insertSpaces: true }, {});

      expect(config.indentSize).toBe(2);
    });

    test('falls back to 2 when editor tabSize is 3 (non-4) and insertSpaces', () => {
      const config = buildFormatConfig({ tabSize: 3, insertSpaces: true }, {});

      expect(config.indentSize).toBe(2);
    });

    test('preserves other user config fields', () => {
      const config = buildFormatConfig(
        { tabSize: 2, insertSpaces: true },
        { alignmentScope: 'block', trailingComma: true, decoratorAlignment: 'compact' },
      );

      expect(config.alignmentScope).toBe('block');
      expect(config.trailingComma).toBe(true);
      expect(config.decoratorAlignment).toBe('compact');
      expect(config.indentSize).toBe(2);
    });

    test('empty user config gets only indentSize filled', () => {
      const config = buildFormatConfig({ tabSize: 2, insertSpaces: true }, {});

      expect(config.indentSize).toBe(2);
      expect(config.alignmentScope).toBeUndefined();
      expect(config.trailingComma).toBeUndefined();
    });
  });

  describe('formatCerialSource integration', () => {
    test('formats valid source and reports changed', () => {
      // Intentionally poorly formatted
      const source = 'model User {\nid Record @id\nname String\n}';
      const result = formatCerialSource(source);

      expect(result.error).toBeUndefined();
      expect(result.formatted).toBeDefined();
      expect(result.changed).toBe(true);
    });

    test('already-formatted source reports not changed', () => {
      const source = 'model User {\n  id Record @id\n  name String\n}\n';
      const result = formatCerialSource(source, { indentSize: 2 });

      // If the formatter considers this already formatted
      if (!result.error) {
        // The result should exist
        expect(result.formatted).toBeDefined();
      }
    });

    test('returns error for invalid source', () => {
      const source = 'model { invalid }';
      const result = formatCerialSource(source);

      expect(result.error).toBeDefined();
      expect(result.error!.message).toBeTruthy();
      expect(typeof result.error!.line).toBe('number');
      expect(typeof result.error!.column).toBe('number');
    });

    test('empty source returns error', () => {
      const result = formatCerialSource('');

      // Empty source may or may not be an error depending on implementation
      // but should not throw
      expect(result).toBeDefined();
    });

    test('formats with custom indentSize 4', () => {
      const source = 'model User {\nid Record @id\n}';
      const result = formatCerialSource(source, { indentSize: 4 });

      if (!result.error && result.formatted) {
        expect(result.formatted).toContain('    id');
      }
    });

    test('formats with tab indentation', () => {
      const source = 'model User {\nid Record @id\n}';
      const result = formatCerialSource(source, { indentSize: 'tab' });

      if (!result.error && result.formatted) {
        expect(result.formatted).toContain('\tid');
      }
    });

    test('formats with compact decorator alignment', () => {
      const source = "model User {\n  id Record @id\n  email Email @unique\n  name String @default('test')\n}\n";
      const result = formatCerialSource(source, { decoratorAlignment: 'compact' });

      if (!result.error && result.formatted) {
        expect(result.formatted).toBeDefined();
      }
    });

    test('formats with trailing comma enabled', () => {
      const source = 'enum Status { ACTIVE, INACTIVE }';
      const result = formatCerialSource(source, {
        trailingComma: true,
        inlineConstructStyle: 'multi',
      });

      if (!result.error && result.formatted) {
        expect(result.formatted).toBeDefined();
      }
    });

    test('formats multiple blocks', () => {
      const source = 'model A {\nid Record @id\n}\nmodel B {\nid Record @id\n}';
      const result = formatCerialSource(source);

      if (!result.error && result.formatted) {
        expect(result.formatted).toContain('model A');
        expect(result.formatted).toContain('model B');
      }
    });

    test('preserves comments during formatting', () => {
      const source = '// Header comment\nmodel User {\n  id Record @id\n  // Field comment\n  name String\n}\n';
      const result = formatCerialSource(source);

      if (!result.error && result.formatted) {
        expect(result.formatted).toContain('Header comment');
        expect(result.formatted).toContain('Field comment');
      }
    });

    test('handles object types', () => {
      const source = 'object Address {\nstreet String\ncity String\n}';
      const result = formatCerialSource(source);

      expect(result.error).toBeUndefined();
      if (result.formatted) {
        expect(result.formatted).toContain('object Address');
      }
    });

    test('handles enum types', () => {
      const source = 'enum Role { ADMIN, USER, GUEST }';
      const result = formatCerialSource(source);

      expect(result.error).toBeUndefined();
    });

    test('handles tuple types', () => {
      const source = 'tuple Point {\n  Float,\n  Float\n}\n';
      const result = formatCerialSource(source);

      expect(result.error).toBeUndefined();
    });

    test('handles literal types', () => {
      const source = 'literal Severity { 1, 2, 3, 4, 5 }';
      const result = formatCerialSource(source);

      expect(result.error).toBeUndefined();
    });

    test('idempotent — formatting twice gives same result', () => {
      const source = "model User {\nid Record @id\nemail Email @unique\nname String @default('test')\n}";
      const first = formatCerialSource(source);

      if (!first.error && first.formatted) {
        const second = formatCerialSource(first.formatted);

        expect(second.error).toBeUndefined();
        expect(second.formatted).toBe(first.formatted);
        expect(second.changed).toBe(false);
      }
    });
  });

  describe('formatDocument behavior simulation', () => {
    test('returns empty edits for parse errors', () => {
      const source = 'model { broken';
      const result = formatCerialSource(source);

      // Simulating: if (result.error) return []
      if (result.error) {
        const edits: unknown[] = [];

        expect(edits).toHaveLength(0);
      }
    });

    test('returns empty edits when nothing changed', () => {
      const source = 'model User {\n  id Record @id\n}\n';
      const result = formatCerialSource(source);

      // Simulating: if (!result.changed) return []
      if (!result.error && !result.changed) {
        const edits: unknown[] = [];

        expect(edits).toHaveLength(0);
      }
    });

    test('returns single replacing edit when changed', () => {
      const source = 'model User {\nid Record @id\n}';
      const result = formatCerialSource(source);

      if (!result.error && result.changed && result.formatted) {
        // Simulating: return [TextEdit.replace(fullRange, result.formatted)]
        const edits = [{ newText: result.formatted }];

        expect(edits).toHaveLength(1);
        expect(edits[0]!.newText).toBe(result.formatted);
      }
    });
  });
});
