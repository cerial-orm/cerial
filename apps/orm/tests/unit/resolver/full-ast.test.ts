/**
 * Unit Tests: Full AST Inheritance Resolution
 *
 * Tests resolveInheritance() across all type kinds simultaneously
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import { ast, element, enumDef, field, literal, model, obj, omit, pick, tuple } from './helpers';

describe('resolveInheritance - full AST', () => {
  test('should resolve all type kinds simultaneously', () => {
    const input = ast({
      models: [model('BaseModel', [field('id')]), model('UserModel', [field('name')], { extends: 'BaseModel' })],
      objects: [obj('BaseObj', [field('x')]), obj('FullObj', [field('y')], { extends: 'BaseObj' })],
      tuples: [tuple('BaseTuple', [element('int')]), tuple('FullTuple', [element('string')], { extends: 'BaseTuple' })],
      enums: [enumDef('BaseEnum', ['A']), enumDef('FullEnum', ['B'], { extends: 'BaseEnum' })],
      literals: [
        literal('BaseLit', [{ kind: 'string', value: 'x' }]),
        literal('FullLit', [{ kind: 'string', value: 'y' }], { extends: 'BaseLit' }),
      ],
    });

    const result = resolveInheritance(input);

    // Models
    const userModel = result.models.find((m) => m.name === 'UserModel')!;
    expect(userModel.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(userModel.extends).toBeUndefined();

    // Objects
    const fullObj = result.objects.find((o) => o.name === 'FullObj')!;
    expect(fullObj.fields.map((f) => f.name)).toEqual(['x', 'y']);
    expect(fullObj.extends).toBeUndefined();

    // Tuples
    const fullTuple = result.tuples.find((t) => t.name === 'FullTuple')!;
    expect(fullTuple.elements.map((e) => e.type)).toEqual(['int', 'string']);
    expect(fullTuple.extends).toBeUndefined();

    // Enums
    const fullEnum = result.enums.find((e) => e.name === 'FullEnum')!;
    expect(fullEnum.values).toEqual(['A', 'B']);
    expect(fullEnum.extends).toBeUndefined();

    // Literals
    const fullLit = result.literals.find((l) => l.name === 'FullLit')!;
    expect(fullLit.variants).toHaveLength(2);
    expect(fullLit.extends).toBeUndefined();
  });

  test('should preserve source string', () => {
    const input = ast({ source: 'model User {}' });
    const result = resolveInheritance(input);

    expect(result.source).toBe('model User {}');
  });

  test('should return new AST object (not mutate input)', () => {
    const input = ast({
      models: [model('User', [field('id')])],
    });
    const result = resolveInheritance(input);

    expect(result).not.toBe(input);
    expect(result.models).not.toBe(input.models);
  });

  test('should handle empty AST', () => {
    const input = ast();
    const result = resolveInheritance(input);

    expect(result.models).toHaveLength(0);
    expect(result.objects).toHaveLength(0);
    expect(result.tuples).toHaveLength(0);
    expect(result.enums).toHaveLength(0);
    expect(result.literals).toHaveLength(0);
  });

  // ── Edge Cases ──

  test('should handle all kinds with chains declared in mixed order', () => {
    const input = ast({
      models: [model('UserModel', [field('name')], { extends: 'BaseModel' }), model('BaseModel', [field('id')])],
      objects: [obj('FullObj', [field('zip')], { extends: 'BaseObj' }), obj('BaseObj', [field('street')])],
      tuples: [tuple('FullTuple', [element('string')], { extends: 'BaseTuple' }), tuple('BaseTuple', [element('int')])],
      enums: [enumDef('FullEnum', ['C'], { extends: 'BaseEnum' }), enumDef('BaseEnum', ['A', 'B'])],
      literals: [
        literal('FullLit', [{ kind: 'int', value: 2 }], { extends: 'BaseLit' }),
        literal('BaseLit', [{ kind: 'int', value: 1 }]),
      ],
    });

    const result = resolveInheritance(input);

    const userModel = result.models.find((m) => m.name === 'UserModel')!;
    expect(userModel.fields.map((f) => f.name)).toEqual(['id', 'name']);

    const fullObj = result.objects.find((o) => o.name === 'FullObj')!;
    expect(fullObj.fields.map((f) => f.name)).toEqual(['street', 'zip']);

    const fullTuple = result.tuples.find((t) => t.name === 'FullTuple')!;
    expect(fullTuple.elements.map((e) => e.type)).toEqual(['int', 'string']);

    const fullEnum = result.enums.find((e) => e.name === 'FullEnum')!;
    expect(fullEnum.values).toEqual(['A', 'B', 'C']);

    const fullLit = result.literals.find((l) => l.name === 'FullLit')!;
    expect(fullLit.variants).toHaveLength(2);
  });

  test('should not cross-reference between kinds — model extends only models', () => {
    // Verify each kind resolves independently — an object named 'Base' does not interfere with a model named 'Base'
    const input = ast({
      models: [model('Base', [field('modelField')]), model('ModelChild', [field('mc')], { extends: 'Base' })],
      objects: [obj('Base', [field('objectField')]), obj('ObjectChild', [field('oc')], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const modelChild = result.models.find((m) => m.name === 'ModelChild')!;
    expect(modelChild.fields.map((f) => f.name)).toEqual(['modelField', 'mc']);

    const objectChild = result.objects.find((o) => o.name === 'ObjectChild')!;
    expect(objectChild.fields.map((f) => f.name)).toEqual(['objectField', 'oc']);
  });

  test('should handle all kinds with filters simultaneously', () => {
    const input = ast({
      models: [
        model('M', [field('a'), field('b'), field('c')]),
        model('MChild', [field('d')], { extends: 'M', extendsFilter: pick(['a', 'b']) }),
      ],
      objects: [
        obj('O', [field('x'), field('y'), field('z')]),
        obj('OChild', [field('w')], { extends: 'O', extendsFilter: omit(['z']) }),
      ],
      tuples: [
        tuple('T', [element('int', { name: 'a' }), element('float', { name: 'b' })]),
        tuple('TChild', [element('string')], { extends: 'T', extendsFilter: pick(['a']) }),
      ],
      enums: [enumDef('E', ['X', 'Y', 'Z']), enumDef('EChild', ['W'], { extends: 'E', extendsFilter: omit(['Z']) })],
      literals: [
        literal('L', [
          { kind: 'string', value: 'a' },
          { kind: 'string', value: 'b' },
        ]),
        literal('LChild', [{ kind: 'string', value: 'c' }], { extends: 'L', extendsFilter: pick(["'a'"]) }),
      ],
    });

    const result = resolveInheritance(input);

    expect(result.models.find((m) => m.name === 'MChild')!.fields.map((f) => f.name)).toEqual(['a', 'b', 'd']);
    expect(result.objects.find((o) => o.name === 'OChild')!.fields.map((f) => f.name)).toEqual(['x', 'y', 'w']);
    expect(result.tuples.find((t) => t.name === 'TChild')!.elements.map((e) => e.type)).toEqual(['int', 'string']);
    expect(result.enums.find((e) => e.name === 'EChild')!.values).toEqual(['X', 'Y', 'W']);
    expect(result.literals.find((l) => l.name === 'LChild')!.variants).toHaveLength(2);
  });

  test('should strip all extends/extendsFilter from all kinds', () => {
    const input = ast({
      models: [model('M', [field('a')]), model('MC', [], { extends: 'M', extendsFilter: pick(['a']) })],
      objects: [obj('O', [field('b')]), obj('OC', [], { extends: 'O', extendsFilter: omit([]) })],
      tuples: [tuple('T', [element('int')]), tuple('TC', [], { extends: 'T' })],
      enums: [enumDef('E', ['X']), enumDef('EC', [], { extends: 'E' })],
      literals: [literal('L', [{ kind: 'int', value: 1 }]), literal('LC', [], { extends: 'L' })],
    });

    const result = resolveInheritance(input);

    for (const m of result.models) {
      expect(m.extends).toBeUndefined();
      expect(m.extendsFilter).toBeUndefined();
    }
    for (const o of result.objects) {
      expect(o.extends).toBeUndefined();
      expect(o.extendsFilter).toBeUndefined();
    }
    for (const t of result.tuples) {
      expect(t.extends).toBeUndefined();
      expect(t.extendsFilter).toBeUndefined();
    }
    for (const e of result.enums) {
      expect(e.extends).toBeUndefined();
      expect(e.extendsFilter).toBeUndefined();
    }
    for (const l of result.literals) {
      expect(l.extends).toBeUndefined();
      expect(l.extendsFilter).toBeUndefined();
    }
  });

  test('should preserve range on all resolved types', () => {
    const customRange = { start: { line: 10, column: 5, offset: 100 }, end: { line: 20, column: 10, offset: 200 } };
    const input = ast({
      models: [model('Base', [field('a')]), model('Child', [field('b')], { extends: 'Base', range: customRange })],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.range).toEqual(customRange);
  });

  test('should handle all kinds with no extends — passthrough', () => {
    const input = ast({
      models: [model('M1', [field('a')]), model('M2', [field('b')])],
      objects: [obj('O1', [field('x')])],
      tuples: [tuple('T1', [element('int')])],
      enums: [enumDef('E1', ['A'])],
      literals: [literal('L1', [{ kind: 'string', value: 'x' }])],
    });

    const result = resolveInheritance(input);

    expect(result.models).toHaveLength(2);
    expect(result.objects).toHaveLength(1);
    expect(result.tuples).toHaveLength(1);
    expect(result.enums).toHaveLength(1);
    expect(result.literals).toHaveLength(1);
    // Verify content unchanged
    expect(result.models[0]!.fields.map((f) => f.name)).toEqual(['a']);
    expect(result.models[1]!.fields.map((f) => f.name)).toEqual(['b']);
  });

  test('should not mutate input AST across all kinds', () => {
    const inputModel = model('Base', [field('a', { isPrivate: true })]);
    const childModel = model('Child', [], { extends: 'Base' });
    const inputObj = obj('OBase', [field('x', { isPrivate: true })]);
    const childObj = obj('OChild', [], { extends: 'OBase' });
    const inputTuple = tuple('TBase', [element('int', { isPrivate: true })]);
    const childTuple = tuple('TChild', [], { extends: 'TBase' });
    const inputEnum = enumDef('EBase', ['A']);
    const childEnum = enumDef('EChild', ['B'], { extends: 'EBase' });
    const inputLit = literal('LBase', [{ kind: 'string', value: 'x' }]);
    const childLit = literal('LChild', [{ kind: 'string', value: 'y' }], { extends: 'LBase' });

    const input = ast({
      models: [inputModel, childModel],
      objects: [inputObj, childObj],
      tuples: [inputTuple, childTuple],
      enums: [inputEnum, childEnum],
      literals: [inputLit, childLit],
    });

    resolveInheritance(input);

    // Verify originals are untouched
    expect(inputModel.fields[0]!.isPrivate).toBe(true);
    expect(childModel.extends).toBe('Base');
    expect(inputObj.fields[0]!.isPrivate).toBe(true);
    expect(childObj.extends).toBe('OBase');
    expect(inputTuple.elements[0]!.isPrivate).toBe(true);
    expect(childTuple.extends).toBe('TBase');
    expect(childEnum.extends).toBe('EBase');
    expect(childLit.extends).toBe('LBase');
  });
});
