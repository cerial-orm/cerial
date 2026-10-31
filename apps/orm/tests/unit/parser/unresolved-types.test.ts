import { describe, expect, it } from 'bun:test';
import { parse, parseForHandles } from '../../../src/parser/parser';

const MODEL = 'model M {\n  id Record(int) @id\n  total Money\n  more Money[]\n  maybe Money?\n}\n';
const TUPLE = 'tuple T {\n  Money,\n  Int\n}\n';
const LITERAL = 'literal L {\n  Money,\n  1\n}\n';

describe('parseForHandles', () => {
  it('keeps a field typed by an undeclared name as a member of unresolved type', () => {
    const { ast, errors } = parseForHandles(MODEL);

    expect(errors).toEqual([]);
    expect(ast.models[0]!.fields.map((f) => [f.name, f.type])).toEqual([
      ['id', 'record'],
      ['total', 'any'],
      ['more', 'any'],
      ['maybe', 'any'],
    ]);
    expect(ast.models[0]!.fields[2]!.isArray).toBe(true);
    expect(ast.models[0]!.fields[3]!.isOptional).toBe(true);
  });

  it('keeps a tuple element and a literal variant naming an undeclared type', () => {
    expect(parseForHandles(TUPLE)).toMatchObject({ errors: [], ast: { tuples: [{ elements: [{}, {}] }] } });
    expect(parseForHandles(LITERAL).ast.literals[0]!.variants[0]).toEqual({ kind: 'literalRef', literalName: 'Money' });
  });

  it('still reports what is not a type name', () => {
    expect(parseForHandles('model M {\n  id Record(int) @id\n  x Mo$ney\n}\n').errors).toHaveLength(1);
    expect(parseForHandles('literal L {\n  Money[]\n}\n').errors).toHaveLength(1);
  });

  it('leaves the ordinary parse alone afterwards', () => {
    parseForHandles(MODEL);

    expect(parse(MODEL).errors).toHaveLength(3);
  });
});

describe('parse, without the recovery', () => {
  it('reports a field typed by an undeclared name', () => {
    const { errors } = parse(MODEL);

    expect(errors.map((e) => e.message)).toEqual([
      expect.stringContaining('Invalid field type: Money'),
      expect.stringContaining('Invalid field type: Money[]'),
      expect.stringContaining('Invalid field type: Money'),
    ]);
  });

  it('drops a tuple element and reports a literal variant naming an undeclared type', () => {
    expect(parse(TUPLE).ast.tuples[0]!.elements).toHaveLength(1);
    expect(parse(LITERAL).errors.map((e) => e.message)).toEqual(["Unknown variant 'Money' in literal L"]);
  });

  it('resolves the same name once it is declared', () => {
    expect(parse(MODEL, new Set(['Money'])).errors).toEqual([]);
  });
});
