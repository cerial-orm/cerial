import { describe, expect, test } from 'bun:test';
import { CerialGenerationError } from '../../../../src/errors';
import {
  e,
  enum as enumeration,
  f,
  literal,
  literalField,
  model,
  object,
  tuple,
  variant,
} from '../../../../src/parser/builder';
import { materialise } from '../../../../src/parser/builder/materialise';
import type { ExportedDeclaration } from '../../../../src/parser/builder/materialise';
import { parse } from '../../../../src/parser/parser';
import type { ASTField, Origin, SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

const FILE = '/app/schema/a.schema.ts';

function declare(handle: object, exportName: string, module = FILE): ExportedDeclaration {
  return { handle, module, exportName };
}

function refusal(declarations: readonly ExportedDeclaration[]): CerialGenerationError {
  try {
    materialise(declarations);
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('materialise did not refuse');
}

function parsed(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors.map((x) => x.message)).toEqual([]);

  return ast;
}

function tsOrigin(file: string, exportName: string): Origin {
  return { kind: 'ts', file, export: exportName };
}

describe('materialise: shape', () => {
  test('an empty entry has source empty and every array present', () => {
    const ast = materialise([]);

    expect(ast).toEqual({ models: [], objects: [], tuples: [], literals: [], enums: [], source: '' });
  });

  test('an entry with only a model still has objects, tuples, literals and enums as arrays', () => {
    const ast = materialise([declare(model('User', { id: f.record().id() }), 'User')]);

    expect(ast.models).toHaveLength(1);
    expect([ast.objects, ast.tuples, ast.literals, ast.enums]).toEqual([[], [], [], []]);
    expect(ast.source).toBe('');
  });

  test('matches the parser for the same schema, ignoring position and origin', () => {
    const Address = object('Address', { city: f.string(), tag: literalField('Tag') });
    const Coord = tuple('Coord', { x: e.float(), y: e.float() });
    const Tag = literal('Tag', [variant.string('a'), variant.tuple(Coord)]);
    const Role = enumeration('Role', ['ADMIN', 'USER']);
    const User = model('User', {
      id: f.record().id(),
      address: f.object(() => Address),
      role: literalField(Role),
      at: f.object('Address').optional(),
    });
    const ast = materialise(
      [Address, Coord, Tag, Role, User].map((handle, index) => declare(handle, `export${index}`)),
    );
    const twin = parsed(`model User {
  id Record @id
  address Address
  role Role
  at Address?
}
object Address {
  city String
  tag Tag
}
tuple Coord {
  x Float,
  y Float
}
literal Tag {
  'a', Coord
}
enum Role {
  ADMIN
  USER
}`);

    expect(withoutPosition({ ...ast, source: '' })).toEqual(withoutPosition({ ...twin, source: '' }));
  });
});

describe('materialise: references', () => {
  test('a bare name resolves to the kind declared in the entry', () => {
    const ast = materialise([
      declare(object('Address', { city: f.string() }), 'Address'),
      declare(model('User', { a: f.object('Address') }), 'User'),
    ]);

    expect(ast.models[0]!.fields[0]).toMatchObject({ type: 'object', objectName: 'Address' });
  });

  test('a thunk is called at materialise time, so a later const is fine', () => {
    const User = model('User', { address: f.object(() => Address) });
    const Address = object('Address', { city: f.string() });

    expect(materialise([declare(User, 'User'), declare(Address, 'Address')]).models[0]!.fields[0]!.objectName).toBe(
      'Address',
    );
  });

  test('an enum is reachable through a literal field and is type literal', () => {
    const ast = materialise([
      declare(enumeration('Role', ['A']), 'Role'),
      declare(model('User', { role: literalField('Role') }), 'User'),
    ]);

    expect(ast.models[0]!.fields[0]).toMatchObject({ type: 'literal', literalName: 'Role' });
  });

  test('a name declared as an object and a literal resolves to the literal, as the parser does', () => {
    const ast = materialise([
      declare(object('X', { a: f.string() }), 'XObject'),
      declare(literal('X', [variant.int(1)]), 'XLiteral'),
      declare(model('M', { x: f.object('X') }), 'M'),
    ]);
    const field = ast.models[0]!.fields[0]!;

    expect(field).toMatchObject({ type: 'literal', literalName: 'X' });
    expect(field.objectName).toBeUndefined();
    expect('objectName' in field).toBe(false);
  });

  test('a name declared as an object and a tuple resolves to the object in a field position', () => {
    const ast = materialise([
      declare(object('X', { a: f.string() }), 'XObject'),
      declare(tuple('X', [e.int()]), 'XTuple'),
      declare(object('Holder', { x: f.object('X') }), 'Holder'),
    ]);

    expect(ast.objects.find((o) => o.name === 'Holder')!.fields[0]).toMatchObject({ type: 'object' });
  });

  test('a tuple element resolves with the field order too', () => {
    const ast = materialise([
      declare(object('X', { a: f.string() }), 'XObject'),
      declare(tuple('X', [e.int()]), 'XTuple'),
      declare(tuple('Holder', [e.tuple('X')]), 'Holder'),
    ]);

    expect(ast.tuples.find((t) => t.name === 'Holder')!.elements[0]).toMatchObject({ type: 'object', objectName: 'X' });
  });

  test('a literal variant naming a tuple and an object resolves to the tuple, the parser variant order', () => {
    const ast = materialise([
      declare(object('X', { a: f.string() }), 'XObject'),
      declare(tuple('X', [e.int()]), 'XTuple'),
      declare(literal('L', [variant.object('X')]), 'L'),
    ]);

    expect(ast.literals[0]!.variants).toEqual([{ kind: 'tupleRef', tupleName: 'X' }]);
  });

  test('a wrong-kind name that is declared only as another kind is refused, naming it', () => {
    const error = refusal([
      declare(tuple('Coord', [e.int()]), 'Coord'),
      declare(model('M', { c: f.object('Coord') }), 'M'),
    ]);

    expect(error.code).toBe('C7000');
    expect(error.message).toContain("'Coord'");
    expect(error.message).toContain('object');
    expect(error.message).toContain('tuple');
  });

  test('an undeclared name is refused naming the reference and the module', () => {
    const error = refusal([declare(model('M', { c: f.object('Missing') }), 'M', '/app/m.schema.ts')]);

    expect(error.code).toBe('C7000');
    expect(error.message).toContain("'Missing'");
    expect(error.message).toContain('/app/m.schema.ts');
  });

  test('a handle declared in no module of this entry is refused naming the reference and the entry', () => {
    const Elsewhere = object('Elsewhere', { a: f.string() });
    const error = refusal([declare(model('M', { c: f.object(Elsewhere) }), 'M', '/app/m.schema.ts')]);

    expect(error.message).toContain("'Elsewhere'");
    expect(error.message).toContain('schema entry');
    expect(error.message).toContain('/app/m.schema.ts');
  });

  test('a literal variant naming nothing declared is refused', () => {
    const error = refusal([declare(literal('L', [variant.object('Nope')]), 'L')]);

    expect(error.message).toContain("'Nope'");
  });

  test('an object reference naming a model is refused: models are not field types, as in the DSL', () => {
    const error = refusal([
      declare(model('User', { id: f.record().id() }), 'User'),
      declare(model('Post', { author: f.object('User') }), 'Post'),
    ]);
    const { errors } = parse('model User {\n  id Record @id\n}\nmodel Post {\n  author User\n}');

    expect(errors.length).toBeGreaterThan(0);
    expect(error.message).toContain("'User'");
  });

  test('a model-to-model relation by name still builds, since @model is validated later', () => {
    const ast = materialise([
      declare(model('User', { id: f.record().id() }), 'User'),
      declare(model('Post', { author: f.relation('User') }), 'Post'),
    ]);

    expect(ast.models.map((m) => m.name)).toEqual(['Post', 'User']);
  });

  test('a thunk that throws refuses with the module, the export and the cause', () => {
    const tdz = new ReferenceError("Cannot access 'Late' before initialization");
    const User = model('User', {
      late: f.object(() => {
        throw tdz;
      }),
    });
    const error = refusal([declare(User, 'User', '/app/u.schema.ts')]);

    expect(error.code).toBe('C7000');
    expect(error.cause).toBe(tdz);
    expect(error.message).toContain('/app/u.schema.ts');
    expect(error.message).toContain("'User'");
    expect(error.message).toContain('Late');
  });

  test('something that is not a declaration is refused', () => {
    const error = refusal([declare({ name: 'Plain' }, 'Plain')]);

    expect(error.message).toContain("'Plain'");
  });
});

describe('materialise: origin', () => {
  test('every node of a declaration carries the ts origin, with only the origin changed', () => {
    const Coord = tuple('Coord', { x: e.float().nullable(), y: e.float() });
    const User = model(
      'User',
      { id: f.record().id(), name: f.string().unique(), c: f.string() },
      { index: { name: 'byName', fields: ['name'] } },
    );
    const ast = materialise([declare(Coord, 'Coord', '/a.ts'), declare(User, 'User', '/b.ts')]);
    const user = ast.models[0]!;
    const origin = tsOrigin('/b.ts', 'User');

    expect(user.origin).toEqual(origin);
    expect(user.fields.every((field) => field.origin.kind === 'ts')).toBe(true);
    expect(user.fields.every((field) => JSON.stringify(field.origin) === JSON.stringify(origin))).toBe(true);
    expect(user.fields[1]!.decorators[0]!.origin).toEqual(origin);
    expect(user.directives![0]!.origin).toEqual(origin);
    const tup = ast.tuples[0]!;

    expect(tup.origin).toEqual(tsOrigin('/a.ts', 'Coord'));
    expect(tup.elements.map((el) => el.origin)).toEqual([tsOrigin('/a.ts', 'Coord'), tsOrigin('/a.ts', 'Coord')]);
    expect(tup.elements[0]!.decorators![0]!.origin).toEqual(tsOrigin('/a.ts', 'Coord'));
    expect(JSON.stringify(withoutPosition(user))).toBe(
      JSON.stringify(
        withoutPosition(
          parsed('model User {\n  id Record @id\n  name String @unique\n  c String\n  @@index(byName, [name])\n}')
            .models[0],
        ),
      ),
    );
  });

  test('literals and enums carry the origin', () => {
    const ast = materialise([declare(literal('L', [variant.int(1)]), 'L'), declare(enumeration('E', ['A']), 'E')]);

    expect(ast.literals[0]!.origin).toEqual(tsOrigin(FILE, 'L'));
    expect(ast.enums[0]!.origin).toEqual(tsOrigin(FILE, 'E'));
  });

  test('a decorator chain shared by two models is not stamped with the wrong export', () => {
    const shared = f.string().unique();
    const ast = materialise([
      declare(model('A', { x: shared }), 'A', '/a.ts'),
      declare(model('B', { x: shared }), 'B', '/b.ts'),
    ]);
    const decoratorOrigin = (name: string): Origin =>
      ast.models.find((m) => m.name === name)!.fields[0]!.decorators[0]!.origin;

    expect(decoratorOrigin('A')).toEqual(tsOrigin('/a.ts', 'A'));
    expect(decoratorOrigin('B')).toEqual(tsOrigin('/b.ts', 'B'));
  });
});

describe('materialise: identity and order', () => {
  test('one declaration exported under two names is one node, with the first place in order', () => {
    const User = model('User', { id: f.record().id() });
    const ast = materialise([
      declare(User, 'Alias', '/z.ts'),
      declare(User, 'User', '/a.ts'),
      declare(User, 'User', '/z.ts'),
    ]);

    expect(ast.models).toHaveLength(1);
    expect(ast.models[0]!.origin).toEqual(tsOrigin('/a.ts', 'User'));
  });

  test('two different declarations of one name both stay, for the duplicate-name check', () => {
    const ast = materialise([
      declare(model('User', { a: f.string() }), 'First', '/a.ts'),
      declare(model('User', { b: f.string() }), 'Second', '/b.ts'),
    ]);

    expect(ast.models.map((m) => m.fields[0]!.name)).toEqual(['a', 'b']);
  });

  test('the result does not depend on the order of the input', () => {
    const list = [
      declare(model('Zed', { id: f.record().id() }), 'Zed', '/z.ts'),
      declare(model('Abe', { id: f.record().id() }), 'Abe', '/a.ts'),
      declare(object('O2', { a: f.string() }), 'O2', '/m.ts'),
      declare(object('O1', { a: f.string() }), 'O1', '/m.ts'),
      declare(enumeration('E', ['A']), 'E', '/a.ts'),
    ];

    expect(materialise([...list].reverse())).toEqual(materialise(list));
    expect(materialise(list).models.map((m) => m.name)).toEqual(['Abe', 'Zed']);
    expect(materialise(list).objects.map((o) => o.name)).toEqual(['O1', 'O2']);
  });

  test('fields keep their declaration order', () => {
    const ast = materialise([declare(model('M', { b: f.string(), a: f.string() }), 'M')]);

    expect(ast.models[0]!.fields.map((x: ASTField) => x.name)).toEqual(['b', 'a']);
  });
});
