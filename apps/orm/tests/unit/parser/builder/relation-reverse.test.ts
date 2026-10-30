import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  RELATION_ONLY_METHOD,
  chainEntries,
  f,
  model,
  modelNode,
  object,
  objectNode,
} from '../../../../src/parser/builder';
import type { Handle } from '../../../../src/parser/builder';
import { parse } from '../../../../src/parser/parser';
import type { ASTField, ASTModel } from '../../../../src/types';
import { withoutPosition } from './helpers';

const schema = (path: string): string => readFileSync(new URL(`../../../e2e/schemas/${path}`, import.meta.url), 'utf8');

function parsedModel(path: string, name: string): ASTModel {
  const { ast, errors } = parse(schema(path));
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

const Target = model('Target', { id: f.record().id() });

describe('f.reverse', () => {
  test('emits one relation node with a model decorator and no field decorator or key', () => {
    const fields = modelNode(model('Owner', { posts: f.reverse(() => Target) })).fields;

    expect(fields.map((x) => [x.name, x.type])).toEqual([['posts', 'relation']]);
    expect(fields[0]?.decorators.map((d) => [d.type, d.value])).toEqual([['model', 'Target']]);
  });

  test('array, optional and private carry onto the single node', () => {
    const [many] = modelNode(model('A', { posts: f.reverse(() => Target).array() })).fields;
    const [maybe] = modelNode(model('B', { post: f.reverse(() => Target).optional() })).fields;
    const [hidden] = modelNode(model('C', { post: f.reverse(() => Target).private() })).fields;

    expect([many?.isArray, !!many?.isOptional]).toEqual([true, false]);
    expect([!!maybe?.isArray, maybe?.isOptional]).toEqual([false, true]);
    expect(hidden?.isPrivate).toBe(true);
  });

  test('a reverse builder is refused inside an object, as a forward one is', () => {
    const Bag = object('Bag', { posts: f.reverse(() => Target) });

    expect(() => objectNode(Bag)).toThrow('cannot hold relation field posts');
  });

  test('has no field or onDelete method at runtime', () => {
    const builder = f.reverse(() => Target);

    expect(builder).not.toHaveProperty('field');
    expect(builder).not.toHaveProperty('onDelete');
    expect(builder).not.toHaveProperty('nullable');
  });

  test('the forward builder keeps field and onDelete', () => {
    const builder = f.relation(() => Target).optional();

    expect(builder).toHaveProperty('field');
    expect(builder).toHaveProperty('onDelete');
  });

  test('type negatives: field, onDelete and nullable do not exist on a reverse relation', () => {
    const reverse = f.reverse(() => Target);
    // @ts-expect-error a reverse relation stores no key, so it has nothing to name
    expect(reverse.field).toBeUndefined();
    // @ts-expect-error the forward side owns the deletion rule
    expect(reverse.optional().onDelete).toBeUndefined();
    // @ts-expect-error @nullable is refused on a relation
    expect(reverse.nullable).toBeUndefined();
    // @ts-expect-error the schema has no optional array relation; the runtime method stays, as on a forward one
    reverse.optional().array();
  });

  test('the key method exists on both factories', () => {
    expect(f.reverse(() => Target).key('a')).toHaveProperty('array');
    expect(f.relation(() => Target).key('a')).toHaveProperty('field');
  });

  test('@field stays relation-only data', () => {
    expect(RELATION_ONLY_METHOD).toEqual(['@field']);
    expect(chainEntries('modelField').map((e) => e.name)).not.toContain('@field');
    expect(chainEntries('modelField', 'relation').map((e) => e.name)).toContain('@field');
  });
});

describe('N:N both sides', () => {
  const Course: Handle<'Course', string> = model('Course', {
    id: f.record().id(),
    name: f.string(),
    code: f.string().unique(),
    students: f.relation((): Handle<'Student', string> => Student).array(),
  });
  const Student: Handle<'Student', string> = model('Student', {
    id: f.record().id(),
    name: f.string(),
    email: f.email().unique(),
    courses: f.relation(() => Course).array(),
  });

  test.each([
    ['Student', Student],
    ['Course', Course],
  ])('%s matches the corpus model node for node', (name, built) => {
    expect(withoutPosition(modelNode(built))).toEqual(
      withoutPosition(parsedModel('relations/many-to-many.cerial', name)),
    );
  });

  test('each side derives its own array key', () => {
    expect(modelNode(Course).fields.map((x) => x.name)).toContain('studentIds');
    expect(modelNode(Student).fields.map((x) => x.name)).toContain('courseIds');
  });

  test('dropping .array() on one side no longer matches', () => {
    const Lone: Handle<'Course', string> = model('Course', {
      id: f.record().id(),
      name: f.string(),
      code: f.string().unique(),
      students: f.relation((): Handle<'Student', string> => Student),
    });

    expect(withoutPosition(modelNode(Lone))).not.toEqual(
      withoutPosition(parsedModel('relations/many-to-many.cerial', 'Course')),
    );
  });
});

describe('@key disambiguation', () => {
  const Document: Handle<'Document', string> = model('Document', {
    id: f.record().id(),
    title: f.string(),
    author: f.relation((): Handle<'Writer', string> => Writer).key('author'),
  });
  const Writer: Handle<'Writer', string> = model('Writer', {
    id: f.record().id(),
    name: f.string(),
    authoredDocs: f
      .reverse(() => Document)
      .array()
      .key('author'),
    reviewedDocs: f
      .reverse(() => Document)
      .array()
      .key('reviewer'),
  });

  test('Writer matches the corpus model node for node', () => {
    expect(withoutPosition(modelNode(Writer))).toEqual(
      withoutPosition(parsedModel('relations/multi-relation.cerial', 'Writer')),
    );
  });

  test('the forward author pair matches the corpus', () => {
    const built = modelNode(Document).fields.filter((x) => ['authorId', 'author'].includes(x.name));
    const parsed = parsedModel('relations/multi-relation.cerial', 'Document').fields.filter((x) =>
      ['authorId', 'author'].includes(x.name),
    );

    expect(withoutPosition(built)).toEqual(withoutPosition(parsed));
  });

  test('the key is the last decorator, after the model, whichever order the chain runs in', () => {
    const [a] = modelNode(
      model('X', {
        r: f
          .reverse(() => Target)
          .key('k')
          .array(),
      }),
    ).fields;
    const [b] = modelNode(
      model('Y', {
        r: f
          .reverse(() => Target)
          .array()
          .key('k'),
      }),
    ).fields;

    expect(a?.decorators.map((d) => d.type)).toEqual(['model', 'key']);
    expect(withoutPosition(a?.decorators)).toEqual(withoutPosition(b?.decorators));
  });

  test('without .key() the node carries none', () => {
    const [r] = modelNode(model('Z', { r: f.reverse(() => Target) })).fields;

    expect(r?.decorators.some((d) => d.type === 'key')).toBe(false);
  });
});

describe('self-reference', () => {
  const Friend: Handle<'Friend', string> = model('Friend', {
    id: f.record().id(),
    name: f.string(),
    friends: f.relation((): Handle<'Friend', string> => Friend).array(),
  });
  const SocialUser: Handle<'SocialUser', string> = model('SocialUser', {
    id: f.record().id(),
    name: f.string(),
    following: f.relation((): Handle<'SocialUser', string> => SocialUser).array(),
  });
  const Tree: Handle<'CategoryTree', string> = model('CategoryTree', {
    id: f.record().id(),
    name: f.string(),
    parent: f
      .relation((): Handle<'CategoryTree', string> => Tree)
      .optional()
      .key('hierarchy'),
    children: f
      .reverse((): Handle<'CategoryTree', string> => Tree)
      .array()
      .key('hierarchy'),
  });
  const Reports: Handle<'EmployeeWithReports', string> = model('EmployeeWithReports', {
    id: f.record().id(),
    name: f.string(),
    directReports: f
      .reverse((): Handle<'EmployeeWithReports', string> => Reports)
      .array()
      .key('manages'),
  });
  const Assistant: Handle<'Assistant', string> = model('Assistant', {
    id: f.record().id(),
    name: f.string(),
    assistedBy: f
      .reverse((): Handle<'Assistant', string> => Assistant)
      .optional()
      .key('assist'),
  });

  test.each([
    ['Friend', Friend],
    ['SocialUser', SocialUser],
  ])('%s, the array form, matches the corpus model node for node', (name, built) => {
    expect(withoutPosition(modelNode(built))).toEqual(
      withoutPosition(parsedModel('relations/self-referential.cerial', name)),
    );
  });

  test.each([
    ['CategoryTree', Tree, 'children'],
    ['EmployeeWithReports', Reports, 'directReports'],
    ['Assistant', Assistant, 'assistedBy'],
  ])('the reverse half of %s matches the corpus field', (name, built, field) => {
    const parsed = fieldOf(parsedModel('relations/self-referential.cerial', name), field);

    expect(withoutPosition(fieldOf(modelNode(built), field))).toEqual(withoutPosition(parsed));
  });

  test('the forward half of CategoryTree.parent matches; only its key differs by @nullable', () => {
    const parsed = parsedModel('relations/self-referential.cerial', 'CategoryTree');
    const built = modelNode(Tree);

    expect(withoutPosition(fieldOf(built, 'parent'))).toEqual(withoutPosition(fieldOf(parsed, 'parent')));
    expect(fieldOf(parsed, 'parentId').isNullable).toBe(true);
    expect(fieldOf(built, 'parentId').isNullable).toBeUndefined();
  });
});
