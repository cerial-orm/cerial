import { describe, expect, test } from 'bun:test';
import { CerialGenerationError } from '../../../../src/errors';
import {
  e,
  enum as enumeration,
  f,
  fieldNode,
  handle,
  literal,
  model,
  object,
  tuple,
  variant,
} from '../../../../src/parser/builder';
import { enumNode } from '../../../../src/parser/builder/enum';
import { literalNode } from '../../../../src/parser/builder/literal';
import { materialise } from '../../../../src/parser/builder/materialise';
import { modelNode } from '../../../../src/parser/builder/model';
import { objectNode } from '../../../../src/parser/builder/object';
import { tupleNode } from '../../../../src/parser/builder/tuple';
import { withoutPosition } from './helpers';

// Each declaration exists twice under one name: written with a builder, and as the handle a `.cerial`
// file produces. Whatever refers to one must produce the same nodes as whatever refers to the other.
const RealUser = model('User', { id: f.record('int').id(), name: f.string() });
const UserHandle = handle.model('User', { members: ['id', 'name'], id: ['int'] });
const RealAddress = object('Address', { street: f.string(), city: f.string() });
const AddressHandle = handle.object('Address', { members: ['street', 'city'] });
const RealPoint = tuple('Point', { x: e.int(), y: e.int() });
const PointHandle = handle.tuple('Point', { members: ['x', 'y'], size: 2 });
const RealRole = enumeration('Role', ['Admin', 'Guest']);
const RoleHandle = handle.enum('Role', ['Admin', 'Guest']);
const RealLevel = literal('Level', [variant.string('low'), variant.int(1)]);
const LevelHandle = handle.literal('Level', { variants: ["'low'", '1'], simple: true });

function same(real: object, viaHandle: object): void {
  expect(withoutPosition(viaHandle)).toEqual(withoutPosition(real));
}

function refusal(build: () => unknown): CerialGenerationError {
  try {
    build();
  } catch (error) {
    expect(error).toBeInstanceOf(CerialGenerationError);

    return error as CerialGenerationError;
  }
  throw new Error('nothing was refused');
}

describe('a handle in a relation position', () => {
  test('f.relation and f.reverse take a model handle, a thunk of one, and derive the same key', () => {
    const body = (User: typeof RealUser | typeof UserHandle) => ({
      id: f.record().id(),
      author: f.relation(User),
      later: f.relation(() => User).optional(),
      tags: f.relation(User).array(),
      posts: f.reverse(User).array().key('author'),
      back: f.reverse(() => User).optional(),
    });

    same(modelNode(model('Post', body(RealUser))), modelNode(model('Post', body(UserHandle))));
    expect(modelNode(model('Post', body(UserHandle))).fields.map((x) => x.name)).toEqual([
      'id',
      'authorId',
      'author',
      'laterId',
      'later',
      'tagIds',
      'tags',
      'posts',
      'back',
    ]);
  });

  test('a foreign key named with field() binds to a key inherited from a handle parent', () => {
    const Parent = handle.model('Base', { members: ['id', 'ownerId'], id: [] });
    const RealParent = model('Base', { id: f.record().id(), ownerId: f.record() });
    const child = (parent: typeof Parent | typeof RealParent) =>
      model('Child', { owner: f.relation(RealUser).field('ownerId') }, { extends: parent });

    same(modelNode(child(RealParent)), modelNode(child(Parent)));
    expect(modelNode(child(Parent)).fields.map((x) => x.name)).toEqual(['owner']);
  });

  test('a relation to a name that is not a model handle is refused, naming the handle', () => {
    // @ts-expect-error -- an object handle is not a model
    const forward = model('A', { id: f.record().id(), x: f.relation(AddressHandle) });
    // A thunk's return type is not inspected by the compiler, so only the build refuses this one
    const thunk = model('B', { id: f.record().id(), x: f.reverse(() => RoleHandle) });

    expect(refusal(() => modelNode(forward)).message).toContain("'Address' is a object handle");
    expect(refusal(() => modelNode(thunk)).message).toContain("'Role' is a enum handle");
  });
});

describe('a handle in a field position', () => {
  test('f.object, f.tuple, f.literal and f.enum take a handle or a thunk of one', () => {
    const body = (a: typeof RealAddress, p: typeof RealPoint, l: typeof RealLevel, r: typeof RealRole) => ({
      home: f.object(a),
      work: f.object(() => a).optional(),
      at: f.tuple(p).array(),
      there: f.tuple(() => p),
      level: f.literal(l),
      lazy: f.literal(() => l),
      role: f.enum(r),
      asLiteral: f.literal(r),
      asEnum: f.enum(() => r),
    });
    const real = object('Holder', body(RealAddress, RealPoint, RealLevel, RealRole));
    const viaHandle = object('Holder', body(AddressHandle, PointHandle, LevelHandle, RoleHandle));

    same(objectNode(real), objectNode(viaHandle));
    expect(objectNode(viaHandle).fields.map((x) => [x.name, x.type])).toContainEqual(['home', 'object']);
  });

  test('a record id takes an object or tuple handle', () => {
    same(
      fieldNode(
        f.record(RealAddress, () => RealPoint),
        'k',
      ),
      fieldNode(
        f.record(AddressHandle, () => PointHandle),
        'k',
      ),
    );
  });

  test('a handle of another kind is refused with its name, for each position', () => {
    // @ts-expect-error -- a model handle is not an object
    const object_ = f.object(UserHandle);
    // A thunk's return type is not inspected by the compiler, so only the build refuses this one
    const tuple_ = f.tuple(() => AddressHandle);
    // @ts-expect-error -- a tuple handle is not a literal
    const literal_ = f.literal(PointHandle);
    // @ts-expect-error -- a model handle is not an enum
    const enum_ = f.enum(UserHandle);
    // @ts-expect-error -- a model handle is not a record id type
    const id = f.record(UserHandle);

    expect(refusal(() => fieldNode(object_, 'a')).message).toContain("'User' is a model handle");
    expect(refusal(() => fieldNode(tuple_, 'a')).message).toContain("'Address' is a object handle");
    expect(refusal(() => fieldNode(literal_, 'a')).message).toContain("'Point' is a tuple handle");
    expect(refusal(() => fieldNode(enum_, 'a')).message).toContain('literal or enum');
    expect(refusal(() => fieldNode(id, 'a')).message).toContain("'User' is a model handle");
  });

  test('an enum or literal handle is accepted for either literal position, and a bare name still is', () => {
    expect(fieldNode(f.literal(RoleHandle), 'a').literalName).toBe('Role');
    expect(fieldNode(f.enum(LevelHandle), 'a').literalName).toBe('Level');
    expect(fieldNode(f.object('Address'), 'a').objectName).toBe('Address');
  });
});

describe('a handle in a tuple element or a literal variant', () => {
  test('element factories take a handle', () => {
    const body = (a: typeof RealAddress, p: typeof RealPoint, l: typeof RealLevel) => [
      e.object(a),
      e.tuple(() => p),
      e.literal(l),
    ];

    same(
      tupleNode(tuple('Mix', body(RealAddress, RealPoint, RealLevel))),
      tupleNode(tuple('Mix', body(AddressHandle, PointHandle, LevelHandle))),
    );
  });

  test('variant references take a handle', () => {
    const variants = (a: typeof RealAddress, p: typeof RealPoint, l: typeof RealLevel) => [
      variant.object(a),
      variant.tuple(() => p),
      variant.literal(l),
    ];

    same(
      literalNode(literal('Any', variants(RealAddress, RealPoint, RealLevel))),
      literalNode(literal('Any', variants(AddressHandle, PointHandle, LevelHandle))),
    );
  });

  test('a handle of another kind is refused in an element and in a variant', () => {
    // @ts-expect-error -- a model handle is not an object
    const element = tuple('Bad', [e.object(UserHandle)]);
    // @ts-expect-error -- an object handle is not a tuple
    const tupleVariant = literal('BadTuple', [variant.tuple(AddressHandle)]);
    // @ts-expect-error -- a tuple handle is not an object
    const objectVariant = literal('BadObject', [variant.object(PointHandle)]);
    // @ts-expect-error -- a model handle is not a literal
    const literalVariant = literal('BadLiteral', [variant.literal(UserHandle)]);

    expect(refusal(() => tupleNode(element)).message).toContain("'User' is a model handle");
    expect(refusal(() => literalNode(tupleVariant)).message).toContain("'Address' is a object handle");
    expect(refusal(() => literalNode(objectVariant)).message).toContain("'Point' is a tuple handle");
    expect(refusal(() => literalNode(literalVariant)).message).toContain("'User' is a model handle");
  });
});

describe('a handle as an extends parent', () => {
  const ModelParentHandle = handle.model('Base', { members: ['id', 'name', 'age'], id: [] });
  const RealModelParent = model('Base', { id: f.record().id(), name: f.string(), age: f.int() });
  const RealAbstract = model('Base', { id: f.record().id(), name: f.string(), age: f.int() }, { abstract: true });

  test('a model extends a handle whole, picked and omitted, as it extends a builder parent', () => {
    for (const [real, viaHandle] of [
      [RealModelParent, ModelParentHandle],
      [RealModelParent.pick('id', 'name'), ModelParentHandle.pick('id', 'name')],
      [RealModelParent.omit('age'), ModelParentHandle.omit('age')],
      [RealAbstract, ModelParentHandle],
      [RealAbstract.omit('name'), ModelParentHandle.omit('name')],
    ] as const) {
      same(
        modelNode(model('Child', { extra: f.string() }, { extends: real })),
        modelNode(model('Child', { extra: f.string() }, { extends: viaHandle })),
      );
    }
  });

  test('an object extends a handle whole, picked and omitted', () => {
    for (const [real, viaHandle] of [
      [RealAddress, AddressHandle],
      [RealAddress.pick('city'), AddressHandle.pick('city')],
      [RealAddress.omit('city'), AddressHandle.omit('city')],
    ] as const) {
      same(
        objectNode(object('Home', { zip: f.string() }, { extends: real })),
        objectNode(object('Home', { zip: f.string() }, { extends: viaHandle })),
      );
    }
  });

  test('a tuple extends a handle, picking by name or by position', () => {
    for (const [real, viaHandle] of [
      [RealPoint, PointHandle],
      [RealPoint.pick('x'), PointHandle.pick('x')],
      [RealPoint.omit(1), PointHandle.omit(1)],
    ] as const) {
      same(
        tupleNode(tuple('Point3', [e.int()], { extends: real })),
        tupleNode(tuple('Point3', [e.int()], { extends: viaHandle })),
      );
    }
  });

  test('a literal extends a handle, and a pick list is checked against its variants', () => {
    same(
      literalNode(literal('Wide', [variant.int(2)], { extends: RealLevel.pick("'low'") })),
      literalNode(literal('Wide', [variant.int(2)], { extends: LevelHandle.pick("'low'") })),
    );
    const picked = literal('Wide', [], { extends: LevelHandle.pick("'low'", '1') });

    expect(literalNode(picked).extendsFilter).toEqual({ mode: 'pick', fields: ["'low'", '1'] });
    // @ts-expect-error -- "'high'" is not a variant of Level; the build refuses it as well
    const unknown = literal('Bad', [], { extends: LevelHandle.pick("'high'") });
    expect(() => literalNode(unknown)).toThrow(/Level has no variant 'high'/);
  });

  test('an enum extends a handle', () => {
    same(
      enumNode(enumeration('Wide', ['Owner'], { extends: RealRole.omit('Guest') })),
      enumNode(enumeration('Wide', ['Owner'], { extends: RoleHandle.omit('Guest') })),
    );
  });

  test('a parent of another kind is refused at the declaration, naming the handle', () => {
    // @ts-expect-error -- an object handle is not a model parent
    const model_ = () => model('Bad', {}, { extends: AddressHandle });
    // @ts-expect-error -- a model handle is not an object parent
    const object_ = () => object('Bad', {}, { extends: UserHandle.pick('id') });
    // @ts-expect-error -- an object handle is not a tuple parent
    const tuple_ = () => tuple('Bad', [], { extends: AddressHandle });
    // @ts-expect-error -- an enum handle is not a literal parent
    const literal_ = () => literal('Bad', [], { extends: RoleHandle });
    // @ts-expect-error -- a literal handle is not an enum parent
    const enum_ = () => enumeration('Bad', [], { extends: LevelHandle });

    expect(refusal(model_).message).toContain("got the object handle 'Address'");
    expect(refusal(object_).message).toContain("got the model handle 'User'");
    expect(refusal(tuple_).message).toContain("got the object handle 'Address'");
    expect(refusal(literal_).message).toContain("got the enum handle 'Role'");
    expect(refusal(enum_).message).toContain("got the literal handle 'Level'");
  });
});

describe('materialise resolves a reference to a handle by name', () => {
  const place = { module: '/app/a.schema.ts' };
  const holder = object('Holder', {
    home: f.object(AddressHandle),
    at: f.tuple(PointHandle),
    level: f.literal(RoleHandle),
  });
  const declarations = [{ handle: holder, exportName: 'Holder', ...place }];

  test('a name no declaration in the entry provides is refused by default', () => {
    expect(refusal(() => materialise(declarations)).message).toContain("refers to 'Address'");
  });

  test('the same names are accepted when they are known from elsewhere', () => {
    const ast = materialise(declarations, { object: ['Address'], tuple: ['Point'], literal: ['Role'] });

    expect(ast.objects[0]!.fields.map((x) => [x.name, x.type, x.objectName ?? x.tupleName ?? x.literalName])).toEqual([
      ['home', 'object', 'Address'],
      ['at', 'tuple', 'Point'],
      ['level', 'literal', 'Role'],
    ]);
  });

  test('a known name of another kind is still refused', () => {
    expect(
      refusal(() => materialise(declarations, { tuple: ['Address', 'Point'], literal: ['Role'] })).message,
    ).toContain("'Address' as object, but it is declared as");
    expect(refusal(() => materialise(declarations, { object: ['Address'], tuple: ['Point'] })).message).toContain(
      "'Role'",
    );
  });
});
