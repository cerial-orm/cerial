/**
 * Unit Tests: Tuple Inheritance Resolution
 *
 * Tests resolveInheritance() for tuples:
 * - element appending, named override, pick/omit, private stripping
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import { ast, dec, element, omit, pick, R, tuple } from './helpers';

describe('resolveInheritance - tuples', () => {
  test('should pass through tuples with no extends', () => {
    const input = ast({
      tuples: [tuple('Pair', [element('float'), element('float')])],
    });
    const result = resolveInheritance(input);

    expect(result.tuples[0]!.elements).toHaveLength(2);
  });

  test('should append child elements after parent elements', () => {
    const input = ast({
      tuples: [
        tuple('Pair', [element('float'), element('float')]),
        tuple('Triple', [element('string')], { extends: 'Pair' }),
      ],
    });
    const result = resolveInheritance(input);

    const triple = result.tuples.find((t) => t.name === 'Triple')!;
    expect(triple.elements).toHaveLength(3);
    expect(triple.elements[0]!.type).toBe('float');
    expect(triple.elements[1]!.type).toBe('float');
    expect(triple.elements[2]!.type).toBe('string');
  });

  test('should override named parent element by name', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('float', { name: 'x' }), element('float', { name: 'y' })]),
        tuple('Override', [element('int', { name: 'x' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const override = result.tuples.find((t) => t.name === 'Override')!;
    expect(override.elements).toHaveLength(2);
    expect(override.elements[0]!.type).toBe('int'); // overridden
    expect(override.elements[0]!.name).toBe('x');
    expect(override.elements[1]!.type).toBe('float'); // parent's
    expect(override.elements[1]!.name).toBe('y');
  });

  test('should append named element that does not match parent', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('float', { name: 'x' }), element('float', { name: 'y' })]),
        tuple('Extended', [element('string', { name: 'z' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.tuples.find((t) => t.name === 'Extended')!;
    expect(ext.elements).toHaveLength(3);
    expect(ext.elements[2]!.name).toBe('z');
  });

  test('should apply pick filter by index', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('string'), element('int'), element('bool')]),
        tuple('Slim', [element('float')], { extends: 'Base', extendsFilter: pick(['0', '2']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.tuples.find((t) => t.name === 'Slim')!;
    expect(slim.elements).toHaveLength(3);
    expect(slim.elements[0]!.type).toBe('string');
    expect(slim.elements[1]!.type).toBe('bool');
    expect(slim.elements[2]!.type).toBe('float');
  });

  test('should apply pick filter by name', () => {
    const input = ast({
      tuples: [
        tuple('Base', [
          element('float', { name: 'x' }),
          element('float', { name: 'y' }),
          element('float', { name: 'z' }),
        ]),
        tuple('XY', [], { extends: 'Base', extendsFilter: pick(['x', 'y']) }),
      ],
    });
    const result = resolveInheritance(input);

    const xy = result.tuples.find((t) => t.name === 'XY')!;
    expect(xy.elements).toHaveLength(2);
    expect(xy.elements[0]!.name).toBe('x');
    expect(xy.elements[1]!.name).toBe('y');
  });

  test('should apply omit filter by index', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('string'), element('int'), element('bool')]),
        tuple('NoMiddle', [], { extends: 'Base', extendsFilter: omit(['1']) }),
      ],
    });
    const result = resolveInheritance(input);

    const noMiddle = result.tuples.find((t) => t.name === 'NoMiddle')!;
    expect(noMiddle.elements).toHaveLength(2);
    expect(noMiddle.elements[0]!.type).toBe('string');
    expect(noMiddle.elements[1]!.type).toBe('bool');
  });

  test('should apply omit filter by name', () => {
    const input = ast({
      tuples: [
        tuple('Base', [
          element('float', { name: 'x' }),
          element('float', { name: 'y' }),
          element('float', { name: 'z' }),
        ]),
        tuple('NoZ', [], { extends: 'Base', extendsFilter: omit(['z']) }),
      ],
    });
    const result = resolveInheritance(input);

    const noZ = result.tuples.find((t) => t.name === 'NoZ')!;
    expect(noZ.elements).toHaveLength(2);
    expect(noZ.elements[0]!.name).toBe('x');
    expect(noZ.elements[1]!.name).toBe('y');
  });

  test('should strip isPrivate from all elements', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('float', { name: 'pub' }), element('int', { name: 'priv', isPrivate: true })]),
        tuple('Child', [], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements.every((e) => e.isPrivate === undefined)).toBe(true);
  });

  test('should strip isPrivate from base tuple elements', () => {
    const input = ast({
      tuples: [tuple('Base', [element('float', { isPrivate: true })])],
    });
    const result = resolveInheritance(input);

    expect(result.tuples[0]!.elements[0]!.isPrivate).toBeUndefined();
  });

  test('should resolve multi-level tuple chain', () => {
    const input = ast({
      tuples: [
        tuple('A', [element('int')]),
        tuple('B', [element('float')], { extends: 'A' }),
        tuple('C', [element('string')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const c = result.tuples.find((t) => t.name === 'C')!;
    expect(c.elements.map((e) => e.type)).toEqual(['int', 'float', 'string']);
  });

  test('should strip extends/extendsFilter from resolved tuple', () => {
    const input = ast({
      tuples: [tuple('Base', [element('int')]), tuple('Child', [], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.extends).toBeUndefined();
    expect(child.extendsFilter).toBeUndefined();
  });

  test('should not mutate input', () => {
    const base = tuple('Base', [element('int', { isPrivate: true })]);
    const child = tuple('Child', [], { extends: 'Base' });
    const input = ast({ tuples: [base, child] });

    resolveInheritance(input);

    expect(input.tuples[0]!.elements[0]!.isPrivate).toBe(true);
    expect(input.tuples[1]!.extends).toBe('Base');
  });

  test('should handle tuples declared in reverse order', () => {
    const input = ast({
      tuples: [tuple('Child', [element('string')], { extends: 'Parent' }), tuple('Parent', [element('int')])],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements.map((e) => e.type)).toEqual(['int', 'string']);
  });

  test('should handle combined override and append', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('float', { name: 'x' }), element('float', { name: 'y' })]),
        tuple('Extended', [element('int', { name: 'x' }), element('string', { name: 'z' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const ext = result.tuples.find((t) => t.name === 'Extended')!;
    expect(ext.elements).toHaveLength(3);
    expect(ext.elements[0]!.type).toBe('int'); // overridden x
    expect(ext.elements[1]!.type).toBe('float'); // parent y
    expect(ext.elements[2]!.type).toBe('string'); // appended z
  });

  test('should handle multi-level with filter at intermediate level', () => {
    const input = ast({
      tuples: [
        tuple('L1', [element('int', { name: 'a' }), element('float', { name: 'b' }), element('string', { name: 'c' })]),
        tuple('L2', [element('bool', { name: 'd' })], { extends: 'L1', extendsFilter: omit(['c']) }),
        tuple('L3', [element('date')], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.tuples.find((t) => t.name === 'L3')!;
    expect(l3.elements.map((e) => e.type)).toEqual(['int', 'float', 'bool', 'date']);
  });

  // ── Edge Cases ──

  test('should append all unnamed child elements after parent', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('int'), element('float')]),
        tuple('Child', [element('string'), element('bool')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements.map((e) => e.type)).toEqual(['int', 'float', 'string', 'bool']);
  });

  test('should handle mixed named/unnamed — override named, append unnamed', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('float', { name: 'x' }), element('int'), element('float', { name: 'y' })]),
        tuple('Child', [element('int', { name: 'x' }), element('string')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    // x overridden to int, unnamed int at [1] unchanged, y unchanged, new unnamed string appended
    expect(child.elements).toHaveLength(4);
    expect(child.elements[0]!.type).toBe('int'); // overridden x
    expect(child.elements[0]!.name).toBe('x');
    expect(child.elements[1]!.type).toBe('int'); // parent unnamed
    expect(child.elements[2]!.type).toBe('float'); // parent y
    expect(child.elements[3]!.type).toBe('string'); // appended unnamed
  });

  test('should preserve decorators on tuple elements through inheritance', () => {
    const input = ast({
      tuples: [
        tuple('Base', [
          element('int', { name: 'x', decorators: [dec('nullable')] }),
          element('float', {
            name: 'y',
            decorators: [{ type: 'default' as any, value: 0, range: R }],
          }),
        ]),
        tuple('Child', [element('string')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements[0]!.decorators![0]!.type).toBe('nullable');
    expect(child.elements[1]!.decorators![0]!.value).toBe(0);
  });

  test('should handle pick by both name and index in same filter', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('int', { name: 'x' }), element('float'), element('string', { name: 'z' })]),
        // Pick x (by name, resolves to index 0) and 1 (by index)
        tuple('Slim', [], { extends: 'Base', extendsFilter: pick(['x', '1']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.tuples.find((t) => t.name === 'Slim')!;
    expect(slim.elements).toHaveLength(2);
    expect(slim.elements[0]!.name).toBe('x');
    expect(slim.elements[0]!.type).toBe('int');
    expect(slim.elements[1]!.type).toBe('float');
  });

  test('should handle empty child tuple — inherits all parent elements', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('int', { name: 'a' }), element('float', { name: 'b' }), element('string')]),
        tuple('Clone', [], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const clone = result.tuples.find((t) => t.name === 'Clone')!;
    expect(clone.elements).toHaveLength(3);
    expect(clone.elements.map((e) => e.type)).toEqual(['int', 'float', 'string']);
  });

  test('should handle child with only overrides — same element count as parent', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('float', { name: 'x' }), element('float', { name: 'y' })]),
        tuple('Override', [element('int', { name: 'x' }), element('int', { name: 'y' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const override = result.tuples.find((t) => t.name === 'Override')!;
    expect(override.elements).toHaveLength(2);
    expect(override.elements[0]!.type).toBe('int');
    expect(override.elements[1]!.type).toBe('int');
  });

  test('should resolve 5-level tuple chain', () => {
    const input = ast({
      tuples: [
        tuple('A', [element('int')]),
        tuple('B', [element('float')], { extends: 'A' }),
        tuple('C', [element('string')], { extends: 'B' }),
        tuple('D', [element('bool')], { extends: 'C' }),
        tuple('E', [element('date')], { extends: 'D' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.tuples.find((t) => t.name === 'E')!;
    expect(e.elements.map((el) => el.type)).toEqual(['int', 'float', 'string', 'bool', 'date']);
  });

  test('should strip private from both named and unnamed elements', () => {
    const input = ast({
      tuples: [
        tuple('Base', [
          element('int', { name: 'x', isPrivate: true }),
          element('float', { isPrivate: true }),
          element('string', { name: 'z' }),
        ]),
        tuple('Child', [], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements.every((e) => e.isPrivate === undefined)).toBe(true);
    expect(child.elements).toHaveLength(3);
  });

  test('should preserve objectName on tuple elements through inheritance', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('object', { name: 'addr', objectName: 'Address' })]),
        tuple('Child', [element('string')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements[0]!.objectName).toBe('Address');
  });

  test('should preserve tupleName on tuple elements through inheritance', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('tuple', { name: 'inner', tupleName: 'InnerTuple' })]),
        tuple('Child', [element('int')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements[0]!.tupleName).toBe('InnerTuple');
  });

  test('should preserve literalName on tuple elements through inheritance', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('literal', { name: 'kind', literalName: 'Kind' })]),
        tuple('Child', [element('int')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements[0]!.literalName).toBe('Kind');
  });

  test('should preserve isNullable on tuple elements through inheritance', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('int', { name: 'x', isNullable: true })]),
        tuple('Child', [element('string')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements[0]!.isNullable).toBe(true);
  });

  test('should handle omit by name on named elements removing correct positions', () => {
    const input = ast({
      tuples: [
        tuple('Base', [
          element('int', { name: 'a' }),
          element('float', { name: 'b' }),
          element('string', { name: 'c' }),
          element('bool', { name: 'd' }),
        ]),
        tuple('Slim', [], { extends: 'Base', extendsFilter: omit(['b', 'd']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.tuples.find((t) => t.name === 'Slim')!;
    expect(slim.elements).toHaveLength(2);
    expect(slim.elements[0]!.name).toBe('a');
    expect(slim.elements[1]!.name).toBe('c');
  });

  test('should handle 5-level chain declared in reverse order', () => {
    const input = ast({
      tuples: [
        tuple('E', [element('date')], { extends: 'D' }),
        tuple('C', [element('string')], { extends: 'B' }),
        tuple('A', [element('int')]),
        tuple('D', [element('bool')], { extends: 'C' }),
        tuple('B', [element('float')], { extends: 'A' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.tuples.find((t) => t.name === 'E')!;
    expect(e.elements.map((el) => el.type)).toEqual(['int', 'float', 'string', 'bool', 'date']);
  });

  test('should ensure multiple children of same parent tuple are independent', () => {
    const input = ast({
      tuples: [
        tuple('Base', [element('int', { name: 'x' }), element('float', { name: 'y' })]),
        tuple('A', [element('string')], { extends: 'Base', extendsFilter: pick(['x']) }),
        tuple('B', [element('bool')], { extends: 'Base', extendsFilter: omit(['x']) }),
      ],
    });
    const result = resolveInheritance(input);

    const a = result.tuples.find((t) => t.name === 'A')!;
    const b = result.tuples.find((t) => t.name === 'B')!;
    expect(a.elements.map((e) => e.type)).toEqual(['int', 'string']);
    expect(b.elements.map((e) => e.type)).toEqual(['float', 'bool']);
  });

  test('should handle empty parent tuple — child only has own elements', () => {
    const input = ast({
      tuples: [tuple('Empty', []), tuple('Child', [element('int'), element('string')], { extends: 'Empty' })],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements).toHaveLength(2);
    expect(child.elements.map((e) => e.type)).toEqual(['int', 'string']);
  });

  test('should handle parent not found gracefully', () => {
    const input = ast({
      tuples: [tuple('Child', [element('int')], { extends: 'NonExistent' })],
    });
    const result = resolveInheritance(input);

    const child = result.tuples.find((t) => t.name === 'Child')!;
    expect(child.elements).toHaveLength(1);
    expect(child.elements[0]!.type).toBe('int');
  });

  test('should handle chain where middle overrides — grandchild inherits override', () => {
    const input = ast({
      tuples: [
        tuple('A', [element('float', { name: 'x' }), element('float', { name: 'y' })]),
        tuple('B', [element('int', { name: 'x' })], { extends: 'A' }),
        tuple('C', [element('string')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const c = result.tuples.find((t) => t.name === 'C')!;
    expect(c.elements[0]!.type).toBe('int'); // B's override of x
    expect(c.elements[0]!.name).toBe('x');
    expect(c.elements[1]!.type).toBe('float'); // A's y
    expect(c.elements[2]!.type).toBe('string'); // C's appended
  });

  test('should handle omit filter at intermediate and pick at final level', () => {
    const input = ast({
      tuples: [
        tuple('Root', [
          element('int', { name: 'a' }),
          element('float', { name: 'b' }),
          element('string', { name: 'c' }),
        ]),
        tuple('Mid', [element('bool', { name: 'd' })], { extends: 'Root', extendsFilter: omit(['c']) }),
        tuple('Leaf', [element('date')], { extends: 'Mid', extendsFilter: pick(['a', 'd']) }),
      ],
    });
    const result = resolveInheritance(input);

    const leaf = result.tuples.find((t) => t.name === 'Leaf')!;
    expect(leaf.elements.map((e) => e.type)).toEqual(['int', 'bool', 'date']);
  });
});
