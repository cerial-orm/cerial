/**
 * Unit Tests: Literal Inheritance Resolution
 *
 * Tests resolveInheritance() for literals:
 * - variant merging, deduplication, pick/omit
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import type { ASTLiteralVariant } from '../../../src/types';
import { ast, literal, omit, pick } from './helpers';

describe('resolveInheritance - literals', () => {
  test('should pass through literals with no extends', () => {
    const variants: ASTLiteralVariant[] = [
      { kind: 'string', value: 'low' },
      { kind: 'string', value: 'high' },
    ];
    const input = ast({
      literals: [literal('Priority', variants)],
    });
    const result = resolveInheritance(input);

    expect(result.literals[0]!.variants).toHaveLength(2);
  });

  test('should inherit parent variants and add child variants', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'low' },
          { kind: 'string', value: 'high' },
        ]),
        literal('Extended', [{ kind: 'string', value: 'critical' }], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(3);
    expect(ext.variants.map((v) => (v as { value: string }).value)).toEqual(['low', 'high', 'critical']);
  });

  test('should deduplicate by variant identity (string)', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'low' },
          { kind: 'string', value: 'high' },
        ]),
        literal(
          'Extended',
          [
            { kind: 'string', value: 'low' },
            { kind: 'string', value: 'critical' },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(3);
  });

  test('should deduplicate by variant identity (int)', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'int', value: 1 },
          { kind: 'int', value: 2 },
        ]),
        literal(
          'Extended',
          [
            { kind: 'int', value: 1 },
            { kind: 'int', value: 3 },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(3);
  });

  test('should deduplicate by variant identity (bool)', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'bool', value: true }]),
        literal(
          'Extended',
          [
            { kind: 'bool', value: true },
            { kind: 'bool', value: false },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(2);
  });

  test('should deduplicate by variant identity (broadType)', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'broadType', typeName: 'Int' }]),
        literal(
          'Extended',
          [
            { kind: 'broadType', typeName: 'Int' },
            { kind: 'broadType', typeName: 'String' },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(2);
  });

  test('should deduplicate by variant identity (objectRef)', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'objectRef', objectName: 'Addr' }]),
        literal('Extended', [{ kind: 'objectRef', objectName: 'Addr' }], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(1);
  });

  test('should apply pick filter', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'low' },
          { kind: 'string', value: 'medium' },
          { kind: 'string', value: 'high' },
        ]),
        literal('TopTwo', [], { extends: 'Base', extendsFilter: pick(["'medium'", "'high'"]) }),
      ],
    });
    const result = resolveInheritance(input);

    const topTwo = result.literals.find((l) => l.name === 'TopTwo')!;
    expect(topTwo.variants).toHaveLength(2);
  });

  test('should apply omit filter', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'low' },
          { kind: 'string', value: 'medium' },
          { kind: 'string', value: 'high' },
        ]),
        literal('NoLow', [{ kind: 'string', value: 'critical' }], { extends: 'Base', extendsFilter: omit(["'low'"]) }),
      ],
    });
    const result = resolveInheritance(input);

    const noLow = result.literals.find((l) => l.name === 'NoLow')!;
    expect(noLow.variants).toHaveLength(3);
    expect(noLow.variants.every((v) => v.kind !== 'string' || v.value !== 'low')).toBe(true);
  });

  test('should resolve multi-level chain', () => {
    const input = ast({
      literals: [
        literal('A', [{ kind: 'string', value: 'a' }]),
        literal('B', [{ kind: 'string', value: 'b' }], { extends: 'A' }),
        literal('C', [{ kind: 'string', value: 'c' }], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const c = result.literals.find((l) => l.name === 'C')!;
    expect(c.variants).toHaveLength(3);
  });

  test('should strip extends/extendsFilter from resolved literal', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'int', value: 1 }]),
        literal('Child', [{ kind: 'int', value: 2 }], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.literals.find((l) => l.name === 'Child')!;
    expect(child.extends).toBeUndefined();
    expect(child.extendsFilter).toBeUndefined();
  });

  test('should not mutate input', () => {
    const base = literal('Base', [{ kind: 'string', value: 'x' }]);
    const child = literal('Child', [{ kind: 'string', value: 'y' }], { extends: 'Base' });
    const input = ast({ literals: [base, child] });

    resolveInheritance(input);

    expect(input.literals[0]!.variants).toHaveLength(1);
    expect(input.literals[1]!.extends).toBe('Base');
  });

  test('should handle literals declared in reverse order', () => {
    const input = ast({
      literals: [
        literal('Child', [{ kind: 'string', value: 'y' }], { extends: 'Parent' }),
        literal('Parent', [{ kind: 'string', value: 'x' }]),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.literals.find((l) => l.name === 'Child')!;
    expect(child.variants).toHaveLength(2);
  });

  test('should handle mixed variant types', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'hello' },
          { kind: 'int', value: 42 },
          { kind: 'bool', value: true },
        ]),
        literal(
          'Extended',
          [
            { kind: 'float', value: 3.14 },
            { kind: 'broadType', typeName: 'String' },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(5);
  });

  test('should apply pick filter on non-string variants', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'int', value: 1 },
          { kind: 'int', value: 2 },
          { kind: 'int', value: 3 },
        ]),
        literal('Slim', [], { extends: 'Base', extendsFilter: pick(['1', '3']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.literals.find((l) => l.name === 'Slim')!;
    expect(slim.variants).toHaveLength(2);
  });

  test('should handle multi-level with filter at intermediate level', () => {
    const input = ast({
      literals: [
        literal('L1', [
          { kind: 'string', value: 'a' },
          { kind: 'string', value: 'b' },
          { kind: 'string', value: 'c' },
        ]),
        literal('L2', [{ kind: 'string', value: 'd' }], { extends: 'L1', extendsFilter: omit(["'c'"]) }),
        literal('L3', [{ kind: 'string', value: 'e' }], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.literals.find((l) => l.name === 'L3')!;
    expect(l3.variants).toHaveLength(4);
    expect(l3.variants.every((v) => v.kind !== 'string' || v.value !== 'c')).toBe(true);
  });

  // ── Edge Cases ──

  test('should deduplicate tupleRef variant', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'tupleRef', tupleName: 'Coord' }]),
        literal('Extended', [{ kind: 'tupleRef', tupleName: 'Coord' }], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(1);
    expect(ext.variants[0]!.kind).toBe('tupleRef');
  });

  test('should deduplicate literalRef variant', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'literalRef', literalName: 'Status' }]),
        literal('Extended', [{ kind: 'literalRef', literalName: 'Status' }], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(1);
    expect(ext.variants[0]!.kind).toBe('literalRef');
  });

  test('should pick by broadType name', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'broadType', typeName: 'Int' },
          { kind: 'broadType', typeName: 'String' },
          { kind: 'broadType', typeName: 'Bool' },
          { kind: 'broadType', typeName: 'Float' },
          { kind: 'broadType', typeName: 'Date' },
        ]),
        literal('Slim', [], { extends: 'Base', extendsFilter: pick(['Int', 'String']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.literals.find((l) => l.name === 'Slim')!;
    expect(slim.variants).toHaveLength(2);
    expect(slim.variants[0]!).toEqual({ kind: 'broadType', typeName: 'Int' });
    expect(slim.variants[1]!).toEqual({ kind: 'broadType', typeName: 'String' });
  });

  test('should omit mixed variant types — omit bool from string+int+bool', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'hello' },
          { kind: 'int', value: 42 },
          { kind: 'bool', value: true },
        ]),
        literal('NoBool', [{ kind: 'string', value: 'extra' }], {
          extends: 'Base',
          extendsFilter: omit(['true']),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const noBool = result.literals.find((l) => l.name === 'NoBool')!;
    expect(noBool.variants).toHaveLength(3);
    expect(noBool.variants.every((v) => !(v.kind === 'bool' && v.value === true))).toBe(true);
  });

  test('should deduplicate float variant', () => {
    const input = ast({
      literals: [
        literal('Base', [{ kind: 'float', value: 3.14 }]),
        literal(
          'Extended',
          [
            { kind: 'float', value: 3.14 },
            { kind: 'float', value: 2.71 },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.literals.find((l) => l.name === 'Extended')!;
    expect(ext.variants).toHaveLength(2);
    expect(ext.variants[0]!).toEqual({ kind: 'float', value: 3.14 });
    expect(ext.variants[1]!).toEqual({ kind: 'float', value: 2.71 });
  });

  test('should pick float variant by numeric string identity', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'float', value: 1.5 },
          { kind: 'float', value: 2.5 },
          { kind: 'float', value: 3.5 },
        ]),
        literal('Slim', [], { extends: 'Base', extendsFilter: pick(['1.5', '3.5']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.literals.find((l) => l.name === 'Slim')!;
    expect(slim.variants).toHaveLength(2);
    expect((slim.variants[0] as { value: number }).value).toBe(1.5);
    expect((slim.variants[1] as { value: number }).value).toBe(3.5);
  });

  test('should resolve 4-level chain with filters at different levels', () => {
    const input = ast({
      literals: [
        literal('L1', [
          { kind: 'string', value: 'a' },
          { kind: 'string', value: 'b' },
          { kind: 'string', value: 'c' },
          { kind: 'string', value: 'd' },
          { kind: 'string', value: 'e' },
        ]),
        literal('L2', [{ kind: 'string', value: 'f' }], { extends: 'L1', extendsFilter: omit(["'d'", "'e'"]) }),
        literal('L3', [{ kind: 'string', value: 'g' }], { extends: 'L2', extendsFilter: pick(["'a'", "'f'"]) }),
        literal('L4', [{ kind: 'string', value: 'h' }], { extends: 'L3' }),
      ],
    });
    const result = resolveInheritance(input);

    const l2 = result.literals.find((l) => l.name === 'L2')!;
    expect(l2.variants).toHaveLength(4); // a, b, c, f

    const l3 = result.literals.find((l) => l.name === 'L3')!;
    expect(l3.variants).toHaveLength(3); // a, f, g

    const l4 = result.literals.find((l) => l.name === 'L4')!;
    expect(l4.variants).toHaveLength(4); // a, f, g, h
  });

  test('should ensure multiple children of same parent literal are independent', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'x' },
          { kind: 'string', value: 'y' },
          { kind: 'string', value: 'z' },
        ]),
        literal('A', [{ kind: 'string', value: 'a' }], { extends: 'Base', extendsFilter: pick(["'x'"]) }),
        literal('B', [{ kind: 'string', value: 'b' }], { extends: 'Base', extendsFilter: omit(["'z'"]) }),
      ],
    });
    const result = resolveInheritance(input);

    const a = result.literals.find((l) => l.name === 'A')!;
    const b = result.literals.find((l) => l.name === 'B')!;
    expect(a.variants).toHaveLength(2); // x, a
    expect(b.variants).toHaveLength(3); // x, y, b
  });

  test('should resolve 5-level literal chain', () => {
    const input = ast({
      literals: [
        literal('L1', [{ kind: 'int', value: 1 }]),
        literal('L2', [{ kind: 'int', value: 2 }], { extends: 'L1' }),
        literal('L3', [{ kind: 'int', value: 3 }], { extends: 'L2' }),
        literal('L4', [{ kind: 'int', value: 4 }], { extends: 'L3' }),
        literal('L5', [{ kind: 'int', value: 5 }], { extends: 'L4' }),
      ],
    });
    const result = resolveInheritance(input);

    const l5 = result.literals.find((l) => l.name === 'L5')!;
    expect(l5.variants).toHaveLength(5);
    expect(l5.variants.map((v) => (v as { value: number }).value)).toEqual([1, 2, 3, 4, 5]);
  });

  test('should handle empty parent literal — child only has own variants', () => {
    const input = ast({
      literals: [literal('Empty', []), literal('Child', [{ kind: 'string', value: 'only' }], { extends: 'Empty' })],
    });
    const result = resolveInheritance(input);

    const child = result.literals.find((l) => l.name === 'Child')!;
    expect(child.variants).toHaveLength(1);
  });

  test('should handle empty child literal — inherits all parent variants', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'a' },
          { kind: 'int', value: 1 },
        ]),
        literal('Clone', [], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const clone = result.literals.find((l) => l.name === 'Clone')!;
    expect(clone.variants).toHaveLength(2);
  });

  test('should handle parent not found gracefully', () => {
    const input = ast({
      literals: [literal('Child', [{ kind: 'string', value: 'x' }], { extends: 'NonExistent' })],
    });
    const result = resolveInheritance(input);

    const child = result.literals.find((l) => l.name === 'Child')!;
    expect(child.variants).toHaveLength(1);
  });

  test('should handle 5-level chain declared in reverse order', () => {
    const input = ast({
      literals: [
        literal('E', [{ kind: 'string', value: 'e' }], { extends: 'D' }),
        literal('C', [{ kind: 'string', value: 'c' }], { extends: 'B' }),
        literal('A', [{ kind: 'string', value: 'a' }]),
        literal('D', [{ kind: 'string', value: 'd' }], { extends: 'C' }),
        literal('B', [{ kind: 'string', value: 'b' }], { extends: 'A' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.literals.find((l) => l.name === 'E')!;
    expect(e.variants).toHaveLength(5);
    expect(e.variants.map((v) => (v as { value: string }).value)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('should omit objectRef variant by name', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'objectRef', objectName: 'Addr' },
          { kind: 'objectRef', objectName: 'Phone' },
          { kind: 'string', value: 'plain' },
        ]),
        literal('NoAddr', [], { extends: 'Base', extendsFilter: omit(['Addr']) }),
      ],
    });
    const result = resolveInheritance(input);

    const noAddr = result.literals.find((l) => l.name === 'NoAddr')!;
    expect(noAddr.variants).toHaveLength(2);
    expect(noAddr.variants[0]!).toEqual({ kind: 'objectRef', objectName: 'Phone' });
  });

  test('should pick tupleRef variant by tupleName', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'tupleRef', tupleName: 'Coord' },
          { kind: 'tupleRef', tupleName: 'Range' },
          { kind: 'string', value: 'text' },
        ]),
        literal('OnlyCoord', [], { extends: 'Base', extendsFilter: pick(['Coord']) }),
      ],
    });
    const result = resolveInheritance(input);

    const onlyCoord = result.literals.find((l) => l.name === 'OnlyCoord')!;
    expect(onlyCoord.variants).toHaveLength(1);
    expect(onlyCoord.variants[0]!).toEqual({ kind: 'tupleRef', tupleName: 'Coord' });
  });

  test('should pick literalRef variant by literalName', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'literalRef', literalName: 'StatusLit' },
          { kind: 'string', value: 'extra' },
        ]),
        literal('OnlyRef', [], { extends: 'Base', extendsFilter: pick(['StatusLit']) }),
      ],
    });
    const result = resolveInheritance(input);

    const onlyRef = result.literals.find((l) => l.name === 'OnlyRef')!;
    expect(onlyRef.variants).toHaveLength(1);
    expect(onlyRef.variants[0]!).toEqual({ kind: 'literalRef', literalName: 'StatusLit' });
  });

  test('should handle all child variants duplicated — result same as parent', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'a' },
          { kind: 'int', value: 1 },
          { kind: 'bool', value: true },
        ]),
        literal(
          'Clone',
          [
            { kind: 'string', value: 'a' },
            { kind: 'int', value: 1 },
            { kind: 'bool', value: true },
          ],
          { extends: 'Base' },
        ),
      ],
    });
    const result = resolveInheritance(input);

    const clone = result.literals.find((l) => l.name === 'Clone')!;
    expect(clone.variants).toHaveLength(3);
  });

  test('should omit all parent variants and only have own', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'a' },
          { kind: 'string', value: 'b' },
        ]),
        literal('Fresh', [{ kind: 'string', value: 'x' }], {
          extends: 'Base',
          extendsFilter: omit(["'a'", "'b'"]),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const fresh = result.literals.find((l) => l.name === 'Fresh')!;
    expect(fresh.variants).toHaveLength(1);
    expect((fresh.variants[0] as { value: string }).value).toBe('x');
  });

  test('should omit bool variant by identity string', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'bool', value: true },
          { kind: 'bool', value: false },
          { kind: 'string', value: 'x' },
        ]),
        literal('NoTrue', [], { extends: 'Base', extendsFilter: omit(['true']) }),
      ],
    });
    const result = resolveInheritance(input);

    const noTrue = result.literals.find((l) => l.name === 'NoTrue')!;
    expect(noTrue.variants).toHaveLength(2);
    expect(noTrue.variants.some((v) => v.kind === 'bool' && v.value === true)).toBe(false);
    expect(noTrue.variants.some((v) => v.kind === 'bool' && v.value === false)).toBe(true);
  });

  test('should handle omit filter at intermediate and pick at final level', () => {
    const input = ast({
      literals: [
        literal('Root', [
          { kind: 'string', value: 'a' },
          { kind: 'string', value: 'b' },
          { kind: 'string', value: 'c' },
        ]),
        literal('Mid', [{ kind: 'string', value: 'd' }], { extends: 'Root', extendsFilter: omit(["'c'"]) }),
        literal('Leaf', [{ kind: 'string', value: 'e' }], { extends: 'Mid', extendsFilter: pick(["'a'", "'d'"]) }),
      ],
    });
    const result = resolveInheritance(input);

    const leaf = result.literals.find((l) => l.name === 'Leaf')!;
    expect(leaf.variants).toHaveLength(3); // a, d, e
    expect(leaf.variants.map((v) => (v as { value: string }).value)).toEqual(['a', 'd', 'e']);
  });

  test('should handle pick empty list — no parent variants inherited', () => {
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'string', value: 'a' },
          { kind: 'int', value: 1 },
        ]),
        literal('Empty', [{ kind: 'string', value: 'own' }], { extends: 'Base', extendsFilter: pick([]) }),
      ],
    });
    const result = resolveInheritance(input);

    const empty = result.literals.find((l) => l.name === 'Empty')!;
    expect(empty.variants).toHaveLength(1);
    expect((empty.variants[0] as { value: string }).value).toBe('own');
  });

  test('should not confuse different ref kinds with same name', () => {
    // objectRef 'Foo' and tupleRef 'Foo' have different identities
    const input = ast({
      literals: [
        literal('Base', [
          { kind: 'objectRef', objectName: 'Foo' },
          { kind: 'tupleRef', tupleName: 'Foo' },
        ]),
        literal('Child', [{ kind: 'objectRef', objectName: 'Foo' }], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.literals.find((l) => l.name === 'Child')!;
    // objectRef 'Foo' deduped, tupleRef 'Foo' remains unique
    expect(child.variants).toHaveLength(2);
  });
});
