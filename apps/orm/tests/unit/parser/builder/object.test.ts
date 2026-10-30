import { describe, expect, test } from 'bun:test';
import { f, fieldNode } from '../../../../src/parser/builder';
import type { Handle } from '../../../../src/parser/builder';
import { object, objectNode } from '../../../../src/parser/builder/object';
import { validateObjectFields } from '../../../../src/cli/validators/schema-validator';
import { parse } from '../../../../src/parser/parser';
import { createSchemaAST } from '../../../../src/parser/types/ast';
import type { ASTObject } from '../../../../src/types';
import { withoutPosition } from './helpers';

/** The nodes `parse()` gives for a schema of objects */
function parsedObjects(source: string): ASTObject[] {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast.objects;
}

function expectSame(built: ASTObject, source: string, index = 0): void {
  expect(withoutPosition(built)).toEqual(withoutPosition(parsedObjects(source)[index]));
}

describe('object builder', () => {
  test('returns a handle carrying only the name', () => {
    const Address = object('Address', { city: f.string() });

    expect(Address.name).toBe('Address');
    expect(Object.keys(Address)).toEqual(['name']);
  });

  test('matches the parser for plain, optional, array and decorated fields', () => {
    const Address = object('Address', {
      street: f.string(),
      zip: f.int().optional(),
      tags: f.string().array(),
      note: f.string().optional().nullable(),
      label: f.string().default('home'),
    });

    expectSame(
      objectNode(Address),
      `object Address {
  street String
  zip Int?
  tags String[]
  note String? @nullable
  label String @default("home")
}`,
    );
  });

  test('an empty object matches the parser', () => {
    // The parser refuses an empty body, so compare the shape directly
    expect(withoutPosition(objectNode(object('Empty', {})))).toEqual({ name: 'Empty', fields: [] });
  });

  test('keeps field order', () => {
    const node = objectNode(object('O', { b: f.int(), a: f.int(), c: f.int() }));

    expect(node.fields.map((x) => x.name)).toEqual(['b', 'a', 'c']);
  });

  test('has no extends keys, as the parser writes none', () => {
    const node = objectNode(object('O', { a: f.int() }));

    expect('extends' in node).toBe(false);
    expect('extendsFilter' in node).toBe(false);
  });

  test('a value that is not an object handle is refused', () => {
    expect(() => objectNode({ name: 'X' })).toThrow('Not an object handle');
  });
});

describe('object-typed fields', () => {
  const Address = object('Address', { city: f.string() });
  const source = `object Address {\n  city String\n}\nobject P {\n`;

  test('a handle, a thunk and a bare name produce an identical field', () => {
    const byHandle = fieldNode(f.object(Address), 'home');
    const byThunk = fieldNode(
      f.object(() => Address),
      'home',
    );
    const byName = fieldNode(f.object('Address'), 'home');

    expect(byThunk).toEqual(byHandle);
    expect(byName).toEqual(byHandle);
  });

  test('matches the parser plain, optional, array and flexible', () => {
    const P = object('P', {
      a: f.object(Address),
      b: f.object(Address).optional(),
      c: f.object(Address).array(),
      d: f.object(Address).flexible(),
    });

    expectSame(objectNode(P), `${source}  a Address\n  b Address?\n  c Address[]\n  d Address @flexible\n}`, 1);
  });

  test('flexibility is per field: one object, flexible from one field and strict from another', () => {
    const P = object('P', { strict: f.object(Address), loose: f.object(Address).flexible() });
    const [strict, loose] = objectNode(P).fields;

    expect(strict!.decorators).toEqual([]);
    expect(loose!.decorators.map((d) => d.type)).toEqual(['flexible']);
    expect(objectNode(Address).fields.flatMap((x) => x.decorators)).toEqual([]);
  });

  test('@nullable is unavailable on the type and the runtime object', () => {
    const builder = f.object(Address);

    // @ts-expect-error SurrealDB cannot define sub-fields on a nullable parent
    expect(builder.nullable).toBeUndefined();
    // @ts-expect-error the restriction survives chaining and optional
    expect(builder.optional().array().nullable).toBeUndefined();
  });

  test('optional and array stay available', () => {
    expect(fieldNode(f.object(Address).optional(), 'x').isOptional).toBe(true);
    expect(fieldNode(f.object(Address).array(), 'x').isArray).toBe(true);
  });

  test('a plain field gains no objectName key', () => {
    expect('objectName' in fieldNode(f.string(), 'x')).toBe(false);
  });
});

describe('self reference', () => {
  function validate(...objects: ASTObject[]): string[] {
    return validateObjectFields(createSchemaAST([], '', objects)).map((e) => e.message);
  }

  // Annotated, because a binding cannot infer its own type through a thunk that reads it
  const Optional: Handle<'Node'> = object('Node', { next: f.object(() => Optional).optional() });
  const Listed: Handle<'Tree'> = object('Tree', { children: f.object(() => Listed).array() });
  const Bare = object('Loop', { next: f.object('Loop').optional() });
  const Required: Handle<'Bad'> = object('Bad', { next: f.object(() => Required) });

  test('the optional and array forms are reachable and pass the validator', () => {
    expect(validate(objectNode(Optional))).toEqual([]);
    expect(validate(objectNode(Listed))).toEqual([]);
    expect(validate(objectNode(Bare))).toEqual([]);
  });

  test('the optional form matches the parser', () => {
    expectSame(objectNode(Optional), 'object Node {\n  next Node?\n}');
    expectSame(objectNode(Listed), 'object Tree {\n  children Tree[]\n}');
  });

  test('the required form builds and the validator refuses it', () => {
    expect(validate(objectNode(Required))).toContain('Self-referencing object fields must be optional or array');
  });
});
