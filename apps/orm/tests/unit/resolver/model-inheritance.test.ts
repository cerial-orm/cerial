/**
 * Unit Tests: Model Inheritance Resolution
 *
 * Tests resolveInheritance() for models:
 * - field merging, override, pick/omit, private stripping, abstract, directives
 */

import { describe, expect, test } from 'bun:test';
import { resolveInheritance } from '../../../src/resolver';
import type { ASTCompositeDirective, ASTDecorator } from '../../../src/types';
import { ast, dec, field, model, omit, pick, R } from './helpers';

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

  // ── Edge Cases ──

  test('should resolve 5-level deep chain with field accumulation', () => {
    const input = ast({
      models: [
        model('A', [field('a')]),
        model('B', [field('b')], { extends: 'A' }),
        model('C', [field('c')], { extends: 'B' }),
        model('D', [field('d')], { extends: 'C' }),
        model('E', [field('e')], { extends: 'D' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.models.find((m) => m.name === 'E')!;
    expect(e.fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(e.extends).toBeUndefined();
    // Intermediate levels should also be correctly resolved
    const d = result.models.find((m) => m.name === 'D')!;
    expect(d.fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd']);
    const c = result.models.find((m) => m.name === 'C')!;
    expect(c.fields.map((f) => f.name)).toEqual(['a', 'b', 'c']);
  });

  test('should override id field with different recordIdTypes', () => {
    const input = ast({
      models: [
        model('Base', [field('id', { type: 'record', recordIdTypes: undefined })]),
        model('Child', [field('id', { type: 'record', recordIdTypes: ['int'] })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields).toHaveLength(1);
    expect(child.fields[0]!.recordIdTypes).toEqual(['int']);
  });

  test('should override field changing isArray', () => {
    const input = ast({
      models: [
        model('Base', [field('tags', { type: 'string' })]),
        model('Child', [field('tags', { type: 'string', isArray: true })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.name).toBe('tags');
    expect(child.fields[0]!.isArray).toBe(true);
  });

  test('should ensure multiple children extending same parent are independent', () => {
    const baseFields = [field('id'), field('name'), field('email')];
    const input = ast({
      models: [
        model('Base', baseFields),
        model('A', [field('a')], { extends: 'Base', extendsFilter: pick(['id', 'name']) }),
        model('B', [field('b')], { extends: 'Base', extendsFilter: omit(['email']) }),
        model('C', [field('name', { type: 'int' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const a = result.models.find((m) => m.name === 'A')!;
    const b = result.models.find((m) => m.name === 'B')!;
    const c = result.models.find((m) => m.name === 'C')!;

    expect(a.fields.map((f) => f.name)).toEqual(['id', 'name', 'a']);
    expect(b.fields.map((f) => f.name)).toEqual(['id', 'name', 'b']);
    expect(c.fields.map((f) => f.name)).toEqual(['id', 'email', 'name']);
    // Child C overrides name to int — verify type
    expect(c.fields.find((f) => f.name === 'name')!.type).toBe('int');
    // Child A still has name as string
    expect(a.fields.find((f) => f.name === 'name')!.type).toBe('string');
  });

  test('should inherit objectName field reference', () => {
    const input = ast({
      models: [
        model('Base', [field('address', { type: 'object', objectName: 'Address' })]),
        model('Child', [field('extra')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.objectName).toBe('Address');
    expect(child.fields[0]!.type).toBe('object');
  });

  test('should inherit tupleName field reference', () => {
    const input = ast({
      models: [
        model('Base', [field('coords', { type: 'tuple', tupleName: 'Coordinate' })]),
        model('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.tupleName).toBe('Coordinate');
  });

  test('should inherit literalName field reference', () => {
    const input = ast({
      models: [
        model('Base', [field('status', { type: 'literal', literalName: 'Status' })]),
        model('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.literalName).toBe('Status');
  });

  test('should handle empty parent model — child only has own fields', () => {
    const input = ast({
      models: [model('Empty', []), model('Child', [field('name')], { extends: 'Empty' })],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['name']);
  });

  test('should apply pick filter then override the picked field', () => {
    const input = ast({
      models: [
        model('Base', [field('id'), field('name'), field('email')]),
        model('Slim', [field('name', { type: 'int' })], {
          extends: 'Base',
          extendsFilter: pick(['id', 'name']),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const slim = result.models.find((m) => m.name === 'Slim')!;
    expect(slim.fields.map((f) => f.name)).toEqual(['id', 'name']);
    expect(slim.fields.find((f) => f.name === 'name')!.type).toBe('int');
  });

  test('should omit all parent fields and only have own fields', () => {
    const input = ast({
      models: [
        model('Base', [field('a'), field('b'), field('c')]),
        model('Fresh', [field('x'), field('y')], {
          extends: 'Base',
          extendsFilter: omit(['a', 'b', 'c']),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const fresh = result.models.find((m) => m.name === 'Fresh')!;
    expect(fresh.fields.map((f) => f.name)).toEqual(['x', 'y']);
  });

  test('should propagate filters through chain — pick at middle level', () => {
    const input = ast({
      models: [
        model('A', [field('a1'), field('a2'), field('a3')]),
        model('B', [field('b1')], { extends: 'A', extendsFilter: pick(['a1', 'a2']) }),
        model('C', [field('c1')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    // B should have: a1, a2, b1
    const b = result.models.find((m) => m.name === 'B')!;
    expect(b.fields.map((f) => f.name)).toEqual(['a1', 'a2', 'b1']);
    // C inherits from resolved B (a1, a2, b1) + c1
    const c = result.models.find((m) => m.name === 'C')!;
    expect(c.fields.map((f) => f.name)).toEqual(['a1', 'a2', 'b1', 'c1']);
  });

  test('should preserve field ordering — parent non-overridden first, then child', () => {
    const input = ast({
      models: [
        model('Base', [field('a'), field('b'), field('c')]),
        model('Child', [field('b', { type: 'int' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    // parent non-overridden (a, c) come first, then child's fields (b override)
    expect(child.fields.map((f) => f.name)).toEqual(['a', 'c', 'b']);
    expect(child.fields[2]!.type).toBe('int');
  });

  test('should preserve isNullable through inheritance', () => {
    const input = ast({
      models: [
        model('Base', [field('email', { isNullable: true, decorators: [dec('nullable')] })]),
        model('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.isNullable).toBe(true);
    expect(child.fields[0]!.decorators[0]!.type).toBe('nullable');
  });

  test('should preserve recordIdTypes through inheritance', () => {
    const input = ast({
      models: [
        model('Base', [field('id', { type: 'record', recordIdTypes: ['string', 'int'] })]),
        model('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.recordIdTypes).toEqual(['string', 'int']);
  });

  test('should handle chain where middle level overrides — grandchild inherits override', () => {
    const input = ast({
      models: [
        model('A', [field('x', { type: 'string' }), field('y')]),
        model('B', [field('x', { type: 'int' })], { extends: 'A' }),
        model('C', [field('z')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const c = result.models.find((m) => m.name === 'C')!;
    // C should get x as int (B's override), y from A, z from C
    expect(c.fields.find((f) => f.name === 'x')!.type).toBe('int');
    expect(c.fields.map((f) => f.name)).toEqual(['y', 'x', 'z']);
  });

  test('should strip private through 5-level chain', () => {
    const input = ast({
      models: [
        model('L1', [field('priv1', { isPrivate: true }), field('pub1')]),
        model('L2', [field('priv2', { isPrivate: true })], { extends: 'L1' }),
        model('L3', [], { extends: 'L2' }),
        model('L4', [field('priv4', { isPrivate: true })], { extends: 'L3' }),
        model('L5', [], { extends: 'L4' }),
      ],
    });
    const result = resolveInheritance(input);

    const l5 = result.models.find((m) => m.name === 'L5')!;
    expect(l5.fields.every((f) => f.isPrivate === undefined)).toBe(true);
    expect(l5.fields.map((f) => f.name)).toEqual(['priv1', 'pub1', 'priv2', 'priv4']);
  });

  test('should NOT inherit abstract flag from parent', () => {
    const input = ast({
      models: [model('Base', [field('id')], { abstract: true }), model('Child', [field('name')], { extends: 'Base' })],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.abstract).toBeUndefined();
  });

  test('should handle abstract child extending abstract parent', () => {
    const input = ast({
      models: [
        model('A', [field('a')], { abstract: true }),
        model('B', [field('b')], { extends: 'A', abstract: true }),
        model('C', [field('c')], { extends: 'B' }),
      ],
    });
    const result = resolveInheritance(input);

    const b = result.models.find((m) => m.name === 'B')!;
    expect(b.abstract).toBe(true);
    expect(b.fields.map((f) => f.name)).toEqual(['a', 'b']);

    const c = result.models.find((m) => m.name === 'C')!;
    expect(c.abstract).toBeUndefined();
    expect(c.fields.map((f) => f.name)).toEqual(['a', 'b', 'c']);
  });

  test('should handle omit filter at intermediate and pick at final level', () => {
    const input = ast({
      models: [
        model('Root', [field('a'), field('b'), field('c'), field('d')]),
        model('Mid', [field('e')], { extends: 'Root', extendsFilter: omit(['c', 'd']) }),
        model('Leaf', [field('f')], { extends: 'Mid', extendsFilter: pick(['a', 'e']) }),
      ],
    });
    const result = resolveInheritance(input);

    const leaf = result.models.find((m) => m.name === 'Leaf')!;
    expect(leaf.fields.map((f) => f.name)).toEqual(['a', 'e', 'f']);
  });

  test('should handle overriding multiple fields from parent', () => {
    const input = ast({
      models: [
        model('Base', [field('a', { type: 'string' }), field('b', { type: 'string' }), field('c', { type: 'string' })]),
        model('Child', [field('a', { type: 'int' }), field('c', { type: 'float' })], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['b', 'a', 'c']);
    expect(child.fields.find((f) => f.name === 'a')!.type).toBe('int');
    expect(child.fields.find((f) => f.name === 'b')!.type).toBe('string');
    expect(child.fields.find((f) => f.name === 'c')!.type).toBe('float');
  });

  test('should handle multiple decorators preserved through inheritance', () => {
    const input = ast({
      models: [
        model('Base', [
          field('email', { decorators: [dec('unique'), dec('createdAt')] }),
          field('score', {
            type: 'int',
            decorators: [{ type: 'default' as ASTDecorator['type'], value: 0, range: R }],
          }),
        ]),
        model('Child', [field('name')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields[0]!.decorators).toHaveLength(2);
    expect(child.fields[1]!.decorators).toHaveLength(1);
    expect(child.fields[1]!.decorators[0]!.value).toBe(0);
  });

  test('should handle pick with empty result from parent plus child fields', () => {
    // Pick fields that exist but leave no non-overridden fields
    const input = ast({
      models: [
        model('Base', [field('a'), field('b')]),
        model('Child', [field('a', { type: 'int' }), field('b', { type: 'int' })], {
          extends: 'Base',
          extendsFilter: pick(['a', 'b']),
        }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    // All parent fields overridden — only child versions remain
    expect(child.fields).toHaveLength(2);
    expect(child.fields.every((f) => f.type === 'int')).toBe(true);
  });

  test('should handle parent with isArray fields inherited correctly', () => {
    const input = ast({
      models: [
        model('Base', [
          field('tags', { type: 'string', isArray: true }),
          field('scores', { type: 'int', isArray: true }),
          field('name'),
        ]),
        model('Child', [field('extra')], { extends: 'Base' }),
      ],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields.find((f) => f.name === 'tags')!.isArray).toBe(true);
    expect(child.fields.find((f) => f.name === 'scores')!.isArray).toBe(true);
    expect(child.fields.find((f) => f.name === 'name')!.isArray).toBeUndefined();
  });

  test('should handle 5-level chain declared in reverse order', () => {
    const input = ast({
      models: [
        model('E', [field('e')], { extends: 'D' }),
        model('C', [field('c')], { extends: 'B' }),
        model('A', [field('a')]),
        model('D', [field('d')], { extends: 'C' }),
        model('B', [field('b')], { extends: 'A' }),
      ],
    });
    const result = resolveInheritance(input);

    const e = result.models.find((m) => m.name === 'E')!;
    expect(e.fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  test('should handle parent not found gracefully (cross-schema reference)', () => {
    const input = ast({
      models: [model('Child', [field('name')], { extends: 'NonExistent' })],
    });
    const result = resolveInheritance(input);

    const child = result.models.find((m) => m.name === 'Child')!;
    expect(child.fields.map((f) => f.name)).toEqual(['name']);
  });
});
