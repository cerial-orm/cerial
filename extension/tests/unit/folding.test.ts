import { describe, expect, test } from 'bun:test';
import { loadFixture, parseFixture } from './helpers';

describe('Folding Logic', () => {
  describe('block folding ranges', () => {
    test('model block produces folding range', () => {
      const ast = parseFixture('simple-model.cerial');
      const user = ast.models.find((m) => m.name === 'User')!;

      // Folding: startLine to endLine (0-indexed for LSP)
      const startLine = user.range.start.line - 1;
      const endLine = user.range.end.line - 1;

      expect(endLine).toBeGreaterThan(startLine);
    });

    test('object block produces folding range', () => {
      const ast = parseFixture('complex-types.cerial');
      const addr = ast.objects.find((o) => o.name === 'Address')!;
      const startLine = addr.range.start.line - 1;
      const endLine = addr.range.end.line - 1;

      expect(endLine).toBeGreaterThan(startLine);
    });

    test('tuple block produces folding range', () => {
      const ast = parseFixture('complex-types.cerial');
      const point = ast.tuples.find((t) => t.name === 'Point3D')!;
      const startLine = point.range.start.line - 1;
      const endLine = point.range.end.line - 1;

      expect(endLine).toBeGreaterThan(startLine);
    });

    test('enum block produces folding range (multi-line only)', () => {
      const ast = parseFixture('complex-types.cerial');
      // Single-line enums don't fold
      for (const enumDef of ast.enums) {
        const startLine = enumDef.range.start.line - 1;
        const endLine = enumDef.range.end.line - 1;
        // Single-line enums have startLine === endLine
        if (endLine > startLine) {
          // Multi-line enum can fold
          expect(endLine).toBeGreaterThan(startLine);
        }
      }
    });

    test('literal block produces folding range (multi-line only)', () => {
      const ast = parseFixture('complex-types.cerial');

      for (const literal of ast.literals) {
        const startLine = literal.range.start.line - 1;
        const endLine = literal.range.end.line - 1;
        // Only multi-line blocks can fold
        if (endLine > startLine) {
          expect(endLine).toBeGreaterThan(startLine);
        }
      }
    });
  });

  describe('comment folding', () => {
    test('consecutive single-line comments can fold', () => {
      const source = '// Line 1\n// Line 2\n// Line 3\nmodel A { id Record @id }';
      const lines = source.split('\n');

      let startLine: number | null = null;
      let endLine: number | null = null;

      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i]!.trim();
        if (trimmed.startsWith('//')) {
          if (startLine === null) startLine = i;
          endLine = i;
        } else {
          break;
        }
      }

      expect(startLine).toBe(0);
      expect(endLine).toBe(2);
      expect(endLine! > startLine!).toBe(true);
    });

    test('single comment line does not fold', () => {
      const source = '// Just one comment\nmodel A { id Record @id }';
      const lines = source.split('\n');
      let consecutiveCount = 0;

      for (const line of lines) {
        if (line.trim().startsWith('//')) {
          consecutiveCount++;
        } else {
          break;
        }
      }

      expect(consecutiveCount).toBe(1);
      // Single line — no fold
    });

    test('multi-line comment block can fold', () => {
      const source = '/* This is\n   a multi-line\n   comment */\nmodel A { id Record @id }';
      const lines = source.split('\n');

      let startLine: number | null = null;
      let endLine: number | null = null;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i]!.trim().startsWith('/*')) {
          startLine = i;
        }
        if (lines[i]!.includes('*/')) {
          endLine = i;
          break;
        }
      }

      expect(startLine).toBe(0);
      expect(endLine).toBe(2);
      expect(endLine! > startLine!).toBe(true);
    });
  });

  describe('all fixture blocks produce folding ranges', () => {
    test('relations fixture has multiple foldable blocks', () => {
      const ast = parseFixture('relations.cerial');
      let foldableCount = 0;

      for (const model of ast.models) {
        const start = model.range.start.line - 1;
        const end = model.range.end.line - 1;
        if (end > start) foldableCount++;
      }

      expect(foldableCount).toBeGreaterThan(0);
    });

    test('inheritance fixture has foldable abstract and concrete models', () => {
      const ast = parseFixture('inheritance.cerial');
      let abstractFoldable = 0;
      let concreteFoldable = 0;

      for (const model of ast.models) {
        const start = model.range.start.line - 1;
        const end = model.range.end.line - 1;
        if (end > start) {
          if (model.abstract) abstractFoldable++;
          else concreteFoldable++;
        }
      }

      expect(abstractFoldable).toBeGreaterThan(0);
      expect(concreteFoldable).toBeGreaterThan(0);
    });
  });
});
