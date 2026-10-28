import { describe, expect, test } from 'bun:test';
import type { ASTDecorator } from '../../../../src/types';
import { parse } from '../../../../src/parser/parser';
import { parseDecorators } from '../../../../src/parser/types/model';
import {
  parseCreatedAtDecorator,
  parseDefaultAlwaysDecorator,
  parseDefaultDecorator,
  parseDistinctDecorator,
  parseFieldDecorator,
  parseGeometryDecorator,
  parseIdDecorator,
  parseKeyDecorator,
  parseNullableDecorator,
  parseOnDeleteDecorator,
  parseSortDecorator,
  parseUniqueDecorator,
  parseUuid7Decorator,
} from '../../../../src/parser/types/field-decorators';

// The handlers are called directly here, so this compares the registry-driven dispatch with the
// per-decorator functions it replaced rather than with itself.
describe('registry dispatch', () => {
  type Range = Parameters<typeof parseIdDecorator>[0];
  const cases: [string, (token: string, range: Range) => ASTDecorator][] = [
    ['@id', (_t, r) => parseIdDecorator(r)],
    ['@unique', (_t, r) => parseUniqueDecorator(r)],
    ['@distinct', (_t, r) => parseDistinctDecorator(r)],
    ['@nullable', (_t, r) => parseNullableDecorator(r)],
    ['@createdAt', (_t, r) => parseCreatedAtDecorator(r)],
    ['@default(1.5)', parseDefaultDecorator],
    ['@defaultAlways("x")', parseDefaultAlwaysDecorator],
    ['@field(authorId)', parseFieldDecorator],
    ['@key(author)', parseKeyDecorator],
    ['@onDelete(Cascade)', parseOnDeleteDecorator],
    ['@sort(desc)', parseSortDecorator],
    ['@uuid7', parseUuid7Decorator],
    ['@point', parseGeometryDecorator],
  ];

  for (const [token, handler] of cases) {
    test(`${token} yields the handler's node`, () => {
      const [node] = parseDecorators(`f String ${token}`, 1);
      expect(node).toBeDefined();
      expect(node).toEqual(handler(token, node!.range));
    });
  }

  test('a decorator with the wrong argument shape or an unknown name is ignored without an error', () => {
    for (const token of ['@id()', '@nullable(true)', '@nope', '@uuid7(x)']) {
      const errors: string[] = [];
      expect(parseDecorators(`f String ${token}`, 1, errors), token).toEqual([]);
      expect(errors, token).toEqual([]);
    }
  });

  test('tuple elements accept only the decorators whose targets include tupleElement', () => {
    const result = parse('tuple T {\n  Float @id @unique @nullable @default(1),\n  Int @createdAt @index @default\n}');
    const [a, b] = result.ast.tuples[0]!.elements;
    expect(a!.decorators?.map((d) => d.type)).toEqual(['nullable', 'default']);
    expect(b!.decorators?.map((d) => d.type)).toEqual(['createdAt']);
  });
});
