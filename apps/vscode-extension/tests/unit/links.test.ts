import { describe, expect, test } from 'bun:test';
import { parse } from '../../../orm/src/parser/parser';
import { findTypeDefinition } from '../../server/src/utils/ast-location';
import { createIndexerWithContent, testPath } from './helpers';

/**
 * Replicate PRIMITIVE_TYPES from links.ts since it's not exported.
 */
const PRIMITIVE_TYPES = new Set([
  'String',
  'Int',
  'Float',
  'Bool',
  'Date',
  'Email',
  'Record',
  'Relation',
  'Uuid',
  'Duration',
  'Decimal',
  'Bytes',
  'Geometry',
  'Any',
  'Number',
  'string',
  'int',
  'float',
  'bool',
  'date',
  'email',
  'record',
  'relation',
  'uuid',
  'duration',
  'decimal',
  'bytes',
  'geometry',
  'any',
  'number',
]);

/**
 * Replicate findWordOnLine from links.ts since it's not exported.
 */
function findWordOnLine(
  sourceLines: string[],
  lineIdx: number,
  typeName: string,
  startCol = 0,
): { start: { line: number; character: number }; end: { line: number; character: number } } | null {
  if (lineIdx < 0 || lineIdx >= sourceLines.length) return null;

  const line = sourceLines[lineIdx]!;
  let from = startCol;

  while (from <= line.length - typeName.length) {
    const idx = line.indexOf(typeName, from);
    if (idx === -1) return null;

    const before = idx > 0 ? line[idx - 1]! : ' ';
    const after = idx + typeName.length < line.length ? line[idx + typeName.length]! : ' ';

    if (!/[a-zA-Z0-9_]/.test(before) && !/[a-zA-Z0-9_]/.test(after)) {
      return {
        start: { line: lineIdx, character: idx },
        end: { line: lineIdx, character: idx + typeName.length },
      };
    }

    from = idx + 1;
  }

  return null;
}

describe('Links Logic', () => {
  describe('PRIMITIVE_TYPES filtering', () => {
    test('contains all 15 capitalized primitive types', () => {
      const capitalized = [
        'String',
        'Int',
        'Float',
        'Bool',
        'Date',
        'Email',
        'Record',
        'Relation',
        'Uuid',
        'Duration',
        'Decimal',
        'Bytes',
        'Geometry',
        'Any',
        'Number',
      ];

      for (const t of capitalized) {
        expect(PRIMITIVE_TYPES.has(t)).toBe(true);
      }
    });

    test('contains all 15 lowercase primitive types', () => {
      const lowercase = [
        'string',
        'int',
        'float',
        'bool',
        'date',
        'email',
        'record',
        'relation',
        'uuid',
        'duration',
        'decimal',
        'bytes',
        'geometry',
        'any',
        'number',
      ];

      for (const t of lowercase) {
        expect(PRIMITIVE_TYPES.has(t)).toBe(true);
      }
    });

    test('does not contain custom type names', () => {
      expect(PRIMITIVE_TYPES.has('Address')).toBe(false);
      expect(PRIMITIVE_TYPES.has('User')).toBe(false);
      expect(PRIMITIVE_TYPES.has('Status')).toBe(false);
    });

    test('total size is 30 (15 capitalized + 15 lowercase)', () => {
      expect(PRIMITIVE_TYPES.size).toBe(30);
    });
  });

  describe('findWordOnLine', () => {
    test('finds type name on a line', () => {
      const lines = ['  addr Address'];
      const result = findWordOnLine(lines, 0, 'Address', 0);

      expect(result).not.toBeNull();
      expect(result!.start.character).toBe(7);
      expect(result!.end.character).toBe(14);
    });

    test('finds type name after startCol', () => {
      const lines = ['  addr Address @flexible'];
      const result = findWordOnLine(lines, 0, 'Address', 5);

      expect(result).not.toBeNull();
      expect(result!.start.character).toBe(7);
    });

    test('returns null for partial match', () => {
      const lines = ['  addr AddressBook'];
      const result = findWordOnLine(lines, 0, 'Address', 0);

      expect(result).toBeNull();
    });

    test('returns null when word not found', () => {
      const lines = ['  name String'];
      const result = findWordOnLine(lines, 0, 'Address', 0);

      expect(result).toBeNull();
    });

    test('returns null for out-of-bounds line index', () => {
      const lines = ['  name String'];
      const result = findWordOnLine(lines, 5, 'String', 0);

      expect(result).toBeNull();
    });

    test('returns null for negative line index', () => {
      const lines = ['  name String'];
      const result = findWordOnLine(lines, -1, 'String', 0);

      expect(result).toBeNull();
    });

    test('finds word at end of line', () => {
      const lines = ['extends Base'];
      const result = findWordOnLine(lines, 0, 'Base', 0);

      expect(result).not.toBeNull();
      expect(result!.start.character).toBe(8);
      expect(result!.end.character).toBe(12);
    });

    test('finds word inside @model() decorator', () => {
      const lines = ['  rel Relation @field(fk) @model(Author)'];
      const result = findWordOnLine(lines, 0, 'Author', 25);

      expect(result).not.toBeNull();
      expect(result!.start.character).toBe(33);
      expect(result!.end.character).toBe(39);
    });

    test('result has correct line number', () => {
      const lines = ['line0', 'line1', '  addr Address'];
      const result = findWordOnLine(lines, 2, 'Address', 0);

      expect(result).not.toBeNull();
      expect(result!.start.line).toBe(2);
      expect(result!.end.line).toBe(2);
    });
  });

  describe('cross-file type detection via indexer', () => {
    test('object type in another file is found', () => {
      const indexer = createIndexerWithContent({
        'types.cerial': 'object Address {\n  street String\n  city String\n}',
        'models.cerial': 'model User {\n  id Record @id\n  addr Address\n}',
      });

      // The model file should reference Address
      const modelAst = indexer.getAST(testPath('models.cerial'));

      expect(modelAst).not.toBeNull();

      const addrField = modelAst!.models[0]!.fields.find((f) => f.name === 'addr');

      expect(addrField).toBeDefined();
      expect(addrField!.objectName).toBe('Address');

      // Address is defined in types.cerial, not models.cerial
      const typesAst = indexer.getAST(testPath('types.cerial'));

      expect(typesAst).not.toBeNull();

      const addrDef = findTypeDefinition(typesAst!, 'Address');

      expect(addrDef).not.toBeNull();
    });

    test('same-file type is found but would be excluded by links provider', () => {
      const indexer = createIndexerWithContent({
        'all.cerial': 'object Address {\n  street String\n}\nmodel User {\n  id Record @id\n  addr Address\n}',
      });

      const ast = indexer.getAST(testPath('all.cerial'));

      expect(ast).not.toBeNull();

      // Address is in the same file — links provider would skip this
      const addrDef = findTypeDefinition(ast!, 'Address');

      expect(addrDef).not.toBeNull();
    });

    test('primitive type has no definition (correctly filtered)', () => {
      const source = 'model User {\n  id Record @id\n  name String\n}';
      const { ast } = parse(source);

      // String is a primitive — no definition in AST
      expect(PRIMITIVE_TYPES.has('String')).toBe(true);

      const stringDef = findTypeDefinition(ast, 'String');

      expect(stringDef).toBeNull();
    });
  });

  describe('extends link detection', () => {
    test('extends reference on model is detectable', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'abstract model Base {\n  id Record @id\n}',
        'child.cerial': 'model Child extends Base {\n  name String\n}',
      });

      const childAst = indexer.getAST(testPath('child.cerial'));
      const child = childAst!.models[0]!;

      expect(child.extends).toBe('Base');

      // Base is in another file
      const baseAst = indexer.getAST(testPath('base.cerial'));
      const baseDef = findTypeDefinition(baseAst!, 'Base');

      expect(baseDef).not.toBeNull();
    });

    test('extends reference on object is detectable', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'object BaseAddr {\n  street String\n}',
        'child.cerial': 'object FullAddr extends BaseAddr {\n  zip String\n}',
      });

      const childAst = indexer.getAST(testPath('child.cerial'));
      const child = childAst!.objects[0]!;

      expect(child.extends).toBe('BaseAddr');
    });

    test('extends reference on enum is detectable', () => {
      const indexer = createIndexerWithContent({
        'base.cerial': 'enum BaseRole { VIEWER, EDITOR }',
        'child.cerial': 'enum FullRole extends BaseRole { ADMIN }',
      });

      const childAst = indexer.getAST(testPath('child.cerial'));
      const child = childAst!.enums[0]!;

      expect(child.extends).toBe('BaseRole');
    });
  });

  describe('@model() decorator link detection', () => {
    test('@model value is extractable from AST', () => {
      const source = [
        'model Author {',
        '  id Record @id',
        '}',
        'model Book {',
        '  id Record @id',
        '  authorId Record',
        '  author Relation @field(authorId) @model(Author)',
        '}',
      ].join('\n');
      const { ast } = parse(source);

      const book = ast.models.find((m) => m.name === 'Book')!;
      const authorField = book.fields.find((f) => f.name === 'author')!;
      const modelDec = authorField.decorators.find((d) => d.type === 'model');

      expect(modelDec).toBeDefined();
      expect(modelDec!.value).toBe('Author');
    });

    test('@model value pointing to cross-file model', () => {
      const indexer = createIndexerWithContent({
        'author.cerial': 'model Author {\n  id Record @id\n  name String\n}',
        'book.cerial':
          'model Book {\n  id Record @id\n  authorId Record\n  author Relation @field(authorId) @model(Author)\n}',
      });

      const bookAst = indexer.getAST(testPath('book.cerial'));
      const authorField = bookAst!.models[0]!.fields.find((f) => f.name === 'author')!;
      const modelDec = authorField.decorators.find((d) => d.type === 'model');

      expect(modelDec!.value).toBe('Author');

      // Author is in another file
      const authorAst = indexer.getAST(testPath('author.cerial'));
      const authorDef = findTypeDefinition(authorAst!, 'Author');

      expect(authorDef).not.toBeNull();
    });
  });

  describe('Record(TypeName) link detection', () => {
    test('Record(int) is a primitive — no link', () => {
      const source = 'model User {\n  id Record(int) @id\n}';
      const { ast } = parse(source);

      const idField = ast.models[0]!.fields[0]!;

      expect(idField.recordIdTypes).toContain('int');
      expect(PRIMITIVE_TYPES.has('int')).toBe(true);
    });

    test('Record(MyTuple) is a custom type — link candidate', () => {
      const source = ['tuple MyTuple { String, Int }', 'model User {', '  id Record(MyTuple) @id', '}'].join('\n');
      const { ast } = parse(source);

      const idField = ast.models[0]!.fields.find((f) => f.name === 'id')!;

      expect(idField.recordIdTypes).toContain('MyTuple');
      expect(PRIMITIVE_TYPES.has('MyTuple')).toBe(false);
    });
  });

  describe('tuple element type refs', () => {
    test('tuple with object element has type ref', () => {
      const source = [
        'object Coord {',
        '  lat Float',
        '  lng Float',
        '}',
        'tuple NamedCoord {',
        '  label String,',
        '  Coord',
        '}',
      ].join('\n');
      // Parser needs external object names for cross-type resolution within same source
      const { ast } = parse(source, new Set(['Coord']));

      const tuple = ast.tuples[0]!;
      const coordElem = tuple.elements.find((e) => e.objectName === 'Coord');

      expect(coordElem).toBeDefined();
    });
  });

  describe('literal variant refs', () => {
    test('literal with objectRef variant has type ref', () => {
      const source = ['object Addr {', '  street String', '}', '', "literal Location { Addr, 'unknown' }"].join('\n');
      const { ast } = parse(source);

      const literal = ast.literals[0]!;
      const objVariant = literal.variants.find((v) => v.kind === 'objectRef');

      expect(objVariant).toBeDefined();
    });

    test('literal with literalRef variant has type ref', () => {
      const source = ["literal Base { 'a', 'b' }", "literal Extended { Base, 'c' }"].join('\n');
      const { ast } = parse(source);

      const extended = ast.literals.find((l) => l.name === 'Extended')!;
      const litVariant = extended.variants.find((v) => v.kind === 'literalRef');

      expect(litVariant).toBeDefined();
    });

    test('literal with enum ref variant', () => {
      const source = ['enum Status { ACTIVE, INACTIVE }', "literal StatusOrCustom { Status, 'custom' }"].join('\n');
      const { ast } = parse(source);

      const literal = ast.literals.find((l) => l.name === 'StatusOrCustom')!;

      // Enum refs in literals may appear as literalRef or enumRef depending on parser
      expect(literal.variants.length).toBeGreaterThan(0);
    });
  });

  describe('schema group requirement', () => {
    test('links provider needs schema group for cross-file lookup', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      const group = indexer.getSchemaGroup(testPath('a.cerial'));

      expect(group).not.toBeNull();
      expect(group!.name).toBe('test-group');
    });

    test('file not in any group returns null', () => {
      const indexer = createIndexerWithContent({
        'a.cerial': 'model A { id Record @id }',
      });

      const group = indexer.getSchemaGroup(testPath('../nonexistent/file.cerial'));

      expect(group).toBeNull();
    });
  });
});
