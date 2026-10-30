import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { e, literal, literalNode, object, tuple, variant, f } from '../../../../src/parser/builder';
import type { SimpleLiteralReference } from '../../../../src/parser/builder';
import { resolveInheritance } from '../../../../src/resolver/inheritance-resolver';
import { validateExtends } from '../../../../src/cli/validators/extends-validator';
import { parse } from '../../../../src/parser/parser';
import type { ASTLiteral, SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

function parsed(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast;
}

/** Raw, then resolved: the second is what the generator sees. */
function expectSameAsParsed(source: string, built: ASTLiteral[]): SchemaAST {
  const ast = parsed(source);
  const twin = { ...ast, literals: built };

  expect(withoutPosition(twin.literals)).toEqual(withoutPosition(ast.literals));
  expect(withoutPosition(resolveInheritance(twin).literals)).toEqual(withoutPosition(resolveInheritance(ast).literals));

  return twin;
}

const Address = object('Address', { street: f.string() });
const Pair = tuple('Pair', [e.int(), e.int()]);
const Inner = literal('Inner', [variant.string('x')]);

const Base = literal('Base', [
  variant.string('low'),
  variant.string('Int'),
  variant.int(1),
  variant.float(2.5),
  variant.bool(true),
  variant.broadType('Int'),
  variant.object(Address),
  variant.tuple(Pair),
  variant.literal(Inner),
]);

const BASE_SOURCE = `object Address {
  street String
}
tuple Pair {
  Int
  Int
}
literal Inner {
  'x'
}
literal Base {
  'low', 'Int', 1, 2.5, true, Int, Address, Pair, Inner
}`;

describe('literal extends: the identity each variant kind is picked by', () => {
  test('every kind is pickable and omittable, and the strings written are what getVariantIdentity gives', () => {
    const kinds = [
      [`'low'`, { kind: 'string', value: 'low' }],
      [`'Int'`, { kind: 'string', value: 'Int' }],
      ['1', { kind: 'int', value: 1 }],
      ['2.5', { kind: 'float', value: 2.5 }],
      ['true', { kind: 'bool', value: true }],
      ['Int', { kind: 'broadType', typeName: 'Int' }],
      ['Address', { kind: 'objectRef', objectName: 'Address' }],
      ['Pair', { kind: 'tupleRef', tupleName: 'Pair' }],
      ['Inner', { kind: 'literalRef', literalName: 'Inner' }],
    ] as const;

    for (const [id, variantNode] of kinds) {
      const picked = literalNode(literal('P', [], { extends: Base.pick(id) }));
      const omitted = literalNode(literal('O', [], { extends: Base.omit(id) }));
      const base = resolveInheritance({
        ...parsed(''),
        literals: [literalNode(Base), picked, omitted],
      }).literals;

      expect(picked.extendsFilter).toEqual({ mode: 'pick', fields: [id] });
      expect(omitted.extendsFilter).toEqual({ mode: 'omit', fields: [id] });
      expect(base[1]!.variants).toEqual([variantNode]);
      expect(base[2]!.variants).toHaveLength(8);
      expect(base[2]!.variants).not.toContainEqual(variantNode);
    }
  });

  test('a string that spells a broad type is a different variant from the broad type', () => {
    const picked = resolveInheritance({
      ...parsed(''),
      literals: [literalNode(Base), literalNode(literal('P', [], { extends: Base.pick(`'Int'`) }))],
    }).literals[1]!;

    expect(picked.variants).toEqual([{ kind: 'string', value: 'Int' }]);
  });

  test('matches the parser for every kind, raw and resolved, and the validator accepts it', () => {
    const twin = expectSameAsParsed(
      `${BASE_SOURCE}
literal ByString extends Base['low', 'Int'] { }
literal ByNumber extends Base[1, 2.5] { }
literal ByBool extends Base[!true] { }
literal ByBroad extends Base[Int] { }
literal ByRefs extends Base[Address, Pair, Inner] { }
literal Plain extends Base { 'extra' }
literal Appended extends Base['low'] { 'extra', 9 }`,
      [
        literalNode(Inner),
        literalNode(Base),
        literalNode(literal('ByString', [], { extends: Base.pick(`'low'`, `'Int'`) })),
        literalNode(literal('ByNumber', [], { extends: Base.pick('1', '2.5') })),
        literalNode(literal('ByBool', [], { extends: Base.omit('true') })),
        literalNode(literal('ByBroad', [], { extends: Base.pick('Int') })),
        literalNode(literal('ByRefs', [], { extends: Base.pick('Address', 'Pair', 'Inner') })),
        literalNode(literal('Plain', [variant.string('extra')], { extends: Base })),
        literalNode(literal('Appended', [variant.string('extra'), variant.int(9)], { extends: Base.pick(`'low'`) })),
      ],
    );

    expect(validateExtends(twin).filter((error) => /Base/.test(error.message))).toEqual([]);
  });

  test('a plain extends writes no filter key, and no extends writes neither', () => {
    const plain = literalNode(literal('Plain', [variant.string('x')], { extends: Base }));
    const solo = literalNode(literal('Solo', [variant.string('x')]));

    expect(plain.extends).toBe('Base');
    expect('extendsFilter' in plain).toBe(false);
    expect('extends' in solo).toBe(false);
    expect('extendsFilter' in solo).toBe(false);
  });

  test('a reference by thunk or by handle names the same variant', () => {
    const Late = literal('Late', [variant.object(() => Address), variant.tuple('Pair')]);

    expect(literalNode(literal('A', [], { extends: Late.pick('Address', 'Pair') })).extendsFilter).toEqual({
      mode: 'pick',
      fields: ['Address', 'Pair'],
    });
  });

  test('a child extends a child, and picks only the variants the middle declares itself', () => {
    const Mid = literal('Mid', [variant.string('mid')], { extends: Base.pick(`'low'`) });
    const Leaf = literal('Leaf', [variant.string('leaf')], { extends: Mid.pick(`'mid'`) });
    const twin = expectSameAsParsed(
      `${BASE_SOURCE}
literal Mid extends Base['low'] { 'mid' }
literal Leaf extends Mid['mid'] { 'leaf' }`,
      [literalNode(Inner), literalNode(Base), literalNode(Mid), literalNode(Leaf)],
    );

    expect(resolveInheritance(twin).literals[3]!.variants).toEqual([
      { kind: 'string', value: 'mid' },
      { kind: 'string', value: 'leaf' },
    ]);
  });

  test('the corpus twin: every literal in features/extends-literal.cerial', () => {
    const source = readFileSync('tests/e2e/schemas/features/extends-literal.cerial', 'utf8');
    const Priority = literal('ExtBasePriority', [
      variant.string('low'),
      variant.string('medium'),
      variant.string('high'),
    ]);
    const Level = literal('ExtBaseLevel', [variant.int(1), variant.int(2), variant.int(3)]);
    const Mixed = literal('ExtBaseMixed', [
      variant.string('active'),
      variant.string('inactive'),
      variant.bool(true),
      variant.bool(false),
    ]);
    const Broad = literal('ExtBroadType', [variant.broadType('String'), variant.broadType('Int')]);
    const built = [
      literalNode(Priority),
      literalNode(
        literal('ExtExtendedPriority', [variant.string('critical'), variant.string('urgent')], { extends: Priority }),
      ),
      literalNode(literal('ExtHighPriority', [variant.string('critical')], { extends: Priority })),
      literalNode(literal('ExtLowMediumPriority', [variant.string('low'), variant.string('medium')])),
      literalNode(Level),
      literalNode(literal('ExtExtendedLevel', [variant.int(4), variant.int(5)], { extends: Level })),
      literalNode(Mixed),
      literalNode(literal('ExtExtendedMixed', [variant.string('pending'), variant.int(0)], { extends: Mixed })),
      literalNode(Broad),
      literalNode(literal('ExtExtendedBroad', [variant.broadType('Bool')], { extends: Broad })),
      literalNode(literal('ExtStringOnly', [], { extends: Mixed.pick('true', 'false') })),
      literalNode(literal('ExtNonBoolMixed', [], { extends: Mixed.omit('true', 'false') })),
      literalNode(literal('ExtQuotedPick', [], { extends: Priority.pick(`'low'`, `'high'`) })),
      literalNode(literal('ExtQuotedOmit', [], { extends: Priority.omit(`'medium'`) })),
    ];
    const ast = parsed(source);

    expect(withoutPosition(built)).toEqual(withoutPosition(ast.literals));
    expect(withoutPosition(resolveInheritance({ ...ast, literals: built }).literals)).toEqual(
      withoutPosition(resolveInheritance(ast).literals),
    );
  });
});

describe('literal extends: one identity', () => {
  test('the builder imports getVariantIdentity and defines no identity function of its own', () => {
    const source = readFileSync('src/parser/builder/literal.ts', 'utf8');

    expect(source).toContain("import { getVariantIdentity } from '../../resolver';");
    expect(source).not.toMatch(/function \w*[iI]dentity/);
    expect(source.match(/getVariantIdentity\(/g)).toHaveLength(1);
  });
});

describe('literal extends: refusals', () => {
  test('a bare string name matches nothing, so the builder names the quoted form', () => {
    // @ts-expect-error the bare name is not the identity of a string variant
    const bare = literal('Bad', [], { extends: Base.pick('low') });

    expect(() => literalNode(bare)).toThrow(/no variant low\. Its variants are 'low', 'Int', 1/);
  });

  test('an unknown name is a compile error and a build error', () => {
    // @ts-expect-error Base declares no variant 99
    const missing = literal('Bad', [], { extends: Base.omit('99') });

    expect(() => literalNode(missing)).toThrow(/Base has no variant 99/);
  });

  test('the parent must be a literal handle', () => {
    const Role = tuple('Role', [e.int()]);
    // A tuple handle types as a parent, so only the build refuses it
    const wrong = literal('Bad', [], { extends: Role.pick(0) });

    expect(() => literalNode(wrong)).toThrow(/takes a literal handle/);
  });

  test('a variant that is the literal itself is still refused', () => {
    expect(() => literalNode(literal('Self', [variant.literal('Self')], { extends: Base }))).toThrow(
      /cannot reference itself/,
    );
  });

  test('a clause cannot carry both modes', () => {
    // @ts-expect-error a filtered reference has neither method
    expect(() => Base.pick('1').omit('2')).toThrow();
  });
});

describe('literal extends: simple', () => {
  const Plain = literal('PlainBase', [variant.string('a'), variant.int(1)]);
  const Complex = literal('ComplexBase', [variant.string('a'), variant.object(Address)]);

  test('a child of a simple parent with simple variants is simple, plain or filtered', () => {
    const refs: SimpleLiteralReference[] = [
      literal('A', [variant.string('b')], { extends: Plain }),
      literal('B', [], { extends: Plain.pick(`'a'`) }),
      literal('C', [], { extends: Plain.omit('1') }),
    ];

    expect(refs).toHaveLength(3);
  });

  test('a child of a complex parent is not simple, plain or filtered', () => {
    // @ts-expect-error inherits an objectRef from its parent
    const a: SimpleLiteralReference = literal('A', [variant.string('b')], { extends: Complex });
    // @ts-expect-error a filter does not make the type track which variants survive
    const b: SimpleLiteralReference = literal('B', [], { extends: Complex.pick(`'a'`) });
    // @ts-expect-error a thunk to it is refused too
    const c: SimpleLiteralReference = () => literal('C', [], { extends: Complex.omit(`'a'`) });

    expect([a, b, c]).toHaveLength(3);
  });

  test('a complex child of a simple parent is not simple', () => {
    // @ts-expect-error holds an objectRef of its own
    const a: SimpleLiteralReference = literal('A', [variant.object(Address)], { extends: Plain });

    expect(a).toBeDefined();
  });
});
