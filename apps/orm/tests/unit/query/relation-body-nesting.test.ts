/**
 * Unit Tests: a relation key inside a relation filter body
 *
 * User has the reverse array `posts`; Post has the forward `author`, the reverse array `comments` and the
 * array-FK `tags`; Comment has the forward `post`; Tag has the array-FK `posts`. A relation key inside a
 * body recurses through the builder the top level uses, so each shape compiles to its own subquery and
 * never to the eq shorthand on the virtual relation field (`author = $author_eq_0`, `authorId.posts = ...`),
 * which is never true and let a NOT around it match every row.
 */

import { describe, expect, test } from 'bun:test';
import { CerialValidationError } from '../../../src/errors';
import { compileDeleteMany, compileFindMany } from '../../../src/query/builder';
import { buildConditions } from '../../../src/query/filters/condition-builder';
import { createCompileContext } from '../../../src/query/compile/var-allocator';
import { validateWhere } from '../../../src/query/validators';
import type { WhereClause } from '../../../src/types';
import { bodyRegistry } from './relation-body-helpers';

const compile = (model: string, where: WhereClause) =>
  buildConditions(createCompileContext(), where, bodyRegistry[model]!, bodyRegistry);

const ann = { name: 'Ann' };
const AUTHOR_ANN = { authorId_name_eq_0: 'Ann' };

interface Shape {
  readonly label: string;
  readonly model: string;
  readonly where: WhereClause;
  readonly text: string;
  readonly vars: Record<string, unknown>;
}

const shapes: Shape[] = [
  // reverse -> forward, every quantifier
  {
    label: 'reverse -> forward: some',
    model: 'User',
    where: { posts: { some: { author: ann } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'reverse -> forward: every requires a related row',
    model: 'User',
    where: { posts: { every: { author: ann } } },
    text: '(id NOT IN (SELECT VALUE authorId FROM post WHERE NOT ((authorId.id != NONE AND authorId.name = $authorId_name_eq_0))) AND id IN (SELECT VALUE authorId FROM post))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'reverse -> forward: none',
    model: 'User',
    where: { posts: { none: { author: ann } } },
    text: 'id NOT IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'reverse -> forward: direct-object shorthand is some',
    model: 'User',
    where: { posts: { author: ann } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0))',
    vars: AUTHOR_ANN,
  },
  // forward -> reverse, every quantifier and isEmpty
  {
    label: 'forward -> reverse: some',
    model: 'Post',
    where: { author: { posts: { some: { title: 'x' } } } },
    text: '(authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0)))',
    vars: { title_eq_0: 'x' },
  },
  {
    label: 'forward -> reverse: every',
    model: 'Post',
    where: { author: { posts: { every: { title: 'x' } } } },
    text: '(authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE (id NOT IN (SELECT VALUE authorId FROM post WHERE NOT (title = $title_eq_0)) AND id IN (SELECT VALUE authorId FROM post))))',
    vars: { title_eq_0: 'x' },
  },
  {
    label: 'forward -> reverse: none',
    model: 'Post',
    where: { author: { posts: { none: { title: 'x' } } } },
    text: '(authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id NOT IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0)))',
    vars: { title_eq_0: 'x' },
  },
  {
    label: 'forward -> reverse: isEmpty',
    model: 'Post',
    where: { author: { posts: { isEmpty: true } } },
    text: '(authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id NOT IN (SELECT VALUE authorId FROM post)))',
    vars: {},
  },
  {
    label: 'forward -> reverse: direct-object shorthand is some',
    model: 'Post',
    where: { author: { posts: { title: 'x' } } },
    text: '(authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0)))',
    vars: { title_eq_0: 'x' },
  },
  // forward -> forward
  {
    label: 'forward -> forward',
    model: 'Comment',
    where: { post: { author: ann } },
    text: '(postId.id != NONE AND postId IN (SELECT VALUE id FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))',
    vars: AUTHOR_ANN,
  },
  // reverse -> reverse
  {
    label: 'reverse -> reverse: some',
    model: 'User',
    where: { posts: { some: { comments: { some: { text: 't' } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE id IN (SELECT VALUE postId FROM comment WHERE text = $text_eq_0))',
    vars: { text_eq_0: 't' },
  },
  {
    label: 'reverse -> reverse: every inside some',
    model: 'User',
    where: { posts: { some: { comments: { every: { text: 't' } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (id NOT IN (SELECT VALUE postId FROM comment WHERE NOT (text = $text_eq_0)) AND id IN (SELECT VALUE postId FROM comment)))',
    vars: { text_eq_0: 't' },
  },
  // reverse -> array-FK
  {
    label: 'reverse -> array-FK: some',
    model: 'User',
    where: { posts: { some: { tags: { some: { label: 'a' } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE label = $label_eq_0))',
    vars: { label_eq_0: 'a' },
  },
  {
    label: 'reverse -> array-FK: every requires a linked row',
    model: 'User',
    where: { posts: { some: { tags: { every: { label: 'a' } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (tagIds ANYINSIDE (SELECT VALUE id FROM tag) AND NOT (tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE NOT (label = $label_eq_0)))))',
    vars: { label_eq_0: 'a' },
  },
  {
    label: 'reverse -> array-FK: none',
    model: 'User',
    where: { posts: { some: { tags: { none: { label: 'a' } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE NOT (tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE label = $label_eq_0)))',
    vars: { label_eq_0: 'a' },
  },
  // array-FK at the top level and inside
  {
    label: 'array-FK: some',
    model: 'Post',
    where: { tags: { some: { label: 'a' } } },
    text: 'tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE label = $label_eq_0)',
    vars: { label_eq_0: 'a' },
  },
  {
    label: 'array-FK: every',
    model: 'Tag',
    where: { posts: { every: { author: ann } } },
    text: '(postIds ANYINSIDE (SELECT VALUE id FROM post) AND NOT (postIds ANYINSIDE (SELECT VALUE id FROM post WHERE NOT ((authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'array-FK: none',
    model: 'Tag',
    where: { posts: { none: { author: ann } } },
    text: 'NOT (postIds ANYINSIDE (SELECT VALUE id FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'array-FK -> array-FK',
    model: 'Post',
    where: { tags: { some: { posts: { some: { title: 'x' } } } } },
    text: 'tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE postIds ANYINSIDE (SELECT VALUE id FROM post WHERE title = $title_eq_0))',
    vars: { title_eq_0: 'x' },
  },
  {
    label: 'forward -> array-FK',
    model: 'Comment',
    where: { post: { tags: { some: { label: 'a' } } } },
    text: '(postId.id != NONE AND postId IN (SELECT VALUE id FROM post WHERE tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE label = $label_eq_0)))',
    vars: { label_eq_0: 'a' },
  },
  // depth 3 and beyond
  {
    label: 'depth 3: reverse -> reverse -> forward',
    model: 'User',
    where: { posts: { some: { comments: { none: { post: { author: ann } } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE id NOT IN (SELECT VALUE postId FROM comment WHERE (postId.id != NONE AND postId IN (SELECT VALUE id FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'depth 3: forward -> forward -> reverse',
    model: 'Comment',
    where: { post: { author: { posts: { some: { title: 'x' } } } } },
    text: '(postId.id != NONE AND postId IN (SELECT VALUE id FROM post WHERE (authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0)))))',
    vars: { title_eq_0: 'x' },
  },
  {
    label: 'depth 4: forward -> array-FK -> array-FK -> forward',
    model: 'Comment',
    where: { post: { tags: { some: { posts: { some: { author: ann } } } } } },
    text: '(postId.id != NONE AND postId IN (SELECT VALUE id FROM post WHERE tagIds ANYINSIDE (SELECT VALUE id FROM tag WHERE postIds ANYINSIDE (SELECT VALUE id FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))))',
    vars: AUTHOR_ANN,
  },
  // logical operators around and inside
  {
    label: 'under NOT, reverse -> forward',
    model: 'User',
    where: { NOT: { posts: { some: { author: ann } } } },
    text: 'NOT (id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))',
    vars: AUTHOR_ANN,
  },
  {
    label: 'under NOT, forward -> reverse',
    model: 'Post',
    where: { NOT: { author: { posts: { some: { title: 'x' } } } } },
    text: 'NOT ((authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0))))',
    vars: { title_eq_0: 'x' },
  },
  {
    label: 'inside AND',
    model: 'User',
    where: { AND: [{ posts: { some: { author: ann } } }, { name: 'x' }] },
    text: '(id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)) AND name = $name_eq_1)',
    vars: { ...AUTHOR_ANN, name_eq_1: 'x' },
  },
  {
    label: 'inside OR',
    model: 'User',
    where: { OR: [{ posts: { some: { author: ann } } }, { name: 'x' }] },
    text: '(id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)) OR name = $name_eq_1)',
    vars: { ...AUTHOR_ANN, name_eq_1: 'x' },
  },
  {
    label: 'OR inside a forward body mixes a relation key and a field',
    model: 'Post',
    where: { author: { OR: [{ posts: { some: { title: 'x' } } }, { name: 'n' }] } },
    text: '(authorId.id != NONE AND (authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0)) OR authorId.name = $authorId_name_eq_1))',
    vars: { title_eq_0: 'x', authorId_name_eq_1: 'n' },
  },
  {
    label: 'NOT inside a reverse body around a relation key',
    model: 'User',
    where: { posts: { some: { NOT: { author: ann } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE NOT ((authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))',
    vars: AUTHOR_ANN,
  },
  // an empty body at the inner level means what it says
  {
    label: 'empty inner body: some { author: {} } needs a related row',
    model: 'User',
    where: { posts: { some: { author: {} } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE))',
    vars: {},
  },
  {
    label: 'empty inner quantifier: some { author: { posts: { some: {} } } }',
    model: 'User',
    where: { posts: { some: { author: { posts: { some: {} } } } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post))))',
    vars: {},
  },
  {
    label: 'empty inner quantifier: none',
    model: 'Post',
    where: { author: { posts: { none: {} } } },
    text: '(authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id NOT IN (SELECT VALUE authorId FROM post)))',
    vars: {},
  },
  {
    label: 'empty array-FK bodies: some and none',
    model: 'Tag',
    where: { posts: { some: {} } },
    text: 'postIds ANYINSIDE (SELECT VALUE id FROM post)',
    vars: {},
  },
  {
    label: 'empty array-FK body: none',
    model: 'Tag',
    where: { posts: { none: {} } },
    text: 'NOT (postIds ANYINSIDE (SELECT VALUE id FROM post))',
    vars: {},
  },
  {
    label: 'null on a forward relation inside a body means no related record',
    model: 'User',
    where: { posts: { some: { author: null } } },
    text: 'id IN (SELECT VALUE authorId FROM post WHERE (authorId.id = NONE))',
    vars: {},
  },
];

describe('a relation key inside a relation filter body compiles through the relation builder', () => {
  test.each(shapes)('$label', ({ model, where, text, vars }) => {
    const fragment = compile(model, where);

    expect(fragment.text).toBe(text);
    expect(fragment.vars).toEqual(vars);
  });

  test.each(shapes)('$label never uses the eq shorthand on a relation field', ({ model, where }) => {
    const { text, vars } = compile(model, where);

    expect(text).not.toMatch(/\b(author|post|posts|tags|comments) = /);
    expect(text).not.toMatch(/authorId\.posts|authorId\.tags|postId\.author\b/);
    expect(Object.keys(vars).some((k) => /^(author|post|posts|tags|comments)_eq/.test(k))).toBe(false);
  });
});

describe('refusals', () => {
  test('null on a reverse relation inside a body is refused, not dropped', () => {
    expect(() => compile('Post', { author: { posts: null } } as WhereClause)).toThrow(CerialValidationError);
  });

  test('a scalar on a relation key inside a body is refused, not compared', () => {
    expect(() => compile('User', { posts: { some: { author: 'x' } } } as WhereClause)).toThrow(
      'Relation filter on Post.author must be an object',
    );
  });

  test('an array on a relation key inside a body is refused', () => {
    expect(() => compile('User', { posts: { some: { author: [ann] } } } as WhereClause)).toThrow(CerialValidationError);
  });
});

describe('the validator checks a nested relation body against the right target at every depth', () => {
  const issues = (model: string, where: unknown) =>
    validateWhere(where as WhereClause, bodyRegistry[model]!, bodyRegistry).errors.map((e) => e.message);

  test('valid nesting passes at every depth', () => {
    for (const { model, where } of shapes) {
      expect(issues(model, where)).toEqual([]);
    }
  });

  test.each([
    ['User', { posts: { some: { author: { nmae: 'x' } } } }, 'nmae'],
    ['User', { posts: { some: { nmae: 'x' } } }, 'nmae'],
    ['Post', { author: { posts: { some: { nmae: 'x' } } } }, 'nmae'],
    ['Post', { author: { posts: { some: { author: { posts: { some: { nmae: 'x' } } } } } } }, 'nmae'],
    ['Comment', { post: { author: { posts: { some: { comments: { some: { txt: 'x' } } } } } } }, 'txt'],
    ['User', { posts: { some: { tags: { some: { lable: 'x' } } } } }, 'lable'],
    ['Tag', { posts: { some: { author: { nmae: 'x' } } } }, 'nmae'],
    ['User', { posts: { some: { author: { posts: { any: {} } } } } }, 'any'],
    ['User', { posts: { some: { tags: { isEmpty: true } } } }, 'isEmpty'],
  ])('%s refuses an unknown key in %j', (model, where, key) => {
    const messages = issues(model, where);

    expect(messages.length).toBeGreaterThan(0);
    expect(messages.join('\n')).toContain(key);
  });

  test('a $raw fragment is refused inside a nested relation body', () => {
    expect(issues('User', { posts: { some: { author: { $raw: 1 } } } }).join('\n')).toContain('$raw');
  });
});

describe('the destructive and read entry points compile the nested shape', () => {
  test('deleteMany of the NOT payload deletes by meaning, not by the eq shorthand', () => {
    const q = compileDeleteMany(
      bodyRegistry.User!,
      { where: { NOT: { posts: { some: { author: ann } } } } },
      bodyRegistry,
    ).query;

    expect(q.text).toContain(
      'NOT (id IN (SELECT VALUE authorId FROM post WHERE (authorId.id != NONE AND authorId.name = $authorId_name_eq_0)))',
    );
    expect(q.text).not.toContain('author = $');
    expect(q.vars).toMatchObject(AUTHOR_ANN);
  });

  test('findMany on Post with a forward -> reverse NOT', () => {
    const q = compileFindMany(
      bodyRegistry.Post!,
      { where: { NOT: { author: { posts: { some: { title: 'x' } } } } } },
      bodyRegistry,
    ).query;

    expect(q.text).toBe(
      'SELECT * FROM post WHERE NOT ((authorId.id != NONE AND authorId IN (SELECT VALUE id FROM user WHERE id IN (SELECT VALUE authorId FROM post WHERE title = $title_eq_0))))',
    );
  });
});
