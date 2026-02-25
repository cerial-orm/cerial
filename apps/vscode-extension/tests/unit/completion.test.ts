import { describe, expect, test } from 'bun:test';
import { parse } from '../../../orm/src/parser/parser';
import type { ASTField } from '../../../orm/src/types';
import type { SchemaFieldType } from '../../../orm/src/types/common.types';
import {
  getDecoratorCompletions,
  getExtendsBracketCompletions,
  getExtendsBracketContext,
  isDecoratorAllowedForFieldType,
  resolveEnumLiteralValues,
} from '../../server/src/providers/completion';
import type { BlockContext } from '../../server/src/utils/ast-location';
import { getBlockContext } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, parseFixture, testPath } from './helpers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeRange = () => ({
  start: { line: 1, column: 1, offset: 0 },
  end: { line: 1, column: 10, offset: 0 },
});

const makeField = (overrides: Partial<ASTField> = {}): ASTField => ({
  name: 'test',
  type: 'string' as SchemaFieldType,
  isOptional: false,
  decorators: [],
  range: makeRange(),
  ...overrides,
});

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

  // ---------------------------------------------------------------------------
  // Smart @default/@defaultAlways for enum/literal fields
  // ---------------------------------------------------------------------------
  describe('resolveEnumLiteralValues', () => {
    test('returns enum values for enum-typed field', () => {
      const source = 'enum Status { ACTIVE, INACTIVE, PENDING }\n\nmodel M {\n  id Record @id\n  role Status\n}';
      const { ast } = parse(source);
      const field = ast.models[0]!.fields.find((f) => f.name === 'role')!;

      const values = resolveEnumLiteralValues(field, ast, testPath('test.cerial'), null);

      expect(values).toEqual(['ACTIVE', 'INACTIVE', 'PENDING']);
    });

    test('returns literal variant strings for literal-typed field with int variants', () => {
      const source = 'literal Severity { 1, 2, 3 }\n\nmodel M {\n  id Record @id\n  sev Severity\n}';
      const { ast } = parse(source);
      const field = ast.models[0]!.fields.find((f) => f.name === 'sev')!;

      const values = resolveEnumLiteralValues(field, ast, testPath('test.cerial'), null);

      expect(values).toEqual(['1', '2', '3']);
    });

    test('returns null for non-literal field types', () => {
      const source = 'model M {\n  id Record @id\n  name String\n}';
      const { ast } = parse(source);
      const field = ast.models[0]!.fields.find((f) => f.name === 'name')!;

      const values = resolveEnumLiteralValues(field, ast, testPath('test.cerial'), null);

      expect(values).toBeNull();
    });

    test('returns null when literalName does not match any definition', () => {
      const source = 'model M {\n  id Record @id\n  role Status\n}';
      // Parse with external literal names so 'Status' is treated as a literal ref
      const { ast } = parse(source, undefined, undefined, new Set(['Status']));
      const field = ast.models[0]!.fields.find((f) => f.name === 'role')!;

      const values = resolveEnumLiteralValues(field, ast, testPath('test.cerial'), null);

      // Status is not defined in the AST, so it can't be resolved
      expect(values).toBeNull();
    });

    test('resolves cross-file: enum defined in another file in same indexer group', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'enum Priority { LOW, MEDIUM, HIGH }',
        'models.cerial': 'model Task {\n  id Record @id\n  priority Priority\n}',
      });

      const modelsUri = testPath('models.cerial');
      const modelsAST = indexer.getAST(modelsUri)!;
      const field = modelsAST.models[0]!.fields.find((f) => f.name === 'priority')!;

      const values = resolveEnumLiteralValues(field, modelsAST, modelsUri, indexer);

      expect(values).toEqual(['LOW', 'MEDIUM', 'HIGH']);
    });

    test('returns null for null field', () => {
      const values = resolveEnumLiteralValues(null, null, testPath('test.cerial'), null);

      expect(values).toBeNull();
    });
  });

  describe('getDecoratorCompletions with enum/literal fields', () => {
    test('enum field produces @default with choice snippet containing enum values', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'enum Status { ACTIVE, INACTIVE }\nmodel M {\n  id Record @id\n  role Status @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      // Line 4 (1-indexed): "  role Status @"
      const cerialPos = { line: 4, column: 15, offset: 0 };
      const lineText = '  role Status @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);

      const defaultItem = items.find((i) => i.label === '@default()');

      expect(defaultItem).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code snippet syntax
      expect(defaultItem!.insertText).toBe('@default(${1|ACTIVE,INACTIVE|})');
    });

    test('enum field produces @defaultAlways with same choice snippet', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'enum Status { ACTIVE, INACTIVE }\nmodel M {\n  id Record @id\n  role Status @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      const cerialPos = { line: 4, column: 15, offset: 0 };
      const lineText = '  role Status @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);

      const defaultAlwaysItem = items.find((i) => i.label === '@defaultAlways()');

      expect(defaultAlwaysItem).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code snippet syntax
      expect(defaultAlwaysItem!.insertText).toBe('@defaultAlways(${1|ACTIVE,INACTIVE|})');
    });

    test('non-enum field keeps generic @default placeholder', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'model M {\n  id Record @id\n  name String @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      // Line 3 (1-indexed): "  name String @"
      const cerialPos = { line: 3, column: 15, offset: 0 };
      const lineText = '  name String @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);

      const defaultItem = items.find((i) => i.label === '@default()');

      expect(defaultItem).toBeDefined();
      // biome-ignore lint/suspicious/noTemplateCurlyInString: VS Code snippet syntax
      expect(defaultItem!.insertText).toBe('@default(${1:value})');
    });
  });

  // ---------------------------------------------------------------------------
  // Field-type-aware decorator filtering
  // ---------------------------------------------------------------------------
  describe('isDecoratorAllowedForFieldType', () => {
    test('@createdAt allowed on Date field', () => {
      expect(isDecoratorAllowedForFieldType('createdAt', makeField({ type: 'date' }))).toBe(true);
    });

    test('@createdAt not allowed on String field', () => {
      expect(isDecoratorAllowedForFieldType('createdAt', makeField({ type: 'string' }))).toBe(false);
    });

    test('@uuid allowed on Uuid field', () => {
      expect(isDecoratorAllowedForFieldType('uuid', makeField({ type: 'uuid' }))).toBe(true);
    });

    test('@uuid not allowed on Int field', () => {
      expect(isDecoratorAllowedForFieldType('uuid', makeField({ type: 'int' }))).toBe(false);
    });

    test('@point allowed on Geometry field', () => {
      expect(isDecoratorAllowedForFieldType('point', makeField({ type: 'geometry' }))).toBe(true);
    });

    test('@point not allowed on String field', () => {
      expect(isDecoratorAllowedForFieldType('point', makeField({ type: 'string' }))).toBe(false);
    });

    test('@flexible allowed on object-typed field (objectName set)', () => {
      expect(isDecoratorAllowedForFieldType('flexible', makeField({ type: 'object', objectName: 'Addr' }))).toBe(true);
    });

    test('@flexible not allowed on String field', () => {
      expect(isDecoratorAllowedForFieldType('flexible', makeField({ type: 'string' }))).toBe(false);
    });

    test('@set allowed on array field (isArray: true)', () => {
      expect(isDecoratorAllowedForFieldType('set', makeField({ type: 'string', isArray: true }))).toBe(true);
    });

    test('@set not allowed on non-array field (isArray: false)', () => {
      expect(isDecoratorAllowedForFieldType('set', makeField({ type: 'string' }))).toBe(false);
    });

    test('@field allowed on Relation field', () => {
      expect(isDecoratorAllowedForFieldType('field', makeField({ type: 'relation' }))).toBe(true);
    });

    test('@field not allowed on String field', () => {
      expect(isDecoratorAllowedForFieldType('field', makeField({ type: 'string' }))).toBe(false);
    });

    test('@default allowed on String field (no restriction)', () => {
      expect(isDecoratorAllowedForFieldType('default', makeField({ type: 'string' }))).toBe(true);
    });

    test('@nullable allowed on any field (no restriction)', () => {
      expect(isDecoratorAllowedForFieldType('nullable', makeField({ type: 'int' }))).toBe(true);
    });

    test('null field returns true (cannot determine type, do not filter)', () => {
      expect(isDecoratorAllowedForFieldType('createdAt', null)).toBe(true);
    });
  });

  describe('getDecoratorCompletions with field-type filtering', () => {
    test('Date field includes @createdAt and @updatedAt', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'model M {\n  id Record @id\n  ts Date @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      const cerialPos = { line: 3, column: 10, offset: 0 };
      const lineText = '  ts Date @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);
      const labels = items.map((i) => i.label);

      expect(labels).toContain('@createdAt');
      expect(labels).toContain('@updatedAt');
      expect(labels).toContain('@now');
    });

    test('String field excludes @createdAt, @updatedAt, @uuid, @point, etc.', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'model M {\n  id Record @id\n  name String @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      const cerialPos = { line: 3, column: 15, offset: 0 };
      const lineText = '  name String @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);
      const labels = items.map((i) => i.label);

      expect(labels).not.toContain('@createdAt');
      expect(labels).not.toContain('@updatedAt');
      expect(labels).not.toContain('@now');
      expect(labels).not.toContain('@uuid');
      expect(labels).not.toContain('@uuid4');
      expect(labels).not.toContain('@uuid7');
      expect(labels).not.toContain('@point');
      expect(labels).not.toContain('@polygon');
      // Should still include type-agnostic decorators
      expect(labels).toContain('@default()');
      expect(labels).toContain('@unique');
      expect(labels).toContain('@nullable');
    });

    test('Uuid field includes @uuid, @uuid4, @uuid7', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'model M {\n  id Record @id\n  trackId Uuid @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      const cerialPos = { line: 3, column: 15, offset: 0 };
      const lineText = '  trackId Uuid @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);
      const labels = items.map((i) => i.label);

      expect(labels).toContain('@uuid');
      expect(labels).toContain('@uuid4');
      expect(labels).toContain('@uuid7');
    });

    test('Geometry field includes @point, @line, @polygon, etc.', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'model M {\n  id Record @id\n  loc Geometry @\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'M', fieldContext: 'decorator' };
      const cerialPos = { line: 3, column: 16, offset: 0 };
      const lineText = '  loc Geometry @';

      const items = getDecoratorCompletions(ast, blockContext, lineText, cerialPos, uri, indexer);
      const labels = items.map((i) => i.label);

      expect(labels).toContain('@point');
      expect(labels).toContain('@line');
      expect(labels).toContain('@polygon');
      expect(labels).toContain('@multipoint');
      expect(labels).toContain('@multiline');
      expect(labels).toContain('@multipolygon');
      expect(labels).toContain('@geoCollection');
    });
  });

  // ---------------------------------------------------------------------------
  // Extends bracket field completions
  // ---------------------------------------------------------------------------
  describe('getExtendsBracketContext', () => {
    test('returns parent name when cursor is inside brackets after extends', () => {
      const result = getExtendsBracketContext('model Child extends Parent[', 27);

      expect(result).toBe('Parent');
    });

    test('returns parent name with content already in brackets', () => {
      const result = getExtendsBracketContext('model Child extends Parent[id, ', 31);

      expect(result).toBe('Parent');
    });

    test('returns null when no bracket present', () => {
      const result = getExtendsBracketContext('model Child extends Parent', 26);

      expect(result).toBeNull();
    });

    test('returns null when cursor is after closing bracket', () => {
      const result = getExtendsBracketContext('model Child extends Parent[] {', 29);

      expect(result).toBeNull();
    });

    test('returns null for non-extends context', () => {
      const result = getExtendsBracketContext('  id Record @id', 15);

      expect(result).toBeNull();
    });
  });

  describe('getExtendsBracketCompletions', () => {
    test('for model parent returns parent fields', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[',
        26,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('id');
      expect(labels).toContain('name');
      expect(labels).toContain('email');
    });

    test('excludes already-listed fields in brackets', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[id, \n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[id, ',
        31,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).not.toContain('id');
      expect(labels).toContain('name');
      expect(labels).toContain('email');
    });

    test('for enum parent returns enum values', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'enum BaseRole { VIEWER, EDITOR, ADMIN }\nenum SubRole extends BaseRole[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'enum', blockName: 'SubRole', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BaseRole',
        'enum SubRole extends BaseRole[',
        30,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('VIEWER');
      expect(labels).toContain('EDITOR');
      expect(labels).toContain('ADMIN');
    });

    test('for object parent returns parent fields', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'object BaseAddr {\n  street String\n  city String\n}\nobject Full extends BaseAddr[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'object', blockName: 'Full', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BaseAddr',
        'object Full extends BaseAddr[',
        30,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('street');
      expect(labels).toContain('city');
    });

    test('for tuple parent returns element names', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'tuple BasePair {\n  x Float,\n  y Float\n}\ntuple Ext extends BasePair[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'tuple', blockName: 'Ext', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BasePair',
        'tuple Ext extends BasePair[',
        27,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('x');
      expect(labels).toContain('y');
    });

    test('for literal parent returns variant labels', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': "literal BaseStatus { 'active', 'inactive' }\nliteral Ext extends BaseStatus[\n}",
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'literal', blockName: 'Ext', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BaseStatus',
        'literal Ext extends BaseStatus[',
        32,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('active');
      expect(labels).toContain('inactive');
    });

    test('searches cross-file ASTs via indexer', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model Base {\n  id Record @id\n  name String\n}',
        'child.cerial': 'model Child extends Base[\n}',
      });
      const uri = testPath('child.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[',
        26,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('id');
      expect(labels).toContain('name');
    });
  });

  describe('extends bracket omit suggestions', () => {
    test('empty brackets → both pick and omit suggestions', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[',
        26,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      // Should have both pick and omit for each field
      expect(labels).toContain('id');
      expect(labels).toContain('!id');
      expect(labels).toContain('name');
      expect(labels).toContain('!name');
      expect(labels).toContain('email');
      expect(labels).toContain('!email');
      // Total: 3 fields × 2 (pick + omit) = 6 items
      expect(items.length).toBe(6);
    });

    test('existing pick items → only pick suggestions', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[id, \n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[id, ',
        31,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      // Should only have pick suggestions (no ! prefix)
      expect(labels).toContain('name');
      expect(labels).toContain('email');
      expect(labels).not.toContain('!name');
      expect(labels).not.toContain('!email');
      // id already used, should not appear
      expect(labels).not.toContain('id');
      expect(labels).not.toContain('!id');
      // Total: 2 remaining fields in pick mode = 2 items
      expect(items.length).toBe(2);
    });

    test('existing omit items → only omit suggestions', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[!id, \n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[!id, ',
        32,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      // Should only have omit suggestions (with ! prefix)
      expect(labels).toContain('!name');
      expect(labels).toContain('!email');
      expect(labels).not.toContain('name');
      expect(labels).not.toContain('email');
      // id already used, should not appear in any form
      expect(labels).not.toContain('id');
      expect(labels).not.toContain('!id');
      // Total: 2 remaining fields in omit mode = 2 items
      expect(items.length).toBe(2);
    });

    test('deduplication — all fields used in pick mode', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[id, name, email, \n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[id, name, email, ',
        43,
        blockContext,
        ast,
        uri,
        indexer,
      );

      // All fields already used, no suggestions
      expect(items.length).toBe(0);
    });

    test('edge case — single field parent', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'abstract model Base {\n  id Record @id\n}\nmodel Child extends Base[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[',
        26,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      // Single field: pick + omit = 2 items
      expect(labels).toContain('id');
      expect(labels).toContain('!id');
      expect(items.length).toBe(2);
    });

    test('edge case — parent with no fields', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'abstract model Base {}\nmodel Child extends Base[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[',
        26,
        blockContext,
        ast,
        uri,
        indexer,
      );

      // No fields in parent, no suggestions
      expect(items.length).toBe(0);
    });

    test('object parent — empty brackets → both pick and omit', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'object BaseAddr {\n  street String\n  city String\n}\nobject Full extends BaseAddr[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'object', blockName: 'Full', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BaseAddr',
        'object Full extends BaseAddr[',
        30,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('street');
      expect(labels).toContain('!street');
      expect(labels).toContain('city');
      expect(labels).toContain('!city');
      expect(items.length).toBe(4);
    });

    test('tuple parent — empty brackets → both pick and omit', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'tuple BasePair {\n  x Float,\n  y Float\n}\ntuple Ext extends BasePair[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'tuple', blockName: 'Ext', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BasePair',
        'tuple Ext extends BasePair[',
        27,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('x');
      expect(labels).toContain('!x');
      expect(labels).toContain('y');
      expect(labels).toContain('!y');
      expect(items.length).toBe(4);
    });

    test('enum parent — empty brackets → both pick and omit', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': 'enum BaseRole { VIEWER, EDITOR, ADMIN }\nenum SubRole extends BaseRole[\n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'enum', blockName: 'SubRole', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BaseRole',
        'enum SubRole extends BaseRole[',
        30,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('VIEWER');
      expect(labels).toContain('!VIEWER');
      expect(labels).toContain('EDITOR');
      expect(labels).toContain('!EDITOR');
      expect(labels).toContain('ADMIN');
      expect(labels).toContain('!ADMIN');
      expect(items.length).toBe(6);
    });

    test('literal parent — empty brackets → both pick and omit', () => {
      const indexer = createIndexerWithContent({
        'test.cerial': "literal BaseStatus { 'active', 'inactive' }\nliteral Ext extends BaseStatus[\n}",
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'literal', blockName: 'Ext', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'BaseStatus',
        'literal Ext extends BaseStatus[',
        32,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      expect(labels).toContain('active');
      expect(labels).toContain('!active');
      expect(labels).toContain('inactive');
      expect(labels).toContain('!inactive');
      expect(items.length).toBe(4);
    });

    test('mixed pick and omit → invalid, but function handles gracefully', () => {
      const indexer = createIndexerWithContent({
        'test.cerial':
          'abstract model Base {\n  id Record @id\n  name String\n  email Email\n}\nmodel Child extends Base[id, !name, \n}',
      });
      const uri = testPath('test.cerial');
      const ast = indexer.getAST(uri)!;
      const blockContext: BlockContext = { blockType: 'model', blockName: 'Child', fieldContext: null };

      const items = getExtendsBracketCompletions(
        'Base',
        'model Child extends Base[id, !name, ',
        38,
        blockContext,
        ast,
        uri,
        indexer,
      );
      const labels = items.map((i) => i.label);

      // When omit is detected (due to !name), mode becomes 'omit'
      // So only omit suggestions should appear
      expect(labels).toContain('!email');
      expect(labels).not.toContain('email');
      // id and name already used, should not appear
      expect(labels).not.toContain('id');
      expect(labels).not.toContain('!id');
      expect(labels).not.toContain('name');
      expect(labels).not.toContain('!name');
    });
  });
});
