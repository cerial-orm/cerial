/**
 * Unit Tests: Inheritance Resolver
 *
 * Tests resolveInheritance() for all 5 type kinds:
 * - Models: field merging, override, pick/omit, private stripping, abstract, directives
 * - Objects: field merging, override, pick/omit, private stripping
 * - Tuples: element appending, named override, pick/omit, private stripping
 * - Enums: value merging, deduplication, pick/omit
 * - Literals: variant merging, deduplication, pick/omit
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import type {
  ASTCompositeDirective,
  ASTDecorator,
  ASTEnum,
  ASTField,
  ASTLiteral,
  ASTLiteralVariant,
  ASTModel,
  ASTObject,
  ASTTuple,
  ASTTupleElement,
  ExtendsFilter,
  SchemaAST,
} from '../../../src/types';

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

const R = { start: { line: 1, column: 1, offset: 0 }, end: { line: 1, column: 1, offset: 0 } };

function field(name: string, opts?: Partial<ASTField>): ASTField {
  return { name, type: 'string', isOptional: false, decorators: [], range: R, ...opts };
}

function element(type: string, opts?: Partial<ASTTupleElement>): ASTTupleElement {
  return { type: type as ASTTupleElement['type'], isOptional: false, ...opts };
}

function dec(type: string): ASTDecorator {
  return { type: type as ASTDecorator['type'], range: R };
}

function model(name: string, fields: ASTField[], opts?: Partial<ASTModel>): ASTModel {
  return { name, fields, range: R, ...opts };
}

function obj(name: string, fields: ASTField[], opts?: Partial<ASTObject>): ASTObject {
  return { name, fields, range: R, ...opts };
}

function tuple(name: string, elements: ASTTupleElement[], opts?: Partial<ASTTuple>): ASTTuple {
  return { name, elements, range: R, ...opts };
}

function enumDef(name: string, values: string[], opts?: Partial<ASTEnum>): ASTEnum {
  return { name, values, range: R, ...opts };
}

function literal(name: string, variants: ASTLiteralVariant[], opts?: Partial<ASTLiteral>): ASTLiteral {
  return { name, variants, range: R, ...opts };
}

function ast(overrides?: Partial<SchemaAST>): SchemaAST {
  return {
    models: [],
    objects: [],
    tuples: [],
    literals: [],
    enums: [],
    source: '',
    ...overrides,
  };
}

const pick = (fields: string[]): ExtendsFilter => ({ mode: 'pick', fields });
const omit = (fields: string[]): ExtendsFilter => ({ mode: 'omit', fields });

// ──────────────────────────────────────────────
// A. Model Resolution
// ──────────────────────────────────────────────

describe('resolveInheritance - models', () => {
  test('should pass through models with no extends', () => {
    const input = ast({
      models: [model('User', [field('id'), field('name')])],
    });
    const result = resolveInheritance(input);

    expect(result.models).toHaveLength(1);
    expect(result.models[0]!.name).toBe('User');
    expect(result.models[0]!.fields.map((f) => f.name)).toEqual(['id', 'name']);
  });

  test('should inherit all parent fields', () => {
    const input = ast({
      models: [model('Base', [field('id'), field('createdAt')]), model('User', [field('name')], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.fields.map((f) => f.name)).toEqual(['id', 'createdAt', 'name']);
  });

  test('should override parent field when child redefines it', () => {
    const input = ast({
      models: [
        model('Base', [field('id', { type: 'int' }), field('name')]),
        model('User', [field('id', { type: 'string' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.fields).toHaveLength(2);
    expect(user.fields[0]!.name).toBe('name'); // parent's non-overridden
    expect(user.fields[1]!.name).toBe('id'); // child's override
    expect(user.fields[1]!.type).toBe('string'); // child wins
  });

  test('should override optional field with required', () => {
    const input = ast({
      models: [
        model('Base', [field('email', { isOptional: true })]),
        model('User', [field('email', { isOptional: false })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.fields[0]!.isOptional).toBe(false);
  });

  test('should override parent decorators with child decorators', () => {
    const input = ast({
      models: [
        model('Base', [field('name', { decorators: [dec('unique')] })]),
        model('User', [field('name', { decorators: [dec('createdAt')] })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.fields[0]!.decorators).toHaveLength(1);
    expect(user.fields[0]!.decorators[0]!.type).toBe('createdAt');
  });

  test('should resolve multi-level chain (3 deep)', () => {
    const input = ast({
      models: [
        model('A', [field('a')]),
        model('B', [field('b')], { extends: 'A' }),
        model('C', [field('c')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const c = result.models.find((m) => m.name === 'C')!;
    expect(c.fields.map((f) => f.name)).toEqual(['a', 'b', 'c']);
  });

  test('should resolve multi-level chain (4 deep)', () => {
    const input = ast({
      models: [
        model('L1', [field('f1')]),
        model('L2', [field('f2')], { extends: 'L1' }),
        model('L3', [field('f3')], { extends: 'L2' }),
        model('L4', [field('f4')], { extends: 'L3' }),
      ],
    });
    const result = resolveInheritance(input);

    const l4 = result.models.find((m) => m.name === 'L4')!;
    expect(l4.fields.map((f) => f.name)).toEqual(['f1', 'f2', 'f3', 'f4']);
  });

  test('should apply pick filter', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('name'), field('email'), field('age')]),
        model('Slim', [field('extra')], { extends: 'Base', extendsFilter: pick(['id', 'name']) }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.models.find((m) => m.name === 'Slim')!;
    expect(slim.fields.map((f) => f.name)).toEqual(['id', 'name', 'extra']);
  });

  test('should apply omit filter', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('name'), field('email'), field('age')]),
        model('NoEmail', [field('extra')], { extends: 'Base', extendsFilter: omit(['email', 'age']) }),
      ],
    });
    const result = resolveInheritance(input);

    const noEmail = result.models.find((m) => m.name === 'NoEmail')!;
    expect(noEmail.fields.map((f) => f.name)).toEqual(['id', 'name', 'extra']);
  });

  test('should strip isPrivate from inherited fields', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('secret', { isPrivate: true })]),
        model('User', [], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.fields[1]!.name).toBe('secret');
    expect(user.fields[1]!.isPrivate).toBeUndefined();
  });

  test('should strip isPrivate from own fields on base model', () => {
    const input = ast({
      models: [model('Base', [field('id'), field('secret', { isPrivate: true })])],
    });
    const result = resolveInheritance(input);

    expect(result.models[0]!.fields[1]!.isPrivate).toBeUndefined();
  });

  test('should strip isPrivate from child override fields', () => {
    const input = ast({
      models: [model('Base', [field('f')]), model('Child', [field('priv', { isPrivate: true })], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    const priv = child.fields.find((f) => f.name === 'priv')!;
    expect(priv.isPrivate).toBeUndefined();
  });

  test('should preserve abstract flag', () => {
    const input = ast({
      models: [model('Base', [field('id')], { abstract: true })],
    });
    const result = resolveInheritance(input);

    expect(result.models[0]!.abstract).toBe(true);
  });

  test('should NOT inherit directives from parent', () => {
    const directive: ASTCompositeDirective = { kind: 'index', name: 'idx_email', fields: ['email'], range: R };
    const input = ast({
      models: [
        model('Base', [field('id'), field('email')], { directives: [directive] }),
        model('User', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.directives).toBeUndefined();
  });

  test('should preserve child directives', () => {
    const directive: ASTCompositeDirective = { kind: 'unique', name: 'unq_name', fields: ['name'], range: R };
    const input = ast({
      models: [
        model('Base', [field('id')]),
        model('User', [field('name')], { extends: 'Base', directives: [directive] }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.directives).toHaveLength(1);
    expect(user.directives![0]!.name).toBe('unq_name');
  });

  test('should strip extends and extendsFilter from resolved model', () => {
    const input = ast({
      models: [
        model('Base', [field('id')]),
        model('User', [field('name')], { extends: 'Base', extendsFilter: pick(['id']) }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.extends).toBeUndefined();
    expect(user.extendsFilter).toBeUndefined();
  });

  test('should handle multiple models, some extending some not', () => {
    const input = ast({
      models: [
        model('Base', [field('id')]),
        model('User', [field('name')], { extends: 'Base' }),
        model('Post', [field('title')]),
      ],
    });
    const result = resolveInheritance(input);

    expect(result.models).toHaveLength(3);
    const user = result.models.find((m) => m.name === 'User')!;
    const post = result.models.find((m) => m.name === 'Post')!;
    expect(user.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(post.fields.map((f) => f.name)).toEqual(['title']);
  });

  test('should handle diamond inheritance (two children from same parent)', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('name')]),
        model('A', [field('a')], { extends: 'Base' }),
        model('B', [field('b')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const a = result.models.find((m) => m.name === 'A')!;
    const b = result.models.find((m) => m.name === 'B')!;
    expect(a.fields.map((f) => f.name)).toEqual(['id', 'name', 'a']);
    expect(b.fields.map((f) => f.name)).toEqual(['id', 'name', 'b']);
  });

  test('should handle pick filter with child override', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('name'), field('email')]),
        model('Slim', [field('name', { type: 'email' })], {
          extends: 'Base',
          extendsFilter: pick(['id', 'name']),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.models.find((m) => m.name === 'Slim')!;
    expect(slim.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(slim.fields.find((f) => f.name === 'name')!.type).toBe('email');
  });

  test('should handle omit filter with child override', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('name'), field('email')]),
        model('NoEmail', [field('name', { type: 'email' })], {
          extends: 'Base',
          extendsFilter: omit(['email']),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const noEmail = result.models.find((m) => m.name === 'NoEmail')!;
    expect(noEmail.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(noEmail.fields.find((f) => f.name === 'name')!.type).toBe('email');
  });

  test('should not mutate input AST', () => {
    const base = model('Base', [field('id'), field('name', { isPrivate: true })]);
    const child = model('Child', [field('extra')], { extends: 'Base' });
    const input = ast({ models: [base, child] });

    resolveInheritance(input);

    // Original unchanged
    expect(input.models[0]!.fields[1]!.isPrivate).toBe(true);
    expect(input.models[1]!.extends).toBe('Base');
  });

  test('should preserve field properties through inheritance', () => {
    const input = ast({
      models: [
        model('Base', [
          field('id', { type: 'record', isOptional: false, objectName: undefined }),
          field('tags', { type: 'string', isArray: true }),
          field('addr', { type: 'object', objectName: 'Address' }),
        ]),
        model('User', [], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const user = result.models.find((m) => m.name === 'User')!;
    expect(user.fields[1]!.isArray).toBe(true);
    expect(user.fields[2]!.objectName).toBe('Address');
  });

  test('should handle models declared in reverse order', () => {
    const input = ast({
      models: [model('Child', [field('name')], { extends: 'Base' }), model('Base', [field('id')])],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['id', 'name']);
  });

  test('should handle multi-level chain with filter at intermediate level', () => {
    const input = ast({
      models: [
        model('L1', [field('a'), field('b'), field('c')]),
        model('L2', [field('d')], { extends: 'L1', extendsFilter: pick(['a', 'b']) }),
        model('L3', [field('e')], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.models.find((m) => m.name === 'L3')!;
    expect(l3.fields.map((f) => f.name)).toEqual(['a', 'b', 'd', 'e']);
  });

  test('should handle private fields inherited through multi-level chain', () => {
    const input = ast({
      models: [
        model('L1', [field('pub'), field('priv', { isPrivate: true })]),
        model('L2', [field('l2')], { extends: 'L1' }),
        model('L3', [field('l3')], { extends: 'L2' }),
      ],
    });
    const result = resolveInheritance(input);

    const l3 = result.models.find((m) => m.name === 'L3')!;
    expect(l3.fields.map((f) => f.name)).toEqual(['pub', 'priv', 'l2', 'l3']);
    // All private markers stripped
    expect(l3.fields.every((f) => f.isPrivate === undefined)).toBe(true);
  });

  test('should handle empty child model (inherits everything)', () => {
    const input = ast({
      models: [model('Base', [field('id'), field('name'), field('email')]), model('Clone', [], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const clone = result.models.find((m) => m.name === 'Clone')!;
    expect(clone.fields.map((f) => f.name)).toEqual(['id', 'name', 'email']);
  });

  test('should override with different field type', () => {
    const input = ast({
      models: [
        model('Base', [field('value', { type: 'int' })]),
        model('Child', [field('value', { type: 'float' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.type).toBe('float');
  });
});

// ──────────────────────────────────────────────
// B. Object Resolution
// ──────────────────────────────────────────────

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
});

// ──────────────────────────────────────────────
// C. Tuple Resolution
// ──────────────────────────────────────────────

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
});

// ──────────────────────────────────────────────
// D. Enum Resolution
// ──────────────────────────────────────────────

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
});

// ──────────────────────────────────────────────
// E. Literal Resolution
// ──────────────────────────────────────────────

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
});

// ──────────────────────────────────────────────
// F. Cross-kind (full AST)
// ──────────────────────────────────────────────

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
});
