import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { enum as enum_, enumNode, literal, variant } from '../../../../src/parser/builder';
import type { SimpleLiteralReference } from '../../../../src/parser/builder';
import { resolveInheritance } from '../../../../src/resolver/inheritance-resolver';
import { validateExtends } from '../../../../src/cli/validators/extends-validator';
import { parse } from '../../../../src/parser/parser';
import { withoutPosition } from './helpers';

const Role = enum_('ExtBaseRole', ['ADMIN', 'USER', 'MODERATOR']);
const Status = enum_('ExtBaseStatus', ['ACTIVE', 'INACTIVE', 'PENDING']);

describe('enum extends', () => {
  test('pick and omit write the values in order, and a plain extends writes no filter key', () => {
    const picked = enumNode(enum_('P', [], { extends: Role.pick('USER', 'ADMIN') }));
    const omitted = enumNode(enum_('O', [], { extends: Role.omit('ADMIN') }));
    const plain = enumNode(enum_('Plain', ['EXTRA'], { extends: Role }));

    expect(picked.extendsFilter).toEqual({ mode: 'pick', fields: ['USER', 'ADMIN'] });
    expect(omitted.extendsFilter).toEqual({ mode: 'omit', fields: ['ADMIN'] });
    expect(plain.extends).toBe('ExtBaseRole');
    expect('extendsFilter' in plain).toBe(false);
    expect('extends' in enumNode(Role)).toBe(false);
  });

  test('the corpus twin: every enum in features/extends-enum.cerial, raw and resolved', () => {
    const ast = parse(readFileSync('tests/e2e/schemas/features/extends-enum.cerial', 'utf8')).ast;
    const built = [
      enumNode(Role),
      enumNode(enum_('ExtExtendedRole', ['SUPERADMIN', 'GUEST'], { extends: Role })),
      enumNode(enum_('ExtCoreRole', [], { extends: Role.pick('ADMIN', 'USER') })),
      enumNode(enum_('ExtNonAdminRole', [], { extends: Role.omit('ADMIN') })),
      enumNode(enum_('ExtCustomRole', ['ADMIN', 'USER', 'MODERATOR', 'CUSTOM'], { extends: Role })),
      enumNode(Status),
      enumNode(enum_('ExtDetailedStatus', ['ARCHIVED', 'DELETED', 'SUSPENDED'], { extends: Status })),
      enumNode(enum_('ExtSimpleStatus', [], { extends: Status.pick('ACTIVE', 'INACTIVE') })),
    ];
    const twin = { ...ast, enums: built };

    expect(withoutPosition(built)).toEqual(withoutPosition(ast.enums));
    expect(withoutPosition(resolveInheritance(twin).enums)).toEqual(withoutPosition(resolveInheritance(ast).enums));
    expect(validateExtends(twin).filter((error) => /Role|Status/.test(error.message))).toEqual([]);
  });

  test('a child of a child sees the middle enum, filtered', () => {
    const Mid = enum_('Mid', ['EXTRA'], { extends: Role.pick('ADMIN') });
    const Leaf = enum_('Leaf', [], { extends: Mid.omit('EXTRA') });
    const ast = parse('').ast;
    const resolved = resolveInheritance({ ...ast, enums: [enumNode(Role), enumNode(Mid), enumNode(Leaf)] });

    expect(resolved.enums[2]!.values).toEqual(['ADMIN']);
  });

  test('an unknown value is a compile error, and the resolver refuses it when it gets past', () => {
    // @ts-expect-error ExtBaseRole declares no GUEST
    const bad = enum_('Bad', [], { extends: Role.pick('GUEST') });
    const ast = parse('').ast;

    expect(() => resolveInheritance({ ...ast, enums: [enumNode(Role), enumNode(bad)] })).toThrow(/GUEST/);
  });

  test('the parent must be an enum handle', () => {
    const Mixed = literal('Mixed', [variant.string('A')]);
    // @ts-expect-error -- a literal handle is not an enum handle; the build refuses it too
    const wrong = enum_('Bad', [], { extends: Mixed });

    expect(() => enumNode(wrong)).toThrow(/takes an enum handle/);
  });

  test('a clause cannot carry both modes', () => {
    // @ts-expect-error a filtered reference has neither method
    expect(() => Role.pick('ADMIN').omit('USER')).toThrow();
  });

  test('a child enum stays simple, filtered or not', () => {
    const refs: SimpleLiteralReference[] = [
      enum_('A', ['X'], { extends: Role }),
      enum_('B', [], { extends: Role.omit('USER') }),
    ];

    expect(refs).toHaveLength(2);
  });
});
