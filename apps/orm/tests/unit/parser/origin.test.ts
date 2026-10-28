/**
 * Unit Tests: dsl origin on parsed AST nodes
 *
 * parse() takes an optional file path; every node it builds carries it in origin.file,
 * and the placeholder '<input>' when it is omitted.
 */

import { describe, expect, test } from 'bun:test';
import { parse, parseWithLexer } from '../../../src/parser/parser';
import type { ASTDecorator, Origin } from '../../../src/types';

const PATH = '/schemas/app.cerial';

const SOURCE = `
enum Role { ADMIN, USER }
literal Status { 'on', 'off' }
object Address {
  city String
}
tuple Pair { Float, Float }
model User {
  id Record @id
  name String @unique
  role Role
  @@index(nameIdx, [name])
}
`;

function nodes(filePath?: string): { label: string; origin: Origin; line?: number }[] {
  const { ast, errors } = parse(SOURCE, undefined, undefined, undefined, undefined, filePath);
  expect(errors).toHaveLength(0);
  const model = ast.models[0]!;
  const field = model.fields.find((f) => f.name === 'name')!;
  const decorator = field.decorators.find((d) => d.type === 'unique') as ASTDecorator;
  const out = [
    { label: 'model', origin: model.origin, line: model.range.start.line },
    { label: 'object', origin: ast.objects[0]!.origin, line: ast.objects[0]!.range.start.line },
    { label: 'tuple', origin: ast.tuples[0]!.origin, line: ast.tuples[0]!.range.start.line },
    { label: 'literal', origin: ast.literals[0]!.origin, line: ast.literals[0]!.range.start.line },
    { label: 'enum', origin: ast.enums[0]!.origin, line: ast.enums[0]!.range.start.line },
    { label: 'field', origin: field.origin, line: field.range.start.line },
    { label: 'object field', origin: ast.objects[0]!.fields[0]!.origin },
    { label: 'decorator', origin: decorator.origin, line: decorator.range.start.line },
    { label: 'directive', origin: model.directives![0]!.origin, line: model.directives![0]!.range.start.line },
    { label: 'tuple element', origin: ast.tuples[0]!.elements[0]!.origin },
  ];

  return out;
}

describe('dsl origin from parse()', () => {
  test('every node kind carries the file path', () => {
    for (const { label, origin } of nodes(PATH)) {
      expect(origin.kind, label).toBe('dsl');
      expect(origin.file, label).toBe(PATH);
    }
  });

  test('omitting the path gives <input> on every node kind', () => {
    for (const { label, origin } of nodes()) expect(origin.file, label).toBe('<input>');
  });

  test('the origin range is the node range', () => {
    for (const { label, origin, line } of nodes(PATH)) {
      if (line === undefined) continue;
      if (origin.kind !== 'dsl') throw new Error('expected a dsl origin');
      expect(origin.range.start.line, label).toBe(line);
    }
  });

  test('tuple elements carry the file with the zero sentinel range', () => {
    const origin = nodes(PATH).find((n) => n.label === 'tuple element')!.origin;
    if (origin.kind !== 'dsl') throw new Error('expected a dsl origin');
    expect(origin.range.start).toEqual({ line: 0, column: 0, offset: 0 });
    expect(origin.range.end).toEqual({ line: 0, column: 0, offset: 0 });
  });

  test('the path does not leak into a later parse without one', () => {
    parse(SOURCE, undefined, undefined, undefined, undefined, PATH);
    const { ast } = parse(SOURCE);
    expect(ast.models[0]!.origin).toMatchObject({ file: '<input>' });
  });

  test('parseWithLexer stamps the path on models and fields', () => {
    const { ast } = parseWithLexer('model A {\n  name String\n}\n', PATH);
    expect(ast.models[0]!.origin).toMatchObject({ kind: 'dsl', file: PATH });
    expect(ast.models[0]!.fields[0]!.origin).toMatchObject({ kind: 'dsl', file: PATH });
    expect(parseWithLexer('model A {\n  name String\n}\n').ast.models[0]!.origin).toMatchObject({
      file: '<input>',
    });
  });
});
