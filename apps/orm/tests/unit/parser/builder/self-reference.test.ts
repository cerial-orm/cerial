import { describe, expect, test } from 'bun:test';
import { CerialGenerationError } from '../../../../src/errors';
import { e, f, literal, object, tuple, variant } from '../../../../src/parser/builder';
import type { Handle, LiteralHandle } from '../../../../src/parser/builder';
import { materialise } from '../../../../src/parser/builder/materialise';
import type { ExportedDeclaration } from '../../../../src/parser/builder/materialise';
import { parse } from '../../../../src/parser/parser';
import { validateObjectFields } from '../../../../src/cli/validators/schema-validator';
import { validateTuples } from '../../../../src/cli/validators/tuple-validator';
import {
  validateNoOptionalTupleElements,
  validateNullableOnTupleElements,
} from '../../../../src/cli/validators/nullable-validator';
import type { SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

const FILE = '/app/schema/tree.schema.ts';

function declare(handle: object, exportName: string): ExportedDeclaration {
  return { handle, module: FILE, exportName };
}

function parsed(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors.map((x) => x.message)).toEqual([]);

  return ast;
}

/** Every message the generator's object and tuple validators give for `ast`. */
function validation(ast: SchemaAST): string[] {
  return [
    ...validateObjectFields(ast),
    ...validateTuples(ast),
    ...validateNoOptionalTupleElements(ast),
    ...validateNullableOnTupleElements(ast),
  ].map((error) => error.message);
}

function materialiseMessage(declarations: readonly ExportedDeclaration[]): string {
  try {
    materialise(declarations);
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return (error as CerialGenerationError).message;
  }
  throw new Error('materialise did not refuse');
}

describe('self-reference: object', () => {
  const OBJECT_ERROR = 'Self-referencing object fields must be optional or array';

  test('an optional self-reference materialises as its twin and validates clean', () => {
    const Node: Handle = object('Node', { value: f.int(), next: f.object(() => Node).optional() });
    const ast = materialise([declare(Node, 'Node')]);
    const twin = parsed('object Node {\n  value Int\n  next Node?\n}');

    expect(withoutPosition(ast.objects)).toEqual(withoutPosition(twin.objects));
    expect(validation(ast)).toEqual([]);
    expect(validation(twin)).toEqual([]);
  });

  test('an array self-reference, by thunk or bare name, materialises as its twin and validates clean', () => {
    const Thunk: Handle = object('Node', { children: f.object(() => Thunk).array() });
    const Bare = object('Node', { children: f.object('Node').array() });
    const twin = parsed('object Node {\n  children Node[]\n}');

    for (const handle of [Thunk, Bare]) {
      const ast = materialise([declare(handle, 'Node')]);
      expect(withoutPosition(ast.objects)).toEqual(withoutPosition(twin.objects));
      expect(validation(ast)).toEqual([]);
    }
  });

  test('a required self-reference materialises and is refused with the twin message, by thunk and bare name', () => {
    const Thunk: Handle = object('Node', { next: f.object(() => Thunk) });
    const Bare = object('Node', { next: f.object('Node') });
    const twin = parsed('object Node {\n  next Node\n}');

    expect(validation(twin)).toEqual([OBJECT_ERROR]);
    for (const handle of [Thunk, Bare]) {
      const ast = materialise([declare(handle, 'Node')]);
      expect(withoutPosition(ast.objects)).toEqual(withoutPosition(twin.objects));
      expect(validation(ast)).toEqual([OBJECT_ERROR]);
    }
  });

  test('a required reference to another object is not a self-reference and is not refused', () => {
    const Other = object('Other', { value: f.int() });
    const Node = object('Node', { other: f.object(() => Other) });

    expect(validation(materialise([declare(Node, 'Node'), declare(Other, 'Other')]))).toEqual([]);
  });
});

describe('self-reference: tuple', () => {
  const TUPLE_ERROR = 'Self-referencing tuple element in tuple Tree must be @nullable to avoid infinite recursion';

  test('a nullable self-reference materialises as its twin and validates clean', () => {
    const Tree = tuple('Tree', { value: e.int(), next: e.self().nullable() });
    const ast = materialise([declare(Tree, 'Tree')]);
    const twin = parsed('tuple Tree {\n  value Int,\n  next Tree @nullable\n}');

    expect(withoutPosition(ast.tuples)).toEqual(withoutPosition(twin.tuples));
    expect(ast.tuples[0]!.elements[1]).toMatchObject({ type: 'tuple', tupleName: 'Tree', isNullable: true });
    expect(validation(ast)).toEqual([]);
    expect(validation(twin)).toEqual([]);
  });

  test('a nullable self-reference by bare name or thunk is the same element as e.self()', () => {
    const Thunk: Handle = tuple('Tree', [e.int(), e.tuple(() => Thunk).nullable()]);
    const Bare = tuple('Tree', [e.int(), e.tuple('Tree').nullable()]);
    const Self = tuple('Tree', [e.int(), e.self().nullable()]);
    const expected = withoutPosition(materialise([declare(Self, 'Tree')]).tuples);

    for (const handle of [Thunk, Bare]) {
      const ast = materialise([declare(handle, 'Tree')]);
      expect(withoutPosition(ast.tuples)).toEqual(expected);
      expect(validation(ast)).toEqual([]);
    }
  });

  test('a self-reference that is not nullable is refused with the twin message, by thunk and bare name', () => {
    const Thunk: Handle = tuple('Tree', [e.int(), e.tuple(() => Thunk)]);
    const Bare = tuple('Tree', [e.int(), e.tuple('Tree')]);
    const twin = parsed('tuple Tree {\n  Int,\n  Tree\n}');

    expect(validation(twin)).toEqual([TUPLE_ERROR]);
    for (const handle of [Thunk, Bare]) {
      const ast = materialise([declare(handle, 'Tree')]);
      expect(withoutPosition(ast.tuples)).toEqual(withoutPosition(twin.tuples));
      expect(validation(ast)).toEqual([TUPLE_ERROR]);
    }
  });

  test('an optional self-reference is refused by the validators, so the builder offers no optional form', () => {
    const twin = parsed('tuple Tree {\n  Int,\n  Tree?\n}');

    expect(validation(twin).some((message) => message.startsWith('Optional elements (?) are not allowed'))).toBe(true);
    expect(e.self()).not.toHaveProperty('optional');
    expect(e.self().nullable()).not.toHaveProperty('optional');
  });

  test('a nullable reference to another tuple is not a self-reference and is not refused', () => {
    const Other = tuple('Other', [e.int()]);
    const Tree = tuple('Tree', [e.int(), e.tuple(() => Other).nullable()]);

    expect(validation(materialise([declare(Tree, 'Tree'), declare(Other, 'Other')]))).toEqual([]);
  });
});

describe('self-reference: literal', () => {
  const LITERAL_ERROR = 'Literal L cannot reference itself';

  function parserErrors(): string[] {
    return parse("literal L {\n  'a',\n  L\n}").errors.map((x) => x.message);
  }

  test('the parser refuses it with the message the builder repeats', () => {
    expect(parserErrors()).toContain(LITERAL_ERROR);
  });

  test('a bare-name self-reference is refused naming the literal and carrying the parser message', () => {
    const message = materialiseMessage([declare(literal('L', [variant.string('a'), variant.literal('L')]), 'L')]);

    expect(message).toContain(LITERAL_ERROR);
    expect(message).toContain(`'L' in ${FILE}`);
  });

  test('a thunk self-reference is refused with the same message', () => {
    const Self: LiteralHandle = literal('L', [variant.string('a'), variant.literal(() => Self)]);
    const message = materialiseMessage([declare(Self, 'L')]);

    expect(message).toContain(LITERAL_ERROR);
    expect(message).toBe(materialiseMessage([declare(literal('L', [variant.literal('L')]), 'L')]));
  });

  test('a literal naming a different literal is not refused', () => {
    const Other = literal('Other', [variant.string('a')]);
    const L = literal('L', [variant.string('b'), variant.literal(() => Other)]);
    const ast = materialise([declare(L, 'L'), declare(Other, 'Other')]);

    expect(ast.literals.find((x) => x.name === 'L')!.variants).toContainEqual({
      kind: 'literalRef',
      literalName: 'Other',
    });
  });
});
