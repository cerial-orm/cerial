import { describe, expect, test } from 'bun:test';
import { e, tuple, tupleNode } from '../../../../src/parser/builder/tuple';
import { f } from '../../../../src/parser/builder';
import { object } from '../../../../src/parser/builder/object';
import { literal, variant } from '../../../../src/parser/builder/literal';
import { validateTuples } from '../../../../src/cli/validators/tuple-validator';
import {
  validateNoOptionalTupleElements,
  validateNullableOnTupleElements,
} from '../../../../src/cli/validators/nullable-validator';
import { applyElementFilter } from '../../../../src/resolver';
import { FIELD_TYPE_REGISTRY } from '../../../../src/parser/registry';
import { parse } from '../../../../src/parser/parser';
import { createSchemaAST } from '../../../../src/parser/types/ast';
import type { ASTTuple } from '../../../../src/types';
import { withoutPosition } from './helpers';

/** The nodes `parse()` gives for a schema of tuples */
function parsedTuples(source: string): ASTTuple[] {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast.tuples;
}

function expectSame(built: ASTTuple, source: string, index = 0): void {
  expect(withoutPosition(built)).toEqual(withoutPosition(parsedTuples(source)[index]));
}

/** What the validators that gate tuple elements report for the built node */
function validationMessages(...tuples: ASTTuple[]): string[] {
  const ast = createSchemaAST([], '', [], tuples);

  return [...validateTuples(ast), ...validateNoOptionalTupleElements(ast), ...validateNullableOnTupleElements(ast)].map(
    (error) => error.message,
  );
}

const SIMPLE = [...FIELD_TYPE_REGISTRY.values()].filter(
  (entry) => entry.fieldType !== 'record' && entry.fieldType !== 'relation',
);

describe('tuple builder', () => {
  test('returns a handle carrying only the name', () => {
    const Point = tuple('Point', [e.float(), e.float()]);

    expect(Point.name).toBe('Point');
    expect(Object.keys(Point)).toEqual(['name']);
  });

  test('refuses a value that is not a tuple handle', () => {
    expect(() => tupleNode({ name: 'Point' })).toThrow('Not a tuple handle');
  });

  test('has one element factory per built-in type except record and relation, plus the references', () => {
    expect(Object.keys(e).sort()).toEqual(
      [...SIMPLE.map((entry) => entry.fieldType), 'literal', 'object', 'self', 'tuple'].sort(),
    );
  });

  describe('positional and named forms', () => {
    test('positional elements match the parser and carry no name', () => {
      const node = tupleNode(tuple('Point', [e.float(), e.float()]));

      expectSame(node, 'tuple Point {\n  Float,\n  Float\n}\n');
      expect(node.elements.map((element) => 'name' in element)).toEqual([false, false]);
    });

    test('named elements match the parser and keep key order', () => {
      const node = tupleNode(tuple('Coord', { x: e.float(), y: e.float(), label: e.string() }));

      expectSame(node, 'tuple Coord {\n  x Float,\n  y Float,\n  label String\n}\n');
      expect(node.elements.map((element) => element.name)).toEqual(['x', 'y', 'label']);
    });

    test('a named element is picked by name and by index, as the resolver does', () => {
      const { elements } = tupleNode(tuple('Coord', { x: e.float(), y: e.float(), z: e.float() }));
      const pick = (...fields: string[]) =>
        applyElementFilter(elements, { mode: 'pick', fields }, 'Coord').map((element) => element.name);

      expect(pick('x', '2')).toEqual(['x', 'z']);
    });

    test('elements of different types match the parser', () => {
      expectSame(tupleNode(tuple('Mixed', [e.float(), e.string()])), 'tuple Mixed {\n  Float,\n  String\n}\n');
    });
  });

  describe('element types', () => {
    test.each(SIMPLE.map((entry) => [entry.name, entry.fieldType] as const))('%s matches the parser', (name, type) => {
      const make = e[type as keyof typeof e] as () => object;

      expectSame(tupleNode(tuple('T', [make() as never])), `tuple T {\n  ${name}\n}\n`);
    });

    test('an object, a tuple and a literal element match the parser through all three reference forms', () => {
      const Address = object('Address', { city: f.string() });
      const Point = tuple('Point', [e.float()]);
      const Status = literal('Status', [variant.string('a'), variant.string('b')]);
      const source =
        'object Address {\n  city String\n}\ntuple Point {\n  Float\n}\nliteral Status {\n  "a",\n  "b"\n}\n' +
        'tuple T {\n  Address,\n  Point,\n  Status\n}\n';

      const byHandle = tupleNode(tuple('T', [e.object(Address), e.tuple(Point), e.literal(Status)]));
      const byThunk = tupleNode(tuple('T', [e.object(() => Address), e.tuple(() => Point), e.literal(() => Status)]));
      const byName = tupleNode(tuple('T', [e.object('Address'), e.tuple('Point'), e.literal('Status')]));

      expectSame(byHandle, source, 1);
      expect(byThunk.elements).toEqual(byHandle.elements);
      expect(byName.elements).toEqual(byHandle.elements);
    });
  });

  describe('decorators on an element', () => {
    test('an element with no decorators has no decorators key at all', () => {
      const [element] = tupleNode(tuple('T', [e.float()])).elements;

      expect('decorators' in element!).toBe(false);
      expect('isNullable' in element!).toBe(false);
    });

    test('an element with decorators carries them and nothing is written unconditionally', () => {
      const [plain, nullable] = tupleNode(tuple('T', [e.float(), e.float().nullable()])).elements;

      expect(Object.keys(plain!).sort()).toEqual(['isOptional', 'origin', 'type']);
      expect(nullable!.decorators).toHaveLength(1);
      expect(nullable!.isNullable).toBe(true);
    });

    test('@nullable, @default, @defaultAlways, @createdAt and @updatedAt match the parser', () => {
      const node = tupleNode(
        tuple('T', {
          a: e.float().nullable(),
          b: e.int().default(5),
          c: e.string().defaultAlways('x'),
          d: e.date().createdAt(),
          ev: e.date().updatedAt(),
          g: e.float().default(null).nullable(),
        }),
      );

      expectSame(
        node,
        'tuple T {\n  a Float @nullable,\n  b Int @default(5),\n  c String @defaultAlways("x"),\n  d Date @createdAt,\n  ev Date @updatedAt,\n  g Float @default(null) @nullable\n}\n',
      );
    });

    test('!!private matches the parser', () => {
      expectSame(tupleNode(tuple('T', [e.float().private()])), 'tuple T {\n  Float !!private\n}\n');
    });

    test('the chain is the registry targets: no @uuid, @id or @unique, no optional', () => {
      const element = e.float();

      for (const name of [
        'uuid',
        'uuid4',
        'uuid7',
        'id',
        'unique',
        'index',
        'readonly',
        'flexible',
        'optional',
        'array',
      ]) {
        expect(name in element).toBe(false);
      }
      for (const name of ['nullable', 'default', 'defaultAlways', 'createdAt', 'updatedAt', 'private']) {
        expect(name in element).toBe(true);
      }
    });

    test('type level: refused decorators, optional, and record or relation elements do not compile', () => {
      // @ts-expect-error `?` is refused on a tuple element, so there is no optional()
      expect(() => e.float().optional()).toThrow();
      // @ts-expect-error @uuid is not on a tuple element's chain
      expect(() => e.uuid().uuid()).toThrow();
      // @ts-expect-error no Record element
      expect(() => e.record()).toThrow();
      // @ts-expect-error no Relation element
      expect(() => e.relation('User')).toThrow();
    });
  });

  describe('optionality', () => {
    test('no element is ever optional, so the node has isOptional false as the validators require', () => {
      const node = tupleNode(tuple('T', [e.float(), e.float().nullable(), e.object('A')]));

      expect(node.elements.map((element) => element.isOptional)).toEqual([false, false, false]);
      expect(validationMessages(node).filter((message) => message.includes('Optional'))).toEqual([]);
    });

    test('negative: the node the parser gives for `Float?` is refused by the validator the builder cannot reach', () => {
      const parsedNode = parsedTuples('tuple T {\n  Float?\n}\n')[0]!;

      expect(parsedNode.elements[0]!.isOptional).toBe(true);
      expect(validationMessages(parsedNode).some((message) => message.includes('Optional elements (?)'))).toBe(true);
    });
  });

  describe('@nullable on an object element', () => {
    test('is not on the chain at runtime, and the parser form is refused by the validator', () => {
      expect('nullable' in e.object('Address')).toBe(false);
      const refused = parsedTuples('object A {\n  x Int\n}\ntuple T {\n  A @nullable\n}\n');
      // The parser keeps the object name only when it knows the object; the validator keys on the type
      expect(
        validationMessages(...refused).some((message) => message.includes('not allowed on object tuple element')),
      ).toBe(true);
    });

    test('type level: @nullable does not compile on an object element', () => {
      // @ts-expect-error SurrealDB cannot define sub-fields on a nullable object
      expect(() => e.object('Address').nullable()).toThrow();
    });
  });

  describe('self-reference', () => {
    test('the nullable form matches the parser and passes the tuple validators', () => {
      const node = tupleNode(tuple('Tree', [e.int(), e.self().nullable()]));

      expectSame(node, 'tuple Tree {\n  Int,\n  Tree @nullable\n}\n');
      expect(node.elements[1]!.tupleName).toBe('Tree');
      expect(validationMessages(node)).toEqual([]);
    });

    test('the self element takes more decorators after nullable and keeps the tuple name', () => {
      const node = tupleNode(tuple('Tree', { value: e.int(), next: e.self().nullable().private() }));

      expectSame(node, 'tuple Tree {\n  value Int,\n  next Tree @nullable !!private\n}\n');
    });

    test('negative: a bare self-reference is not an element and does not compile', () => {
      // @ts-expect-error a self-reference is accepted only once it is nullable
      const bare = tuple('Tree', [e.int(), e.self()]);

      expect(() => tupleNode(bare)).toThrow('Not a tuple element builder');
    });

    test("negative: the same reference by bare name is the validator's call, and it refuses a required one", () => {
      const node = tupleNode(tuple('Tree', [e.int(), e.tuple('Tree')]));

      expect(validationMessages(node).some((message) => message.includes('Self-referencing tuple element'))).toBe(true);
    });

    test('negative: a plain optional self-reference is refused by the parser-side rules', () => {
      const parsedNode = parsedTuples('tuple Tree {\n  Int,\n  Tree?\n}\n')[0]!;
      const messages = validationMessages(parsedNode);

      expect(messages.some((message) => message.includes('Optional elements (?)'))).toBe(true);
    });
  });
});
