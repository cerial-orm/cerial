import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import type { Handle } from '../../../../src/parser/builder';
import { f, model, modelNode, object, objectNode } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import type { ASTField, ASTModel } from '../../../../src/types';
import { withoutPosition } from './helpers';

const schema = (path: string): string => readFileSync(new URL(`../../../e2e/schemas/${path}`, import.meta.url), 'utf8');

function parsedModel(source: string, name: string): ASTModel {
  const { ast, errors } = parse(source);
  expect(errors).toHaveLength(0);
  const found = ast.models.find((m) => m.name === name);
  if (!found) throw new Error(`No model ${name}`);

  return found;
}

function fieldOf(m: ASTModel, name: string): ASTField {
  const found = m.fields.find((x) => x.name === name);
  if (!found) throw new Error(`No field ${name} on ${m.name}`);

  return found;
}

const Author = model('Author', { id: f.record().id() });

describe('f.relation derives the backing Record', () => {
  test('a model with a relation matches its parsed twin field for field', () => {
    const built = model('PostRequired', {
      id: f.record().id(),
      title: f.string(),
      body: f.string().optional().nullable(),
      author: f.relation(() => Author),
      createdAt: f.date().createdAt(),
    });
    const parsed = parsedModel(schema('relations/one-to-many.cerial'), 'PostRequired');

    expect(withoutPosition(modelNode(built).fields)).toEqual(withoutPosition(parsed.fields));
  });

  test('one relation entry becomes two nodes, the key first', () => {
    const built = modelNode(model('Post', { author: f.relation(() => Author) }));

    expect(built.fields.map((x) => [x.name, x.type])).toEqual([
      ['authorId', 'record'],
      ['author', 'relation'],
    ]);
  });

  test('the key is a bare Record with no decorators and no explicit id type', () => {
    const [key] = modelNode(model('Post', { author: f.relation(() => Author) })).fields;

    expect(key?.decorators).toEqual([]);
    expect(key).not.toHaveProperty('recordIdTypes');
    expect(key?.isOptional).toBe(false);
  });

  test('both decorators carry a value, in field then model order', () => {
    const [, rel] = modelNode(model('Post', { author: f.relation(() => Author) })).fields;

    expect(rel?.decorators.map((d) => [d.type, d.value])).toEqual([
      ['field', 'authorId'],
      ['model', 'Author'],
    ]);
  });

  test('a chained key lands after field and model, as the parser orders it', () => {
    const built = model('Document', { author: f.relation(() => Author).key('author') });
    const parsed = parsedModel(
      'model Document {\n  authorId Record\n  author Relation @field(authorId) @model(Author) @key(author)\n}',
      'Document',
    );

    expect(withoutPosition(modelNode(built).fields)).toEqual(withoutPosition(parsed.fields));
  });
});

describe('the FK-name override', () => {
  const Moderated = () => model('ExtRelBlogAuthor', { id: f.record().id() });
  const twin = parsedModel(
    'model M {\n  approvedBy Record\n  approver Relation @field(approvedBy) @model(ExtRelBlogAuthor)\n}',
    'M',
  );

  test('.field(name) reproduces the pair a hand-written key gives', () => {
    const built = model('M', { approver: f.relation(Moderated).field('approvedBy') });

    expect(withoutPosition(modelNode(built).fields)).toEqual(withoutPosition(twin.fields));
  });

  test('the corpus pair at extends-relations differs only in being optional, which is not built yet', () => {
    const corpus = parsedModel(schema('features/extends-relations.cerial'), 'ExtRelCommentModerated');
    const built = modelNode(model('M', { approver: f.relation(Moderated).field('approvedBy') })).fields;

    expect(withoutPosition(built.map((x) => ({ ...x, isOptional: true })))).toEqual(
      withoutPosition([fieldOf(corpus, 'approvedBy'), fieldOf(corpus, 'approver')]),
    );
  });

  test('without the override the key is named after the relation and no longer matches', () => {
    const built = model('M', { approver: f.relation(Moderated) });

    expect(withoutPosition(modelNode(built).fields)).not.toEqual(withoutPosition(twin.fields));
    expect(modelNode(built).fields[0]?.name).toBe('approverId');
  });
});

describe('the target', () => {
  test('a thunk is not called until the model is materialised', () => {
    let calls = 0;
    const built = model('Post', {
      author: f.relation(() => {
        calls++;

        return Author;
      }),
    });
    expect(calls).toBe(0);
    modelNode(built);
    expect(calls).toBe(1);
  });

  test('a thunk may name a const declared later in the module', () => {
    const ref: { later?: Handle<string, unknown> } = {};
    const built = model('Post', {
      author: f.relation(() => ref.later ?? Author),
    });
    ref.later = model('Later', { id: f.record().id() });

    expect(fieldOf(modelNode(built), 'author').decorators[1]?.value).toBe('Later');
  });

  test('a handle and a bare name give the same node as a thunk', () => {
    const viaThunk = modelNode(model('Post', { author: f.relation(() => Author) }));

    expect(withoutPosition(modelNode(model('Post', { author: f.relation(Author) })))).toEqual(
      withoutPosition(viaThunk),
    );
    expect(withoutPosition(modelNode(model('Post', { author: f.relation('Author') })))).toEqual(
      withoutPosition(viaThunk),
    );
  });
});

describe('what a relation refuses', () => {
  test('there is no public @model method and no @field method on a plain field', () => {
    const rel = f.relation(() => Author);

    expect(rel).not.toHaveProperty('model');
    expect(f.string()).not.toHaveProperty('field');
    expect(rel).toHaveProperty('field');
  });

  test('a model cannot hold a relation whose key collides with a declared field', () => {
    const built = model('Post', { authorId: f.string(), author: f.relation(() => Author) });

    expect(() => modelNode(built)).toThrow('declares field authorId twice');
  });

  test('an object refuses a relation field', () => {
    const built = object('Address', { owner: f.relation(() => Author) });

    expect(() => objectNode(built)).toThrow('cannot hold relation field owner');
  });

  test('an object still builds its ordinary fields', () => {
    expect(objectNode(object('Address', { city: f.string() })).fields.map((x) => x.name)).toEqual(['city']);
  });

  test.each(['array', 'optional', 'private', 'onDelete'] as const)('.%s() throws until it is supported', (method) => {
    const rel = f.relation(() => Author) as unknown as Record<string, () => unknown>;

    expect(() => rel[method]!()).toThrow(`.${method}() is not supported on f.relation() yet`);
  });

  test('the unsupported methods are absent from the type', () => {
    const rel = f.relation(() => Author);
    // @ts-expect-error array is not offered on a relation until its pair is derived
    expect(rel.array).toBeDefined();
    // @ts-expect-error optional is not offered on a relation until its pair is derived
    expect(rel.optional).toBeDefined();
    // @ts-expect-error onDelete is not offered on a relation until its key nullability is derived
    expect(rel.onDelete).toBeDefined();
    // @ts-expect-error a plain field has no .field(name), which belongs to relations
    expect(f.string().field).toBeUndefined();
  });
});
