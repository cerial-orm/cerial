import { describe, expect, test } from 'bun:test';
import { f, extendsOf, model, modelNode, object, objectNode } from '../../../../src/parser/builder';
import { resolveInheritance } from '../../../../src/resolver/inheritance-resolver';
import { parse } from '../../../../src/parser/parser';
import type { SchemaAST } from '../../../../src/types';
import { withoutPosition } from './helpers';

function parsed(source: string): SchemaAST {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);

  return ast;
}

/** Raw, then resolved: the second is what the generator sees. */
function expectSameAsParsed(source: string, built: Pick<SchemaAST, 'models' | 'objects'>): void {
  const ast = parsed(source);
  const twin = { ...ast, models: built.models, objects: built.objects };

  expect(withoutPosition(twin.models)).toEqual(withoutPosition(ast.models));
  expect(withoutPosition(twin.objects)).toEqual(withoutPosition(ast.objects));
  const resolvedBuilt = resolveInheritance(twin);
  const resolvedParsed = resolveInheritance(ast);
  expect(withoutPosition(resolvedBuilt.models)).toEqual(withoutPosition(resolvedParsed.models));
  expect(withoutPosition(resolvedBuilt.objects)).toEqual(withoutPosition(resolvedParsed.objects));
}

const Entity = model(
  'Entity',
  { id: f.record().id().private(), name: f.string(), note: f.string().optional(), tag: f.string() },
  { abstract: true },
);

describe('extends on a model', () => {
  test('a plain extends writes the parent name and no extendsFilter key', () => {
    const node = modelNode(model('Child', { extra: f.int() }, { extends: Entity }));

    expect(node.extends).toBe('Entity');
    expect('extendsFilter' in node).toBe(false);
  });

  test('no extends writes neither key', () => {
    const node = modelNode(model('Solo', { id: f.record().id() }));

    expect('extends' in node).toBe(false);
    expect('extendsFilter' in node).toBe(false);
  });

  test('pick writes mode pick and the list in order', () => {
    const node = modelNode(model('C', {}, { extends: Entity.pick('tag', 'id') }));

    expect(node.extendsFilter).toEqual({ mode: 'pick', fields: ['tag', 'id'] });
  });

  test('omit writes mode omit and the list in order', () => {
    const node = modelNode(model('C', {}, { extends: Entity.omit('note', 'name') }));

    expect(node.extendsFilter).toEqual({ mode: 'omit', fields: ['note', 'name'] });
  });

  test('the written filter is a copy, not the caller list', () => {
    const list: ['tag'] = ['tag'];
    const node = modelNode(model('C', {}, { extends: Entity.pick(...list) }));
    list.push('tag');

    expect(node.extendsFilter?.fields).toEqual(['tag']);
  });

  test('matches the parser for plain, pick and omit, raw and resolved', () => {
    const Base = model('Base', { id: f.record().id(), name: f.string(), age: f.int().optional() }, { abstract: true });
    const source = `abstract model Base {
  id Record @id
  name String
  age Int?
}
model Plain extends Base {
  extra Int
}
model Picked extends Base[id, name] {
  extra Int
}
model Omitted extends Base[!age] {
}
`;

    expectSameAsParsed(source, {
      models: [
        modelNode(Base),
        modelNode(model('Plain', { extra: f.int() }, { extends: Base })),
        modelNode(model('Picked', { extra: f.int() }, { extends: Base.pick('id', 'name') })),
        modelNode(model('Omitted', {}, { extends: Base.omit('age') })),
      ],
      objects: [],
    });
  });

  test('an abstract parent stays usable and keeps its abstract flag', () => {
    expect(modelNode(Entity).abstract).toBe(true);
    expect(modelNode(model('Child', {}, { extends: Entity })).extends).toBe('Entity');
  });

  test('a child can itself be abstract and extended again', () => {
    const Mid = model('Mid', { extra: f.int() }, { abstract: true, extends: Entity });
    const node = modelNode(model('Leaf', {}, { extends: Mid }));
    const mid = modelNode(Mid);

    expect(mid.abstract).toBe(true);
    expect(mid.extends).toBe('Entity');
    expect(node.extends).toBe('Mid');
  });

  test('a multi-level chain that alternates pick and omit matches the parsed one', () => {
    const P1 = model(
      'ExtP1',
      {
        id: f.record().id().private(),
        secret: f.string().private(),
        name: f.string(),
        note: f.string().optional(),
        tag: f.string(),
      },
      { abstract: true },
    );
    const P2 = model(
      'ExtP2',
      { extra: f.string().optional(), spare: f.string().optional() },
      { abstract: true, extends: P1.pick('id', 'secret', 'name', 'tag') },
    );
    const P3 = model('ExtP3', { level: f.int().default(1) }, { abstract: true, extends: P2.omit('spare') });
    const P4 = model('ExtP4Concrete', { final: f.string().optional() }, { extends: P3 });
    const source = `abstract model ExtP1 {
  id Record @id !!private
  secret String !!private
  name String
  note String?
  tag String
}

abstract model ExtP2 extends ExtP1[id, secret, name, tag] {
  extra String?
  spare String?
}

abstract model ExtP3 extends ExtP2[!spare] {
  level Int @default(1)
}

model ExtP4Concrete extends ExtP3 {
  final String?
}
`;

    expectSameAsParsed(source, { models: [P1, P2, P3, P4].map(modelNode), objects: [] });
  });

  test('omitting a relation and its derived key matches the parser', () => {
    const Author = model('Author', { id: f.record().id() });
    const Post = model(
      'Post',
      { id: f.record().id(), title: f.string(), author: f.relation(() => Author) },
      { abstract: true },
    );
    const Summary = model('Summary', { words: f.int().optional() }, { extends: Post.omit('author', 'authorId') });
    const source = `model Author {
  id Record @id
}
abstract model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Author)
}
model Summary extends Post[!author, !authorId] {
  words Int?
}
`;

    expectSameAsParsed(source, { models: [Author, Post, Summary].map(modelNode), objects: [] });
  });

  test('an inherited field can head a composite directive, and the directive matches the parser', () => {
    const Child = model(
      'Child',
      { extra: f.int() },
      { extends: Entity, unique: { name: 'byName', fields: ['name', 'extra'] } },
    );
    const source = `abstract model Entity {
  id Record @id !!private
  name String
  note String?
  tag String
}
model Child extends Entity {
  extra Int
  @@unique(byName, [name, extra])
}
`;
    const node = modelNode(Child);

    expect(node.directives).toHaveLength(1);
    expect(withoutPosition(node.directives)).toEqual(withoutPosition(parsed(source).models[1]!.directives));
  });
});

describe('extends on an object', () => {
  const Base = object('ExtBaseAddress', {
    street: f.string(),
    city: f.string(),
    zip: f.string(),
    country: f.string().default('US'),
  });
  const source = `object ExtBaseAddress {
  street String
  city String
  zip String
  country String @default('US')
}
object ExtAddress extends ExtBaseAddress {
  apartment String?
}
object ExtCityAddress extends ExtBaseAddress[city, country] {
  district String?
}
object ExtSimpleAddress extends ExtBaseAddress[!country] {
  region String?
}
object ExtGeoAddress extends ExtAddress {
  elevation Float?
}
`;

  test('plain, pick, omit and a second level match the parser, raw and resolved', () => {
    const Address = object('ExtAddress', { apartment: f.string().optional() }, { extends: Base });

    expectSameAsParsed(source, {
      models: [],
      objects: [
        Base,
        Address,
        object('ExtCityAddress', { district: f.string().optional() }, { extends: Base.pick('city', 'country') }),
        object('ExtSimpleAddress', { region: f.string().optional() }, { extends: Base.omit('country') }),
        object('ExtGeoAddress', { elevation: f.float().optional() }, { extends: Address }),
      ].map(objectNode),
    });
  });

  test('a plain extends writes no extendsFilter key', () => {
    const node = objectNode(object('Child', {}, { extends: Base }));

    expect(node.extends).toBe('ExtBaseAddress');
    expect('extendsFilter' in node).toBe(false);
  });

  test('no options writes neither key', () => {
    const node = objectNode(Base);

    expect('extends' in node).toBe(false);
    expect('extendsFilter' in node).toBe(false);
  });
});

describe('the handle', () => {
  test('keeps only its name as an own enumerable key', () => {
    expect(Object.keys(Entity)).toEqual(['name']);
  });

  test('a filtered reference has neither pick nor omit', () => {
    const picked = Entity.pick('name');

    expect('pick' in picked).toBe(false);
    expect('omit' in picked).toBe(false);
  });

  test('extendsOf walks from a child to the raw parent handle and the filter', () => {
    const Mid = model('Mid', {}, { extends: Entity.pick('name') });
    const Leaf = model('Leaf', {}, { extends: Mid });

    expect(extendsOf(Leaf)).toEqual({ parent: Mid });
    expect(extendsOf(Leaf)?.parent).toBe(Mid);
    expect(extendsOf(Mid)?.parent).toBe(Entity);
    expect(extendsOf(Mid)?.filter).toEqual({ mode: 'pick', fields: ['name'] });
    expect(extendsOf(Entity)).toBeUndefined();
  });

  test('a bare string, a thunk and a plain object are refused at declaration', () => {
    // @ts-expect-error a name is not a handle
    expect(() => model('A', {}, { extends: 'Entity' })).toThrow("'extends' takes");
    // @ts-expect-error a thunk is not a handle
    expect(() => model('A', {}, { extends: () => Entity })).toThrow("'extends' takes");
    // @ts-expect-error a plain object is not a handle
    expect(() => model('A', {}, { extends: { name: 'Entity' } })).toThrow("'extends' takes");
  });
});

describe('types', () => {
  const Parent = model('Parent', { id: f.record().id(), name: f.string(), age: f.int() });
  const Child = model('Child', { extra: f.int() }, { extends: Parent });

  test('a name the parent does not declare is a compile error', () => {
    // @ts-expect-error 'nope' is not a field of Parent
    expect(() => Parent.pick('nope')).not.toThrow();
    // @ts-expect-error 'nope' is not a field of Parent
    expect(() => Parent.omit('name', 'nope')).not.toThrow();
  });

  test('pick and omit take their names from the parent own fields, not the grandparent', () => {
    // @ts-expect-error 'name' is the grandparent's, and Child declares only 'extra'
    expect(() => Child.pick('name')).not.toThrow();
    expect(() => Child.pick('extra')).not.toThrow();
  });

  test('a filter cannot carry both modes', () => {
    // @ts-expect-error a picked reference has no omit
    expect(() => Parent.pick('id').omit('name')).toThrow();
    // @ts-expect-error an omitted reference has no pick
    expect(() => Parent.omit('id').pick('name')).toThrow();
  });

  test('a pick or omit needs at least one name', () => {
    // @ts-expect-error an empty list is not a filter
    expect(() => Parent.pick()).not.toThrow();
  });

  test('a composite directive may name an inherited field but not an unknown one', () => {
    expect(() => model('G', {}, { extends: Parent, unique: { name: 'u', fields: ['name', 'id'] } })).not.toThrow();
    expect(() =>
      // @ts-expect-error 'ghost' is neither declared nor inherited
      model('G', {}, { extends: Parent, unique: { name: 'u', fields: ['ghost'] } }),
    ).not.toThrow();
  });

  test('a composite directive sees names inherited through a filter and through two levels', () => {
    const Omitted = model('O', {}, { extends: Parent.omit('age') });
    const Leaf = model('L', {}, { extends: Omitted, index: { name: 'i', fields: ['name'] } });

    expect(modelNode(Leaf).directives).toHaveLength(1);
    expect(() =>
      // @ts-expect-error 'age' was omitted by the middle link
      model('L2', {}, { extends: Omitted, index: { name: 'i', fields: ['age'] } }),
    ).not.toThrow();
  });

  test('a derived foreign key is a member name, and an array key drops one trailing s', () => {
    const Tag = model('Tag', { id: f.record().id() });
    const Post = model('Post', { author: f.relation(() => Tag), tags: f.relation(() => Tag).array() });

    expect(() => Post.pick('authorId', 'tagIds', 'author', 'tags')).not.toThrow();
    // @ts-expect-error 'tagsIds' is not the derived name
    expect(() => Post.pick('tagsIds')).not.toThrow();
  });

  test('a reverse relation derives no key', () => {
    const Tag = model('Tag', { id: f.record().id() });
    const Owner = model('Owner', { posts: f.reverse(() => Tag).array() });

    expect(() => Owner.pick('posts')).not.toThrow();
    // @ts-expect-error a reverse relation stores nothing
    expect(() => Owner.pick('postIds')).not.toThrow();
  });
});
