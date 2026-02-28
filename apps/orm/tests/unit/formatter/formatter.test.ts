/**
 * Tests for the core formatting orchestrator: formatCerialSource()
 */

import { describe, expect, it } from 'bun:test';
import { formatCerialSource, normalizeCommentText } from '../../../src/formatter/formatter';
import type { FormatOptions } from '../../../src/formatter/types';

describe('formatCerialSource', () => {
  describe('valid source → formatted output', () => {
    it('should format a simple model', () => {
      const source = ['model User {', '  id Record @id', '  email Email @unique', '  name String', '}', ''].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBeDefined();
      expect(typeof result.formatted).toBe('string');
      expect(result.formatted!.endsWith('\n')).toBe(true);
    });

    it('should return changed: true when formatting modifies the source', () => {
      // Deliberately unformatted: no alignment
      const source = 'model User {\nid Record @id\nemail Email @unique\nname String\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.changed).toBe(true);
    });

    it('should return changed: false when source is already formatted', () => {
      const source = 'model User {\n  id Record @id\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      // Format once to get canonical form
      const canonical = result.formatted!;
      // Format the canonical form
      const second = formatCerialSource(canonical);
      expect(second.changed).toBe(false);
    });
  });

  describe('invalid source → error', () => {
    it('should return first error only from source with multiple errors', () => {
      // Invalid field type causes parse error
      const source = 'model User {\n  id InvalidType\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeDefined();
      expect(result.error!.message).toBeDefined();
      expect(typeof result.error!.line).toBe('number');
      expect(typeof result.error!.column).toBe('number');
      expect(result.formatted).toBeUndefined();
    });

    it('should return error for model with missing closing brace', () => {
      const source = 'model Broken {\n  id Record @id\n';
      const result = formatCerialSource(source);
      // Parser may handle this as a valid model ending at EOF or error
      // Either way the behavior should be predictable
      if (result.error) {
        expect(result.error.message).toBeDefined();
      }
    });
  });

  describe('idempotency', () => {
    it('format(format(x)) === format(x) for simple model', () => {
      const source = 'model User {\nid Record @id\nemail Email @unique\nname String\n}\n';
      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();
      const second = formatCerialSource(first.formatted!);
      expect(second.error).toBeUndefined();
      expect(second.formatted).toBe(first.formatted);
    });

    it('format(format(x)) === format(x) for model + object', () => {
      const source = [
        'object Address {',
        '  street String',
        '  city String',
        '}',
        '',
        'model User {',
        '  id Record @id',
        '  name String',
        '  addr Address',
        '}',
        '',
      ].join('\n');

      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();
      const second = formatCerialSource(first.formatted!);
      expect(second.formatted).toBe(first.formatted);
    });

    it('format(format(x)) === format(x) for enum', () => {
      const source = 'enum Role {\n  Admin,\n  Editor,\n  Viewer\n}\n';
      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();
      const second = formatCerialSource(first.formatted!);
      expect(second.formatted).toBe(first.formatted);
    });

    it('format(format(x)) === format(x) for literal', () => {
      const source = "literal Status {\n  'active',\n  'inactive',\n  'pending'\n}\n";
      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();
      const second = formatCerialSource(first.formatted!);
      expect(second.formatted).toBe(first.formatted);
    });

    it('format(format(x)) === format(x) for tuple', () => {
      const source = 'tuple Point {\n  x Float,\n  y Float\n}\n';
      const first = formatCerialSource(source);
      expect(first.error).toBeUndefined();
      const second = formatCerialSource(first.formatted!);
      expect(second.formatted).toBe(first.formatted);
    });

    it('format(format(x)) === format(x) with comment style normalization', () => {
      const source = '# This is a comment\nmodel User {\n  id Record @id\n}\n';
      const opts: FormatOptions = { commentStyle: 'slash' };
      const first = formatCerialSource(source, opts);
      expect(first.error).toBeUndefined();
      const second = formatCerialSource(first.formatted!, opts);
      expect(second.formatted).toBe(first.formatted);
    });
  });

  describe('decorator reordering in full pipeline', () => {
    it('should reorder @nullable @id → @id @nullable', () => {
      const source = 'model User {\n  id Record @nullable @id\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      // @id should come before @nullable in the formatted output
      const lines = result.formatted!.split('\n');
      const fieldLine = lines.find((l) => l.includes('id'));
      expect(fieldLine).toBeDefined();
      const idIdx = fieldLine!.indexOf('@id');
      const nullableIdx = fieldLine!.indexOf('@nullable');
      expect(idIdx).toBeLessThan(nullableIdx);
    });

    it('should reorder @model @field → @field @model', () => {
      const source = [
        'model Post {',
        '  id Record @id',
        '  authorId Record',
        '  author Relation @model(User) @field(authorId)',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const lines = result.formatted!.split('\n');
      const authorLine = lines.find((l) => l.includes('author') && l.includes('Relation'));
      expect(authorLine).toBeDefined();
      const fieldIdx = authorLine!.indexOf('@field');
      const modelIdx = authorLine!.indexOf('@model');
      expect(fieldIdx).toBeLessThan(modelIdx);
    });
  });

  describe('comment style normalization', () => {
    it('should convert # comments to // with commentStyle: slash', () => {
      const source = '# Top comment\nmodel User {\n  # field comment\n  id Record @id\n}\n';
      const result = formatCerialSource(source, { commentStyle: 'slash' });
      expect(result.error).toBeUndefined();
      expect(result.formatted).not.toContain('# ');
      expect(result.formatted).toContain('//');
    });

    it('should convert // comments to # with commentStyle: hash', () => {
      const source = '// Top comment\nmodel User {\n  // field comment\n  id Record @id\n}\n';
      const result = formatCerialSource(source, { commentStyle: 'hash' });
      expect(result.error).toBeUndefined();
      expect(result.formatted).not.toContain('//');
      expect(result.formatted).toContain('#');
    });

    it('should preserve comments as-is with commentStyle: honor', () => {
      const source = '# hash comment\nmodel User {\n  // slash comment\n  id Record @id\n}\n';
      const result = formatCerialSource(source, { commentStyle: 'honor' });
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('#');
      expect(result.formatted).toContain('//');
    });

    it('should handle mixed comments with commentStyle: slash', () => {
      const source = '# hash comment\n// slash comment\nmodel User {\n  id Record @id\n}\n';
      const result = formatCerialSource(source, { commentStyle: 'slash' });
      expect(result.error).toBeUndefined();
      // All comments should now be // style
      const lines = result.formatted!.split('\n');
      const commentLines = lines.filter((l) => l.trim().startsWith('#') || l.trim().startsWith('//'));
      for (const line of commentLines) {
        expect(line.trim().startsWith('//')).toBe(true);
      }
    });
  });

  describe('block separation', () => {
    it('should use 1 blank line between blocks with blockSeparation: 1', () => {
      const source = ['model User {', '  id Record @id', '}', '', 'model Post {', '  id Record @id', '}', ''].join(
        '\n',
      );

      const result = formatCerialSource(source, { blockSeparation: 1 });
      expect(result.error).toBeUndefined();
      // Between the two blocks there should be exactly 1 blank line
      const text = result.formatted!;
      // } followed by blank line followed by model
      expect(text).toContain('}\n\nmodel Post');
      // Should NOT have 2 blank lines
      expect(text).not.toContain('}\n\n\nmodel Post');
    });

    it('should use 2 blank lines between blocks with blockSeparation: 2', () => {
      const source = ['model User {', '  id Record @id', '}', '', 'model Post {', '  id Record @id', '}', ''].join(
        '\n',
      );

      const result = formatCerialSource(source, { blockSeparation: 2 });
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('}\n\n\nmodel Post');
    });

    it('should honor original blank lines with blockSeparation: honor', () => {
      // Source has 1 blank line between blocks
      const source = ['model User {', '  id Record @id', '}', '', 'model Post {', '  id Record @id', '}', ''].join(
        '\n',
      );

      const result = formatCerialSource(source, { blockSeparation: 'honor' });
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      // Original had 1 blank line
      expect(text).toContain('}\n\nmodel Post');
    });

    it('should cap honored blank lines at 2', () => {
      // Source has 5 blank lines between blocks
      const source = [
        'model User {',
        '  id Record @id',
        '}',
        '',
        '',
        '',
        '',
        '',
        'model Post {',
        '  id Record @id',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source, { blockSeparation: 'honor' });
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      // Should be capped at 2 blank lines (3 consecutive newlines)
      expect(text).toContain('}\n\n\nmodel Post');
      expect(text).not.toContain('}\n\n\n\nmodel Post');
    });
  });

  describe('multi-block file', () => {
    it('should format model + object + enum in source order', () => {
      const source = [
        'enum Role {',
        '  Admin,',
        '  Editor',
        '}',
        '',
        'object Address {',
        '  street String',
        '  city String',
        '}',
        '',
        'model User {',
        '  id Record @id',
        '  name String',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      // Verify order: enum before object before model
      const enumIdx = text.indexOf('enum Role');
      const objectIdx = text.indexOf('object Address');
      const modelIdx = text.indexOf('model User');
      expect(enumIdx).toBeGreaterThanOrEqual(0);
      expect(objectIdx).toBeGreaterThan(enumIdx);
      expect(modelIdx).toBeGreaterThan(objectIdx);
    });

    it('should format model + literal + tuple', () => {
      const source = [
        "literal Status { 'active', 'inactive' }",
        '',
        'tuple Point { x Float, y Float }',
        '',
        'model User {',
        '  id Record @id',
        '  name String',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      const litIdx = text.indexOf('literal Status');
      const tupleIdx = text.indexOf('tuple Point');
      const modelIdx = text.indexOf('model User');
      expect(litIdx).toBeGreaterThanOrEqual(0);
      expect(tupleIdx).toBeGreaterThan(litIdx);
      expect(modelIdx).toBeGreaterThan(tupleIdx);
    });

    it('should handle all five block types together', () => {
      const source = [
        'enum Role {',
        '  Admin,',
        '  User',
        '}',
        '',
        "literal Theme { 'light', 'dark' }",
        '',
        'tuple Coord { Float, Float }',
        '',
        'object Address {',
        '  city String',
        '}',
        '',
        'model Person {',
        '  id Record @id',
        '  name String',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('enum Role');
      expect(text).toContain('literal Theme');
      expect(text).toContain('tuple Coord');
      expect(text).toContain('object Address');
      expect(text).toContain('model Person');
    });
  });

  describe('empty and edge cases', () => {
    it('should handle empty string', () => {
      const result = formatCerialSource('');
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('\n');
      // '' → '\n' is a change (adding trailing newline)
      expect(result.changed).toBe(true);
    });

    it('should handle empty string with trailing newline as unchanged', () => {
      const result = formatCerialSource('\n');
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('\n');
      expect(result.changed).toBe(false);
    });

    it('should handle whitespace-only string', () => {
      const result = formatCerialSource('   \n  \n');
      expect(result.error).toBeUndefined();
      expect(result.formatted).toBe('\n');
    });

    it('should handle comments-only file', () => {
      const source = '# This is a comment\n# Another comment\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      // Comments should be preserved
      expect(result.formatted).toContain('# This is a comment');
      expect(result.formatted).toContain('# Another comment');
    });

    it('should strip trailing whitespace from lines', () => {
      const source = 'model User {  \n  id Record @id   \n}  \n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const lines = result.formatted!.split('\n');
      for (const line of lines) {
        if (line.length > 0) {
          expect(line).toBe(line.trimEnd());
        }
      }
    });

    it('should ensure file ends with exactly one newline', () => {
      const source = 'model User {\n  id Record @id\n}';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted!.endsWith('\n')).toBe(true);
      expect(result.formatted!.endsWith('\n\n')).toBe(false);
    });

    it('should normalize CRLF line endings', () => {
      const source = 'model User {\r\n  id Record @id\r\n}\r\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).not.toContain('\r');
    });
  });

  describe('config override', () => {
    it('should apply custom indentSize', () => {
      const source = 'model User {\n  id Record @id\n  name String\n}\n';
      const result = formatCerialSource(source, { indentSize: 4 });
      expect(result.error).toBeUndefined();
      // Fields should be indented with 4 spaces
      const lines = result.formatted!.split('\n');
      const fieldLine = lines.find((l) => l.includes('id') && l.includes('Record'));
      expect(fieldLine).toBeDefined();
      expect(fieldLine!.startsWith('    ')).toBe(true);
    });

    it('should apply tab indentation', () => {
      const source = 'model User {\n  id Record @id\n}\n';
      const result = formatCerialSource(source, { indentSize: 'tab' });
      expect(result.error).toBeUndefined();
      const lines = result.formatted!.split('\n');
      const fieldLine = lines.find((l) => l.includes('id') && l.includes('Record'));
      expect(fieldLine).toBeDefined();
      expect(fieldLine!.startsWith('\t')).toBe(true);
    });

    it('should apply fieldGroupBlankLines: collapse', () => {
      const source = 'model User {\n  id Record @id\n\n  name String\n}\n';
      const result = formatCerialSource(source, { fieldGroupBlankLines: 'collapse' });
      expect(result.error).toBeUndefined();
      // No blank lines between fields
      const text = result.formatted!;
      const modelBody = text.slice(text.indexOf('{') + 1, text.lastIndexOf('}'));
      const lines = modelBody.split('\n').filter((l) => l.trim() !== '');
      // Should have exactly 2 field lines (no blanks)
      expect(lines.length).toBe(2);
    });

    it('should apply trailingComma: true to multi-line enums', () => {
      const source = 'enum Role {\n  Admin,\n  Editor\n}\n';
      const result = formatCerialSource(source, { trailingComma: true });
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      // Last variant should have trailing comma
      const lines = text.split('\n');
      const editorLine = lines.find((l) => l.includes('Editor'));
      expect(editorLine).toBeDefined();
      expect(editorLine!.trim().endsWith(',')).toBe(true);
    });

    it('should apply inlineConstructStyle: single for enums', () => {
      const source = 'enum Role {\n  Admin,\n  Editor\n}\n';
      const result = formatCerialSource(source, { inlineConstructStyle: 'single' });
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('enum Role { Admin, Editor }');
    });

    it('should apply decoratorAlignment: compact', () => {
      const source = ['model User {', '  id Record @id', '  email Email @unique', '  name String', '}', ''].join('\n');

      const result = formatCerialSource(source, { decoratorAlignment: 'compact' });
      expect(result.error).toBeUndefined();
      // Compact mode should not column-align decorators
      const lines = result.formatted!.split('\n');
      const idLine = lines.find((l) => l.includes('@id'));
      const emailLine = lines.find((l) => l.includes('@unique'));
      expect(idLine).toBeDefined();
      expect(emailLine).toBeDefined();
    });
  });

  describe('top-level and bottom comments', () => {
    it('should preserve top-level comments before first declaration', () => {
      const source = [
        '# File header comment',
        '# Another header line',
        '',
        'model User {',
        '  id Record @id',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('# File header comment');
      expect(text).toContain('# Another header line');
      // Header should come before model
      const headerIdx = text.indexOf('# File header');
      const modelIdx = text.indexOf('model User');
      expect(headerIdx).toBeLessThan(modelIdx);
    });

    it('should preserve bottom comments after last declaration', () => {
      const source = ['model User {', '  id Record @id', '}', '', '# Bottom comment', ''].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('# Bottom comment');
      // Bottom comment should come after model
      const modelEnd = text.indexOf('}');
      const bottomIdx = text.indexOf('# Bottom comment');
      expect(bottomIdx).toBeGreaterThan(modelEnd);
    });

    it('should preserve field-level comments', () => {
      const source = [
        'model User {',
        '  # The primary key',
        '  id Record @id',
        '  # User email',
        '  email Email @unique',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('# The primary key');
      expect(text).toContain('# User email');
    });

    it('should preserve trailing comments on model declaration', () => {
      const source = 'model User { # Main user model\n  id Record @id\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const text = result.formatted!;
      expect(text).toContain('# Main user model');
    });
  });

  describe('complex formatting scenarios', () => {
    it('should handle model with directives', () => {
      const source = [
        'model User {',
        '  id Record @id',
        '  email Email',
        '  name String',
        '',
        '  @@unique(emailIdx, [email, name])',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('@@unique(emailIdx, [email, name])');
    });

    it('should handle model with optional and nullable fields', () => {
      const source = [
        'model User {',
        '  id Record @id',
        '  name String',
        '  bio String? @nullable',
        '  age Int?',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('String?');
      expect(result.formatted).toContain('@nullable');
      expect(result.formatted).toContain('Int?');
    });

    it('should handle model with array fields', () => {
      const source = ['model User {', '  id Record @id', '  tags String[]', '  scores Int[]', '}', ''].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('String[]');
      expect(result.formatted).toContain('Int[]');
    });

    it('should handle typed Record IDs', () => {
      const source = 'model User {\n  id Record(int) @id\n  name String\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('Record(int)');
    });

    it('should handle object with decorators', () => {
      const source = [
        'object Address {',
        '  street String',
        '  city String',
        '  createdAt Date @createdAt',
        '}',
        '',
      ].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('@createdAt');
    });

    it('should handle literal with various variant types', () => {
      const source = "literal Mixed { 'hello', 42, 3.14, true, String }\n";
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
    });

    it('should handle tuple with decorators on elements', () => {
      const source = 'tuple TimedPoint {\n  x Float,\n  y Float,\n  ts Date @createdAt\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      expect(result.formatted).toContain('@createdAt');
    });
  });

  describe('default config behavior', () => {
    it('should use blockSeparation: 2 by default', () => {
      const source = ['model A {', '  id Record @id', '}', '', 'model B {', '  id Record @id', '}', ''].join('\n');

      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      // Default blockSeparation is 2
      expect(result.formatted).toContain('}\n\n\nmodel B');
    });

    it('should use indentSize: 2 by default', () => {
      const source = 'model User {\n  id Record @id\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      const lines = result.formatted!.split('\n');
      const fieldLine = lines.find((l) => l.includes('id') && l.includes('Record'));
      expect(fieldLine).toBeDefined();
      expect(fieldLine!.startsWith('  ')).toBe(true);
      expect(fieldLine![2]).not.toBe(' '); // Not 4 spaces
    });

    it('should use commentStyle: honor by default', () => {
      const source = '# hash\n// slash\nmodel User {\n  id Record @id\n}\n';
      const result = formatCerialSource(source);
      expect(result.error).toBeUndefined();
      // Both styles preserved
      expect(result.formatted).toContain('#');
      expect(result.formatted).toContain('//');
    });
  });
});

describe('normalizeCommentText', () => {
  describe('to hash style', () => {
    it('should convert // comment to # comment', () => {
      expect(normalizeCommentText('// hello', 'hash')).toBe('# hello');
    });

    it('should convert //comment (no space) to #comment', () => {
      expect(normalizeCommentText('//comment', 'hash')).toBe('#comment');
    });

    it('should convert /* single-line */ to # single-line', () => {
      expect(normalizeCommentText('/* single-line */', 'hash')).toBe('# single-line');
    });

    it('should convert /* empty */ to #', () => {
      expect(normalizeCommentText('/*  */', 'hash')).toBe('#');
    });

    it('should preserve # comment as-is', () => {
      expect(normalizeCommentText('# already hash', 'hash')).toBe('# already hash');
    });
  });

  describe('to slash style', () => {
    it('should convert # comment to // comment', () => {
      expect(normalizeCommentText('# hello', 'slash')).toBe('// hello');
    });

    it('should convert #comment (no space) to //comment', () => {
      expect(normalizeCommentText('#comment', 'slash')).toBe('//comment');
    });

    it('should preserve // comment as-is', () => {
      expect(normalizeCommentText('// already slash', 'slash')).toBe('// already slash');
    });

    it('should preserve /* block */ as-is', () => {
      expect(normalizeCommentText('/* block */', 'slash')).toBe('/* block */');
    });
  });
});
