import { describe, expect, test } from 'bun:test';
import { enumeration } from '../../../../src/parser/builder/enum';
import { f, fieldNode } from '../../../../src/parser/builder/field';
import { referenceName } from '../../../../src/parser/builder/handle';
import type { Handle } from '../../../../src/parser/builder/handle';
import { literal, literalNode, variant } from '../../../../src/parser/builder/literal';
import type { SimpleLiteralReference } from '../../../../src/parser/builder/literal';
import type { ASTLiteralVariant } from '../../../../src/types';
import { parse } from '../../../../src/parser/parser';
import { withoutPosition } from './helpers';

const PREAMBLE = 'object Obj {\n  a String\n}\ntuple Tup {\n  Int,\n  Int\n}\nliteral Other {\n  1\n}\n';

function parsedLiteral(variants: string, name = 'L') {
  const { ast, errors } = parse(`${PREAMBLE}literal ${name} {\n  ${variants}\n}\n`);
  expect(errors).toHaveLength(0);

  return ast.literals.find((l) => l.name === name)!;
}

const Obj: Handle<'Obj'> = { name: 'Obj' };
const Tup: Handle<'Tup'> = { name: 'Tup' };
const Other = literal('Other', [variant.int(1)]);

const KINDS = [
  ['string', "'a'", variant.string('a')],
  ['int', '5', variant.int(5)],
  ['negative int', '-3', variant.int(-3)],
  ['float', '1.5', variant.float(1.5)],
  ['float with a whole value', '2.0', variant.float(2)],
  ['bool true', 'true', variant.bool(true)],
  ['bool false', 'false', variant.bool(false)],
  ['broadType', 'String', variant.broadType('String')],
  ['broadType Date', 'Date', variant.broadType('Date')],
  ['tupleRef', 'Tup', variant.tuple(Tup)],
  ['objectRef', 'Obj', variant.object(Obj)],
  ['literalRef', 'Other', variant.literal(Other)],
] as const;

describe('literal builder', () => {
  test.each(KINDS)('%s matches the parser', (_label, source, built) => {
    const node = literalNode(literal('L', [built]));

    expect(withoutPosition(node)).toEqual(withoutPosition(parsedLiteral(source)));
  });

  test('covers all eight variant kinds', () => {
    const kinds = new Set(
      literalNode(
        literal(
          'L',
          KINDS.map((k) => k[2]),
        ),
      ).variants.map((v) => v.kind),
    );

    const expected: ASTLiteralVariant['kind'][] = [
      'bool',
      'broadType',
      'float',
      'int',
      'literalRef',
      'objectRef',
      'string',
      'tupleRef',
    ];

    expect([...kinds].sort()).toEqual(expected);
  });

  test('a mixed literal keeps variant order and matches the parser', () => {
    const node = literalNode(
      literal('L', [variant.string('a'), variant.int(2), variant.bool(true), variant.object(Obj)]),
    );

    expect(withoutPosition(node)).toEqual(withoutPosition(parsedLiteral("'a', 2, true, Obj")));
  });

  test('does not write extends keys the parser omits', () => {
    const node = literalNode(literal('L', [variant.int(1)]));

    expect('extends' in node).toBe(false);
    expect('extendsFilter' in node).toBe(false);
  });

  test('a reference reduces the same by handle, thunk and bare name', () => {
    const byHandle = literalNode(literal('L', [variant.object(Obj)]));
    const byThunk = literalNode(literal('L', [variant.object(() => Obj)]));
    const byName = literalNode(literal('L', [variant.object('Obj')]));

    expect(byThunk).toEqual(byHandle);
    expect(byName).toEqual(byHandle);
  });

  test('a thunk is not called until the node is built', () => {
    let calls = 0;
    const handle = literal('L', [
      variant.object(() => {
        calls += 1;

        return Obj;
      }),
    ]);

    expect(calls).toBe(0);
    literalNode(handle);
    expect(calls).toBe(1);
  });

  test('a field typed by a literal matches the parser, by handle, thunk and name', () => {
    const { ast } = parse('literal L {\n  1\n}\nmodel M {\n  x L\n}\n');
    const expected = withoutPosition(ast.models[0]!.fields[0]);
    const L = literal('L', [variant.int(1)]);

    expect(withoutPosition(fieldNode(f.literal(L), 'x'))).toEqual(expected);
    expect(
      withoutPosition(
        fieldNode(
          f.literal(() => L),
          'x',
        ),
      ),
    ).toEqual(expected);
    expect(withoutPosition(fieldNode(f.literal('L'), 'x'))).toEqual(expected);
    expect(referenceName(L)).toBe('L');
  });

  describe('self reference', () => {
    test('a bare name that is the literal itself is refused, as the parser refuses it', () => {
      expect(() => literalNode(literal('L', [variant.literal('L')]))).toThrow('Literal L cannot reference itself');
      expect(parse('literal L {\n  L\n}\n').errors.length).toBeGreaterThan(0);
    });

    test('a thunk that resolves to the literal itself is refused', () => {
      const self: Handle = { name: 'L' };

      expect(() => literalNode(literal('L', [variant.literal(() => self)]))).toThrow('cannot reference itself');
    });

    test('another literal is accepted', () => {
      expect(() => literalNode(literal('L', [variant.literal('Other')]))).not.toThrow();
    });
  });

  describe('variant arguments', () => {
    test('int refuses a fractional number', () => {
      expect(() => variant.int(1.5)).toThrow(/integer/);
    });

    test('float refuses NaN and infinity', () => {
      expect(() => variant.float(Number.NaN)).toThrow(/finite/);
      expect(() => variant.float(Number.POSITIVE_INFINITY)).toThrow(/finite/);
    });

    test('type negatives', () => {
      // @ts-expect-error a bool variant takes a boolean
      variant.bool('true');
      // @ts-expect-error an unknown broad type name is not offered
      variant.broadType('Bytes');
      // @ts-expect-error null is not a literal variant
      variant.string(null);
    });
  });

  test('a node is only available for a literal handle', () => {
    expect(() => literalNode({ name: 'X' })).toThrow(/Not a literal handle/);
  });

  describe('nesting depth', () => {
    // An object or tuple field inside a literal may point at a literal, but only a primitive-only one
    // (or an enum). The handle carries that, so the illegal case does not type-check.
    const Simple = literal('Simple', [variant.string('a'), variant.int(1), variant.broadType('Bool')]);
    const Complex = literal('Complex', [variant.object(Obj)]);
    const ComplexTuple = literal('ComplexTuple', [variant.tuple(Tup)]);
    const ComplexLiteral = literal('ComplexLiteral', [variant.literal(Other)]);
    const Role = enumeration('Role', ['A']);

    test('primitive-only literals and enums are acceptable nested literals', () => {
      const refs: SimpleLiteralReference[] = [Simple, () => Simple, Role, 'ByName'];

      expect(refs).toHaveLength(4);
    });

    test('a literal holding an objectRef, tupleRef or literalRef is not', () => {
      // @ts-expect-error holds an objectRef, so it cannot be nested
      const a: SimpleLiteralReference = Complex;
      // @ts-expect-error holds a tupleRef, so it cannot be nested
      const b: SimpleLiteralReference = ComplexTuple;
      // @ts-expect-error holds a literalRef, so it cannot be nested
      const c: SimpleLiteralReference = ComplexLiteral;
      // @ts-expect-error a thunk to a complex literal is refused too
      const d: SimpleLiteralReference = () => Complex;

      expect([a, b, c, d]).toHaveLength(4);
    });

    test('a literal may itself reference a complex literal, as the parser allows', () => {
      const node = literalNode(literal('Outer', [variant.literal(Complex)]));

      expect(node.variants).toEqual([{ kind: 'literalRef', literalName: 'Complex' }]);
    });
  });
});
