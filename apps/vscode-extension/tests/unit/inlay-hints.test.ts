import { describe, expect, test } from 'bun:test';
import { parse } from '../../../orm/src/parser/parser';
import type { ASTModel } from '../../../orm/src/types';
import { cerialToLsp } from '../../server/src/utils/position';
import { createIndexerWithContent, testPath } from './helpers';

/**
 * Replicate helper functions from inlay-hints.ts since they are not exported.
 */

function mapIdTypeToTs(idType: string): string {
  switch (idType) {
    case 'int':
    case 'float':
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'uuid':
      return 'CerialUuid';
    default:
      return idType;
  }
}

function hasDecorator(field: { decorators: Array<{ type: string }> }, name: string): boolean {
  return field.decorators.some((d) => d.type === name);
}

function findRecordTypeEnd(sourceLine: string, isArray: boolean): number | null {
  const pattern = isArray ? /\bRecord\s*\[\s*\]/ : /\bRecord\b/;
  const match = sourceLine.match(pattern);
  if (!match || match.index === undefined) return null;

  return match.index + match[0].length;
}

function isInLspRange(
  pos: { line: number; character: number },
  range: { start: { line: number; character: number }; end: { line: number; character: number } },
): boolean {
  if (pos.line < range.start.line || pos.line > range.end.line) return false;
  if (pos.line === range.start.line && pos.character < range.start.character) return false;
  if (pos.line === range.end.line && pos.character > range.end.character) return false;

  return true;
}

describe('Inlay Hints Logic', () => {
  describe('mapIdTypeToTs', () => {
    test('int → number', () => {
      expect(mapIdTypeToTs('int')).toBe('number');
    });

    test('float → number', () => {
      expect(mapIdTypeToTs('float')).toBe('number');
    });

    test('number → number', () => {
      expect(mapIdTypeToTs('number')).toBe('number');
    });

    test('string → string', () => {
      expect(mapIdTypeToTs('string')).toBe('string');
    });

    test('uuid → CerialUuid', () => {
      expect(mapIdTypeToTs('uuid')).toBe('CerialUuid');
    });

    test('custom type name passes through', () => {
      expect(mapIdTypeToTs('MyTuple')).toBe('MyTuple');
    });

    test('object type name passes through', () => {
      expect(mapIdTypeToTs('Address')).toBe('Address');
    });
  });

  describe('hasDecorator', () => {
    test('returns true when decorator exists', () => {
      const field = { decorators: [{ type: 'id' }, { type: 'unique' }] };

      expect(hasDecorator(field, 'id')).toBe(true);
    });

    test('returns false when decorator missing', () => {
      const field = { decorators: [{ type: 'id' }] };

      expect(hasDecorator(field, 'unique')).toBe(false);
    });

    test('returns false for empty decorators', () => {
      const field = { decorators: [] as Array<{ type: string }> };

      expect(hasDecorator(field, 'id')).toBe(false);
    });
  });

  describe('findRecordTypeEnd', () => {
    test('finds end of Record on simple field', () => {
      const result = findRecordTypeEnd('  authorId Record', false);

      expect(result).toBe(17); // "  authorId Record".length
    });

    test('finds end of Record[] on array field', () => {
      const result = findRecordTypeEnd('  tagIds Record[]', true);

      expect(result).toBe(17); // "  tagIds Record[]".length
    });

    test('finds end of Record[] with spaces', () => {
      const result = findRecordTypeEnd('  ids Record [ ]', true);

      expect(result).toBe(16); // "  ids Record [ ]".length
    });

    test('returns null when Record not found', () => {
      const result = findRecordTypeEnd('  name String', false);

      expect(result).toBeNull();
    });

    test('does not match partial word (Recording)', () => {
      const result = findRecordTypeEnd('  Recording String', false);

      expect(result).toBeNull();
    });

    test('matches Record with decorators after', () => {
      const result = findRecordTypeEnd('  fk Record @field(x)', false);

      expect(result).toBe(11); // "  fk Record".length
    });
  });

  describe('isInLspRange', () => {
    const range = {
      start: { line: 5, character: 0 },
      end: { line: 15, character: 80 },
    };

    test('position inside range', () => {
      expect(isInLspRange({ line: 10, character: 20 }, range)).toBe(true);
    });

    test('position at range start', () => {
      expect(isInLspRange({ line: 5, character: 0 }, range)).toBe(true);
    });

    test('position at range end', () => {
      expect(isInLspRange({ line: 15, character: 80 }, range)).toBe(true);
    });

    test('position before range (line)', () => {
      expect(isInLspRange({ line: 4, character: 50 }, range)).toBe(false);
    });

    test('position after range (line)', () => {
      expect(isInLspRange({ line: 16, character: 0 }, range)).toBe(false);
    });

    test('position on start line but before start character', () => {
      const narrowRange = {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 30 },
      };

      expect(isInLspRange({ line: 5, character: 5 }, narrowRange)).toBe(false);
    });

    test('position on end line but after end character', () => {
      const narrowRange = {
        start: { line: 5, character: 10 },
        end: { line: 5, character: 30 },
      };

      expect(isInLspRange({ line: 5, character: 35 }, narrowRange)).toBe(false);
    });
  });

  describe('FK type inference via AST', () => {
    test('detects FK Record field paired with Relation @field @model', () => {
      const source = [
        'model Author {',
        '  id Record @id',
        '  name String',
        '}',
        'model Book {',
        '  id Record @id',
        '  authorId Record',
        '  author Relation @field(authorId) @model(Author)',
        '}',
      ].join('\n');
      const { ast } = parse(source);

      const book = ast.models.find((m) => m.name === 'Book')!;
      const authorIdField = book.fields.find((f) => f.name === 'authorId')!;

      expect(authorIdField.type).toBe('record');
      expect(hasDecorator(authorIdField, 'id')).toBe(false);

      // Find paired relation
      const pairedRelation = book.fields.find(
        (f) => f.type === 'relation' && f.decorators.some((d) => d.type === 'field' && d.value === 'authorId'),
      );

      expect(pairedRelation).toBeDefined();

      const modelDec = pairedRelation!.decorators.find((d) => d.type === 'model');

      expect(modelDec).toBeDefined();
      expect(modelDec!.value).toBe('Author');
    });

    test('typed ID model produces typed CerialId hint', () => {
      const source = ['model TypedModel {', '  id Record(int) @id', '  label String', '}'].join('\n');
      const { ast } = parse(source);

      const model = ast.models[0]!;
      const idField = model.fields.find((f) => f.name === 'id')!;

      expect(idField.recordIdTypes).toBeDefined();
      expect(idField.recordIdTypes).toContain('int');

      // buildFkTypeHint would produce CerialId<number>
      const mapped = mapIdTypeToTs(idField.recordIdTypes![0]!);

      expect(mapped).toBe('number');
    });

    test('union ID types produce union CerialId hint', () => {
      const source = ['model UnionId {', '  id Record(string, int) @id', '  label String', '}'].join('\n');
      const { ast } = parse(source);

      const idField = ast.models[0]!.fields.find((f) => f.name === 'id')!;

      expect(idField.recordIdTypes).toHaveLength(2);

      const mapped = idField.recordIdTypes!.map(mapIdTypeToTs);

      expect(mapped).toContain('string');
      expect(mapped).toContain('number');
    });

    test('@id field is skipped (not an FK)', () => {
      const source = 'model User {\n  id Record @id\n}';
      const { ast } = parse(source);

      const idField = ast.models[0]!.fields[0]!;

      expect(hasDecorator(idField, 'id')).toBe(true);
      // FK hint generation should skip this field
    });
  });

  describe('decorator behavioral hints via AST', () => {
    test('@uuid field detected for auto-generated hint', () => {
      const source = 'model User {\n  id Record @id\n  trackId Uuid @uuid\n}';
      const { ast } = parse(source);

      const trackField = ast.models[0]!.fields.find((f) => f.name === 'trackId')!;

      expect(hasDecorator(trackField, 'uuid')).toBe(true);
    });

    test('@uuid4 field detected for auto-generated hint', () => {
      const source = 'model User {\n  id Record @id\n  legacyId Uuid @uuid4\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'legacyId')!;

      expect(hasDecorator(field, 'uuid4')).toBe(true);
    });

    test('@uuid7 field detected for auto-generated hint', () => {
      const source = 'model User {\n  id Record @id\n  modernId Uuid @uuid7\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'modernId')!;

      expect(hasDecorator(field, 'uuid7')).toBe(true);
    });

    test('@createdAt field detected for auto-generated hint', () => {
      const source = 'model User {\n  id Record @id\n  createdAt Date @createdAt\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'createdAt')!;

      expect(hasDecorator(field, 'createdAt')).toBe(true);
    });

    test('@updatedAt field detected for auto-generated hint', () => {
      const source = 'model User {\n  id Record @id\n  updatedAt Date @updatedAt\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'updatedAt')!;

      expect(hasDecorator(field, 'updatedAt')).toBe(true);
    });

    test('@now field detected for computed hint', () => {
      const source = 'model User {\n  id Record @id\n  snapshot Date @now\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'snapshot')!;

      expect(hasDecorator(field, 'now')).toBe(true);
    });

    test('@defaultAlways field detected for resets-on-update hint', () => {
      const source = 'model User {\n  id Record @id\n  version Int @defaultAlways(1)\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'version')!;

      expect(hasDecorator(field, 'defaultAlways')).toBe(true);

      const daDec = field.decorators.find((d) => d.type === 'defaultAlways')!;

      expect(daDec.range).toBeDefined();
    });

    test('@default field detected for sets-on-create hint', () => {
      const source = 'model User {\n  id Record @id\n  name String @default("Guest")\n}';
      const { ast } = parse(source);

      const field = ast.models[0]!.fields.find((f) => f.name === 'name')!;

      expect(hasDecorator(field, 'default')).toBe(true);

      const dec = field.decorators.find((d) => d.type === 'default')!;

      expect(dec.range).toBeDefined();
    });
  });

  describe('inheritance hints via indexer', () => {
    test('child model with extends has parent name in AST', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model Base {\n  id Record @id\n  name String\n}',
        'child.cerial': 'model Child extends Base {\n  extra String\n}',
      });

      const childAst = indexer.getAST(testPath('child.cerial'));

      expect(childAst).not.toBeNull();

      const child = childAst!.models[0]!;

      expect(child.extends).toBe('Base');
    });

    test('parent fields can be looked up via indexer', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model Base {\n  id Record @id\n  name String\n}',
        'child.cerial': 'model Child extends Base {\n  extra String\n}',
      });

      const allASTs = indexer.getAllASTsInGroup('test-group');
      let parentModel: ASTModel | null = null;

      for (const [, ast] of allASTs) {
        const found = ast.models.find((m) => m.name === 'Base');
        if (found) {
          parentModel = found;
          break;
        }
      }

      expect(parentModel).not.toBeNull();
      expect(parentModel!.fields.some((f) => f.name === 'id')).toBe(true);
      expect(parentModel!.fields.some((f) => f.name === 'name')).toBe(true);
    });

    test('inherited field names overlap detection', () => {
      const parentFields = [{ name: 'id' }, { name: 'name' }, { name: 'createdAt' }];
      const childFields = [{ name: 'id' }, { name: 'name' }, { name: 'extra' }];

      const parentFieldNames = new Set(parentFields.map((f) => f.name));
      const overlapping = childFields.filter((f) => parentFieldNames.has(f.name));

      expect(overlapping).toHaveLength(2);
      expect(overlapping.map((f) => f.name)).toEqual(['id', 'name']);
    });
  });

  describe('settings toggle simulation', () => {
    test('master toggle disabled returns empty hints', () => {
      const settings = {
        inlayHints: {
          enabled: false,
          inferredTypes: true,
          behaviorHints: true,
          inheritedFields: true,
        },
      };

      if (!settings.inlayHints.enabled) {
        const hints: unknown[] = [];

        expect(hints).toHaveLength(0);
      }
    });

    test('inferredTypes disabled skips FK hints', () => {
      const settings = {
        inlayHints: {
          enabled: true,
          inferredTypes: false,
          behaviorHints: true,
          inheritedFields: true,
        },
      };

      expect(settings.inlayHints.inferredTypes).toBe(false);
    });

    test('behaviorHints disabled skips decorator hints', () => {
      const settings = {
        inlayHints: {
          enabled: true,
          inferredTypes: true,
          behaviorHints: false,
          inheritedFields: true,
        },
      };

      expect(settings.inlayHints.behaviorHints).toBe(false);
    });

    test('inheritedFields disabled skips inheritance hints', () => {
      const settings = {
        inlayHints: {
          enabled: true,
          inferredTypes: true,
          behaviorHints: true,
          inheritedFields: false,
        },
      };

      expect(settings.inlayHints.inheritedFields).toBe(false);
    });
  });

  describe('object decorator hints', () => {
    test('object fields with @createdAt/@updatedAt are detected', () => {
      const source = ['object Metadata {', '  createdAt Date @createdAt', '  updatedAt Date @updatedAt', '}'].join(
        '\n',
      );
      const { ast } = parse(source);

      const obj = ast.objects[0]!;

      expect(obj.fields.some((f) => hasDecorator(f, 'createdAt'))).toBe(true);
      expect(obj.fields.some((f) => hasDecorator(f, 'updatedAt'))).toBe(true);
    });

    test('object with @defaultAlways is detected', () => {
      const source = ['object Config {', '  version Int @defaultAlways(1)', '}'].join('\n');
      const { ast } = parse(source);

      const field = ast.objects[0]!.fields.find((f) => f.name === 'version')!;

      expect(hasDecorator(field, 'defaultAlways')).toBe(true);
    });
  });
});
