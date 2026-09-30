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

  test('follows nested creates inside nested creates', () => {
    const names = collectRelatedModelNames(comment, registry, {
      data: [{ post: { create: { title: 't', author: { create: { name: 'a' } } } } }],
    });

    expect(new Set(names)).toEqual(new Set(['Comment', 'Post', 'Author']));
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
