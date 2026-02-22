/**
 * Unit Tests: Object Inheritance Resolution
 *
 * Tests resolveInheritance() for objects:
 * - field merging, override, pick/omit, private stripping
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import { ast, dec, field, obj, omit, pick, R } from './helpers';

describe('resolveInheritance - objects', () => {
  test('should pass through objects with no extends', () => {
    const input = ast({
      objects: [obj('Address', [field('street'), field('city')])],
    });
    const result = resolveInheritance(input);

    expect(result.objects[0]!.fields.map((f) => f.name)).toEqual(['street', 'city']);
  });

  test('should inherit all parent fields', () => {
    const input = ast({
      objects: [obj('Base', [field('street'), field('city')]), obj('Full', [field('zip')], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const full = result.objects.find((o) => o.name === 'Full')!;
    expect(full.fields.map((f) => f.name)).toEqual(['street', 'city', 'zip']);
  });

  test('should override parent field by name', () => {
    const input = ast({
      objects: [
        obj('Base', [field('city', { type: 'string' })]),
        obj('Full', [field('city', { type: 'int' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const full = result.objects.find((o) => o.name === 'Full')!;
    expect(full.fields).toHaveLength(1);
    expect(full.fields[0]!.type).toBe('int');
  });

  test('should apply pick filter', () => {
    const input = ast({
      objects: [
        obj('Base', [field('a'), field('b'), field('c')]),
        obj('Slim', [field('d')], { extends: 'Base', extendsFilter: pick(['a']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.objects.find((o) => o.name === 'Slim')!;
    expect(slim.fields.map((f) => f.name)).toEqual(['a', 'd']);
  });

  test('should apply omit filter', () => {
    const input = ast({
      objects: [
        obj('Base', [field('a'), field('b'), field('c')]),
        obj('NoC', [field('d')], { extends: 'Base', extendsFilter: omit(['c']) }),
      ],
    });
    const result = resolveInheritance(input);

    const noC = result.objects.find((o) => o.name === 'NoC')!;
    expect(noC.fields.map((f) => f.name)).toEqual(['a', 'b', 'd']);
  });

  test('should strip isPrivate from all fields', () => {
    const input = ast({
      objects: [obj('Base', [field('pub'), field('priv', { isPrivate: true })]), obj('Child', [], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields.every((f) => f.isPrivate === undefined)).toBe(true);
  });

  test('should resolve multi-level chain', () => {
    const input = ast({
      objects: [
        obj('A', [field('a')]),
        obj('B', [field('b')], { extends: 'A' }),
        obj('C', [field('c')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const c = result.objects.find((o) => o.name === 'C')!;
    expect(c.fields.map((f) => f.name)).toEqual(['a', 'b', 'c']);
  });

  test('should strip extends/extendsFilter from resolved object', () => {
    const input = ast({
      objects: [obj('Base', [field('a')]), obj('Child', [], { extends: 'Base', extendsFilter: pick(['a']) })],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.extends).toBeUndefined();
    expect(child.extendsFilter).toBeUndefined();
  });

  test('should not mutate input', () => {
    const base = obj('Base', [field('a', { isPrivate: true })]);
    const child = obj('Child', [], { extends: 'Base' });
    const input = ast({ objects: [base, child] });

    resolveInheritance(input);

    expect(input.objects[0]!.fields[0]!.isPrivate).toBe(true);
    expect(input.objects[1]!.extends).toBe('Base');
  });

  test('should handle objects declared in reverse order', () => {
    const input = ast({
      objects: [obj('Child', [field('extra')], { extends: 'Parent' }), obj('Parent', [field('base')])],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['base', 'extra']);
  });

  test('should handle empty child object', () => {
    const input = ast({
      objects: [obj('Base', [field('x'), field('y')]), obj('Clone', [], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const clone = result.objects.find((o) => o.name === 'Clone')!;
    expect(clone.fields.map((f) => f.name)).toEqual(['x', 'y']);
  });

  test('should handle pick with override', () => {
    const input = ast({
      objects: [
        obj('Base', [field('a'), field('b')]),
        obj('Over', [field('a', { type: 'int' })], { extends: 'Base', extendsFilter: pick(['a', 'b']) }),
      ],
    });
    const result = resolveInheritance(input);

    const over = result.objects.find((o) => o.name === 'Over')!;
    expect(over.fields.map((f) => f.name)).toEqual(['b', 'a']);
    expect(over.fields.find((f) => f.name === 'a')!.type).toBe('int');
  });

  test('should handle multi-level with filter at intermediate level', () => {
    const input = ast({
      objects: [
        obj('L1', [field('a'), field('b'), field('c')]),
        obj('L2', [field('d')], { extends: 'L1', extendsFilter: omit(['c']) }),
        obj('L3', [field('e')], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.objects.find((o) => o.name === 'L3')!;
    expect(l3.fields.map((f) => f.name)).toEqual(['a', 'b', 'd', 'e']);
  });

  test('should strip private through multi-level chain', () => {
    const input = ast({
      objects: [
        obj('L1', [field('x', { isPrivate: true })]),
        obj('L2', [field('y')], { extends: 'L1' }),
        obj('L3', [field('z')], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.objects.find((o) => o.name === 'L3')!;
    expect(l3.fields.every((f) => f.isPrivate === undefined)).toBe(true);
    expect(l3.fields.map((f) => f.name)).toEqual(['x', 'y', 'z']);
  });

  // ── Edge Cases ──

  test('should preserve decorators on inherited fields', () => {
    const input = ast({
      objects: [
        obj('Base', [
          field('createdAt', { type: 'date', decorators: [dec('createdAt')] }),
          field('value', {
            type: 'int',
            decorators: [{ type: 'default' as any, value: 42, range: R }],
          }),
        ]),
        obj('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields[0]!.decorators[0]!.type).toBe('createdAt');
    expect(child.fields[1]!.decorators[0]!.value).toBe(42);
  });

  test('should preserve nested objectName reference through inheritance', () => {
    const input = ast({
      objects: [
        obj('Base', [field('nested', { type: 'object', objectName: 'Inner' })]),
        obj('Child', [field('extra')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields[0]!.objectName).toBe('Inner');
  });

  test('should preserve tupleName reference through inheritance', () => {
    const input = ast({
      objects: [
        obj('Base', [field('coords', { type: 'tuple', tupleName: 'Coord' })]),
        obj('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields[0]!.tupleName).toBe('Coord');
  });

  test('should preserve literalName reference through inheritance', () => {
    const input = ast({
      objects: [
        obj('Base', [field('status', { type: 'literal', literalName: 'StatusType' })]),
        obj('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields[0]!.literalName).toBe('StatusType');
  });

  test('should override optional to required', () => {
    const input = ast({
      objects: [
        obj('Base', [field('email', { isOptional: true })]),
        obj('Strict', [field('email', { isOptional: false })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const strict = result.objects.find((o) => o.name === 'Strict')!;
    expect(strict.fields[0]!.isOptional).toBe(false);
  });

  test('should override required to optional', () => {
    const input = ast({
      objects: [
        obj('Base', [field('email', { isOptional: false })]),
        obj('Relaxed', [field('email', { isOptional: true })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const relaxed = result.objects.find((o) => o.name === 'Relaxed')!;
    expect(relaxed.fields[0]!.isOptional).toBe(true);
  });

  test('should handle empty parent object — child only has own fields', () => {
    const input = ast({
      objects: [obj('Empty', []), obj('Child', [field('x'), field('y')], { extends: 'Empty' })],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['x', 'y']);
  });

  test('should resolve 5-level object chain', () => {
    const input = ast({
      objects: [
        obj('A', [field('a')]),
        obj('B', [field('b')], { extends: 'A' }),
        obj('C', [field('c')], { extends: 'B' }),
        obj('D', [field('d')], { extends: 'C' }),
        obj('E', [field('e')], { extends: 'D' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.objects.find((o) => o.name === 'E')!;
    expect(e.fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('should ensure multiple children of same parent are independent', () => {
    const input = ast({
      objects: [
        obj('Base', [field('x'), field('y'), field('z')]),
        obj('A', [field('a')], { extends: 'Base', extendsFilter: pick(['x']) }),
        obj('B', [field('b')], { extends: 'Base', extendsFilter: omit(['z']) }),
      ],
    });
    const result = resolveInheritance(input);

    const a = result.objects.find((o) => o.name === 'A')!;
    const b = result.objects.find((o) => o.name === 'B')!;
    expect(a.fields.map((f) => f.name)).toEqual(['x', 'a']);
    expect(b.fields.map((f) => f.name)).toEqual(['x', 'y', 'b']);
  });

  test('should omit all parent fields and only have own', () => {
    const input = ast({
      objects: [
        obj('Base', [field('a'), field('b')]),
        obj('Fresh', [field('x')], { extends: 'Base', extendsFilter: omit(['a', 'b']) }),
      ],
    });
    const result = resolveInheritance(input);

    const fresh = result.objects.find((o) => o.name === 'Fresh')!;
    expect(fresh.fields.map((f) => f.name)).toEqual(['x']);
  });

  test('should preserve isNullable through inheritance', () => {
    const input = ast({
      objects: [
        obj('Base', [field('value', { isNullable: true })]),
        obj('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields[0]!.isNullable).toBe(true);
  });

  test('should handle parent not found gracefully', () => {
    const input = ast({
      objects: [obj('Child', [field('name')], { extends: 'NonExistent' })],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['name']);
  });

  test('should handle 5-level chain declared in reverse order', () => {
    const input = ast({
      objects: [
        obj('E', [field('e')], { extends: 'D' }),
        obj('C', [field('c')], { extends: 'B' }),
        obj('A', [field('a')]),
        obj('D', [field('d')], { extends: 'C' }),
        obj('B', [field('b')], { extends: 'A' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.objects.find((o) => o.name === 'E')!;
    expect(e.fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('should preserve isArray through inheritance', () => {
    const input = ast({
      objects: [
        obj('Base', [field('tags', { type: 'string', isArray: true })]),
        obj('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.objects.find((o) => o.name === 'Child')!;
    expect(child.fields[0]!.isArray).toBe(true);
  });
});
