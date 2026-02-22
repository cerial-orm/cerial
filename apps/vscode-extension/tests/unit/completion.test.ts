import { describe, expect, test } from 'bun:test';
import { parse } from '../../../src/parser/parser';
import { getBlockContext, isInsideBlock } from '../../server/src/utils/ast-location';
import { lspToCerial } from '../../server/src/utils/position';
import { createIndexerWithContent, loadFixture, parseFixture, testPath } from './helpers';

describe('Completion Logic', () => {
  describe('context detection for completions', () => {
    test('outside blocks → top-level context (blockType null)', () => {
      const ast = parseFixture('simple-model.cerial');
      // Line 1 is a comment, outside blocks
      const ctx = getBlockContext(ast, { line: 1, column: 0, offset: 0 });

      expect(ctx.blockType).toBeNull();
      expect(ctx.fieldContext).toBeNull();
    });

    test('inside model on empty line → block context with null fieldContext', () => {
      const source = 'model User {\n  id Record @id\n\n  name String\n}';
      const { ast } = parse(source);
      // Line 3 (1-indexed) is the empty line inside the model
      const ctx = getBlockContext(ast, { line: 3, column: 0, offset: 0 });

      expect(ctx.blockType).toBe('model');
      expect(ctx.blockName).toBe('User');
      expect(ctx.fieldContext).toBeNull();
    });

    test('at field type position → type context', () => {
      const ast = parseFixture('simple-model.cerial');
      // "  email Email @unique" — on the Email type
      const ctx = getBlockContext(ast, { line: 5, column: 8, offset: 0 });

      expect(ctx.blockType).toBe('model');
      expect(ctx.fieldContext).toBe('type');
    });

    test('after @ → decorator context', () => {
      const ast = parseFixture('simple-model.cerial');
      // "  email Email @unique" — on @unique (column ~14-20)
      const ctx = getBlockContext(ast, { line: 5, column: 16, offset: 0 });

      expect(ctx.fieldContext).toBe('decorator');
    });

    test('inside object block → object context', () => {
      const ast = parseFixture('complex-types.cerial');
      // Inside Address object (line 4: "  street String")
      const ctx = getBlockContext(ast, { line: 4, column: 2, offset: 0 });

      expect(ctx.blockType).toBe('object');
      expect(ctx.blockName).toBe('Address');
    });
  });

  describe('extends context detection', () => {
    test('line text after extends keyword can be detected', () => {
      // This tests the pattern the completion provider uses
      const lineText = 'model Child extends ';
      const beforeCursor = lineText.slice(0, lineText.length).trimEnd();

      expect(beforeCursor.endsWith('extends')).toBe(true);
    });

    test('extends with partial name does not match', () => {
      const lineText = 'model Child extends Base';
      const beforeCursor = lineText.slice(0, lineText.length).trimEnd();

      expect(beforeCursor.endsWith('extends')).toBe(false);
    });
  });

  describe('Record() context detection', () => {
    test('inside Record() parens detectable from line text', () => {
      const lineText = '  id Record(';
      const beforeCursor = lineText.slice(0, lineText.length);
      const recordIdx = beforeCursor.lastIndexOf('Record(');

      expect(recordIdx).toBeGreaterThan(-1);
      const afterRecord = beforeCursor.slice(recordIdx + 'Record('.length);

      expect(afterRecord.includes(')')).toBe(false);
    });

    test('after closed Record() not inside parens', () => {
      const lineText = '  id Record(int) @id';
      const beforeCursor = lineText.slice(0, 16); // after "Record(int)"
      const recordIdx = beforeCursor.lastIndexOf('Record(');
      const afterRecord = beforeCursor.slice(recordIdx + 'Record('.length);

      expect(afterRecord.includes(')')).toBe(true);
    });
  });

  describe('@model() context detection', () => {
    test('inside @model() parens detectable', () => {
      const lineText = '  rel Relation @field(fk) @model(';
      const character = lineText.length;
      const beforeCursor = lineText.slice(0, character);
      const idx = beforeCursor.lastIndexOf('@model(');

      expect(idx).toBeGreaterThan(-1);
      const afterModel = beforeCursor.slice(idx + '@model('.length);

      expect(afterModel.includes(')')).toBe(false);
    });
  });

  describe('@field() context detection', () => {
    test('inside @field() parens detectable', () => {
      const lineText = '  rel Relation @field(';
      const character = lineText.length;
      const beforeCursor = lineText.slice(0, character);
      const idx = beforeCursor.lastIndexOf('@field(');

      expect(idx).toBeGreaterThan(-1);
      const afterField = beforeCursor.slice(idx + '@field('.length);

      expect(afterField.includes(')')).toBe(false);
    });
  });

  describe('cross-file type availability via indexer', () => {
    test('types from other files in group are available', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Address { street String }',
        'models.cerial': 'model User { id Record @id }',
      });

      const group = indexer.getSchemaGroup(testPath('models.cerial'));

      expect(group).not.toBeNull();

      const allASTs = indexer.getAllASTsInGroup(group!.name);

      // Should have 2 files
      expect(allASTs.size).toBe(2);

      // The types file should have Address
      let hasAddress = false;
      for (const [, ast] of allASTs) {
        if (ast.objects.some((o) => o.name === 'Address')) {
          hasAddress = true;
        }
      }

      expect(hasAddress).toBe(true);
    });
  });

  describe('decorator filtering logic', () => {
    test('decorator position detection from line text', () => {
      const lineText = '  name String @';
      const character = lineText.length;
      const beforeCursor = lineText.slice(0, character);

      expect(/@[a-zA-Z0-9]*$/.test(beforeCursor)).toBe(true);
    });

    test('partial decorator name matches pattern', () => {
      const lineText = '  name String @def';
      const character = lineText.length;
      const beforeCursor = lineText.slice(0, character);

      expect(/@[a-zA-Z0-9]*$/.test(beforeCursor)).toBe(true);
    });

    test('non-decorator position does not match', () => {
      const lineText = '  name String ';
      const character = lineText.length;
      const beforeCursor = lineText.slice(0, character);

      expect(/@[a-zA-Z0-9]*$/.test(beforeCursor)).toBe(false);
    });
  });
});
