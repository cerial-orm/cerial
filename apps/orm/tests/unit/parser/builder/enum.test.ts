import { describe, expect, test } from 'bun:test';
import { enumNode, enumeration } from '../../../../src/parser/builder/enum';
import { f, fieldNode } from '../../../../src/parser/builder/field';
import { literal, literalNode, variant } from '../../../../src/parser/builder/literal';
import type { LiteralHandle, SimpleLiteralReference } from '../../../../src/parser/builder/literal';
import { parse } from '../../../../src/parser/parser';
import { withoutPosition } from './helpers';

function parsedEnum(source: string) {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast.enums[0]!;
}

describe('enum builder', () => {
  test('matches the parser, key for key', () => {
    const built = enumNode(enumeration('Role', ['ADMIN', 'USER', 'GUEST']));

    expect(withoutPosition(built)).toEqual(withoutPosition(parsedEnum('enum Role {\n  ADMIN\n  USER\n  GUEST\n}\n')));
  });

  test('an empty enum matches the parser', () => {
    expect(withoutPosition(enumNode(enumeration('Empty', [])))).toEqual(
      withoutPosition(parsedEnum('enum Empty {\n}\n')),
    );
  });

  test('does not write extends keys the parser omits', () => {
    const built = enumNode(enumeration('Role', ['A']));

    expect('extends' in built).toBe(false);
    expect('extendsFilter' in built).toBe(false);
  });

  test('a field typed by an enum matches the parser, by handle, thunk and name', () => {
    const Role = enumeration('Role', ['A']);
    const { ast } = parse('enum Role {\n  A\n}\nmodel M {\n  x Role\n}\n');
    const expected = withoutPosition(ast.models[0]!.fields[0]);

    expect(withoutPosition(fieldNode(f.enum(Role), 'x'))).toEqual(expected);
    expect(
      withoutPosition(
        fieldNode(
          f.enum(() => Role),
          'x',
        ),
      ),
    ).toEqual(expected);
    expect(withoutPosition(fieldNode(f.enum('Role'), 'x'))).toEqual(expected);
  });

  test('f.enum and f.literal give the same node for the same name', () => {
    expect(withoutPosition(fieldNode(f.enum('Role'), 'x'))).toEqual(withoutPosition(fieldNode(f.literal('Role'), 'x')));
  });

  test('an enum is a simple literal handle and a literal can reference it', () => {
    const Role = enumeration('Role', ['A']);
    const simple: LiteralHandle<'Role', true> = Role;
    const ref: SimpleLiteralReference = Role;
    const node = literalNode(literal('Wrap', [variant.literal(Role)]));

    expect(simple.name).toBe('Role');
    expect(ref).toBe(Role);
    expect(node.variants).toEqual([{ kind: 'literalRef', literalName: 'Role' }]);
  });

  test('rejects a value that is not a bare identifier', () => {
    for (const bad of ["'ADMIN'", '1abc', 'a b', '', 'a-b', 'true', 'false']) {
      expect(() => enumeration('Role', [bad])).toThrow(/valid identifiers/);
    }
  });

  test('numeric and boolean values are compile errors', () => {
    // @ts-expect-error numbers are not enum values; mixed types mean a literal
    expect(() => enumeration('N', [1, 2])).toThrow();
    // @ts-expect-error booleans are not enum values
    expect(() => enumeration('B', [true])).toThrow();
  });

  test('a literal handle is not an enum handle', () => {
    const L = literal('L', []);

    expect(() => enumNode(L)).toThrow(/Not an enum handle/);
  });
});
