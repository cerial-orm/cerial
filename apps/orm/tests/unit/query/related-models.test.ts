import { describe, expect, mock, test } from 'bun:test';
import { Model } from '../../../src/client/model/model';
import { collectRelatedModelNames } from '../../../src/query/builders';
import { parseModelRegistry } from '../../test-helpers';

const registry = parseModelRegistry(`
model Author {
  id Record @id
  name String
  posts Relation[] @model(Post)
}

model Post {
  id Record @id
  title String
  authorId Record
  author Relation @field(authorId) @model(Author)
  comments Relation[] @model(Comment)
}

model Comment {
  id Record @id
  text String
  postId Record
  post Relation @field(postId) @model(Post)
}

model Unrelated {
  id Record @id
  label String
}
`);

const post = registry.Post!;
const comment = registry.Comment!;

const createMockSurreal = () => ({
  query: mock(() => ({
    collect: () => Promise.resolve([[]]),
  })),
});

/** Model names handed to the before-query hook for one awaited operation */
async function hookedNames(run: (model: Model) => PromiseLike<unknown>, metadata = post): Promise<string[]> {
  let received: string[] = [];
  const model = new Model(createMockSurreal() as never, metadata, registry, {
    onBeforeQuery: async (modelNames) => {
      received = modelNames;
    },
  });
  await run(model).then(undefined, () => {});

  return received;
}

describe('collectRelatedModelNames', () => {
  test('returns only the queried model without nested ops or include', () => {
    expect(collectRelatedModelNames(post, registry, { data: [{ title: 'x' }] })).toEqual(['Post']);
  });

  test('returns only the queried model when there is no registry', () => {
    expect(collectRelatedModelNames(post, undefined, { include: { author: true } })).toEqual(['Post']);
  });

  test('ignores include entries that are false', () => {
    expect(collectRelatedModelNames(post, registry, { include: { author: false } })).toEqual(['Post']);
  });

  test('includes targets of nested create and connect', () => {
    expect(collectRelatedModelNames(post, registry, { data: [{ author: { create: { name: 'a' } } }] })).toEqual([
      'Post',
      'Author',
    ]);
    expect(collectRelatedModelNames(post, registry, { data: [{ author: { connect: 'author:1' } }] })).toEqual([
      'Post',
      'Author',
    ]);
  });

  test('refuses a nested create inside a nested create, naming its path', () => {
    expect(() =>
      collectRelatedModelNames(comment, registry, {
        data: [{ post: { create: { title: 't', author: { create: { name: 'a' } } } } }],
      }),
    ).toThrow("'post.author' holds a relation value");
  });

  test('follows nested includes recursively', () => {
    const names = collectRelatedModelNames(comment, registry, { include: { post: { include: { author: true } } } });

    expect(new Set(names)).toEqual(new Set(['Comment', 'Post', 'Author']));
  });

  test('unions create and update data for upsert', () => {
    const names = collectRelatedModelNames(post, registry, {
      data: [{ author: { create: { name: 'a' } } }, undefined],
    });

    expect(names).toEqual(['Post', 'Author']);
  });
});

const onDeleteRegistry = parseModelRegistry(`
model Parent {
  id Record @id
  cascades Relation[] @model(CascadeChild)
  setNulls Relation[] @model(SetNullChild)
  setNones Relation[] @model(SetNoneChild)
  restricts Relation[] @model(RestrictChild)
  noActions Relation[] @model(NoActionChild)
}

model CascadeChild {
  id Record @id
  parentId Record
  parent Relation @field(parentId) @model(Parent)
  grandchildren Relation[] @model(Grandchild)
}

model Grandchild {
  id Record @id
  cascadeChildId Record
  cascadeChild Relation @field(cascadeChildId) @model(CascadeChild)
}

model SetNullChild {
  id Record @id
  parentId Record? @nullable
  parent Relation? @field(parentId) @model(Parent) @onDelete(SetNull)
}

model SetNoneChild {
  id Record @id
  parentId Record?
  parent Relation? @field(parentId) @model(Parent) @onDelete(SetNone)
}

model RestrictChild {
  id Record @id
  parentId Record?
  parent Relation? @field(parentId) @model(Parent) @onDelete(Restrict)
}

model NoActionChild {
  id Record @id
  parentId Record?
  parent Relation? @field(parentId) @model(Parent) @onDelete(NoAction)
}
`);

describe('collectRelatedModelNames for deletes', () => {
  test('adds Cascade, SetNull, SetNone and Restrict dependents but not NoAction', () => {
    const names = collectRelatedModelNames(onDeleteRegistry.Parent!, onDeleteRegistry, { isDelete: true });

    expect(new Set(names)).toEqual(
      new Set(['Parent', 'CascadeChild', 'Grandchild', 'SetNullChild', 'SetNoneChild', 'RestrictChild']),
    );
  });

  test('is transitive: collects the dependents of a cascading dependent', () => {
    const names = collectRelatedModelNames(onDeleteRegistry.Parent!, onDeleteRegistry, { isDelete: true });

    expect(names).toContain('Grandchild');
  });

  test('collects a chain below the queried model', () => {
    expect(collectRelatedModelNames(onDeleteRegistry.CascadeChild!, onDeleteRegistry, { isDelete: true })).toEqual([
      'CascadeChild',
      'Grandchild',
    ]);
  });

  test('adds nothing for a model without dependents', () => {
    expect(collectRelatedModelNames(onDeleteRegistry.Grandchild!, onDeleteRegistry, { isDelete: true })).toEqual([
      'Grandchild',
    ]);
  });

  test('does not add dependents when the operation is not a delete', () => {
    expect(collectRelatedModelNames(onDeleteRegistry.Parent!, onDeleteRegistry, {})).toEqual(['Parent']);
  });

  test('returns only the queried model when there is no registry', () => {
    expect(collectRelatedModelNames(post, undefined, { isDelete: true })).toEqual(['Post']);
  });

  test('deleteMany and deleteUnique hand dependents to the before-query hook', async () => {
    for (const run of [
      (m: Model) => m.deleteMany({ where: { name: 'a' } }),
      (m: Model) => m.deleteUnique({ where: { id: 'author:1' } }),
    ]) {
      const names = await hookedNames(run, registry.Author!);

      expect(new Set(names)).toEqual(new Set(['Author', 'Post', 'Comment']));
    }
  });
});

const chainRegistry = parseModelRegistry(`
model Root {
  id Record @id
  mids Relation[] @model(NullMid)
  cycles Relation[] @model(CycA)
}

model NullMid {
  id Record @id
  rootId Record? @nullable
  root Relation? @field(rootId) @model(Root) @onDelete(SetNull)
  leaves Relation[] @model(Leaf)
}

model Leaf {
  id Record @id
  midId Record
  mid Relation @field(midId) @model(NullMid)
}

model CycA {
  id Record @id
  rootId Record
  root Relation @field(rootId) @model(Root)
  bs Relation[] @model(CycB)
}

model CycB {
  id Record @id
  aId Record
  a Relation @field(aId) @model(CycA)
  as Relation[] @model(CycA)
}
`);

describe('collectRelatedModelNames past SetNull and around cycles', () => {
  test('a SetNull edge collects its dependent and stops', () => {
    const names = collectRelatedModelNames(chainRegistry.Root!, chainRegistry, { isDelete: true });

    expect(names).toContain('NullMid');
    expect(names).not.toContain('Leaf');
  });

  test('a cascade cycle terminates and collects each model once', () => {
    const names = collectRelatedModelNames(chainRegistry.Root!, chainRegistry, { isDelete: true });

    expect(names.filter((n) => n === 'CycA')).toHaveLength(1);
    expect(names).toContain('CycB');
  });
});

describe('Model passes every touched model to the before-query hook', () => {
  test('plain create', async () => {
    expect(await hookedNames((m) => m.create({ data: { title: 't', authorId: 'author:1' } }))).toEqual(['Post']);
  });

  test('nested create', async () => {
    const names = await hookedNames((m) => m.create({ data: { title: 't', author: { create: { name: 'a' } } } }));

    expect(new Set(names)).toEqual(new Set(['Post', 'Author']));
  });

  test('nested connect', async () => {
    const names = await hookedNames((m) => m.create({ data: { title: 't', author: { connect: 'author:1' } } }));

    expect(new Set(names)).toEqual(new Set(['Post', 'Author']));
  });

  test('nested write through updateMany', async () => {
    const names = await hookedNames((m) =>
      m.updateMany({ where: { title: 't' }, data: { author: { create: { name: 'a' } } } }),
    );

    expect(new Set(names)).toEqual(new Set(['Post', 'Author']));
  });

  test('nested create in upsert create branch', async () => {
    const names = await hookedNames((m) =>
      m.upsert({
        where: { id: 'post:1' },
        create: { title: 't', author: { create: { name: 'a' } } },
        update: { title: 'u' },
      }),
    );

    expect(new Set(names)).toEqual(new Set(['Post', 'Author']));
  });

  test('single-level include', async () => {
    const names = await hookedNames((m) => m.findMany({ include: { author: true } }));

    expect(new Set(names)).toEqual(new Set(['Post', 'Author']));
  });

  test('nested include', async () => {
    const names = await hookedNames((m) => m.findMany({ include: { post: { include: { author: true } } } }), comment);

    expect(new Set(names)).toEqual(new Set(['Comment', 'Post', 'Author']));
  });

  test('findMany without include does not pull in related models', async () => {
    expect(await hookedNames((m) => m.findMany())).toEqual(['Post']);
  });

  test('query promise exposes the same models for array-mode $transaction', () => {
    const model = new Model(createMockSurreal() as never, post, registry);
    const query = model.create({ data: { title: 't', author: { create: { name: 'a' } } } });

    expect(new Set(query.modelNames)).toEqual(new Set(['Post', 'Author']));
    expect(model.findMany().modelNames).toEqual(['Post']);
  });
});
