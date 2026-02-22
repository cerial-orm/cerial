/**
 * Unit Tests: Enum Inheritance Resolution
 *
 * Tests resolveInheritance() for enums:
 * - value merging, deduplication, pick/omit
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import { ast, enumDef, omit, pick } from './helpers';

describe('resolveInheritance - enums', () => {
  test('should pass through enums with no extends', () => {
    const input = ast({
      enums: [enumDef('Role', ['Admin', 'User'])],
    });
    const result = resolveInheritance(input);

    expect(result.enums[0]!.values).toEqual(['Admin', 'User']);
  });

  test('should inherit parent values and add child values', () => {
    const input = ast({
      enums: [enumDef('Base', ['Admin', 'User']), enumDef('Extended', ['Guest'], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const ext = result.enums.find((e) => e.name === 'Extended')!;
    expect(ext.values).toEqual(['Admin', 'User', 'Guest']);
  });

  test('should deduplicate when child adds existing value', () => {
    const input = ast({
      enums: [enumDef('Base', ['Admin', 'User']), enumDef('Extended', ['User', 'Guest'], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const ext = result.enums.find((e) => e.name === 'Extended')!;
    expect(ext.values).toEqual(['Admin', 'User', 'Guest']);
  });

  test('should apply pick filter', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['Admin', 'Editor', 'Viewer', 'Guest']),
        enumDef('Core', [], { extends: 'Base', extendsFilter: pick(['Admin', 'Editor']) }),
      ],
    });
    const result = resolveInheritance(input);

    const core = result.enums.find((e) => e.name === 'Core')!;
    expect(core.values).toEqual(['Admin', 'Editor']);
  });

  test('should apply omit filter', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['Admin', 'Editor', 'Viewer', 'Guest']),
        enumDef('NonAdmin', ['Super'], { extends: 'Base', extendsFilter: omit(['Admin']) }),
      ],
    });
    const result = resolveInheritance(input);

    const nonAdmin = result.enums.find((e) => e.name === 'NonAdmin')!;
    expect(nonAdmin.values).toEqual(['Editor', 'Viewer', 'Guest', 'Super']);
  });

  test('should resolve multi-level chain', () => {
    const input = ast({
      enums: [enumDef('A', ['X']), enumDef('B', ['Y'], { extends: 'A' }), enumDef('C', ['Z'], { extends: 'B' })],
    });
    const result = resolveInheritance(input);

    const c = result.enums.find((e) => e.name === 'C')!;
    expect(c.values).toEqual(['X', 'Y', 'Z']);
  });

  test('should strip extends/extendsFilter from resolved enum', () => {
    const input = ast({
      enums: [enumDef('Base', ['A']), enumDef('Child', ['B'], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const child = result.enums.find((e) => e.name === 'Child')!;
    expect(child.extends).toBeUndefined();
    expect(child.extendsFilter).toBeUndefined();
  });

  test('should not mutate input', () => {
    const base = enumDef('Base', ['A', 'B']);
    const child = enumDef('Child', ['C'], { extends: 'Base' });
    const input = ast({ enums: [base, child] });

    resolveInheritance(input);

    expect(input.enums[0]!.values).toEqual(['A', 'B']);
    expect(input.enums[1]!.extends).toBe('Base');
  });

  test('should handle enums declared in reverse order', () => {
    const input = ast({
      enums: [enumDef('Child', ['C'], { extends: 'Parent' }), enumDef('Parent', ['A', 'B'])],
    });
    const result = resolveInheritance(input);

    const child = result.enums.find((e) => e.name === 'Child')!;
    expect(child.values).toEqual(['A', 'B', 'C']);
  });

  test('should handle pick filter with child additions', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['A', 'B', 'C']),
        enumDef('Slim', ['D'], { extends: 'Base', extendsFilter: pick(['A']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.enums.find((e) => e.name === 'Slim')!;
    expect(slim.values).toEqual(['A', 'D']);
  });

  test('should handle multi-level with filter at intermediate level', () => {
    const input = ast({
      enums: [
        enumDef('L1', ['A', 'B', 'C']),
        enumDef('L2', ['D'], { extends: 'L1', extendsFilter: omit(['C']) }),
        enumDef('L3', ['E'], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.enums.find((e) => e.name === 'L3')!;
    expect(l3.values).toEqual(['A', 'B', 'D', 'E']);
  });

  // ── Edge Cases ──

  test('should handle all values duplicated in child — result same as parent', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['Admin', 'User', 'Guest']),
        enumDef('Clone', ['Admin', 'User', 'Guest'], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const clone = result.enums.find((e) => e.name === 'Clone')!;
    expect(clone.values).toEqual(['Admin', 'User', 'Guest']);
  });

  test('should omit all parent values then add own — only child values', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['A', 'B', 'C']),
        enumDef('Fresh', ['D', 'E'], { extends: 'Base', extendsFilter: omit(['A', 'B', 'C']) }),
      ],
    });
    const result = resolveInheritance(input);

    const fresh = result.enums.find((e) => e.name === 'Fresh')!;
    expect(fresh.values).toEqual(['D', 'E']);
  });

  test('should handle empty parent enum — child only has own values', () => {
    const input = ast({
      enums: [enumDef('Empty', []), enumDef('Child', ['X', 'Y'], { extends: 'Empty' })],
    });
    const result = resolveInheritance(input);

    const child = result.enums.find((e) => e.name === 'Child')!;
    expect(child.values).toEqual(['X', 'Y']);
  });

  test('should handle pick with empty fields list — no parent values inherited', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['A', 'B', 'C']),
        enumDef('NoParent', ['X'], { extends: 'Base', extendsFilter: pick([]) }),
      ],
    });
    const result = resolveInheritance(input);

    const noParent = result.enums.find((e) => e.name === 'NoParent')!;
    expect(noParent.values).toEqual(['X']);
  });

  test('should resolve 4-level chain with filters at different levels', () => {
    const input = ast({
      enums: [
        enumDef('L1', ['A', 'B', 'C', 'D', 'E']),
        enumDef('L2', ['F'], { extends: 'L1', extendsFilter: omit(['D', 'E']) }),
        enumDef('L3', ['G'], { extends: 'L2', extendsFilter: pick(['A', 'F']) }),
        enumDef('L4', ['H'], { extends: 'L3' }),
      ],
    });
    const result = resolveInheritance(input);

    const l2 = result.enums.find((e) => e.name === 'L2')!;
    expect(l2.values).toEqual(['A', 'B', 'C', 'F']);

    const l3 = result.enums.find((e) => e.name === 'L3')!;
    expect(l3.values).toEqual(['A', 'F', 'G']);

    const l4 = result.enums.find((e) => e.name === 'L4')!;
    expect(l4.values).toEqual(['A', 'F', 'G', 'H']);
  });

  test('should ensure multiple children of same parent enum are independent', () => {
    const input = ast({
      enums: [
        enumDef('Base', ['Admin', 'User', 'Guest']),
        enumDef('A', ['Super'], { extends: 'Base', extendsFilter: pick(['Admin']) }),
        enumDef('B', ['Viewer'], { extends: 'Base', extendsFilter: omit(['Admin']) }),
      ],
    });
    const result = resolveInheritance(input);

    const a = result.enums.find((e) => e.name === 'A')!;
    const b = result.enums.find((e) => e.name === 'B')!;
    expect(a.values).toEqual(['Admin', 'Super']);
    expect(b.values).toEqual(['User', 'Guest', 'Viewer']);
  });

  test('should resolve 5-level enum chain', () => {
    const input = ast({
      enums: [
        enumDef('L1', ['A']),
        enumDef('L2', ['B'], { extends: 'L1' }),
        enumDef('L3', ['C'], { extends: 'L2' }),
        enumDef('L4', ['D'], { extends: 'L3' }),
        enumDef('L5', ['E'], { extends: 'L4' }),
      ],
    });
    const result = resolveInheritance(input);

    const l5 = result.enums.find((e) => e.name === 'L5')!;
    expect(l5.values).toEqual(['A', 'B', 'C', 'D', 'E']);
  });

  test('should handle empty child enum — inherits all parent values', () => {
    const input = ast({
      enums: [enumDef('Base', ['X', 'Y', 'Z']), enumDef('Clone', [], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const clone = result.enums.find((e) => e.name === 'Clone')!;
    expect(clone.values).toEqual(['X', 'Y', 'Z']);
  });

  test('should handle parent not found gracefully', () => {
    const input = ast({
      enums: [enumDef('Child', ['A'], { extends: 'NonExistent' })],
    });
    const result = resolveInheritance(input);

    const child = result.enums.find((e) => e.name === 'Child')!;
    expect(child.values).toEqual(['A']);
  });

  test('should handle 5-level chain declared in reverse order', () => {
    const input = ast({
      enums: [
        enumDef('E', ['e'], { extends: 'D' }),
        enumDef('C', ['c'], { extends: 'B' }),
        enumDef('A', ['a']),
        enumDef('D', ['d'], { extends: 'C' }),
        enumDef('B', ['b'], { extends: 'A' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.enums.find((en) => en.name === 'E')!;
    expect(e.values).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('should handle partial dedup — some child values match parent, some new', () => {
    const input = ast({
      enums: [enumDef('Base', ['A', 'B', 'C', 'D']), enumDef('Mixed', ['B', 'D', 'E', 'F'], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const mixed = result.enums.find((e) => e.name === 'Mixed')!;
    expect(mixed.values).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  test('should handle omit filter at intermediate and pick at final level', () => {
    const input = ast({
      enums: [
        enumDef('Root', ['A', 'B', 'C', 'D']),
        enumDef('Mid', ['E'], { extends: 'Root', extendsFilter: omit(['C', 'D']) }),
        enumDef('Leaf', ['F'], { extends: 'Mid', extendsFilter: pick(['A', 'E']) }),
      ],
    });
    const result = resolveInheritance(input);

    const leaf = result.enums.find((e) => e.name === 'Leaf')!;
    expect(leaf.values).toEqual(['A', 'E', 'F']);
  });
});
